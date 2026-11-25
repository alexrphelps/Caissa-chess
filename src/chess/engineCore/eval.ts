import { FastBoard } from './board';
import {
  BISHOP_DIRS_88,
  KING_ATTACK_WEIGHT,
  KNIGHT_OFFSETS_88,
  MAX_PHASE,
  PASSED_PAWN_EG,
  PASSED_PAWN_MG,
  QUEEN_DIRS_88,
  ROOK_DIRS_88,
} from './tables';
import {
  BB,
  BLACK,
  BN,
  BP,
  BQ,
  BR,
  COLOR_BIT,
  EMPTY,
  WB,
  WHITE,
  WN,
  WP,
  WQ,
  WR,
} from './types';
import { EvalWeights } from '../types';

/* ============================================================================
 * PRE-ALLOCATED SCRATCH BUFFERS (ZERO HEAP ALLOCATIONS PER EVAL CALL)
 * ========================================================================== */

const wPawnCount = new Int8Array(8);
const bPawnCount = new Int8Array(8);
const wPawnMinRow = new Int8Array(8);
const wPawnMaxRow = new Int8Array(8);
const bPawnMinRow = new Int8Array(8);
const bPawnMaxRow = new Int8Array(8);

// Timestamped enemy pawn attack maps & king-zone maps (avoid clearing 128 bytes each call)
const wPawnAtk = new Uint8Array(128);
const bPawnAtk = new Uint8Array(128);
const bkZone = new Uint8Array(128);
const wkZone = new Uint8Array(128);
let atkStamp = 1;

export const DEFAULT_WEIGHTS_FAST: Readonly<EvalWeights> = {
  material: 1.0,
  pieceSquareTables: 1.0,
  pawnStructure: 1.0,
  kingSafety: 1.0,
  mobility: 1.0,
};

export function areDefaultWeights(w?: EvalWeights): boolean {
  if (!w) return true;
  return (
    w.material === 1.0 &&
    w.pieceSquareTables === 1.0 &&
    w.pawnStructure === 1.0 &&
    w.kingSafety === 1.0 &&
    w.mobility === 1.0 &&
    (w.aggression === undefined || w.aggression === 1.0)
  );
}

/**
 * High-speed, zero-allocation PeSTO-style Tapered Positional Evaluation.
 * Returns score in centipawns strictly from the perspective of `board.side` (side to move).
 *
 * Includes:
 * - Incremental PeSTO MG/EG material & PST scores
 * - O(P) Pawn Structure (Passed pawns with clear-path/protected/king-proximity,
 *   Doubled, Isolated, Backward, Connected pawns)
 * - Safe Piece Mobility (excluding enemy pawn-controlled squares) for N, B, R, Q
 * - Piece Coordination (Bishop Pair, Rook Open/Semi-Open File & 7th Rank, Knight Outposts)
 * - Middlegame King Safety (Pawn Shield, Open Files near King, 3x3 King Zone Attack Weight Table)
 * - Side-to-move Tempo bonus
 */
export function evaluateFast(
  board: FastBoard,
  weights?: EvalWeights,
  useDefaultWeights = true,
  lazyAlpha = -32000,
  lazyBeta = 32000,
  fastLeaf = false
): number {
  const squares = board.squares;
  const pieceList = board.pieceList;
  const pieceCount = board.pieceCount;

  // Phase interpolation weights (0..24)
  const mgPhase = board.phase > MAX_PHASE ? MAX_PHASE : board.phase < 0 ? 0 : board.phase;
  const egPhase = MAX_PHASE - mgPhase;

  // 0. O(1) Lazy Evaluation fast path (5 CPU ops using incremental PeSTO accumulators)
  // Uses wider 520cp margin in endgames where passed pawns can swing eval heavily
  if (useDefaultWeights && lazyBeta < 30000) {
    const baseWhite =
      (((board.matMg + board.pstMg) * mgPhase + (board.matEg + board.pstEg) * egPhase) /
        MAX_PHASE) |
      0;
    const baseSide = board.side === WHITE ? baseWhite + 12 : -baseWhite + 12;
    const lazyMargin = mgPhase <= 4 ? 520 : 340;
    if (baseSide - lazyMargin >= lazyBeta || baseSide + lazyMargin <= lazyAlpha) {
      return baseSide;
    }
  }

  // Advance timestamp for pawn attack & king zone maps
  let stamp = atkStamp + 1;
  if (stamp >= 255) {
    wPawnAtk.fill(0);
    bPawnAtk.fill(0);
    bkZone.fill(0);
    wkZone.fill(0);
    stamp = 1;
  }
  atkStamp = stamp;

  // Reset per-file pawn metadata (8 iterations, unrolled/tiny)
  for (let c = 0; c < 8; c++) {
    wPawnCount[c] = 0;
    bPawnCount[c] = 0;
    wPawnMinRow[c] = 8;
    wPawnMaxRow[c] = -1;
    bPawnMinRow[c] = 8;
    bPawnMaxRow[c] = -1;
  }

  // 1. Scan pawns once to build O(1) file metadata + pawn attack bitmaps
  const wpCount = pieceCount[WP];
  const wpBase = WP << 4;
  let wPawnsOn2nd = false;
  for (let i = 0; i < wpCount; i++) {
    const sq = pieceList[wpBase | i];
    const r = sq >> 4;
    const c = sq & 7;
    wPawnCount[c]++;
    if (r < wPawnMinRow[c]) wPawnMinRow[c] = r;
    if (r > wPawnMaxRow[c]) wPawnMaxRow[c] = r;
    if (r === 6) wPawnsOn2nd = true;
    const a1 = sq - 17;
    if ((a1 & 0x88) === 0) wPawnAtk[a1] = stamp;
    const a2 = sq - 15;
    if ((a2 & 0x88) === 0) wPawnAtk[a2] = stamp;
  }

  const bpCount = pieceCount[BP];
  const bpBase = BP << 4;
  let bPawnsOn7th = false;
  for (let i = 0; i < bpCount; i++) {
    const sq = pieceList[bpBase | i];
    const r = sq >> 4;
    const c = sq & 7;
    bPawnCount[c]++;
    if (r < bPawnMinRow[c]) bPawnMinRow[c] = r;
    if (r > bPawnMaxRow[c]) bPawnMaxRow[c] = r;
    if (r === 1) bPawnsOn7th = true;
    const a1 = sq + 15;
    if ((a1 & 0x88) === 0) bPawnAtk[a1] = stamp;
    const a2 = sq + 17;
    if ((a2 & 0x88) === 0) bPawnAtk[a2] = stamp;
  }

  const wkSq = board.kingSq[WHITE];
  const bkSq = board.kingSq[BLACK];
  const wkR = wkSq >> 4;
  const wkC = wkSq & 7;
  const bkR = bkSq >> 4;
  const bkC = bkSq & 7;

  // 2. Pawn Structure (MG & EG, White minus Black)
  let pawnMg = 0;
  let pawnEg = 0;

  if (useDefaultWeights || (weights && weights.pawnStructure > 0)) {
    // Doubled & Isolated pawns
    for (let c = 0; c < 8; c++) {
      const wc = wPawnCount[c];
      if (wc > 0) {
        if (wc > 1) {
          const extra = wc - 1;
          pawnMg -= extra * 14;
          pawnEg -= extra * 22;
        }
        const hasNeighbor =
          (c > 0 && wPawnCount[c - 1] > 0) || (c < 7 && wPawnCount[c + 1] > 0);
        if (!hasNeighbor) {
          pawnMg -= bPawnCount[c] === 0 ? 18 : 12;
          pawnEg -= 16;
        }
      }

      const bc = bPawnCount[c];
      if (bc > 0) {
        if (bc > 1) {
          const extra = bc - 1;
          pawnMg += extra * 14;
          pawnEg += extra * 22;
        }
        const hasNeighbor =
          (c > 0 && bPawnCount[c - 1] > 0) || (c < 7 && bPawnCount[c + 1] > 0);
        if (!hasNeighbor) {
          pawnMg += wPawnCount[c] === 0 ? 18 : 12;
          pawnEg += 16;
        }
      }
    }

    // White Passed, Connected, & Backward Pawns
    for (let i = 0; i < wpCount; i++) {
      const sq = pieceList[wpBase | i];
      const r = sq >> 4;
      const c = sq & 7;

      const isDefendedByPawn = wPawnAtk[sq] === stamp;
      const isPhalanx =
        (c > 0 && squares[sq - 1] === WP) || (c < 7 && squares[sq + 1] === WP);
      if (isDefendedByPawn || isPhalanx) {
        const adv = 7 - r;
        pawnMg += 4 + adv;
        pawnEg += 3 + adv;
      }

      // Passed pawn: frontmost friendly pawn on file & no enemy pawn ahead on files c-1..c+1
      const isPassed =
        wPawnMinRow[c] === r &&
        bPawnMinRow[c] >= r &&
        (c === 0 || bPawnMinRow[c - 1] >= r) &&
        (c === 7 || bPawnMinRow[c + 1] >= r);

      if (isPassed) {
        const advance = 7 - r; // 1..6
        pawnMg += PASSED_PAWN_MG[advance];
        pawnEg += PASSED_PAWN_EG[advance];

        const stopSq = sq - 16;
        if (advance >= 3) {
          if (isDefendedByPawn || isPhalanx) {
            pawnMg += advance * 3;
            pawnEg += advance * 5;
          }
          if (squares[stopSq] === EMPTY) {
            pawnMg += advance * 2;
            pawnEg += advance * 5;
            if (bPawnAtk[stopSq] !== stamp) {
              pawnEg += advance * 2;
            }
          }
        }

        // Endgame King proximity to stop square
        if (advance >= 2) {
          const stopR = r > 0 ? r - 1 : 0;
          const drW = wkR > stopR ? wkR - stopR : stopR - wkR;
          const dcW = wkC > c ? wkC - c : c - wkC;
          const fDist = drW > dcW ? drW : dcW;

          const drB = bkR > stopR ? bkR - stopR : stopR - bkR;
          const dcB = bkC > c ? bkC - c : c - bkC;
          const eDist = drB > dcB ? drB : dcB;

          pawnEg += (eDist * 5 - fDist * 3) * (advance - 1);
        }
      } else if (r >= 3) {
        // Backward pawn: neighbors exist, all neighbors are ahead (maxRow < r), stop sq attacked by Black pawn
        const leftHas = c > 0 && wPawnCount[c - 1] > 0;
        const rightHas = c < 7 && wPawnCount[c + 1] > 0;
        if (leftHas || rightHas) {
          const leftAheadOnly = !leftHas || wPawnMaxRow[c - 1] < r;
          const rightAheadOnly = !rightHas || wPawnMaxRow[c + 1] < r;
          if (leftAheadOnly && rightAheadOnly && bPawnAtk[sq - 16] === stamp) {
            pawnMg -= 10;
            pawnEg -= 14;
          }
        }
      }
    }

    // Black Passed, Connected, & Backward Pawns
    for (let i = 0; i < bpCount; i++) {
      const sq = pieceList[bpBase | i];
      const r = sq >> 4;
      const c = sq & 7;

      const isDefendedByPawn = bPawnAtk[sq] === stamp;
      const isPhalanx =
        (c > 0 && squares[sq - 1] === BP) || (c < 7 && squares[sq + 1] === BP);
      if (isDefendedByPawn || isPhalanx) {
        pawnMg -= 4 + r;
        pawnEg -= 3 + r;
      }

      const isPassed =
        bPawnMaxRow[c] === r &&
        wPawnMaxRow[c] <= r &&
        (c === 0 || wPawnMaxRow[c - 1] <= r) &&
        (c === 7 || wPawnMaxRow[c + 1] <= r);

      if (isPassed) {
        const advance = r; // 1..6
        pawnMg -= PASSED_PAWN_MG[advance];
        pawnEg -= PASSED_PAWN_EG[advance];

        const stopSq = sq + 16;
        if (advance >= 3) {
          if (isDefendedByPawn || isPhalanx) {
            pawnMg -= advance * 3;
            pawnEg -= advance * 5;
          }
          if (squares[stopSq] === EMPTY) {
            pawnMg -= advance * 2;
            pawnEg -= advance * 5;
            if (wPawnAtk[stopSq] !== stamp) {
              pawnEg -= advance * 2;
            }
          }
        }

        if (advance >= 2) {
          const stopR = r < 7 ? r + 1 : 7;
          const drB = bkR > stopR ? bkR - stopR : stopR - bkR;
          const dcB = bkC > c ? bkC - c : c - bkC;
          const fDist = drB > dcB ? drB : dcB;

          const drW = wkR > stopR ? wkR - stopR : stopR - wkR;
          const dcW = wkC > c ? wkC - c : c - wkC;
          const eDist = drW > dcW ? drW : dcW;

          pawnEg -= (eDist * 5 - fDist * 3) * (advance - 1);
        }
      } else if (r <= 4) {
        const leftHas = c > 0 && bPawnCount[c - 1] > 0;
        const rightHas = c < 7 && bPawnCount[c + 1] > 0;
        if (leftHas || rightHas) {
          const leftAheadOnly = !leftHas || bPawnMinRow[c - 1] > r;
          const rightAheadOnly = !rightHas || bPawnMinRow[c + 1] > r;
          if (leftAheadOnly && rightAheadOnly && wPawnAtk[sq + 16] === stamp) {
            pawnMg += 10;
            pawnEg += 14;
          }
        }
      }
    }
  }

  // 3. Piece Mobility, Coordination, and King Zone Attack Accumulators
  let mobMg = 0;
  let mobEg = 0;

  let attacksOnBlackKingCount = 0;
  let attacksOnBlackKingUnits = 0;
  let attacksOnWhiteKingCount = 0;
  let attacksOnWhiteKingUnits = 0;

  const aggrWeight = weights?.aggression ?? 1.0;
  const evalMobOrKing =
    useDefaultWeights ||
    (weights && (weights.mobility > 0 || weights.kingSafety > 0 || aggrWeight > 0));

  if (evalMobOrKing && fastLeaf) {
    // Fast leaf path (deep qPly >= 1): retain O(1) Bishop Pair, Rook Open/Semi-Open/7th, and Knight Outposts
    if (pieceCount[WB] >= 2) {
      mobMg += 35;
      mobEg += 50;
    }
    if (pieceCount[BB] >= 2) {
      mobMg -= 35;
      mobEg -= 50;
    }
    const wrCount = pieceCount[WR];
    const wrBase = WR << 4;
    for (let i = 0; i < wrCount; i++) {
      const sq = pieceList[wrBase | i];
      const r = sq >> 4;
      const c = sq & 7;
      if (wPawnCount[c] === 0) {
        if (bPawnCount[c] === 0) {
          mobMg += 26;
          mobEg += 20;
        } else {
          mobMg += 14;
          mobEg += 10;
        }
      }
      if (r === 1 && (bkR === 0 || bPawnsOn7th)) {
        mobMg += 26;
        mobEg += 38;
      }
    }
    const brCount = pieceCount[BR];
    const brBase = BR << 4;
    for (let i = 0; i < brCount; i++) {
      const sq = pieceList[brBase | i];
      const r = sq >> 4;
      const c = sq & 7;
      if (bPawnCount[c] === 0) {
        if (wPawnCount[c] === 0) {
          mobMg -= 26;
          mobEg -= 20;
        } else {
          mobMg -= 14;
          mobEg -= 10;
        }
      }
      if (r === 6 && (wkR === 7 || wPawnsOn2nd)) {
        mobMg -= 26;
        mobEg -= 38;
      }
    }
  } else if (evalMobOrKing) {
    // Stamp extended 3x3 king zones once (12 ops each) so raycasts do O(1) lookup
    if (mgPhase > 2) {
      const bkMinR = bkR > 0 ? bkR - 1 : 0;
      const bkMaxR = bkR < 5 ? bkR + 2 : 7;
      const bkMinC = bkC > 0 ? bkC - 1 : 0;
      const bkMaxC = bkC < 7 ? bkC + 1 : 7;
      for (let r = bkMinR; r <= bkMaxR; r++) {
        const rowOff = r << 4;
        for (let c = bkMinC; c <= bkMaxC; c++) {
          bkZone[rowOff | c] = stamp;
        }
      }

      const wkMinR = wkR > 2 ? wkR - 2 : 0;
      const wkMaxR = wkR < 7 ? wkR + 1 : 7;
      const wkMinC = wkC > 0 ? wkC - 1 : 0;
      const wkMaxC = wkC < 7 ? wkC + 1 : 7;
      for (let r = wkMinR; r <= wkMaxR; r++) {
        const rowOff = r << 4;
        for (let c = wkMinC; c <= wkMaxC; c++) {
          wkZone[rowOff | c] = stamp;
        }
      }
    }

    // --- White Knights ---
    const wnCount = pieceCount[WN];
    const wnBase = WN << 4;
    for (let i = 0; i < wnCount; i++) {
      const sq = pieceList[wnBase | i];
      const r = sq >> 4;
      const c = sq & 7;
      let safeMob = 0;
      let kzHits = 0;
      for (let d = 0; d < 8; d++) {
        const to = sq + KNIGHT_OFFSETS_88[d];
        if ((to & 0x88) !== 0) continue;
        const t = squares[to];
        if (t === EMPTY || (t & COLOR_BIT) === COLOR_BIT) {
          if (bPawnAtk[to] !== stamp) safeMob++;
          if (bkZone[to] === stamp) kzHits++;
        }
      }
      const nMob = (safeMob - 4) * 4;
      mobMg += nMob;
      mobEg += nMob;
      if (kzHits > 0) {
        attacksOnBlackKingCount++;
        attacksOnBlackKingUnits += kzHits * 2;
      }

      if (r >= 2 && r <= 4 && c >= 2 && c <= 5 && wPawnAtk[sq] === stamp) {
        if (bPawnMinRow[c - 1] >= r && bPawnMinRow[c + 1] >= r) {
          mobMg += 26;
          mobEg += 18;
        } else {
          mobMg += 8;
          mobEg += 6;
        }
      }
    }

    // --- Black Knights ---
    const bnCount = pieceCount[BN];
    const bnBase = BN << 4;
    for (let i = 0; i < bnCount; i++) {
      const sq = pieceList[bnBase | i];
      const r = sq >> 4;
      const c = sq & 7;
      let safeMob = 0;
      let kzHits = 0;
      for (let d = 0; d < 8; d++) {
        const to = sq + KNIGHT_OFFSETS_88[d];
        if ((to & 0x88) !== 0) continue;
        const t = squares[to];
        if (t === EMPTY || (t & COLOR_BIT) === 0) {
          if (wPawnAtk[to] !== stamp) safeMob++;
          if (wkZone[to] === stamp) kzHits++;
        }
      }
      const nMob = (safeMob - 4) * 4;
      mobMg -= nMob;
      mobEg -= nMob;
      if (kzHits > 0) {
        attacksOnWhiteKingCount++;
        attacksOnWhiteKingUnits += kzHits * 2;
      }

      if (r >= 3 && r <= 5 && c >= 2 && c <= 5 && bPawnAtk[sq] === stamp) {
        if (wPawnMaxRow[c - 1] <= r && wPawnMaxRow[c + 1] <= r) {
          mobMg -= 26;
          mobEg -= 18;
        } else {
          mobMg -= 8;
          mobEg -= 6;
        }
      }
    }

    // --- White Bishops ---
    const wbCount = pieceCount[WB];
    const wbBase = WB << 4;
    for (let i = 0; i < wbCount; i++) {
      const sq = pieceList[wbBase | i];
      let safeMob = 0;
      let kzHits = 0;
      for (let d = 0; d < 4; d++) {
        const dir = BISHOP_DIRS_88[d];
        let to = sq + dir;
        while ((to & 0x88) === 0) {
          const t = squares[to];
          if (t === EMPTY) {
            if (bPawnAtk[to] !== stamp) safeMob++;
            if (bkZone[to] === stamp) kzHits++;
          } else {
            if ((t & COLOR_BIT) === COLOR_BIT) {
              safeMob++;
              if (bkZone[to] === stamp) kzHits++;
            }
            break;
          }
          to += dir;
        }
      }
      const bMob = (safeMob - 6) * 4;
      mobMg += bMob;
      mobEg += bMob;
      if (kzHits > 0) {
        attacksOnBlackKingCount++;
        attacksOnBlackKingUnits += kzHits * 2;
      }
    }
    if (wbCount >= 2) {
      mobMg += 35;
      mobEg += 50;
    }

    // --- Black Bishops ---
    const bbCount = pieceCount[BB];
    const bbBase = BB << 4;
    for (let i = 0; i < bbCount; i++) {
      const sq = pieceList[bbBase | i];
      let safeMob = 0;
      let kzHits = 0;
      for (let d = 0; d < 4; d++) {
        const dir = BISHOP_DIRS_88[d];
        let to = sq + dir;
        while ((to & 0x88) === 0) {
          const t = squares[to];
          if (t === EMPTY) {
            if (wPawnAtk[to] !== stamp) safeMob++;
            if (wkZone[to] === stamp) kzHits++;
          } else {
            if ((t & COLOR_BIT) === 0) {
              safeMob++;
              if (wkZone[to] === stamp) kzHits++;
            }
            break;
          }
          to += dir;
        }
      }
      const bMob = (safeMob - 6) * 4;
      mobMg -= bMob;
      mobEg -= bMob;
      if (kzHits > 0) {
        attacksOnWhiteKingCount++;
        attacksOnWhiteKingUnits += kzHits * 2;
      }
    }
    if (bbCount >= 2) {
      mobMg -= 35;
      mobEg -= 50;
    }

    // --- White Rooks ---
    const wrCount = pieceCount[WR];
    const wrBase = WR << 4;
    for (let i = 0; i < wrCount; i++) {
      const sq = pieceList[wrBase | i];
      const r = sq >> 4;
      const c = sq & 7;
      let safeMob = 0;
      let kzHits = 0;
      for (let d = 0; d < 4; d++) {
        const dir = ROOK_DIRS_88[d];
        let to = sq + dir;
        while ((to & 0x88) === 0) {
          const t = squares[to];
          if (t === EMPTY) {
            if (bPawnAtk[to] !== stamp) safeMob++;
            if (bkZone[to] === stamp) kzHits++;
          } else {
            if ((t & COLOR_BIT) === COLOR_BIT) {
              safeMob++;
              if (bkZone[to] === stamp) kzHits++;
            }
            break;
          }
          to += dir;
        }
      }
      mobMg += (safeMob - 7) * 2;
      mobEg += (safeMob - 7) * 4;
      if (kzHits > 0) {
        attacksOnBlackKingCount++;
        attacksOnBlackKingUnits += kzHits * 3;
      }

      if (wPawnCount[c] === 0) {
        if (bPawnCount[c] === 0) {
          mobMg += 26;
          mobEg += 20;
        } else {
          mobMg += 14;
          mobEg += 10;
        }
      }
      if (r === 1 && (bkR === 0 || bPawnsOn7th)) {
        mobMg += 26;
        mobEg += 38;
      }
    }

    // --- Black Rooks ---
    const brCount = pieceCount[BR];
    const brBase = BR << 4;
    for (let i = 0; i < brCount; i++) {
      const sq = pieceList[brBase | i];
      const r = sq >> 4;
      const c = sq & 7;
      let safeMob = 0;
      let kzHits = 0;
      for (let d = 0; d < 4; d++) {
        const dir = ROOK_DIRS_88[d];
        let to = sq + dir;
        while ((to & 0x88) === 0) {
          const t = squares[to];
          if (t === EMPTY) {
            if (wPawnAtk[to] !== stamp) safeMob++;
            if (wkZone[to] === stamp) kzHits++;
          } else {
            if ((t & COLOR_BIT) === 0) {
              safeMob++;
              if (wkZone[to] === stamp) kzHits++;
            }
            break;
          }
          to += dir;
        }
      }
      mobMg -= (safeMob - 7) * 2;
      mobEg -= (safeMob - 7) * 4;
      if (kzHits > 0) {
        attacksOnWhiteKingCount++;
        attacksOnWhiteKingUnits += kzHits * 3;
      }

      if (bPawnCount[c] === 0) {
        if (wPawnCount[c] === 0) {
          mobMg -= 26;
          mobEg -= 20;
        } else {
          mobMg -= 14;
          mobEg -= 10;
        }
      }
      if (r === 6 && (wkR === 7 || wPawnsOn2nd)) {
        mobMg -= 26;
        mobEg -= 38;
      }
    }

    // --- White Queens ---
    const wqCount = pieceCount[WQ];
    const wqBase = WQ << 4;
    for (let i = 0; i < wqCount; i++) {
      const sq = pieceList[wqBase | i];
      let safeMob = 0;
      let kzHits = 0;
      for (let d = 0; d < 8; d++) {
        const dir = QUEEN_DIRS_88[d];
        let to = sq + dir;
        while ((to & 0x88) === 0) {
          const t = squares[to];
          if (t === EMPTY) {
            if (bPawnAtk[to] !== stamp) safeMob++;
            if (bkZone[to] === stamp) kzHits++;
          } else {
            if ((t & COLOR_BIT) === COLOR_BIT) {
              safeMob++;
              if (bkZone[to] === stamp) kzHits++;
            }
            break;
          }
          to += dir;
        }
      }
      mobMg += (safeMob - 10) * 1;
      mobEg += (safeMob - 10) * 2;
      if (kzHits > 0) {
        attacksOnBlackKingCount++;
        attacksOnBlackKingUnits += kzHits * 5;
      }
    }

    // --- Black Queens ---
    const bqCount = pieceCount[BQ];
    const bqBase = BQ << 4;
    for (let i = 0; i < bqCount; i++) {
      const sq = pieceList[bqBase | i];
      let safeMob = 0;
      let kzHits = 0;
      for (let d = 0; d < 8; d++) {
        const dir = QUEEN_DIRS_88[d];
        let to = sq + dir;
        while ((to & 0x88) === 0) {
          const t = squares[to];
          if (t === EMPTY) {
            if (wPawnAtk[to] !== stamp) safeMob++;
            if (wkZone[to] === stamp) kzHits++;
          } else {
            if ((t & COLOR_BIT) === 0) {
              safeMob++;
              if (wkZone[to] === stamp) kzHits++;
            }
            break;
          }
          to += dir;
        }
      }
      mobMg -= (safeMob - 10) * 1;
      mobEg -= (safeMob - 10) * 2;
      if (kzHits > 0) {
        attacksOnWhiteKingCount++;
        attacksOnWhiteKingUnits += kzHits * 5;
      }
    }
  }

  // 4. King Safety (Pawn Shield + Open Files) & Offensive King Attack (3x3 Zone + Forward Pressure)
  let kingShieldMg = 0;
  let kingAttackMg = 0;
  if (
    mgPhase > 0 &&
    (useDefaultWeights || (weights && (weights.kingSafety > 0 || aggrWeight > 0)))
  ) {
    // White King Shield
    if (wkR >= 6 && (wkC >= 5 || wkC <= 2)) {
      const startC = wkC >= 5 ? 5 : 0;
      for (let sc = startC; sc < startC + 3; sc++) {
        if (squares[(6 << 4) | sc] === WP) kingShieldMg += 12;
        else if (squares[(5 << 4) | sc] === WP) kingShieldMg += 6;
        else kingShieldMg -= 11;

        if (wPawnCount[sc] === 0) {
          kingShieldMg -= bPawnCount[sc] === 0 ? 14 : 7;
        }
      }
    } else if (wkR >= 6 && wkC >= 3 && wkC <= 4) {
      // Uncastled central king exposed on open central file
      if (wPawnCount[wkC] === 0) kingShieldMg -= 16;
    }

    // Black King Shield
    if (bkR <= 1 && (bkC >= 5 || bkC <= 2)) {
      const startC = bkC >= 5 ? 5 : 0;
      for (let sc = startC; sc < startC + 3; sc++) {
        if (squares[(1 << 4) | sc] === BP) kingShieldMg -= 12;
        else if (squares[(2 << 4) | sc] === BP) kingShieldMg -= 6;
        else kingShieldMg += 11;

        if (bPawnCount[sc] === 0) {
          kingShieldMg += wPawnCount[sc] === 0 ? 14 : 7;
        }
      }
    } else if (bkR <= 1 && bkC >= 3 && bkC <= 4) {
      if (bPawnCount[bkC] === 0) kingShieldMg += 16;
    }

    // 3x3 King Zone Enemy Attack Weight Table
    if (attacksOnBlackKingCount >= 2 || (pieceCount[WQ] > 0 && attacksOnBlackKingUnits >= 5)) {
      const scaledUnits =
        attacksOnBlackKingCount >= 3
          ? attacksOnBlackKingUnits + 4
          : attacksOnBlackKingUnits;
      const idx = scaledUnits > 99 ? 99 : scaledUnits;
      kingAttackMg += KING_ATTACK_WEIGHT[idx];
    }
    if (attacksOnWhiteKingCount >= 2 || (pieceCount[BQ] > 0 && attacksOnWhiteKingUnits >= 5)) {
      const scaledUnits =
        attacksOnWhiteKingCount >= 3
          ? attacksOnWhiteKingUnits + 4
          : attacksOnWhiteKingUnits;
      const idx = scaledUnits > 99 ? 99 : scaledUnits;
      kingAttackMg -= KING_ATTACK_WEIGHT[idx];
    }
  }

  // 5. Tapered Interpolation (fast integer path for default weights, scaled path for custom weights)
  let whiteScore: number;
  if (useDefaultWeights || !weights) {
    const totalMg = board.matMg + board.pstMg + pawnMg + mobMg + kingShieldMg + kingAttackMg;
    const totalEg = board.matEg + board.pstEg + pawnEg + mobEg;
    whiteScore = ((totalMg * mgPhase + totalEg * egPhase) / MAX_PHASE) | 0;
  } else {
    // Extra forward-initiative & king-zone attacking pressure term (active ONLY when aggression != 1.0)
    let aggressionInitiativeMg = 0;
    if (Math.abs(aggrWeight - 1.0) >= 0.01 && mgPhase > 0) {
      // Reward pieces pressing into enemy half & close to enemy king (Manhattan distance <= 3)
      for (let pt = WN; pt <= WQ; pt++) {
        const cnt = pieceCount[pt];
        const base = pt << 4;
        const weight = pt === WQ ? 8 : pt === WR ? 6 : 4;
        for (let i = 0; i < cnt; i++) {
          const sq = pieceList[base | i];
          const r = sq >> 4;
          const c = sq & 7;
          if (r <= 3) aggressionInitiativeMg += weight;
          const dist = Math.abs(r - bkR) + Math.abs(c - bkC);
          if (dist <= 3) aggressionInitiativeMg += (4 - dist) * 3;
        }
      }
      for (let pt = BN; pt <= BQ; pt++) {
        const cnt = pieceCount[pt];
        const base = pt << 4;
        const weight = pt === BQ ? 8 : pt === BR ? 6 : 4;
        for (let i = 0; i < cnt; i++) {
          const sq = pieceList[base | i];
          const r = sq >> 4;
          const c = sq & 7;
          if (r >= 4) aggressionInitiativeMg -= weight;
          const dist = Math.abs(r - wkR) + Math.abs(c - wkC);
          if (dist <= 3) aggressionInitiativeMg -= (4 - dist) * 3;
        }
      }
      // Reward sharp central/kingside space pawns (4th/5th rank on c-f files) for open attacking lines
      for (let i = 0; i < wpCount; i++) {
        const sq = pieceList[wpBase | i];
        const r = sq >> 4;
        const c = sq & 7;
        if (r <= 4 && c >= 2 && c <= 5) {
          aggressionInitiativeMg += r <= 3 ? 8 : 5;
        }
      }
      for (let i = 0; i < bpCount; i++) {
        const sq = pieceList[bpBase | i];
        const r = sq >> 4;
        const c = sq & 7;
        if (r >= 3 && c >= 2 && c <= 5) {
          aggressionInitiativeMg -= r >= 4 ? 8 : 5;
        }
      }
      // Single-attacker king zone pressure (even before 2+ attackers accumulate)
      aggressionInitiativeMg += (attacksOnBlackKingUnits - attacksOnWhiteKingUnits) * 5;
    }

    const matScore = ((board.matMg * mgPhase + board.matEg * egPhase) / MAX_PHASE) * weights.material;
    const pstScore = ((board.pstMg * mgPhase + board.pstEg * egPhase) / MAX_PHASE) * weights.pieceSquareTables;
    const pawnScore = ((pawnMg * mgPhase + pawnEg * egPhase) / MAX_PHASE) * weights.pawnStructure;
    const kingShieldScore = ((kingShieldMg * mgPhase) / MAX_PHASE) * weights.kingSafety;
    // King-zone attacks scale with both aggression and kingSafety awareness (weighted 70% aggression, 30% safety)
    const attackMultiplier = aggrWeight * 0.7 + weights.kingSafety * 0.3;
    const kingAttackScore = ((kingAttackMg * mgPhase) / MAX_PHASE) * attackMultiplier;
    const initiativeScore =
      ((aggressionInitiativeMg * mgPhase) / MAX_PHASE) * (aggrWeight - 1.0);
    const mobScore = ((mobMg * mgPhase + mobEg * egPhase) / MAX_PHASE) * weights.mobility;
    whiteScore = Math.round(
      matScore +
        pstScore +
        pawnScore +
        kingShieldScore +
        kingAttackScore +
        initiativeScore +
        mobScore
    );
  }

  // Side-to-move perspective + tempo bonus
  const tempo = 12;
  return board.side === WHITE ? whiteScore + tempo : -whiteScore + tempo;
}
