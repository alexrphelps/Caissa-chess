import { FastBoard } from './board';
import { areDefaultWeights, evaluateFast } from './eval';
import { LMR_TABLE, MVV_LVA, SEE_VALUE } from './tables';
import { getSharedTT, TranspositionTable, TT_ALPHA, TT_BETA, TT_EXACT } from './tt';
import {
  FastMove,
  FastMultiPVLine,
  FastSearchOptions,
  FastSearchOutcome,
  fastMoveToUci,
  INTERNAL_INF,
  INTERNAL_MATE,
  INTERNAL_MATE_BOUND,
  MAX_PLY,
  MOVE_FLAG_CASTLE,
  packTTMove,
  PAWN,
  QUEEN,
  sq88To64,
} from './types';
import { EvalWeights } from '../types';

/* ============================================================================
 * 3000+ ELO CLASSICAL NEGAMAX + PVS SEARCH ENGINE
 *
 * Features:
 * - Zero-allocation hot loop (pre-allocated Int32Array move/score/PV/history/killer/countermove stacks)
 * - Iterative Deepening with Soft (~45%) and Hard (100%, checked every 2048 nodes) Time Bounds
 * - Aspiration Windows (depth >= 4, ±25 initial window, exponential widening)
 * - Fixed 64 MB Flat TypedArray Transposition Table (64-bit Zobrist verification)
 * - Staged Lazy Move Selection (selection sort best-first):
 *     1. TT Hash Move
 *     2. Winning/Equal Captures & Promotions (MVV-LVA + SEE >= 0)
 *     3. Killer Moves (2 slots per ply)
 *     4. Countermove Heuristic
 *     5. Quiet Moves ordered by History Heuristic (aged between searches, malus on fail-low)
 *     6. Losing Captures (SEE < 0)
 * - Reverse Futility Pruning (Static Null Move, depth <= 6)
 * - Null-Move Pruning (NMP, R = 3 + floor(depth / 6), zugzwang check)
 * - Internal Iterative Reductions (IIR, depth >= 4 when no TT move)
 * - Futility Pruning & Late Move Pruning (LMP, depth <= 3)
 * - Late Move Reductions (LMR, precomputed log table + PV/history adjustments)
 * - Check Extensions (+1 ply when giving check with SEE >= 0)
 * - Hardened Quiescence Search (Stand-Pat, Check Evasions, Delta Pruning +200, SEE >= 0)
 * - Triangular PV Table + Multi-PV Support + Softmax Lower-Elo Scaling
 * ========================================================================== */

const TIMER_CHECK_MASK = 2047; // Check performance.now() every 2,048 nodes
const MAX_QUIESCENCE_PLY = 10;
const APP_MATE_SCORE = 100000;

/**
 * Maps internal search score (MATE = 30000) to app-facing score (MATE = 100000)
 * so existing UI formatters (`M1`, `M2`, etc.) and unit tests stay 100% compatible.
 */
export function mapInternalScoreToAppScore(internalScore: number): number {
  if (internalScore >= INTERNAL_MATE_BOUND) {
    const plies = INTERNAL_MATE - internalScore;
    return APP_MATE_SCORE - plies;
  }
  if (internalScore <= -INTERNAL_MATE_BOUND) {
    const plies = INTERNAL_MATE + internalScore;
    return -APP_MATE_SCORE + plies;
  }
  return internalScore;
}

export class FastSearchEngine {
  public readonly tt: TranspositionTable;

  // Pre-allocated zero-GC search buffers
  private readonly moveStack = new Int32Array((MAX_PLY + 8) * 256);
  private readonly scoreStack = new Int32Array((MAX_PLY + 8) * 256);

  // Move ordering heuristics (persisted & aged across searches!)
  private readonly killers1 = new Int32Array(MAX_PLY + 8);
  private readonly killers2 = new Int32Array(MAX_PLY + 8);
  private readonly countermoves = new Int32Array(64 * 64);
  private readonly history = new Int32Array(2 * 64 * 64);
  private readonly prevMoveStack = new Int32Array(MAX_PLY + 8);
  private readonly staticEvalStack = new Int32Array(MAX_PLY + 8);

  // Triangular PV table
  private readonly pvTable = new Int32Array((MAX_PLY + 8) * (MAX_PLY + 8));
  private readonly pvLength = new Int32Array(MAX_PLY + 8);

  // Active search runtime state
  private nodes = 0;
  private ttHits = 0;
  private seldepth = 0;
  private startTimeMs = 0;
  private hardTimeMs = 1200;
  private softTimeMs = 540;
  private maxNodes = 0;
  private aborted = false;
  private stopRequested = false;

  // Per-search config flags (read into primitives for zero object-property indirection)
  private enableTT = true;
  private enableQuiescence = true;
  private enableNMP = true;
  private enableLMR = true;
  private weights: EvalWeights | undefined = undefined;
  private useDefaultWeights = true;

  constructor(tt?: TranspositionTable) {
    this.tt = tt ?? getSharedTT(64);
  }

  public requestStop(): void {
    this.stopRequested = true;
  }

  public clearState(): void {
    this.tt.clear();
    this.history.fill(0);
    this.countermoves.fill(0);
    this.killers1.fill(0);
    this.killers2.fill(0);
  }

  private ageHistory(): void {
    const h = this.history;
    for (let i = 0; i < h.length; i++) {
      h[i] >>= 1;
    }
  }

  private updateHistory(side: number, move: FastMove, bonus: number): void {
    const from64 = sq88To64(move & 0x7f);
    const to64 = sq88To64((move >> 7) & 0x7f);
    const idx = (side << 12) | (from64 << 6) | to64;
    const clampedBonus = bonus > 400 ? 400 : bonus < -400 ? -400 : bonus;
    // Gravity formula keeps history smoothly bounded in [-16384, +16384]
    const cur = this.history[idx];
    this.history[idx] = cur + clampedBonus - ((cur * Math.abs(clampedBonus)) >> 14);
  }

  private checkTimeOrLimits(): boolean {
    if (this.stopRequested) {
      this.aborted = true;
      return true;
    }
    if (this.maxNodes > 0 && this.nodes >= this.maxNodes) {
      this.aborted = true;
      return true;
    }
    if ((this.nodes & TIMER_CHECK_MASK) === 0) {
      if (performance.now() - this.startTimeMs >= this.hardTimeMs) {
        this.aborted = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Scores generated moves in `[start, end)` according to the strict 6-stage ordering:
   * 1. TT Hash Move (10,000,000)
   * 2. Winning/Neutral Captures & Queen Promotions (SEE >= 0: 2,000,000 + MVV-LVA + SEE)
   * 3. Killer 1 (900,000) & Killer 2 (850,000)
   * 4. Countermove (800,000)
   * 5. Quiet Moves ordered by History Heuristic (0..500,000)
   * 6. Losing Captures (SEE < 0: -1,000,000 + SEE)
   */
  private scoreMoves(
    board: FastBoard,
    start: number,
    end: number,
    ply: number,
    ttMove16: number
  ): void {
    const moves = this.moveStack;
    const scores = this.scoreStack;
    const squares = board.squares;
    const side = board.side;
    const sideShift = side << 12;

    const k1 = this.killers1[ply];
    const k2 = this.killers2[ply];
    const prevMove = ply > 0 ? this.prevMoveStack[ply - 1] : 0;
    let counterMove = 0;
    if (prevMove !== 0) {
      const pf = sq88To64(prevMove & 0x7f);
      const pt = sq88To64((prevMove >> 7) & 0x7f);
      counterMove = this.countermoves[(pf << 6) | pt];
    }

    for (let i = start; i < end; i++) {
      const m = moves[i];

      // 1. TT Hash Move
      if (ttMove16 !== 0 && packTTMove(m) === ttMove16) {
        scores[i] = 10_000_000;
        continue;
      }

      const captured = (m >> 14) & 0xf;
      const promo = (m >> 18) & 0x7;

      // 2 & 6. Captures and Promotions
      if (captured !== 0 || promo !== 0) {
        const attacker = squares[m & 0x7f];
        const victimVal = SEE_VALUE[captured & 7];
        const attackerVal = SEE_VALUE[attacker & 7];
        const promoBonus = promo !== 0 ? SEE_VALUE[promo] - SEE_VALUE[PAWN] : 0;
        const mvv =
          captured !== 0 ? MVV_LVA[(captured << 4) | attacker] : 0;

        // Fast-path SEE: lower-or-equal value capturing higher-or-equal value is always SEE >= 0
        let seeScore: number;
        if (victimVal + promoBonus >= attackerVal && (promo === 0 || promo === QUEEN)) {
          seeScore = victimVal + promoBonus - attackerVal;
        } else {
          seeScore = board.see(m);
        }

        if (seeScore >= 0 && (promo === 0 || promo === QUEEN)) {
          scores[i] = 2_000_000 + mvv + seeScore * 4 + (promo === QUEEN ? 8000 : 0);
        } else if (promo !== 0 && promo !== QUEEN) {
          // Underpromotions below good captures
          scores[i] = 100_000 + promo * 1000;
        } else {
          // Losing capture (Stage 6)
          scores[i] = -1_000_000 + seeScore;
        }
        continue;
      }

      // 3. Killer Moves
      if (m === k1) {
        scores[i] = 900_000;
        continue;
      }
      if (m === k2) {
        scores[i] = 850_000;
        continue;
      }

      // 4. Countermove Heuristic
      if (m === counterMove) {
        scores[i] = 800_000;
        continue;
      }

      // 5. Quiet Moves ordered by History Heuristic
      const from64 = sq88To64(m & 0x7f);
      const to64 = sq88To64((m >> 7) & 0x7f);
      const hist = this.history[sideShift | (from64 << 6) | to64];
      const castleBonus = (m & MOVE_FLAG_CASTLE) !== 0 ? 4000 : 0;
      scores[i] = 200_000 + hist + castleBonus;
    }
  }

  /**
   * Lazy selection sort: swaps the highest-scoring move in `[idx, end)` into `idx`.
   * Avoids sorting moves that are never searched due to early beta cutoffs!
   */
  private pickNextMove(idx: number, end: number): FastMove {
    const moves = this.moveStack;
    const scores = this.scoreStack;
    let bestIdx = idx;
    let bestScore = scores[idx];
    for (let j = idx + 1; j < end; j++) {
      if (scores[j] > bestScore) {
        bestScore = scores[j];
        bestIdx = j;
      }
    }
    if (bestIdx !== idx) {
      const tmpM = moves[idx];
      moves[idx] = moves[bestIdx];
      moves[bestIdx] = tmpM;

      const tmpS = scores[idx];
      scores[idx] = scores[bestIdx];
      scores[bestIdx] = tmpS;
    }
    return moves[idx];
  }

  /**
   * Hardened Quiescence Search:
   * - Stand-Pat evaluation (bypassed when in check -> generates all legal evasions)
   * - Delta Pruning (`standPat + capturedVal + 200 < alpha`, exempting endgames/promotions/checks)
   * - SEE Pruning (`see(move) < 0` skipped for non-check captures)
   * - Lazy move selection by MVV-LVA + SEE
   */
  private quiescence(
    board: FastBoard,
    alpha: number,
    beta: number,
    ply: number,
    qPly: number,
    inCheckKnown = -1
  ): number {
    if (this.checkTimeOrLimits()) return 0;
    this.nodes++;
    if (ply > this.seldepth) this.seldepth = ply;

    if (ply >= MAX_PLY - 1) {
      return evaluateFast(board, this.weights, this.useDefaultWeights, alpha, beta);
    }

    const inCheck = inCheckKnown >= 0 ? inCheckKnown === 1 : board.isInCheck();
    const isEndgame = board.phase <= 4;
    let standPat = -INTERNAL_INF;
    let bestScore = -INTERNAL_INF;

    if (!inCheck) {
      standPat = evaluateFast(
        board,
        this.weights,
        this.useDefaultWeights,
        alpha,
        beta,
        qPly >= 1
      );
      if (qPly >= MAX_QUIESCENCE_PLY) return standPat;
      if (standPat >= beta) return standPat;
      // Big Delta Pruning: if even capturing a Queen (+1050cp) cannot reach alpha, skip capture movegen
      if (!isEndgame && standPat + 1050 < alpha) return standPat;
      if (standPat > alpha) alpha = standPat;
      bestScore = standPat;
    } else if (qPly >= MAX_QUIESCENCE_PLY + 2) {
      return evaluateFast(board, this.weights, this.useDefaultWeights, alpha, beta, true);
    }

    const start = ply << 8;
    const end = board.generateMoves(this.moveStack, start, !inCheck);

    // Score captures/evasions
    const moves = this.moveStack;
    const scores = this.scoreStack;
    const squares = board.squares;
    for (let i = start; i < end; i++) {
      const m = moves[i];
      const cap = (m >> 14) & 0xf;
      const promo = (m >> 18) & 0x7;
      if (cap !== 0 || promo !== 0) {
        const atk = squares[m & 0x7f];
        scores[i] =
          1_000_000 +
          (cap !== 0 ? MVV_LVA[(cap << 4) | atk] : 0) +
          (promo === QUEEN ? 8000 : 0);
      } else {
        scores[i] = 0;
      }
    }

    let legalMoves = 0;

    for (let i = start; i < end; i++) {
      const m = this.pickNextMove(i, end);

      if (!inCheck) {
        const cap = (m >> 14) & 0xf;
        const promo = (m >> 18) & 0x7;

        // Delta Pruning: skip captures that cannot even raise alpha by +200cp
        if (!isEndgame && promo === 0 && cap !== 0) {
          if (standPat + SEE_VALUE[cap & 7] + 200 < alpha) {
            continue;
          }
        }

        // SEE Pruning: skip losing captures (SEE < 0) in Quiescence
        if (promo === 0 && cap !== 0) {
          const atkType = squares[m & 0x7f] & 7;
          const vicType = cap & 7;
          if (SEE_VALUE[atkType] > SEE_VALUE[vicType] && board.see(m) < 0) {
            continue;
          }
        }
      }

      if (!board.makeMove(m)) continue;
      legalMoves++;

      const score = -this.quiescence(board, -beta, -alpha, ply + 1, qPly + 1);
      board.unmakeMove();

      if (this.aborted) return 0;

      if (score > bestScore) {
        bestScore = score;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            return bestScore;
          }
        }
      }
    }

    if (inCheck && legalMoves === 0) {
      return -INTERNAL_MATE + ply;
    }

    return bestScore;
  }

  /**
   * Core Negamax with Principal Variation Search (PVS) and aggressive selective pruning.
   */
  private negamax(
    board: FastBoard,
    depth: number,
    ply: number,
    alpha: number,
    beta: number,
    allowNull: boolean,
    inCheckKnown = -1
  ): number {
    const pvIdx = ply * MAX_PLY;
    this.pvLength[ply] = 0;

    if (this.checkTimeOrLimits()) return 0;

    // Draw checks (50-move, insufficient material, repetition)
    if (ply > 0) {
      if (
        board.halfMoveClock >= 100 ||
        board.isInsufficientMaterial() ||
        board.isRepetition()
      ) {
        return 0;
      }

      // Mate Distance Pruning
      const mateAlpha = -INTERNAL_MATE + ply;
      const mateBeta = INTERNAL_MATE - ply - 1;
      if (alpha < mateAlpha) alpha = mateAlpha;
      if (beta > mateBeta) beta = mateBeta;
      if (alpha >= beta) return alpha;
    }

    if (ply >= MAX_PLY - 1) {
      return evaluateFast(board, this.weights, this.useDefaultWeights, alpha, beta);
    }

    if (depth <= 0) {
      if (this.enableQuiescence) {
        return this.quiescence(board, alpha, beta, ply, 0, inCheckKnown);
      }
      this.nodes++;
      const ic = inCheckKnown >= 0 ? inCheckKnown === 1 : board.isInCheck();
      if (ic) {
        // Verify checkmate at horizon even when quiescence is disabled (lower presets)
        const start = ply << 8;
        const end = board.generateMoves(this.moveStack, start, false);
        let hasLegal = false;
        for (let i = start; i < end; i++) {
          if (board.makeMove(this.moveStack[i])) {
            board.unmakeMove();
            hasLegal = true;
            break;
          }
        }
        if (!hasLegal) return -INTERNAL_MATE + ply;
      }
      return evaluateFast(board, this.weights, this.useDefaultWeights, alpha, beta);
    }

    this.nodes++;
    if (ply > this.seldepth) this.seldepth = ply;

    const isPv = beta - alpha > 1;
    const alphaOrig = alpha;
    const hashHi = board.hashHi;
    const hashLo = board.hashLo;

    // 1. Transposition Table Probe
    let ttMove16 = 0;
    if (this.enableTT) {
      if (this.tt.probe(hashHi, hashLo, ply)) {
        ttMove16 = this.tt.probedMove;
        if (!isPv && ply > 0 && this.tt.probedDepth >= depth) {
          const ttScore = this.tt.probedScore;
          const ttFlag = this.tt.probedFlag;
          if (
            ttFlag === TT_EXACT ||
            (ttFlag === TT_BETA && ttScore >= beta) ||
            (ttFlag === TT_ALPHA && ttScore <= alpha)
          ) {
            this.ttHits++;
            return ttScore;
          }
        }
      }
    }

    const inCheck = inCheckKnown >= 0 ? inCheckKnown === 1 : board.isInCheck();

    // Static evaluation for pruning heuristics (skip if in check or on high-depth PV nodes)
    let staticEval = -INTERNAL_INF;
    let improving = false;
    if (!inCheck && (!isPv || depth <= 3)) {
      staticEval = evaluateFast(
        board,
        this.weights,
        this.useDefaultWeights,
        alpha - 360,
        beta + 560
      );
      this.staticEvalStack[ply] = staticEval;
      if (ply >= 2 && this.staticEvalStack[ply - 2] > -INTERNAL_MATE_BOUND) {
        improving = staticEval > this.staticEvalStack[ply - 2];
      }
    } else {
      this.staticEvalStack[ply] = -INTERNAL_INF;
    }

    // 2. Reverse Futility Pruning (Static Null Move Pruning)
    // At non-PV nodes, depth <= 6, not in check, staticEval - 80*depth >= beta -> return staticEval
    if (
      !isPv &&
      !inCheck &&
      ply > 0 &&
      depth <= 6 &&
      beta < INTERNAL_MATE_BOUND &&
      beta > -INTERNAL_MATE_BOUND &&
      this.enableNMP
    ) {
      const margin = 80 * depth - (improving ? 20 : 0);
      if (staticEval - margin >= beta) {
        return staticEval;
      }
    }

    // 3. Null-Move Pruning (NMP)
    // Non-PV, !inCheck, depth >= 3, staticEval >= beta, side has non-pawn material
    if (
      this.enableNMP &&
      allowNull &&
      !isPv &&
      !inCheck &&
      ply > 0 &&
      depth >= 3 &&
      staticEval >= beta &&
      beta < INTERNAL_MATE_BOUND &&
      beta > -INTERNAL_MATE_BOUND &&
      board.hasNonPawnMaterial()
    ) {
      const R = 3 + Math.floor(depth / 6);
      board.makeNullMove();
      this.prevMoveStack[ply] = 0;
      const nullScore = -this.negamax(
        board,
        depth - 1 - R,
        ply + 1,
        -beta,
        -beta + 1,
        false,
        0
      );
      board.unmakeNullMove();

      if (this.aborted) return 0;

      if (nullScore >= beta) {
        return nullScore >= INTERNAL_MATE_BOUND ? beta : nullScore;
      }
    }

    // 4. Internal Iterative Reductions (IIR)
    // When depth >= 4 and we have no TT move, reduce depth by 1 to find a hash move faster
    if (this.enableTT && depth >= 4 && ttMove16 === 0 && !inCheck) {
      depth--;
    }

    // 5. Generate & Score Pseudo-Legal Moves (Lazy Pick)
    const start = ply << 8;
    const end = board.generateMoves(this.moveStack, start, false);
    this.scoreMoves(board, start, end, ply, ttMove16);

    const k1 = this.killers1[ply];
    const k2 = this.killers2[ply];
    const prevMove = ply > 0 ? this.prevMoveStack[ply - 1] : 0;
    const counterMove =
      prevMove !== 0
        ? this.countermoves[
            (sq88To64(prevMove & 0x7f) << 6) | sq88To64((prevMove >> 7) & 0x7f)
          ]
        : 0;

    // Futility pruning flag for frontier nodes (depth <= 3)
    const futilityBase =
      !isPv && !inCheck && depth <= 3 && alpha < INTERNAL_MATE_BOUND && alpha > -INTERNAL_MATE_BOUND
        ? staticEval + 100 * depth + 60
        : INTERNAL_INF;

    // Track quiet moves tried so we can apply history malus on beta cutoff
    const quietStart = start;
    let quietCount = 0;
    // Reuse a tiny slice? Better: store quiet moves in a small local or track via history update directly
    // We can keep a fixed ply-indexed quiet buffer without allocating!

    let legalMoveCount = 0;
    let bestScore = -INTERNAL_INF;
    let bestMove = 0;

    for (let i = start; i < end; i++) {
      const m = this.pickNextMove(i, end);
      const isCapture = ((m >> 14) & 0xf) !== 0;
      const isPromo = ((m >> 18) & 0x7) !== 0;
      const isQuiet = !isCapture && !isPromo;
      const isKillerOrCounter = m === k1 || m === k2 || m === counterMove;

      // Check SEE before makeMove for check-extension validation
      let moveSeePos = true;
      if (isCapture || isPromo) {
        const atkVal = SEE_VALUE[board.squares[m & 0x7f] & 7];
        const vicVal = SEE_VALUE[(m >> 14) & 7];
        if (atkVal > vicVal && !isPromo) {
          moveSeePos = board.see(m) >= 0;
        }
      }

      if (!board.makeMove(m)) continue;
      legalMoveCount++;
      this.prevMoveStack[ply] = m;

      const givesCheck = board.isInCheck();

      // 6. Futility Pruning & Late Move Pruning (LMP) at Frontier Nodes (depth <= 3)
      if (
        !isPv &&
        !inCheck &&
        !givesCheck &&
        isQuiet &&
        !isKillerOrCounter &&
        legalMoveCount > 1 &&
        bestScore > -INTERNAL_MATE_BOUND &&
        this.enableLMR
      ) {
        // Late Move Pruning
        if (depth <= 3) {
          const lmpLimit = 3 + depth * depth + (improving ? depth : 0);
          if (legalMoveCount > lmpLimit) {
            board.unmakeMove();
            continue;
          }
          // Futility Pruning
          if (futilityBase < alpha) {
            board.unmakeMove();
            continue;
          }
        }
      }

      // 7. Check Extensions (+1 ply when giving check with SEE >= 0 to prevent explosion)
      let extension = 0;
      if (givesCheck && ply < MAX_PLY - 4 && (inCheck || moveSeePos)) {
        extension = 1;
      }

      const newDepth = depth - 1 + extension;
      let score: number;

      const givesCheckInt = givesCheck ? 1 : 0;

      // 8. Principal Variation Search (PVS) + Late Move Reductions (LMR)
      if (legalMoveCount === 1) {
        score = -this.negamax(
          board,
          newDepth,
          ply + 1,
          -beta,
          -alpha,
          true,
          givesCheckInt
        );
      } else {
        let doFullDepthSearch = true;

        // LMR for late quiet moves at depth >= 3
        if (
          this.enableLMR &&
          depth >= 3 &&
          legalMoveCount >= 3 &&
          !inCheck &&
          !givesCheck &&
          isQuiet &&
          !isKillerOrCounter
        ) {
          const dClamp = depth < 63 ? depth : 63;
          const mClamp = legalMoveCount < 63 ? legalMoveCount : 63;
          let R = LMR_TABLE[(dClamp << 6) | mClamp];

          // Reduce less on PV nodes or improving positions
          if (isPv && R > 1) R--;
          if (improving && R > 1) R--;

          // Adjust by history score
          const from64 = sq88To64(m & 0x7f);
          const to64 = sq88To64((m >> 7) & 0x7f);
          const hist =
            this.history[((board.side ^ 1) << 12) | (from64 << 6) | to64];
          if (hist > 4000 && R > 1) R--;
          else if (hist < -4000 && R < newDepth - 1) R++;

          const reducedDepth = Math.max(1, newDepth - R);

          score = -this.negamax(
            board,
            reducedDepth,
            ply + 1,
            -alpha - 1,
            -alpha,
            true,
            0
          );

          doFullDepthSearch = score > alpha && reducedDepth < newDepth;
        } else {
          // Zero-window PVS scout search at full depth
          score = -this.negamax(
            board,
            newDepth,
            ply + 1,
            -alpha - 1,
            -alpha,
            true,
            givesCheckInt
          );
          doFullDepthSearch = false;
        }

        // If LMR raised alpha, re-search at full depth with zero window first
        if (!this.aborted && doFullDepthSearch) {
          score = -this.negamax(
            board,
            newDepth,
            ply + 1,
            -alpha - 1,
            -alpha,
            true,
            givesCheckInt
          );
        }

        // If zero-window PVS beat alpha on a PV node, re-search with full window (-beta, -alpha)
        if (!this.aborted && score > alpha && score < beta) {
          score = -this.negamax(
            board,
            newDepth,
            ply + 1,
            -beta,
            -alpha,
            true,
            givesCheckInt
          );
        }
      }

      board.unmakeMove();

      if (this.aborted) return 0;

      if (isQuiet) {
        quietCount++;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;

        if (score > alpha) {
          alpha = score;

          // Update Triangular PV Table
          this.pvTable[pvIdx] = m;
          const childPvIdx = (ply + 1) * MAX_PLY;
          const childLen = this.pvLength[ply + 1];
          for (let k = 0; k < childLen; k++) {
            this.pvTable[pvIdx + 1 + k] = this.pvTable[childPvIdx + k];
          }
          this.pvLength[ply] = 1 + childLen;

          if (alpha >= beta) {
            // Beta Cutoff! Update Killers, Countermove, and History Heuristic
            if (isQuiet) {
              if (this.killers1[ply] !== m) {
                this.killers2[ply] = this.killers1[ply];
                this.killers1[ply] = m;
              }
              if (prevMove !== 0) {
                const pf = sq88To64(prevMove & 0x7f);
                const pt = sq88To64((prevMove >> 7) & 0x7f);
                this.countermoves[(pf << 6) | pt] = m;
              }
              const bonus = depth * depth;
              this.updateHistory(board.side, m, bonus);

              // History malus for previously searched quiet moves that failed to cut off
              if (quietCount > 1) {
                for (let q = quietStart; q < i; q++) {
                  const qm = this.moveStack[q];
                  if (((qm >> 14) & 0xf) === 0 && ((qm >> 18) & 0x7) === 0) {
                    this.updateHistory(board.side, qm, -bonus);
                  }
                }
              }
            }
            break;
          }
        }
      }
    }

    // Terminal position: Checkmate or Stalemate
    if (legalMoveCount === 0) {
      return inCheck ? -INTERNAL_MATE + ply : 0;
    }

    // 9. Store in Flat TypedArray Transposition Table
    if (this.enableTT && !this.aborted) {
      const flag =
        bestScore <= alphaOrig
          ? TT_ALPHA
          : bestScore >= beta
          ? TT_BETA
          : TT_EXACT;
      this.tt.store(
        hashHi,
        hashLo,
        depth,
        bestScore,
        flag,
        packTTMove(bestMove),
        ply
      );
    }

    return bestScore;
  }

  /**
   * Executes Iterative Deepening with Aspiration Windows, Soft/Hard Time Bounds,
   * and optional Multi-PV or Softmax lower-Elo move selection.
   */
  public search(board: FastBoard, options: FastSearchOptions): FastSearchOutcome {
    this.startTimeMs = performance.now();
    this.hardTimeMs = Math.max(15, options.maxTimeMs);
    this.softTimeMs =
      options.softTimeMs ?? Math.max(15, Math.floor(this.hardTimeMs * 0.45));
    this.maxNodes = options.maxNodes ?? 0;

    this.nodes = 0;
    this.ttHits = 0;
    this.seldepth = 0;
    this.aborted = false;
    this.stopRequested = false;

    const cfg = options.config;
    this.enableTT = cfg.enableTranspositionTable;
    this.enableQuiescence = cfg.enableQuiescence;
    this.enableNMP = cfg.enableNullMovePruning;
    this.enableLMR = cfg.enableLMR;
    this.weights = cfg.evalWeights;
    this.useDefaultWeights = areDefaultWeights(cfg.evalWeights);

    this.tt.nextGeneration();
    this.ageHistory();
    this.killers1.fill(0);
    this.killers2.fill(0);
    this.prevMoveStack.fill(0);

    // Collect strictly legal root moves once
    const rootEnd = board.generateMoves(this.moveStack, 0, false);
    const legalMoves: FastMove[] = [];
    for (let i = 0; i < rootEnd; i++) {
      const m = this.moveStack[i];
      if (board.makeMove(m)) {
        legalMoves.push(m);
        board.unmakeMove();
      }
    }

    if (legalMoves.length === 0) {
      const inCheck = board.isInCheck();
      const raw = inCheck
        ? -INTERNAL_MATE
        : 0;
      return {
        bestMove: 0,
        bestUci: '0000',
        score: mapInternalScoreToAppScore(raw),
        depth: 0,
        seldepth: 0,
        nodes: 0,
        nps: 0,
        ttHits: 0,
        elapsedMs: 1,
        pv: [],
        multiPvLines: [],
      };
    }

    const multiPvCount = Math.min(
      legalMoves.length,
      Math.max(1, options.multiPv ?? 1)
    );
    const maxDepth = Math.max(1, Math.min(MAX_PLY - 4, options.maxDepth));

    // If Multi-PV > 1 or lower-Elo softmax/error selection is active, use root-scored Multi-PV loop
    const needRootScores =
      multiPvCount > 1 ||
      (cfg.errorProbability > 0 && cfg.errorMarginCentipawns > 0) ||
      (options.softmaxTemp !== undefined && options.softmaxTemp > 0);

    if (needRootScores) {
      return this.searchRootMultiPV(
        board,
        legalMoves,
        maxDepth,
        multiPvCount,
        options
      );
    }

    // Fast single-PV Iterative Deepening with Aspiration Windows
    let bestMove = legalMoves[0];
    let bestScore = 0;
    let completedDepth = 0;
    let bestPv: FastMove[] = [bestMove];

    // If only 1 legal move and not looking for deep score, still do quick depth 1-4 eval
    const effectiveMaxDepth =
      legalMoves.length === 1 ? Math.min(maxDepth, 4) : maxDepth;

    for (let d = 1; d <= effectiveMaxDepth; d++) {
      // Soft time bound: stop starting new depths after ~45% of allocated time
      if (d >= 2) {
        const elapsed = performance.now() - this.startTimeMs;
        if (elapsed >= this.softTimeMs) {
          break;
        }
        if (this.maxNodes > 0 && this.nodes >= this.maxNodes) {
          break;
        }
      }

      let alpha = -INTERNAL_INF;
      let beta = INTERNAL_INF;
      let delta = 25;

      // Aspiration Windows starting at depth >= 4
      if (d >= 4 && Math.abs(bestScore) < INTERNAL_MATE_BOUND - 100) {
        alpha = Math.max(-INTERNAL_INF, bestScore - delta);
        beta = Math.min(INTERNAL_INF, bestScore + delta);
      }

      let iterScore = 0;
      while (true) {
        iterScore = this.negamax(board, d, 0, alpha, beta, true);
        if (this.aborted) break;

        if (iterScore <= alpha) {
          // Fail-low: widen lower bound exponentially
          alpha = delta >= 800 ? -INTERNAL_INF : Math.max(-INTERNAL_INF, alpha - delta);
          delta = delta * 2;
        } else if (iterScore >= beta) {
          // Fail-high: widen upper bound exponentially
          beta = delta >= 800 ? INTERNAL_INF : Math.min(INTERNAL_INF, beta + delta);
          delta = delta * 2;
        } else {
          break;
        }
      }

      if (this.aborted) {
        // If depth 1 was aborted (impossible unless tiny time/node cap), fall back safely
        if (completedDepth === 0 && this.pvLength[0] > 0) {
          bestMove = this.pvTable[0];
          bestScore = iterScore;
          completedDepth = 1;
          bestPv = this.extractRootPV();
        }
        break;
      }

      completedDepth = d;
      bestScore = iterScore;
      if (this.pvLength[0] > 0) {
        bestMove = this.pvTable[0];
        bestPv = this.extractRootPV();
      }

      const elapsedMs = Math.max(1, performance.now() - this.startTimeMs);
      if (options.onInfo) {
        const isMate = Math.abs(bestScore) >= INTERNAL_MATE_BOUND;
        const matePlies = isMate
          ? INTERNAL_MATE - Math.abs(bestScore)
          : undefined;
        options.onInfo({
          depth: completedDepth,
          seldepth: this.seldepth,
          score: mapInternalScoreToAppScore(bestScore),
          isMate,
          mateInPlies: matePlies,
          nodes: this.nodes,
          nps: Math.round((this.nodes * 1000) / elapsedMs),
          timeMs: Math.round(elapsedMs),
          ttHits: this.ttHits,
          pvUci: bestPv.map(fastMoveToUci),
        });
      }

      // Stop early if forced checkmate found well within current depth
      if (
        Math.abs(bestScore) >= INTERNAL_MATE_BOUND &&
        INTERNAL_MATE - Math.abs(bestScore) <= d
      ) {
        break;
      }
    }

    const totalMs = Math.max(1, Math.round(performance.now() - this.startTimeMs));
    return {
      bestMove,
      bestUci: fastMoveToUci(bestMove),
      score: mapInternalScoreToAppScore(bestScore),
      depth: Math.max(1, completedDepth),
      seldepth: this.seldepth,
      nodes: this.nodes,
      nps: Math.round((this.nodes * 1000) / totalMs),
      ttHits: this.ttHits,
      elapsedMs: totalMs,
      pv: bestPv,
    };
  }

  /**
   * Multi-PV & Root-Ordered Iterative Deepening Search (used by Tactical Coach,
   * Game Review, and lower-Elo top-N softmax / error-margin bots).
   */
  private searchRootMultiPV(
    board: FastBoard,
    legalMoves: FastMove[],
    maxDepth: number,
    multiPvCount: number,
    options: FastSearchOptions
  ): FastSearchOutcome {
    const moveCount = legalMoves.length;
    const orderedMoves = legalMoves.slice();
    const moveScores = new Int32Array(moveCount);
    const movePvs: FastMove[][] = orderedMoves.map((m) => [m]);

    let completedDepth = 0;

    for (let d = 1; d <= maxDepth; d++) {
      if (d >= 2) {
        const elapsed = performance.now() - this.startTimeMs;
        if (elapsed >= this.softTimeMs) break;
        if (this.maxNodes > 0 && this.nodes >= this.maxNodes) break;
      }

      const iterScores = new Int32Array(moveCount);
      const iterPvs: FastMove[][] = new Array(moveCount);
      let iterAborted = false;

      // Track the kth-best score for Multi-PV pruning window
      const topK: number[] = [];

      for (let i = 0; i < moveCount; i++) {
        const m = orderedMoves[i];
        board.makeMove(m);
        this.prevMoveStack[0] = m;

        let alpha = -INTERNAL_INF;
        if (d >= 2 && topK.length >= multiPvCount) {
          // Prune moves that cannot crack the top-K Multi-PV list (or error margin)
          const margin = Math.max(25, options.config.errorMarginCentipawns + 30);
          const cutoff =
            multiPvCount > 1
              ? topK[multiPvCount - 1] - 10
              : topK[0] - margin;
          if (cutoff > -INTERNAL_MATE_BOUND) {
            alpha = cutoff;
          }
        }

        let sc: number;
        if (alpha > -INTERNAL_INF) {
          sc = -this.negamax(board, d - 1, 1, -alpha - 1, -alpha, true);
          if (!this.aborted && sc > alpha) {
            sc = -this.negamax(
              board,
              d - 1,
              1,
              -INTERNAL_INF,
              INTERNAL_INF,
              true
            );
          }
        } else {
          sc = -this.negamax(
            board,
            d - 1,
            1,
            -INTERNAL_INF,
            INTERNAL_INF,
            true
          );
        }

        board.unmakeMove();

        if (this.aborted) {
          iterAborted = true;
          break;
        }

        iterScores[i] = sc;
        const childLen = this.pvLength[1];
        const line: FastMove[] = new Array(1 + childLen);
        line[0] = m;
        const childPvIdx = MAX_PLY;
        for (let k = 0; k < childLen; k++) {
          line[1 + k] = this.pvTable[childPvIdx + k];
        }
        iterPvs[i] = line;

        topK.push(sc);
        topK.sort((a, b) => b - a);
      }

      if (!iterAborted || completedDepth === 0) {
        const validCount = iterAborted ? 0 : moveCount;
        if (validCount === moveCount) {
          completedDepth = d;
          // Sort root moves descending by score
          const indices = Array.from({ length: moveCount }, (_, idx) => idx);
          indices.sort((a, b) => iterScores[b] - iterScores[a]);
          const nextMoves = new Array<FastMove>(moveCount);
          const nextPvs = new Array<FastMove[]>(moveCount);
          for (let j = 0; j < moveCount; j++) {
            const orig = indices[j];
            nextMoves[j] = orderedMoves[orig];
            moveScores[j] = iterScores[orig];
            nextPvs[j] = iterPvs[orig];
          }
          for (let j = 0; j < moveCount; j++) {
            orderedMoves[j] = nextMoves[j];
            movePvs[j] = nextPvs[j];
          }
        } else if (completedDepth === 0) {
          completedDepth = 1;
          for (let j = 0; j < moveCount; j++) {
            moveScores[j] = iterScores[j];
            if (iterPvs[j]) movePvs[j] = iterPvs[j];
          }
        }

        if (options.onInfo && !iterAborted) {
          const elapsedMs = Math.max(1, performance.now() - this.startTimeMs);
          const topSc = moveScores[0];
          const isMate = Math.abs(topSc) >= INTERNAL_MATE_BOUND;
          options.onInfo({
            depth: completedDepth,
            seldepth: this.seldepth,
            score: mapInternalScoreToAppScore(topSc),
            isMate,
            mateInPlies: isMate ? INTERNAL_MATE - Math.abs(topSc) : undefined,
            nodes: this.nodes,
            nps: Math.round((this.nodes * 1000) / elapsedMs),
            timeMs: Math.round(elapsedMs),
            ttHits: this.ttHits,
            pvUci: movePvs[0].map(fastMoveToUci),
          });
        }

        // Stop early on forced mate when single-PV
        if (
          multiPvCount === 1 &&
          Math.abs(moveScores[0]) >= INTERNAL_MATE_BOUND &&
          INTERNAL_MATE - Math.abs(moveScores[0]) <= d
        ) {
          break;
        }
      }

      if (iterAborted) break;
    }

    // Build Multi-PV output lines
    const multiPvLines: FastMultiPVLine[] = [];
    for (let i = 0; i < moveCount; i++) {
      multiPvLines.push({
        move: orderedMoves[i],
        uci: fastMoveToUci(orderedMoves[i]),
        score: mapInternalScoreToAppScore(moveScores[i]),
        pv: movePvs[i],
      });
    }

    // Controlled Top-N Softmax / Error-Margin selection for lower Elo tiers
    let chosenIdx = 0;
    const rng = options.rng ?? Math.random;
    const cfg = options.config;
    const topScore = moveScores[0];

    if (
      multiPvCount === 1 &&
      moveCount >= 2 &&
      topScore < INTERNAL_MATE_BOUND &&
      cfg.errorProbability > 0 &&
      cfg.errorMarginCentipawns > 0 &&
      rng() < cfg.errorProbability
    ) {
      const margin = cfg.errorMarginCentipawns;
      const temp = Math.max(25, options.softmaxTemp ?? margin * 0.65);
      const weightsArr: number[] = [];
      const candIndices: number[] = [];
      let sumW = 0;
      const capN = Math.min(moveCount, 8);
      // Start at i = 1 so a triggered error actually selects a suboptimal human inaccuracy
      // within `margin` instead of self-canceling back to the engine's #1 best move.
      for (let i = 1; i < capN; i++) {
        const diff = topScore - moveScores[i];
        if (diff <= margin) {
          const w = Math.exp(-diff / temp);
          candIndices.push(i);
          weightsArr.push(w);
          sumW += w;
        }
      }
      if (candIndices.length >= 1 && sumW > 0) {
        let r = rng() * sumW;
        chosenIdx = candIndices[candIndices.length - 1];
        for (let i = 0; i < candIndices.length; i++) {
          r -= weightsArr[i];
          if (r <= 0) {
            chosenIdx = candIndices[i];
            break;
          }
        }
      }
    }

    const totalMs = Math.max(1, Math.round(performance.now() - this.startTimeMs));
    const chosenMove = orderedMoves[chosenIdx];
    const chosenScore = moveScores[chosenIdx];

    return {
      bestMove: chosenMove,
      bestUci: fastMoveToUci(chosenMove),
      score: mapInternalScoreToAppScore(chosenScore),
      depth: Math.max(1, completedDepth),
      seldepth: this.seldepth,
      nodes: this.nodes,
      nps: Math.round((this.nodes * 1000) / totalMs),
      ttHits: this.ttHits,
      elapsedMs: totalMs,
      pv: movePvs[chosenIdx],
      multiPvLines,
    };
  }

  private extractRootPV(): FastMove[] {
    const len = this.pvLength[0];
    const pv: FastMove[] = new Array(len);
    for (let i = 0; i < len; i++) {
      pv[i] = this.pvTable[i];
    }
    return pv;
  }
}

let sharedSearchEngine: FastSearchEngine | null = null;

export function getSharedSearchEngine(): FastSearchEngine {
  if (!sharedSearchEngine) {
    sharedSearchEngine = new FastSearchEngine(getSharedTT(64));
  }
  return sharedSearchEngine;
}
