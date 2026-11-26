import {
  applyMoveToBoard,
  BOARD_SIZE,
  computePositionHash,
  coordsToSquare,
  FIFTY_MOVE_HALF_MOVE_LIMIT,
  FILES,
  generateLegalMoves,
  generatePseudoLegalMoves,
  getLegalSquareAttackers,
  isInsideBoard,
  isInsufficientMaterial,
  isKingInCheck,
  makeMove,
  oppositeColor,
  PIECE_VALUES,
  squareToCoords,
  THREEFOLD_REPETITION_LIMIT,
} from './engine';
import {
  AI_DIFFICULTY_LEVELS,
  computeGamePhase,
  createEngineProfileFromElo,
  createEngineProfileFromPreset,
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_EVAL_WEIGHTS,
  describeEngineProfileSummary,
  ENGINE_MILESTONE_PRESETS,
  evaluateBoardWhitePerspective,
  evaluateForSide,
  evaluateTaperedBreakdown,
  formatEvalScore,
  getDifficultyInfo,
  getEngineConfigForDifficulty,
  getEnginePresetInfo,
  getPieceSquareBonus,
  hasNonPawnMaterial,
  interpolateEngineConfigFromElo,
  interpolateTaperedScore,
  isEndgamePhase,
  mapEloToLegacyDifficulty,
  MATE_SCORE,
  MATE_THRESHOLD,
  MAX_ENGINE_ELO,
  MAX_GAME_PHASE,
  MAX_HARD_TIME_LIMIT_MS,
  MIN_ENGINE_ELO,
  resolveEngineConfig,
} from './evaluation';
import { getBookMoveCandidates } from './openingBook';
import {
  AIDifficulty,
  AISearchResult,
  Board,
  CastlingRights,
  ChessEngineConfig,
  Color,
  EvalWeights,
  GameState,
  Move,
  PieceType,
  Square,
  TTFlag,
} from './types';
import { FastBoard } from './engineCore/board';
import { FastSearchEngine } from './engineCore/search';
import { getSharedTT, TranspositionTable } from './engineCore/tt';
import { FastMove, fastMoveToUci, SearchInfoEvent } from './engineCore/types';

let sharedFastBoard: FastBoard | null = null;
let sharedFastEngine: FastSearchEngine | null = null;
let coachFastBoard: FastBoard | null = null;
let coachFastEngine: FastSearchEngine | null = null;
let lastCoachWeightsSignature = '';

function computeEvalWeightsSignature(weights: EvalWeights): string {
  return `${weights.material.toFixed(2)}|${weights.pieceSquareTables.toFixed(
    2
  )}|${weights.pawnStructure.toFixed(2)}|${weights.kingSafety.toFixed(
    2
  )}|${weights.mobility.toFixed(2)}|${(weights.aggression ?? 1.0).toFixed(2)}`;
}

export function getSharedFastBoard(): FastBoard {
  if (!sharedFastBoard) {
    sharedFastBoard = new FastBoard();
  }
  return sharedFastBoard;
}

export function getSharedFastEngine(): FastSearchEngine {
  if (!sharedFastEngine) {
    sharedFastEngine = new FastSearchEngine(getSharedTT(64));
  }
  return sharedFastEngine;
}

/**
 * Dedicated Tactical Coach 3000+ engine instance with its own 16 MB Flat TypedArray TT.
 * Completely isolated from the Opponent AI's 64 MB TT, and automatically flushes stale TT scores
 * whenever the user changes their Tactical Coach playstyle tuning knobs.
 */
export function getCoachFastEngine(weights: EvalWeights): FastSearchEngine {
  if (!coachFastEngine) {
    coachFastEngine = new FastSearchEngine(new TranspositionTable(16));
  }
  const sig = computeEvalWeightsSignature(weights);
  if (lastCoachWeightsSignature !== '' && lastCoachWeightsSignature !== sig) {
    coachFastEngine.clearState();
  }
  lastCoachWeightsSignature = sig;
  return coachFastEngine;
}

function getCoachFastBoard(): FastBoard {
  if (!coachFastBoard) {
    coachFastBoard = new FastBoard();
  }
  return coachFastBoard;
}

function matchFastMoveToLegal(
  fastMove: FastMove,
  legalMoves: Move[]
): Move | undefined {
  if (fastMove === 0) return undefined;
  const uci = fastMoveToUci(fastMove);
  return legalMoves.find(
    (m) => `${m.from}${m.to}${m.promotion ?? ''}` === uci
  );
}

function fastMoveListToPVSteps(
  rootState: GameState,
  fastMoves: FastMove[],
  maxSteps = 6
): PVStep[] {
  const steps: PVStep[] = [];
  let curr = rootState;
  const limit = Math.min(maxSteps, fastMoves.length);
  for (let i = 0; i < limit; i++) {
    if (curr.status !== 'playing') break;
    const legal = generateLegalMoves(curr);
    const appMove = matchFastMoveToLegal(fastMoves[i], legal);
    if (!appMove) break;
    const next = makeMove(curr, appMove);
    const san =
      next.moveHistory[next.moveHistory.length - 1]?.san ??
      `${appMove.from}-${appMove.to}`;
    steps.push({
      from: appMove.from,
      to: appMove.to,
      san,
      color: curr.turn,
      move: appMove,
    });
    curr = next;
  }
  return steps;
}

export {
  AI_DIFFICULTY_LEVELS,
  computeGamePhase,
  createEngineProfileFromElo,
  createEngineProfileFromPreset,
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_EVAL_WEIGHTS,
  describeEngineProfileSummary,
  ENGINE_MILESTONE_PRESETS,
  evaluateBoardWhitePerspective,
  evaluateForSide,
  evaluateTaperedBreakdown,
  formatEvalScore,
  getDifficultyInfo,
  getEngineConfigForDifficulty,
  getEnginePresetInfo,
  getPieceSquareBonus,
  hasNonPawnMaterial,
  interpolateEngineConfigFromElo,
  interpolateTaperedScore,
  isEndgamePhase,
  mapEloToLegacyDifficulty,
  MATE_SCORE,
  MATE_THRESHOLD,
  MAX_ENGINE_ELO,
  MAX_GAME_PHASE,
  MAX_HARD_TIME_LIMIT_MS,
  MIN_ENGINE_ELO,
  resolveEngineConfig,
};

/* ============================================================================
 * 1. 64-BIT ZOBRIST HASHING & TRANSPOSITION TABLE
 * Deterministic SplitMix64 PRNG generates 64-bit random keys for:
 * - Piece positions (2 colors × 6 piece types × 64 squares)
 * - Side to move (Black to move key)
 * - Castling rights (wK, wQ, bK, bQ)
 * - En Passant target square (64 squares)
 * ========================================================================== */

const MASK_64 = 0xffffffffffffffffn;

function createSplitMix64(seed: bigint): () => bigint {
  let state = seed & MASK_64;
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK_64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    return (z ^ (z >> 31n)) & MASK_64;
  };
}

const PIECE_TYPE_INDEX: Record<PieceType, number> = {
  p: 0,
  n: 1,
  b: 2,
  r: 3,
  q: 4,
  k: 5,
};

const nextZobristRand = createSplitMix64(0xca155a2026c4e55n);

// [colorIdx (0=w, 1=b)][pieceIdx (0..5)][sqIdx (0..63)]
const ZOBRIST_PIECE_KEYS: readonly (readonly (readonly bigint[])[])[] =
  Array.from({ length: 2 }, () =>
    Array.from({ length: 6 }, () =>
      Array.from({ length: 64 }, () => nextZobristRand())
    )
  );

const ZOBRIST_SIDE_TO_MOVE_KEY: bigint = nextZobristRand();

const ZOBRIST_CASTLING_KEYS: Readonly<{
  wK: bigint;
  wQ: bigint;
  bK: bigint;
  bQ: bigint;
}> = {
  wK: nextZobristRand(),
  wQ: nextZobristRand(),
  bK: nextZobristRand(),
  bQ: nextZobristRand(),
};

const ZOBRIST_EP_SQUARE_KEYS: readonly bigint[] = Array.from(
  { length: 64 },
  () => nextZobristRand()
);

/**
 * Computes the 64-bit Zobrist hash key for a given `GameState`
 * (piece placement, side to move, castling rights, and en passant square).
 */
export function computeZobristHash(state: GameState): bigint {
  let hash = 0n;
  const { board, turn, castlingRights, enPassantTarget } = state;

  for (let r = 0; r < BOARD_SIZE; r++) {
    const rowOffset = r * 8;
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (p) {
        const colorIdx = p.color === 'w' ? 0 : 1;
        const pieceIdx = PIECE_TYPE_INDEX[p.type];
        hash ^= ZOBRIST_PIECE_KEYS[colorIdx][pieceIdx][rowOffset + c];
      }
    }
  }

  if (turn === 'b') {
    hash ^= ZOBRIST_SIDE_TO_MOVE_KEY;
  }

  if (castlingRights.wK) hash ^= ZOBRIST_CASTLING_KEYS.wK;
  if (castlingRights.wQ) hash ^= ZOBRIST_CASTLING_KEYS.wQ;
  if (castlingRights.bK) hash ^= ZOBRIST_CASTLING_KEYS.bK;
  if (castlingRights.bQ) hash ^= ZOBRIST_CASTLING_KEYS.bQ;

  if (enPassantTarget) {
    const epCoords = squareToCoords(enPassantTarget);
    if (isInsideBoard(epCoords.row, epCoords.col)) {
      hash ^= ZOBRIST_EP_SQUARE_KEYS[epCoords.row * 8 + epCoords.col];
    }
  }

  return hash;
}

/**
 * Incrementally updates a 64-bit Zobrist hash key via O(1) XOR operations for `move`
 * transitioning from `state` to the next state (`nextCastling`, `nextEnPassant`).
 * Matches `computeZobristHash(childState)` bit-for-bit without rescanning the 64-square board.
 */
export function updateZobristHashAfterMove(
  prevHash: bigint,
  state: GameState,
  move: Move,
  nextCastling: CastlingRights,
  nextEnPassant: Square | null
): bigint {
  let hash = prevHash;
  const colorIdx = move.piece.color === 'w' ? 0 : 1;
  const enemyIdx = 1 - colorIdx;

  const fromCoords = squareToCoords(move.from);
  const toCoords = squareToCoords(move.to);
  const fromSqIdx = fromCoords.row * 8 + fromCoords.col;
  const toSqIdx = toCoords.row * 8 + toCoords.col;

  // 1. XOR out moving piece from origin square
  hash ^=
    ZOBRIST_PIECE_KEYS[colorIdx][PIECE_TYPE_INDEX[move.piece.type]][fromSqIdx];

  // 2. XOR out captured piece (if any)
  if (move.isEnPassant) {
    const epCapSqIdx = fromCoords.row * 8 + toCoords.col;
    hash ^= ZOBRIST_PIECE_KEYS[enemyIdx][PIECE_TYPE_INDEX.p][epCapSqIdx];
  } else if (move.captured) {
    hash ^=
      ZOBRIST_PIECE_KEYS[enemyIdx][PIECE_TYPE_INDEX[move.captured.type]][
        toSqIdx
      ];
  }

  // 3. XOR in moved (or promoted) piece on destination square
  const landedType = move.promotion ?? move.piece.type;
  hash ^= ZOBRIST_PIECE_KEYS[colorIdx][PIECE_TYPE_INDEX[landedType]][toSqIdx];

  // 4. XOR castling Rook movement
  if (move.isCastle === 'K') {
    const rowOffset = fromCoords.row * 8;
    const rookKey = ZOBRIST_PIECE_KEYS[colorIdx][PIECE_TYPE_INDEX.r];
    hash ^= rookKey[rowOffset + 7];
    hash ^= rookKey[rowOffset + 5];
  } else if (move.isCastle === 'Q') {
    const rowOffset = fromCoords.row * 8;
    const rookKey = ZOBRIST_PIECE_KEYS[colorIdx][PIECE_TYPE_INDEX.r];
    hash ^= rookKey[rowOffset + 0];
    hash ^= rookKey[rowOffset + 3];
  }

  // 5. Flip side to move
  hash ^= ZOBRIST_SIDE_TO_MOVE_KEY;

  // 6. XOR changed castling rights
  const prevCastling = state.castlingRights;
  if (prevCastling.wK !== nextCastling.wK) hash ^= ZOBRIST_CASTLING_KEYS.wK;
  if (prevCastling.wQ !== nextCastling.wQ) hash ^= ZOBRIST_CASTLING_KEYS.wQ;
  if (prevCastling.bK !== nextCastling.bK) hash ^= ZOBRIST_CASTLING_KEYS.bK;
  if (prevCastling.bQ !== nextCastling.bQ) hash ^= ZOBRIST_CASTLING_KEYS.bQ;

  // 7. XOR out previous en passant target and XOR in new en passant target
  if (state.enPassantTarget) {
    const prevEp = squareToCoords(state.enPassantTarget);
    if (isInsideBoard(prevEp.row, prevEp.col)) {
      hash ^= ZOBRIST_EP_SQUARE_KEYS[prevEp.row * 8 + prevEp.col];
    }
  }
  if (nextEnPassant) {
    const nextEp = squareToCoords(nextEnPassant);
    if (isInsideBoard(nextEp.row, nextEp.col)) {
      hash ^= ZOBRIST_EP_SQUARE_KEYS[nextEp.row * 8 + nextEp.col];
    }
  }

  return hash;
}

/**
 * Normalizes checkmate scores before storing in the Transposition Table so that
 * mate scores represent mate distance relative to the stored node rather than the root ply.
 */
export function normalizeMateScoreForStorage(score: number, ply: number): number {
  if (score >= MATE_THRESHOLD) {
    return score + ply;
  }
  if (score <= -MATE_THRESHOLD) {
    return score - ply;
  }
  return score;
}

/**
 * Denormalizes checkmate scores retrieved from the Transposition Table back into
 * root-relative mate distance at the current `ply`.
 */
export function denormalizeMateScoreFromStorage(
  storedScore: number,
  ply: number
): number {
  if (storedScore >= MATE_THRESHOLD) {
    return storedScore - ply;
  }
  if (storedScore <= -MATE_THRESHOLD) {
    return storedScore + ply;
  }
  return storedScore;
}

export interface TTEntry {
  key: bigint;
  depth: number;
  score: number; // Stored with normalizeMateScoreForStorage
  flag: TTFlag;  // 'EXACT' | 'LOWERBOUND' | 'UPPERBOUND'
  hashMove?: string;
}

const MAX_TT_ENTRIES = 131072;

/**
 * Stores a position evaluation in the Zobrist Transposition Table with mate-distance normalization
 * and depth-preferred replacement.
 */
export function storeTTEntry(
  tt: Map<bigint, TTEntry>,
  key: bigint,
  depth: number,
  score: number,
  flag: TTFlag,
  ply: number,
  hashMove?: string
): void {
  const existing = tt.get(key);
  if (
    existing &&
    existing.depth > depth &&
    existing.flag === 'EXACT' &&
    flag !== 'EXACT'
  ) {
    return;
  }

  if (tt.size >= MAX_TT_ENTRIES && !existing) {
    // Evict oldest insertion to keep memory strictly bounded
    const oldestKey = tt.keys().next().value;
    if (oldestKey !== undefined) {
      tt.delete(oldestKey);
    }
  }

  tt.set(key, {
    key,
    depth,
    score: normalizeMateScoreForStorage(score, ply),
    flag,
    hashMove: hashMove ?? existing?.hashMove,
  });
}

/**
 * Probes the Zobrist Transposition Table at `key` for a given `depth`, `[alpha, beta]` window, and `ply`.
 * Strictly enforces `entry.depth >= depth` for score cutoffs while always returning `hashMove` for move ordering.
 */
export function probeTTEntry(
  tt: Map<bigint, TTEntry>,
  key: bigint,
  depth: number,
  alpha: number,
  beta: number,
  ply: number
): {
  hit: boolean;
  cutoffScore?: number;
  adjustedAlpha: number;
  adjustedBeta: number;
  hashMove?: string;
  entry?: TTEntry;
} {
  const entry = tt.get(key);
  if (!entry || entry.key !== key) {
    return { hit: false, adjustedAlpha: alpha, adjustedBeta: beta };
  }

  const score = denormalizeMateScoreFromStorage(entry.score, ply);
  let adjustedAlpha = alpha;
  let adjustedBeta = beta;

  if (entry.depth >= depth && ply > 0) {
    if (entry.flag === 'EXACT') {
      return {
        hit: true,
        cutoffScore: score,
        adjustedAlpha: alpha,
        adjustedBeta: beta,
        hashMove: entry.hashMove,
        entry,
      };
    }
    if (entry.flag === 'LOWERBOUND') {
      if (score >= beta) {
        return {
          hit: true,
          cutoffScore: score,
          adjustedAlpha: score,
          adjustedBeta: beta,
          hashMove: entry.hashMove,
          entry,
        };
      }
      if (score > adjustedAlpha) {
        adjustedAlpha = score;
      }
    } else if (entry.flag === 'UPPERBOUND') {
      if (score <= alpha) {
        return {
          hit: true,
          cutoffScore: score,
          adjustedAlpha: alpha,
          adjustedBeta: score,
          hashMove: entry.hashMove,
          entry,
        };
      }
      if (score < adjustedBeta) {
        adjustedBeta = score;
      }
    }
  }

  return {
    hit: true,
    adjustedAlpha,
    adjustedBeta,
    hashMove: entry.hashMove,
    entry,
  };
}

/* ============================================================================
 * 2. STATIC EXCHANGE EVALUATION (SEE) & PIECE SAFETY
 * ========================================================================== */

/**
 * Evaluates whether a piece at (row, col) of `color` on `board` is currently hanging
 * or threatened with a net material loss.
 * Returns the potential material loss (> 0 if vulnerable, 0 if safe).
 */
export function evaluateSquareVulnerability(
  board: Board,
  row: number,
  col: number,
  color: Color
): number {
  const piece = board[row][col];
  if (!piece || piece.color !== color || piece.type === 'k') return 0;

  const enemy = oppositeColor(color);
  const attackers = getLegalSquareAttackers(board, row, col, enemy);
  if (attackers.length === 0) return 0;

  const defenders = getLegalSquareAttackers(board, row, col, color);
  const pieceVal = PIECE_VALUES[piece.type];

  const minAttackerVal = Math.min(
    ...attackers.map((a) => PIECE_VALUES[a.piece.type])
  );

  if (defenders.length === 0) {
    return pieceVal;
  }

  if (minAttackerVal < pieceVal) {
    return pieceVal - minAttackerVal;
  }

  if (attackers.length > defenders.length && minAttackerVal <= pieceVal) {
    return Math.max(50, pieceVal - minAttackerVal);
  }

  return 0;
}

/**
 * Computes total hanging material risk for `color` on `board`.
 */
export function getTotalHangingRisk(board: Board, color: Color): {
  totalRisk: number;
  maxPieceRisk: number;
  queenRisk: number;
  hangingSquares: Square[];
} {
  let totalRisk = 0;
  let maxPieceRisk = 0;
  let queenRisk = 0;
  const hangingSquares: Square[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type !== 'k') {
        const vuln = evaluateSquareVulnerability(board, r, c, color);
        if (vuln > 0) {
          totalRisk += vuln;
          if (vuln > maxPieceRisk) maxPieceRisk = vuln;
          if (p.type === 'q' && vuln > queenRisk) queenRisk = vuln;
          hangingSquares.push(coordsToSquare(r, c));
        }
      }
    }
  }

  return { totalRisk, maxPieceRisk, queenRisk, hangingSquares };
}

/**
 * Full Static Exchange Evaluation (SEE) using the Swap-List recurrence.
 * Simulates the entire chain of least-valuable legal recaptures on `move.to`,
 * removing each attacker from its origin square so X-ray/battery attackers
 * (e.g. Rooks/Bishops/Queens stacked along a file or diagonal) are accurately uncovered.
 * Returns the net centipawn material gain/loss of executing `move`.
 */
export function evaluateSEE(
  boardBefore: Board,
  move: Move,
  moverColor: Color
): number {
  const capturedVal = move.captured ? PIECE_VALUES[move.captured.type] : 0;
  const promoGain = move.promotion
    ? PIECE_VALUES[move.promotion] - PIECE_VALUES.p
    : 0;

  const currentBoard = applyMoveToBoard(boardBefore, move);
  const toCoords = squareToCoords(move.to);
  const targetRow = toCoords.row;
  const targetCol = toCoords.col;

  const gain: number[] = [capturedVal + promoGain];
  let pieceOnTargetType = move.promotion ?? move.piece.type;
  let sideToMove = oppositeColor(moverColor);
  let depth = 0;

  while (depth < 16) {
    const attackers = getLegalSquareAttackers(
      currentBoard,
      targetRow,
      targetCol,
      sideToMove
    );
    if (attackers.length === 0) break;

    attackers.sort(
      (a, b) => PIECE_VALUES[a.piece.type] - PIECE_VALUES[b.piece.type]
    );
    const chosen = attackers[0];

    if (pieceOnTargetType === 'k') {
      break;
    }

    depth++;
    const isPromoCapture =
      chosen.piece.type === 'p' && (targetRow === 0 || targetRow === 7);
    const stepPromoGain = isPromoCapture
      ? PIECE_VALUES.q - PIECE_VALUES.p
      : 0;

    gain[depth] =
      PIECE_VALUES[pieceOnTargetType] + stepPromoGain - gain[depth - 1];

    const fromCoords = squareToCoords(chosen.square);
    currentBoard[fromCoords.row][fromCoords.col] = null;
    const nextLandedType = isPromoCapture ? 'q' : chosen.piece.type;
    currentBoard[targetRow][targetCol] = {
      type: nextLandedType,
      color: sideToMove,
    };

    pieceOnTargetType = nextLandedType;
    sideToMove = oppositeColor(sideToMove);
  }

  while (depth > 0) {
    gain[depth - 1] = -Math.max(-gain[depth - 1], gain[depth]);
    depth--;
  }

  return gain[0];
}

/**
 * Evaluates the net static exchange gain of a capturing move (or promotion).
 */
export function evaluateCaptureGain(
  boardBefore: Board,
  move: Move,
  aiColor: Color
): number {
  const capturedVal = move.captured ? PIECE_VALUES[move.captured.type] : 0;
  const promoGain = move.promotion
    ? PIECE_VALUES[move.promotion] - PIECE_VALUES.p
    : 0;

  if (capturedVal === 0 && promoGain === 0) return 0;

  return evaluateSEE(boardBefore, move, aiColor);
}

/**
 * Checks whether a candidate move places the moved piece onto an unsafe square
 * (backed by full Static Exchange Evaluation on the destination square).
 */
export function isMoveSafe(
  boardBefore: Board,
  move: Move,
  aiColor: Color
): boolean {
  const landedPieceType = move.promotion ?? move.piece.type;
  if (landedPieceType === 'k') {
    return true;
  }

  return evaluateSEE(boardBefore, move, aiColor) >= -25;
}

/* ============================================================================
 * 3. ADVANCED 6-TIER MOVE ORDERING & HISTORY HEURISTIC
 * Hierarchy:
 * 1. Hash Move (10,000,000)
 * 2. Winning / Neutral Captures & Queen Promotions (SEE >= 0: 2,000,000 + SEE*100 + MVV-LVA)
 * 3. Killer Moves (2 quiet moves per ply: 900,000 / 850,000)
 * 4. History Heuristic (Quiet moves with history > 0: 500,000 + min(300,000, historyScore))
 * 5. Losing Captures (SEE < 0: 200,000 + max(-95,000, SEE*100) + MVV-LVA)
 * 6. Remaining Quiet Moves (Castling + PST/mobility delta: -5,000 to +50,000)
 * ========================================================================== */

export type HistoryTable = Record<Color, Int32Array>;

export function createHistoryTable(): HistoryTable {
  return {
    w: new Int32Array(64 * 64),
    b: new Int32Array(64 * 64),
  };
}

export function squareToIndex(sq: Square): number {
  const col = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const row = 8 - Number(sq[1]);
  if (row < 0 || row >= 8 || col < 0 || col >= 8) return 0;
  return row * 8 + col;
}

export function getHistoryScore(
  historyTable: HistoryTable | undefined,
  move: Move
): number {
  if (!historyTable) return 0;
  const fromIdx = squareToIndex(move.from);
  const toIdx = squareToIndex(move.to);
  return historyTable[move.piece.color][fromIdx * 64 + toIdx] ?? 0;
}

export function recordHistoryCutoff(
  historyTable: HistoryTable,
  move: Move,
  depth: number
): void {
  const fromIdx = squareToIndex(move.from);
  const toIdx = squareToIndex(move.to);
  const idx = fromIdx * 64 + toIdx;
  const bonus = depth * depth;
  historyTable[move.piece.color][idx] = Math.min(
    300_000,
    historyTable[move.piece.color][idx] + bonus
  );
}

/**
 * Computes the strict 6-tier move-ordering priority score for Alpha-Beta pruning:
 * 1. Hash Move (`10,000,000`)
 * 2. Winning / Neutral Captures & Queen Promotions (`2,000,000+`)
 * 3. Killer Moves (`900,000` / `850,000`)
 * 4. History Heuristic Quiet Moves (`500,000` to `800,000`)
 * 5. Losing Captures (`100,000` to `199,999`)
 * 6. Remaining Quiet Moves (`-5,000` to `+50,000`)
 */
export function scoreMoveForOrdering(
  move: Move,
  isEndgame: boolean,
  ttBestMoveKey?: string,
  killerKey1?: string,
  killerKey2?: string,
  board?: Board,
  historyScore = 0
): number {
  const moveKey = `${move.from}${move.to}${move.promotion ?? ''}`;

  // Tier 1: Hash Move from Transposition Table
  if (ttBestMoveKey && moveKey === ttBestMoveKey) {
    return 10_000_000;
  }

  // Captures & Promotions (Tier 2 if SEE >= 0, Tier 5 if SEE < 0)
  if (move.captured || move.promotion) {
    const victimVal = move.captured ? PIECE_VALUES[move.captured.type] : 0;
    const attackerVal = move.piece ? PIECE_VALUES[move.piece.type] : 100;
    const promoGain = move.promotion
      ? PIECE_VALUES[move.promotion] - PIECE_VALUES.p
      : 0;
    const promoVal = move.promotion ? PIECE_VALUES[move.promotion] : 0;
    const mvvLva =
      victimVal * 10 - Math.floor(attackerVal / 10) + promoVal * 5;

    let seeScore: number;
    // Fast-path MVV-LVA guarantee: when a lower-or-equal value piece captures a higher-or-equal
    // value target (or promotes), even if immediately recaptured, net gain is >= victimVal + promoGain - attackerVal >= 0.
    // Only invoke full board-cloning SEE when a higher-value piece captures a lower-value piece!
    if (victimVal + promoGain >= attackerVal) {
      seeScore = victimVal + promoGain - attackerVal;
    } else if (board) {
      seeScore = evaluateSEE(board, move, move.piece.color);
    } else {
      seeScore = 0;
    }

    if (seeScore >= 0) {
      // Tier 2: Winning / Neutral Captures
      return 2_000_000 + seeScore * 100 + mvvLva;
    } else {
      // Tier 5: Losing Captures (strictly between 100,000 and 199,999)
      return 190_000 + Math.max(-85_000, seeScore * 50) + Math.floor(mvvLva / 10);
    }
  }

  // Tier 3: Killer Moves (2 non-capture moves per ply)
  if (killerKey1 && moveKey === killerKey1) {
    return 900_000;
  }
  if (killerKey2 && moveKey === killerKey2) {
    return 850_000;
  }

  // Tier 4: History Heuristic (quiet moves with positive beta-cutoff history)
  if (historyScore > 0) {
    return 500_000 + Math.min(300_000, historyScore);
  }

  // Tier 6: Remaining Quiet Moves ranked by castling & Piece-Square/mobility delta
  let quietScore = 0;
  if (move.isCastle) {
    quietScore += 15_000;
  }

  const fromCoords = squareToCoords(move.from);
  const toCoords = squareToCoords(move.to);
  const pstBefore = getPieceSquareBonus(
    move.piece.type,
    move.piece.color,
    fromCoords.row,
    fromCoords.col,
    isEndgame
  );
  const pstAfter = getPieceSquareBonus(
    move.promotion ?? move.piece.type,
    move.piece.color,
    toCoords.row,
    toCoords.col,
    isEndgame
  );
  quietScore += pstAfter - pstBefore;

  return quietScore;
}

/**
 * Sorts candidate moves descending by the 6-tier move-ordering hierarchy.
 */
export function orderMoves(
  moves: Move[],
  isEndgame: boolean,
  ttBestMoveKey?: string,
  killerKey1?: string,
  killerKey2?: string,
  board?: Board,
  historyTable?: HistoryTable
): Move[] {
  if (moves.length <= 1) return moves;
  const decorated = moves.map((m) => ({
    move: m,
    orderScore: scoreMoveForOrdering(
      m,
      isEndgame,
      ttBestMoveKey,
      killerKey1,
      killerKey2,
      board,
      getHistoryScore(historyTable, m)
    ),
  }));
  decorated.sort((a, b) => b.orderScore - a.orderScore);
  return decorated.map((d) => d.move);
}

/* ============================================================================
 * 4. SEARCH ENGINE CORE (QUIESCENCE, NMP, LMR, PVS, ITERATIVE DEEPENING)
 * ========================================================================== */

const MAX_PLY = 64;

/**
 * Lightweight state transition for internal Alpha-Beta search nodes,
 * including incremental O(1) Zobrist hash maintenance via XOR operations.
 */
function createChildSearchState(
  state: GameState,
  move: Move,
  nextBoard: Board,
  parentZobrist?: bigint
): GameState {
  const nextTurn = oppositeColor(state.turn);
  const nextCastling: CastlingRights = { ...state.castlingRights };

  if (move.piece.type === 'k') {
    if (state.turn === 'w') {
      nextCastling.wK = false;
      nextCastling.wQ = false;
    } else {
      nextCastling.bK = false;
      nextCastling.bQ = false;
    }
  }
  if (move.from === 'h1' || move.to === 'h1') nextCastling.wK = false;
  if (move.from === 'a1' || move.to === 'a1') nextCastling.wQ = false;
  if (move.from === 'h8' || move.to === 'h8') nextCastling.bK = false;
  if (move.from === 'a8' || move.to === 'a8') nextCastling.bQ = false;

  let nextEnPassant: Square | null = null;
  if (move.piece.type === 'p') {
    const fromRow = squareToCoords(move.from).row;
    const toCoords = squareToCoords(move.to);
    if (Math.abs(toCoords.row - fromRow) === 2) {
      nextEnPassant = coordsToSquare(
        (fromRow + toCoords.row) / 2,
        toCoords.col
      );
    }
  }

  const nextHalfMoveClock =
    move.piece.type === 'p' || move.captured ? 0 : state.halfMoveClock + 1;
  const nextFullMoveNumber =
    state.turn === 'b' ? state.fullMoveNumber + 1 : state.fullMoveNumber;

  const baseHash = parentZobrist ?? state.zobristHash;
  const nextZobrist =
    baseHash !== undefined
      ? updateZobristHashAfterMove(
          baseHash,
          state,
          move,
          nextCastling,
          nextEnPassant
        )
      : undefined;

  return {
    board: nextBoard,
    turn: nextTurn,
    castlingRights: nextCastling,
    enPassantTarget: nextEnPassant,
    halfMoveClock: nextHalfMoveClock,
    fullMoveNumber: nextFullMoveNumber,
    positionCounts: state.positionCounts,
    moveHistory: state.moveHistory,
    capturedByWhite: state.capturedByWhite,
    capturedByBlack: state.capturedByBlack,
    status: 'playing',
    winner: null,
    inCheck: false,
    lastMove: { from: move.from, to: move.to },
    zobristHash: nextZobrist,
  };
}

interface SearchContext {
  difficulty: AIDifficulty;
  config: ChessEngineConfig;
  evalParam: AIDifficulty | Partial<ChessEngineConfig>;
  nodes: number;
  ttHits: number;
  isEndgame: boolean;
  tt: Map<bigint, TTEntry>;
  killerMoves: [string | undefined, string | undefined][];
  historyTable: HistoryTable;
  pathHashes: bigint[];
  startTimeMs: number;
  maxTimeMs: number;
  aborted: boolean;
}

const MAX_QUIESCENCE_DEPTH = 6;
const TIMER_CHECK_MASK = 2047; // Check elapsed time every 2048 nodes

/**
 * Upgraded Fail-Soft Quiescence Search:
 * - Evaluates captures and promotions (including Knight underpromotions) to resolve tactical exchanges.
 * - When in check (`inCheck === true`), bypasses stand-pat and generates all legal evasions,
 *   returning exact root-relative checkmate score (`-MATE_SCORE + ply`) if no legal evasion exists.
 * - Applies Delta Pruning (exempting endgames, promotions, and in-check nodes).
 */
function quiescenceSearch(
  state: GameState,
  alpha: number,
  beta: number,
  qDepth: number,
  ply: number,
  ctx: SearchContext
): number {
  if (
    (ctx.nodes & TIMER_CHECK_MASK) === 0 &&
    performance.now() - ctx.startTimeMs >= ctx.maxTimeMs
  ) {
    ctx.aborted = true;
    return evaluateForSide(state.board, state.turn, ctx.evalParam);
  }

  ctx.nodes++;

  const inCheck = isKingInCheck(state.board, state.turn);
  let standPat = -MATE_SCORE;
  let bestScore = -Infinity;

  if (!inCheck) {
    standPat = evaluateForSide(state.board, state.turn, ctx.evalParam);
    bestScore = standPat;
    if (qDepth >= MAX_QUIESCENCE_DEPTH) {
      return standPat;
    }
    if (standPat >= beta) {
      return standPat;
    }
    if (standPat > alpha) {
      alpha = standPat;
    }
  } else if (qDepth >= MAX_QUIESCENCE_DEPTH + 2) {
    return evaluateForSide(state.board, state.turn, ctx.evalParam);
  }

  const pseudoMoves = generatePseudoLegalMoves(state).filter(
    (m) => m.promotion !== 'r' && m.promotion !== 'b'
  );

  // Select candidate moves:
  // - If inCheck: all pseudo-legal evasions (captures and quiet evasions)
  // - If !inCheck: strictly captures and promotions (prevents quiet check tree explosions)
  const candidateMoves: Move[] = [];
  for (const m of pseudoMoves) {
    if (inCheck || m.captured || m.promotion) {
      candidateMoves.push(m);
    }
  }

  if (candidateMoves.length === 0) {
    if (inCheck) {
      const legal = generateLegalMoves(state);
      if (legal.length === 0) {
        return -MATE_SCORE + ply;
      }
      return evaluateForSide(state.board, state.turn, ctx.evalParam);
    }
    return bestScore;
  }

  const ordered = orderMoves(
    candidateMoves,
    ctx.isEndgame,
    undefined,
    undefined,
    undefined,
    state.board
  );

  let legalEvasions = 0;

  for (const move of ordered) {
    // Delta Pruning & SEE Pruning (exempt endgames, promotions, and in-check positions)
    if (!inCheck) {
      if (!ctx.isEndgame && !move.promotion && move.captured) {
        const gainEstimate = PIECE_VALUES[move.captured.type];
        if (standPat + gainEstimate + 200 < alpha) {
          continue;
        }
      }

      // Prune clearly losing captures in Quiescence
      if (
        !move.promotion &&
        move.captured &&
        PIECE_VALUES[move.piece.type] > PIECE_VALUES[move.captured.type]
      ) {
        const see = evaluateSEE(state.board, move, state.turn);
        if (see < -50) {
          continue;
        }
      }
    }

    const nextBoard = applyMoveToBoard(state.board, move);
    if (isKingInCheck(nextBoard, state.turn)) {
      continue;
    }
    legalEvasions++;

    const childState = createChildSearchState(
      state,
      move,
      nextBoard,
      state.zobristHash
    );
    const score = -quiescenceSearch(
      childState,
      -beta,
      -alpha,
      qDepth + 1,
      ply + 1,
      ctx
    );

    if (ctx.aborted) {
      return bestScore > -Infinity
        ? bestScore
        : evaluateForSide(state.board, state.turn, ctx.evalParam);
    }

    if (score > bestScore) {
      bestScore = score;
    }
    if (score > alpha) {
      alpha = score;
    }
    if (score >= beta) {
      return bestScore;
    }
  }

  if (inCheck && legalEvasions === 0) {
    return -MATE_SCORE + ply;
  }

  return bestScore;
}

/**
 * Negamax Alpha-Beta Search with:
 * - Hard Time Cutoff check every 2048 nodes
 * - Search-path Repetition & 50-Move Rule draw detection
 * - Mate Distance Pruning (`-MATE_SCORE + ply` to `MATE_SCORE - ply - 1`)
 * - 64-bit Incremental Zobrist Transposition Table lookup & mate-normalized storage
 * - Null-Move Pruning (NMP) with Zugzwang & Static Eval verification
 * - 6-Tier Move Ordering (Hash -> Winning/Neutral Captures -> Killers -> History -> Losing Captures -> Quiet)
 * - Late Move Reductions (LMR) + Principal Variation re-search
 */
function alphaBeta(
  state: GameState,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  ctx: SearchContext,
  isNullMove = false
): number {
  if (
    (ctx.nodes & TIMER_CHECK_MASK) === 0 &&
    performance.now() - ctx.startTimeMs >= ctx.maxTimeMs
  ) {
    ctx.aborted = true;
    return evaluateForSide(state.board, state.turn, ctx.evalParam);
  }

  if (
    state.halfMoveClock >= FIFTY_MOVE_HALF_MOVE_LIMIT ||
    isInsufficientMaterial(state.board)
  ) {
    return 0;
  }

  const zobristKey = state.zobristHash ?? computeZobristHash(state);

  // Repetition detection along current search path & game history
  if (ply > 0 && state.halfMoveClock >= 2) {
    if (ctx.pathHashes.includes(zobristKey)) {
      return 0;
    }
    if (state.halfMoveClock >= 4 && Object.keys(state.positionCounts).length > 1) {
      const posHash = computePositionHash(
        state.board,
        state.turn,
        state.castlingRights,
        state.enPassantTarget
      );
      if ((state.positionCounts[posHash] ?? 0) >= THREEFOLD_REPETITION_LIMIT - 1) {
        return 0;
      }
    }
  }

  // Mate Distance Pruning: tighten [alpha, beta] to the shortest possible mate at this ply
  if (ply > 0) {
    alpha = Math.max(alpha, -MATE_SCORE + ply);
    beta = Math.min(beta, MATE_SCORE - ply - 1);
    if (alpha >= beta) {
      return alpha;
    }
  }

  const alphaOrig = alpha;
  const isPvNode = beta - alpha > 1;
  const useTT = ctx.config.enableTranspositionTable;

  let hashMoveKey: string | undefined;
  if (useTT) {
    const probe = probeTTEntry(ctx.tt, zobristKey, depth, alpha, beta, ply);
    if (probe.hit) {
      hashMoveKey = probe.hashMove;
      if (probe.cutoffScore !== undefined) {
        ctx.ttHits++;
        return probe.cutoffScore;
      }
    }
  }

  if (depth <= 0) {
    if (ctx.config.enableQuiescence) {
      return quiescenceSearch(state, alpha, beta, 0, ply, ctx);
    }
    // Even when Q-search is disabled, if King is in check at leaf horizon,
    // verify whether the active side is checkmated or has legal evasions!
    const leafInCheck = isKingInCheck(state.board, state.turn);
    if (leafInCheck) {
      const legalEvasions = generateLegalMoves(state);
      if (legalEvasions.length === 0) {
        return -MATE_SCORE + ply;
      }
    }
    ctx.nodes++;
    const baseEval = evaluateForSide(state.board, state.turn, ctx.evalParam);
    if (ctx.difficulty === 'casual') {
      const myRisk = getTotalHangingRisk(state.board, state.turn);
      const enemyRisk = getTotalHangingRisk(
        state.board,
        oppositeColor(state.turn)
      );
      return (
        baseEval - myRisk.maxPieceRisk * 0.65 + enemyRisk.maxPieceRisk * 0.35
      );
    }
    return baseEval;
  }

  ctx.nodes++;

  const inCheck = isKingInCheck(state.board, state.turn);

  ctx.pathHashes.push(zobristKey);
  try {
    // ============================================================================
    // NULL-MOVE PRUNING (NMP) WITH ZUGZWANG & STATIC EVAL VERIFICATION
    // If not in check, remaining depth >= 3, not in a PV or mate search, side to move
    // has non-pawn material (avoids Zugzwang in King+Pawn endgames), and static eval >= beta,
    // pass the turn with reduction R = 2 or 3.
    // ============================================================================
    if (
      ctx.config.enableNullMovePruning &&
      !isNullMove &&
      !isPvNode &&
      ply > 0 &&
      depth >= 3 &&
      !inCheck &&
      Math.abs(beta) < MATE_THRESHOLD &&
      hasNonPawnMaterial(state.board, state.turn)
    ) {
      const staticEval = evaluateForSide(state.board, state.turn, ctx.evalParam);
      if (staticEval >= beta) {
        const R = depth >= 6 ? 3 : 2;
        let nullZobrist = zobristKey ^ ZOBRIST_SIDE_TO_MOVE_KEY;
        if (state.enPassantTarget) {
          const epCoords = squareToCoords(state.enPassantTarget);
          if (isInsideBoard(epCoords.row, epCoords.col)) {
            nullZobrist ^= ZOBRIST_EP_SQUARE_KEYS[epCoords.row * 8 + epCoords.col];
          }
        }
        const nullState: GameState = {
          ...state,
          turn: oppositeColor(state.turn),
          enPassantTarget: null,
          inCheck: false,
          zobristHash: nullZobrist,
        };

        const nullScore = -alphaBeta(
          nullState,
          depth - 1 - R,
          ply + 1,
          -beta,
          -beta + 1,
          ctx,
          true
        );

        if (ctx.aborted) {
          return staticEval;
        }

        if (nullScore >= beta) {
          return nullScore >= MATE_THRESHOLD ? beta : nullScore;
        }
      }
    }

    const pseudoMoves = generatePseudoLegalMoves(state).filter(
      (m) => m.promotion !== 'r' && m.promotion !== 'b'
    );
    const killers =
      ply < MAX_PLY ? ctx.killerMoves[ply] ?? [undefined, undefined] : [undefined, undefined];
    const ordered = orderMoves(
      pseudoMoves,
      ctx.isEndgame,
      hashMoveKey,
      killers[0],
      killers[1],
      depth >= 2 ? state.board : undefined,
      ctx.historyTable
    );

    const enemyColor = oppositeColor(state.turn);
    let legalMoveCount = 0;
    let bestScore = -Infinity;
    let bestMoveKey: string | undefined;

    for (const move of ordered) {
      const nextBoard = applyMoveToBoard(state.board, move);
      if (isKingInCheck(nextBoard, state.turn)) {
        continue;
      }
      legalMoveCount++;

      const childState = createChildSearchState(
        state,
        move,
        nextBoard,
        zobristKey
      );
      const moveKey = `${move.from}${move.to}${move.promotion ?? ''}`;
      const isQuiet = !move.captured && !move.promotion && !move.isCastle;
      const isKiller = moveKey === killers[0] || moveKey === killers[1];

      let score: number;

      // ==========================================================================
      // LATE MOVE REDUCTIONS (LMR)
      // For quiet, non-killer, non-checking moves searched late in the ordering list
      // at depth >= 3, reduce search depth by 1 or 2 plies. Re-search at full depth if score > alpha.
      // ==========================================================================
      let didLMR = false;
      if (
        ctx.config.enableLMR &&
        depth >= 3 &&
        legalMoveCount > 3 &&
        !inCheck &&
        isQuiet &&
        !isKiller
      ) {
        const givesCheck = isKingInCheck(nextBoard, enemyColor);
        if (!givesCheck) {
          const reduction = legalMoveCount > 6 && depth >= 4 ? 2 : 1;
          const reducedDepth = Math.max(1, depth - 1 - reduction);
          didLMR = true;

          score = -alphaBeta(
            childState,
            reducedDepth,
            ply + 1,
            -alpha - 1,
            -alpha,
            ctx,
            false
          );

          // If reduced search beats alpha, re-search at full depth and full window
          if (!ctx.aborted && score > alpha) {
            score = -alphaBeta(
              childState,
              depth - 1,
              ply + 1,
              -beta,
              -alpha,
              ctx,
              false
            );
          }
        } else {
          score = -alphaBeta(
            childState,
            depth - 1,
            ply + 1,
            -beta,
            -alpha,
            ctx,
            false
          );
        }
      } else if (!didLMR) {
        score = -alphaBeta(
          childState,
          depth - 1,
          ply + 1,
          -beta,
          -alpha,
          ctx,
          false
        );
      } else {
        score = -Infinity;
      }

      if (ctx.aborted) {
        return bestScore > -Infinity
          ? bestScore
          : evaluateForSide(state.board, state.turn, ctx.evalParam);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMoveKey = moveKey;
      }

      if (score > alpha) {
        alpha = score;
      }

      if (score >= beta) {
        // Beta-cutoff: update Killer Moves (2 per ply, strictly non-captures) and History Heuristic table
        if (!move.captured && !move.promotion && ply < MAX_PLY) {
          const slot = ctx.killerMoves[ply] ?? [undefined, undefined];
          if (slot[0] !== moveKey) {
            ctx.killerMoves[ply] = [moveKey, slot[0]];
          }
          recordHistoryCutoff(ctx.historyTable, move, depth);
        }
        break;
      }
    }

    // Terminal node detection (Checkmate or Stalemate)
    if (legalMoveCount === 0) {
      if (inCheck) {
        return -MATE_SCORE + ply;
      }
      return 0;
    }

    if (useTT && !ctx.aborted) {
      const flag: TTFlag =
        bestScore <= alphaOrig
          ? 'UPPERBOUND'
          : bestScore >= beta
          ? 'LOWERBOUND'
          : 'EXACT';
      storeTTEntry(
        ctx.tt,
        zobristKey,
        depth,
        bestScore,
        flag,
        ply,
        bestMoveKey
      );
    }

    return bestScore;
  } finally {
    ctx.pathHashes.pop();
  }
}

/**
 * Checks whether a candidate move in `state` is free of obvious 1-ply blunders.
 */
function isCandidateSafeFromBlunder(
  state: GameState,
  move: Move,
  currentRisk: ReturnType<typeof getTotalHangingRisk>
): {
  leavesQueenHanging: boolean;
  netMaterialSafetyDelta: number;
  isSafe: boolean;
} {
  const aiColor = state.turn;
  const boardAfter = applyMoveToBoard(state.board, move);
  const afterRisk = getTotalHangingRisk(boardAfter, aiColor);
  const captureGain = evaluateCaptureGain(state.board, move, aiColor);
  const moveSafe = isMoveSafe(state.board, move, aiColor);

  const toCoords = squareToCoords(move.to);
  const targetVuln =
    move.captured || move.promotion
      ? evaluateSquareVulnerability(
          boardAfter,
          toCoords.row,
          toCoords.col,
          aiColor
        )
      : 0;
  const nonTargetRiskAfter = Math.max(0, afterRisk.totalRisk - targetVuln);
  const riskDelta = currentRisk.totalRisk - nonTargetRiskAfter;

  const leavesQueenHanging = afterRisk.queenRisk >= 400;
  const netMaterialSafetyDelta = captureGain + riskDelta;
  const isSafe =
    !leavesQueenHanging && moveSafe && netMaterialSafetyDelta >= -50;

  return {
    leavesQueenHanging,
    netMaterialSafetyDelta,
    isSafe,
  };
}

function countTotalPieces(board: Board): number {
  let count = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]) count++;
    }
  }
  return count;
}

/**
 * Executes the parameterized classical chess engine search for `state`.
 * Accepts either a preset `AIDifficulty` ('novice' | 'casual' | 'intermediate' | 'club')
 * or a fine-grained `Partial<ChessEngineConfig>` (with optional `configOverrides`).
 */
export function searchBestAIMove(
  state: GameState,
  difficultyOrConfig: AIDifficulty | Partial<ChessEngineConfig> = 'casual',
  rng: () => number = Math.random,
  configOverrides?: Partial<ChessEngineConfig>
): AISearchResult {
  const startTimeMs = performance.now();
  const legalMoves = generateLegalMoves(state);
  const aiColor = state.turn;
  const signForWhite = aiColor === 'w' ? 1 : -1;

  const isPresetString = typeof difficultyOrConfig === 'string';
  const difficulty: AIDifficulty = isPresetString ? difficultyOrConfig : 'club';
  const config = resolveEngineConfig(difficultyOrConfig, configOverrides);
  const hasCustomConfig = !isPresetString || Boolean(configOverrides);

  if (legalMoves.length === 0) {
    const rawEval = evaluateBoardWhitePerspective(
      state.board,
      hasCustomConfig ? config : difficulty
    );
    return {
      move: null,
      difficulty,
      depth: 0,
      nodes: 0,
      score: rawEval,
      formattedScore: formatEvalScore(rawEval),
      elapsedMs: Math.round(performance.now() - startTimeMs),
      ttHits: 0,
      config,
    };
  }

  const candidateMoves = legalMoves.filter(
    (m) =>
      !(
        (m.promotion === 'r' || m.promotion === 'b') &&
        legalMoves.some(
          (o) => o.from === m.from && o.to === m.to && o.promotion === 'q'
        )
      )
  );

  // ============================================================================
  // OPENING BOOK INTEGRATION: Instant, master-grade opening move selection
  // Moves 1 to 6 (plies <= 12) when King is not in check
  // ============================================================================
  const isStartGame =
    state.moveHistory.length > 0 ||
    candidateMoves.length === 20; // 20 legal moves on standard initial board

  if (!state.inCheck && state.moveHistory.length <= 12 && isStartGame) {
    const bookCandidates = getBookMoveCandidates(state, candidateMoves);
    if (bookCandidates.length > 0) {
      const useBook =
        difficulty === 'novice'
          ? rng() >= config.errorProbability
          : true;

      if (useBook) {
        let chosenBookEntry = bookCandidates[0];
        if (bookCandidates.length > 1) {
          if (difficulty === 'club' && !hasCustomConfig) {
            // Club / Master plays the primary mainline book line deterministically
            chosenBookEntry = bookCandidates[0];
          } else {
            // Casual / Intermediate / Novice introduces opening variety
            const randIdx = Math.floor(rng() * bookCandidates.length);
            chosenBookEntry = bookCandidates[randIdx];
          }
        }

        const staticEval = evaluateBoardWhitePerspective(
          state.board,
          hasCustomConfig ? config : difficulty
        );

        return {
          move: chosenBookEntry.move,
          difficulty,
          depth: 1,
          nodes: 1,
          score: staticEval,
          formattedScore: formatEvalScore(staticEval),
          elapsedMs: 1,
          ttHits: 0,
          config,
        };
      }
    }
  }

  // ============================================================================
  // PRESET 1: NOVICE (~600 ELO) when no custom deep search config overrides maxDepth > 1
  // ============================================================================
  if (difficulty === 'novice' && !hasCustomConfig && config.maxDepth === 1) {
    let nodes = 0;
    const scoredMoves = candidateMoves.map((move) => {
      nodes++;
      const nextBoard = applyMoveToBoard(state.board, move);
      const matScore = evaluateForSide(nextBoard, aiColor, 'novice');
      const captureBonus = move.captured ? PIECE_VALUES[move.captured.type] : 0;
      const safeStep = isMoveSafe(state.board, move, aiColor) ? 25 : 0;
      return {
        move,
        matScore,
        greedyScore: matScore + captureBonus * 0.5 + safeStep,
      };
    });

    let chosen = scoredMoves[0];

    if (rng() < config.errorProbability) {
      chosen = scoredMoves[Math.floor(rng() * scoredMoves.length)];
    } else {
      scoredMoves.sort((a, b) => b.greedyScore - a.greedyScore);
      const bestGreedy = scoredMoves[0].greedyScore;
      const tiedTop = scoredMoves.filter(
        (m) => m.greedyScore >= bestGreedy - 25
      );
      chosen = tiedTop[Math.floor(rng() * tiedTop.length)];
    }

    const whiteScore = chosen.matScore * signForWhite;
    return {
      move: chosen.move,
      difficulty,
      depth: 1,
      nodes,
      score: whiteScore,
      formattedScore: formatEvalScore(whiteScore),
      elapsedMs: Math.max(1, Math.round(performance.now() - startTimeMs)),
      ttHits: 0,
      config,
    };
  }

  // ============================================================================
  // PRESET 2: CASUAL (~1000 ELO) when no custom search config overrides
  // ============================================================================
  if (difficulty === 'casual' && !hasCustomConfig && config.maxDepth === 2) {
    const currentRisk = getTotalHangingRisk(state.board, aiColor);
    const isEndgame = isEndgamePhase(state.board);
    const rootZobrist = computeZobristHash(state);
    const ctx: SearchContext = {
      difficulty: 'casual',
      config,
      evalParam: 'casual',
      nodes: 0,
      ttHits: 0,
      isEndgame,
      tt: new Map(),
      killerMoves: Array.from({ length: MAX_PLY }, () => [undefined, undefined]),
      historyTable: createHistoryTable(),
      pathHashes: [rootZobrist],
      startTimeMs,
      maxTimeMs: config.maxTimeMs,
      aborted: false,
    };

    const evaluatedRoot = candidateMoves.map((move) => {
      const nextState = makeMove(state, move);
      if (nextState.status === 'checkmate') {
        ctx.nodes++;
        return {
          move,
          searchScore: MATE_SCORE,
          safety: {
            leavesQueenHanging: false,
            netMaterialSafetyDelta: 10000,
            isSafe: true,
          },
          preventsDraw: true,
          combinedScore: MATE_SCORE,
        };
      }

      const isDraw =
        nextState.status === 'stalemate' ||
        nextState.status === 'draw_repetition' ||
        nextState.status === 'draw_fifty_move';

      const safety = isCandidateSafeFromBlunder(state, move, currentRisk);
      const searchScore = isDraw
        ? 0
        : -alphaBeta(nextState, 1, 1, -MATE_SCORE, MATE_SCORE, ctx);

      let safetyAdjustment = safety.netMaterialSafetyDelta * 0.6;
      if (safety.leavesQueenHanging) {
        safetyAdjustment -= 2500;
      } else if (!safety.isSafe) {
        safetyAdjustment -= 450;
      }

      return {
        move,
        searchScore,
        safety,
        preventsDraw: !isDraw,
        combinedScore: searchScore + safetyAdjustment,
      };
    });

    const mateMove = evaluatedRoot.find((r) => r.searchScore >= MATE_THRESHOLD);
    if (mateMove) {
      const whiteScore = mateMove.searchScore * signForWhite;
      return {
        move: mateMove.move,
        difficulty,
        depth: 2,
        nodes: ctx.nodes,
        score: whiteScore,
        formattedScore: formatEvalScore(whiteScore),
        elapsedMs: Math.max(1, Math.round(performance.now() - startTimeMs)),
        ttHits: ctx.ttHits,
        config,
      };
    }

    const queenSafePool = evaluatedRoot.filter(
      (r) => !r.safety.leavesQueenHanging
    );
    const activePool = queenSafePool.length > 0 ? queenSafePool : evaluatedRoot;

    const strictlySafePool = activePool.filter(
      (r) => r.safety.isSafe && r.preventsDraw
    );
    const safePool =
      strictlySafePool.length > 0 ? strictlySafePool : activePool;

    safePool.sort((a, b) => b.combinedScore - a.combinedScore);

    let chosen = safePool[0];
    if (rng() < config.errorProbability && safePool.length > 1) {
      const subOptimalPool = safePool.slice(1, Math.min(5, safePool.length));
      chosen = subOptimalPool[Math.floor(rng() * subOptimalPool.length)];
    } else if (safePool.length > 1) {
      const best = safePool[0].combinedScore;
      const topTied = safePool.filter((r) => r.combinedScore >= best - 18);
      chosen = topTied[Math.floor(rng() * topTied.length)];
    }

    const whiteScore = chosen.searchScore * signForWhite;
    return {
      move: chosen.move,
      difficulty,
      depth: 2,
      nodes: ctx.nodes,
      score: whiteScore,
      formattedScore: formatEvalScore(whiteScore),
      elapsedMs: Math.max(1, Math.round(performance.now() - startTimeMs)),
      ttHits: ctx.ttHits,
      config,
    };
  }

  // ============================================================================
  // UNIFIED 3000+ ELO FAST 0x88 PVS SEARCH ENGINE
  // (Reactive, Intermediate, Club 1800, Grandmaster 3000+, Custom Config)
  // - Zero-allocation 0x88 board + piece lists + incremental PeSTO MG/EG eval
  // - Persistent 64 MB Flat TypedArray Transposition Table (64-bit Zobrist)
  // - Iterative Deepening with Soft (~45%) & Hard (2048-node check) Time Bounds
  // - Aspiration Windows + PVS + NMP + LMR + RFP + Futility/LMP + Check Ext + SEE Q-Search
  // ============================================================================
  const fastBoard = getSharedFastBoard();
  const fastEngine = getSharedFastEngine();
  fastBoard.loadGameState(state);

  const targetDepth = config.maxDepth;
  const hardTimeMs = Math.max(25, Math.min(MAX_HARD_TIME_LIMIT_MS, config.maxTimeMs));
  const softTimeMs = Math.max(20, Math.floor(hardTimeMs * 0.45));

  const outcome = fastEngine.search(fastBoard, {
    maxDepth: targetDepth,
    maxTimeMs: hardTimeMs,
    softTimeMs,
    config,
    rng,
  });

  const chosenMove =
    matchFastMoveToLegal(outcome.bestMove, legalMoves) ?? legalMoves[0];
  const whiteScore = outcome.score * signForWhite;

  return {
    move: chosenMove,
    difficulty,
    depth: Math.max(1, outcome.depth),
    nodes: outcome.nodes,
    score: whiteScore,
    formattedScore: formatEvalScore(whiteScore),
    elapsedMs: Math.max(1, outcome.elapsedMs),
    ttHits: outcome.ttHits,
    config,
  };
}

/**
 * Selects the AI opponent's move for the given `state` and `difficultyOrConfig`.
 */
export function selectAIMove(
  state: GameState,
  rng: () => number = Math.random,
  difficultyOrConfig: AIDifficulty | Partial<ChessEngineConfig> = 'casual'
): Move | null {
  return searchBestAIMove(state, difficultyOrConfig, rng).move;
}

/**
 * Computes the human-like cadence delay (ms) required before applying the AI move.
 */
export function getTargetAIDelayMs(
  difficulty: AIDifficulty,
  elapsedComputeMs: number,
  rng: () => number = Math.random
): number {
  if (difficulty === 'novice' || difficulty === 'casual') {
    const targetTotal = 300 + Math.floor(rng() * 200);
    return Math.max(0, targetTotal - elapsedComputeMs);
  }
  return Math.max(0, 400 - elapsedComputeMs);
}

/* ============================================================================
 * 5. MULTI-PV SEARCH FOR TACTICAL COACH & MOVE PREDICTOR
 * ========================================================================== */

/**
 * Converts a centipawn evaluation (from the active player's perspective)
 * into an estimated Win Probability percentage (0 to 100) using a standard logistic curve.
 */
export function computeWinProbability(centipawnsForMover: number): number {
  if (centipawnsForMover >= MATE_THRESHOLD) return 100;
  if (centipawnsForMover <= -MATE_THRESHOLD) return 0;
  const raw = 100 / (1 + Math.exp(-0.00368208 * centipawnsForMover));
  return Math.max(1, Math.min(99, Math.round(raw)));
}

export interface PVStep {
  from: Square;
  to: Square;
  san: string;
  color: Color;
  move: Move;
}

export interface MultiPVItem {
  move: Move;
  nextState: GameState;
  san: string;
  scoreForTurn: number;
  whiteScore: number;
  formattedScore: string;
  winProb: number;
  seeScore: number;
  safety: {
    leavesQueenHanging: boolean;
    netMaterialSafetyDelta: number;
    isSafe: boolean;
  };
  pvLine: PVStep[];
}

export interface MultiPVSearchResult {
  items: MultiPVItem[];
  depth: number;
  nodes: number;
  ttHits: number;
  elapsedMs: number;
  config: ChessEngineConfig;
}

/**
 * Extracts a Principal Variation (PV) line starting from `rootMove` in `rootState`
 * by walking the 64-bit Zobrist Transposition Table.
 */
function extractPrincipalVariation(
  rootState: GameState,
  rootMove: Move,
  rootNextState: GameState,
  rootSan: string,
  ctx: SearchContext,
  maxPvMoves = 5,
  allowFallbackProbe = true
): PVStep[] {
  const pv: PVStep[] = [
    {
      from: rootMove.from,
      to: rootMove.to,
      san: rootSan,
      color: rootState.turn,
      move: rootMove,
    },
  ];

  let currState = rootNextState;
  const visitedKeys = new Set<bigint>([computeZobristHash(rootState)]);

  for (let step = 1; step < maxPvMoves; step++) {
    if (currState.status !== 'playing') break;

    const stateKey = computeZobristHash(currState);
    if (visitedKeys.has(stateKey)) break;
    visitedKeys.add(stateKey);

    const legal = generateLegalMoves(currState);
    if (legal.length === 0) break;

    const ttEntry = ctx.tt.get(stateKey);
    let chosenMove: Move | undefined;

    if (ttEntry?.hashMove) {
      chosenMove = legal.find(
        (m) => `${m.from}${m.to}${m.promotion ?? ''}` === ttEntry.hashMove
      );
    }

    if (!chosenMove && allowFallbackProbe && step <= 2) {
      let bestProbeScore = -Infinity;
      const ordered = orderMoves(
        legal,
        ctx.isEndgame,
        undefined,
        undefined,
        undefined,
        currState.board,
        ctx.historyTable
      );
      for (const cand of ordered.slice(0, 8)) {
        const nextSt = makeMove(currState, cand);
        if (nextSt.status === 'checkmate') {
          chosenMove = cand;
          break;
        }
        const probeScore = -quiescenceSearch(
          nextSt,
          -MATE_SCORE,
          MATE_SCORE,
          0,
          step + 1,
          ctx
        );
        if (probeScore > bestProbeScore) {
          bestProbeScore = probeScore;
          chosenMove = cand;
        }
      }
    }

    if (!chosenMove) break;

    const nextSt = makeMove(currState, chosenMove);
    const san =
      nextSt.moveHistory[nextSt.moveHistory.length - 1]?.san ??
      `${chosenMove.from}-${chosenMove.to}`;

    pv.push({
      from: chosenMove.from,
      to: chosenMove.to,
      san,
      color: currState.turn,
      move: chosenMove,
    });

    currState = nextSt;
  }

  return pv;
}

/**
 * Runs a Multi-PV Iterative Deepening PVS + Quiescence search backed by the
 * zero-allocation 0x88 engine, persistent 64 MB flat TypedArray TT, NMP, LMR, and PeSTO eval.
 */
export function searchMultiPV(
  state: GameState,
  options?: {
    maxDepth?: number;
    maxTimeMs?: number;
    multiPvCount?: number;
    engineConfig?: Partial<ChessEngineConfig>;
    forCoach?: boolean;
    onInfo?: (info: SearchInfoEvent) => void;
  }
): MultiPVSearchResult {
  const startTimeMs = performance.now();
  const totalPieces = countTotalPieces(state.board);
  const defaultDepth = totalPieces <= 12 ? 16 : 14;
  const targetDepth =
    options?.maxDepth ?? options?.engineConfig?.maxDepth ?? defaultDepth;
  const maxTimeMs = Math.min(
    MAX_HARD_TIME_LIMIT_MS,
    options?.maxTimeMs ?? options?.engineConfig?.maxTimeMs ?? 1050
  );
  const multiPvCount = options?.multiPvCount ?? 3;

  const clubConfig = resolveEngineConfig('club', {
    ...options?.engineConfig,
    maxDepth: targetDepth,
    maxTimeMs,
    // Tactical Coach Multi-PV always runs with full 3000+ search features and zero error
    ...(options?.forCoach
      ? {
          enableQuiescence: true,
          enableTranspositionTable: true,
          enableNullMovePruning: true,
          enableLMR: true,
          errorProbability: 0.0,
          errorMarginCentipawns: 0,
        }
      : {}),
  });

  const legalMoves = generateLegalMoves(state);
  if (legalMoves.length === 0 || state.status !== 'playing') {
    return {
      items: [],
      depth: 0,
      nodes: 0,
      ttHits: 0,
      elapsedMs: 0,
      config: clubConfig,
    };
  }

  const aiColor = state.turn;
  const signForWhite = aiColor === 'w' ? 1 : -1;
  const currentRisk = getTotalHangingRisk(state.board, aiColor);

  const useCoachEngine =
    options?.forCoach === true ||
    options?.engineConfig?.evalWeights !== undefined;
  const fastBoard = useCoachEngine ? getCoachFastBoard() : getSharedFastBoard();
  const fastEngine = useCoachEngine
    ? getCoachFastEngine(clubConfig.evalWeights)
    : getSharedFastEngine();
  fastBoard.loadGameState(state);

  const outcome = fastEngine.search(fastBoard, {
    maxDepth: targetDepth,
    maxTimeMs,
    softTimeMs: Math.max(40, Math.floor(maxTimeMs * 0.6)),
    multiPv: Math.max(multiPvCount, 1),
    config: clubConfig,
    onInfo: options?.onInfo,
  });

  const lines =
    outcome.multiPvLines && outcome.multiPvLines.length > 0
      ? outcome.multiPvLines
      : outcome.bestMove
      ? [
          {
            move: outcome.bestMove,
            uci: outcome.bestUci,
            score: outcome.score,
            pv: outcome.pv,
          },
        ]
      : [];
  const items: MultiPVItem[] = [];
  const seenKeys = new Set<string>();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const move = matchFastMoveToLegal(line.move, legalMoves);
    if (!move) continue;
    const key = `${move.from}${move.to}${move.promotion ?? ''}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const nextState = makeMove(state, move);
    const san =
      nextState.moveHistory[nextState.moveHistory.length - 1]?.san ??
      `${move.from}-${move.to}`;
    const seeScore = evaluateSEE(state.board, move, aiColor);
    const safety = isCandidateSafeFromBlunder(state, move, currentRisk);
    const scoreForTurn = line.score;
    const whiteScore = scoreForTurn * signForWhite;
    const formattedScore = formatEvalScore(whiteScore);
    const winProb = computeWinProbability(scoreForTurn);
    const pvLine =
      idx < Math.max(multiPvCount + 1, 4)
        ? fastMoveListToPVSteps(state, line.pv, 6)
        : [
            {
              from: move.from,
              to: move.to,
              san,
              color: state.turn,
              move,
            },
          ];

    items.push({
      move,
      nextState,
      san,
      scoreForTurn,
      whiteScore,
      formattedScore,
      winProb,
      seeScore,
      safety,
      pvLine:
        pvLine.length > 0
          ? pvLine
          : [
              {
                from: move.from,
                to: move.to,
                san,
                color: state.turn,
                move,
              },
            ],
    });
  }

  return {
    items,
    depth: Math.max(1, outcome.depth),
    nodes: outcome.nodes,
    ttHits: outcome.ttHits,
    elapsedMs: Math.max(1, Math.round(performance.now() - startTimeMs)),
    config: clubConfig,
  };
}
