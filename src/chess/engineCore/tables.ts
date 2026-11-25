import {
  BB,
  BISHOP,
  BK,
  BN,
  BP,
  BQ,
  BR,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WB,
  WK,
  WN,
  WP,
  WQ,
  WR,
} from './types';

/* ============================================================================
 * 1. DETERMINISTIC 64-BIT ZOBRIST KEYS (SPLIT INTO ZERO-ALLOC UINT32 HI/LO)
 * Uses SplitMix64 PRNG so every key has full 64-bit entropy while all hot-loop
 * XOR operations stay in V8 32-bit integer registers with zero BigInt boxing.
 * ========================================================================== */

const MASK_64 = 0xffffffffffffffffn;
const MASK_32 = 0xffffffffn;

function createSplitMix64(seed: bigint): () => [number, number] {
  let state = seed & MASK_64;
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK_64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    z = (z ^ (z >> 31n)) & MASK_64;
    const hi = Number((z >> 32n) & MASK_32) >>> 0;
    const lo = Number(z & MASK_32) >>> 0;
    return [hi, lo];
  };
}

const nextRand = createSplitMix64(0x3000e10ca155a99n);

// Indexed by (pieceCode << 7) | sq88 -> size 16 * 128 = 2048
export const ZOBRIST_PIECE_HI = new Uint32Array(16 * 128);
export const ZOBRIST_PIECE_LO = new Uint32Array(16 * 128);

for (let p = 1; p < 16; p++) {
  for (let sq = 0; sq < 128; sq++) {
    if ((sq & 0x88) === 0) {
      const [hi, lo] = nextRand();
      ZOBRIST_PIECE_HI[(p << 7) | sq] = hi;
      ZOBRIST_PIECE_LO[(p << 7) | sq] = lo;
    }
  }
}

const [sideHi, sideLo] = nextRand();
export const ZOBRIST_SIDE_HI = sideHi;
export const ZOBRIST_SIDE_LO = sideLo;

export const ZOBRIST_CASTLE_HI = new Uint32Array(16);
export const ZOBRIST_CASTLE_LO = new Uint32Array(16);
for (let c = 0; c < 16; c++) {
  const [hi, lo] = nextRand();
  ZOBRIST_CASTLE_HI[c] = hi;
  ZOBRIST_CASTLE_LO[c] = lo;
}

export const ZOBRIST_EP_HI = new Uint32Array(128);
export const ZOBRIST_EP_LO = new Uint32Array(128);
for (let sq = 0; sq < 128; sq++) {
  if ((sq & 0x88) === 0) {
    const [hi, lo] = nextRand();
    ZOBRIST_EP_HI[sq] = hi;
    ZOBRIST_EP_LO[sq] = lo;
  }
}

/* ============================================================================
 * 2. PeSTO TAPERED MATERIAL VALUES & PIECE-SQUARE TABLES (MG & EG)
 * Proven classical Texel-tuned PeSTO/Rofchade tables (White perspective,
 * index 0 = a8 (row 0, col 0), index 63 = h1 (row 7, col 7)).
 * ========================================================================== */

export const MG_VALUE = new Int32Array([0, 82, 337, 365, 477, 1025, 0]);
export const EG_VALUE = new Int32Array([0, 94, 281, 297, 512, 936, 0]);

export const SEE_VALUE = new Int32Array([0, 100, 320, 330, 500, 900, 20000]);

export const PHASE_WEIGHT = new Int32Array([0, 0, 1, 1, 2, 4, 0]);
export const MAX_PHASE = 24;

export const PESTO_MG_PAWN: readonly number[] = [
    0,   0,   0,   0,   0,   0,   0,   0,
   98, 134,  61,  95,  68, 126,  34, -11,
   -6,   7,  26,  31,  65,  56,  25, -20,
  -14,  13,   6,  21,  23,  12,  17, -23,
  -27,  -2,  -5,  12,  17,   6,  10, -25,
  -26,  -4,  -4, -10,   3,   3,  33, -12,
  -35,  -1, -20, -23, -15,  24,  38, -22,
    0,   0,   0,   0,   0,   0,   0,   0,
];

export const PESTO_EG_PAWN: readonly number[] = [
    0,   0,   0,   0,   0,   0,   0,   0,
  178, 173, 158, 134, 147, 132, 165, 187,
   94, 100,  85,  67,  56,  53,  82,  84,
   32,  24,  13,   5,  -2,   4,  17,  17,
   13,   9,  -3,  -7,  -7,  -8,   3,  -1,
    4,   7,  -6,   1,   0,  -5,  -1,  -8,
   13,   8,   8,  10,  13,   0,   2,  -7,
    0,   0,   0,   0,   0,   0,   0,   0,
];

export const PESTO_MG_KNIGHT: readonly number[] = [
 -167, -89, -34, -49,  61, -97, -15,-107,
  -73, -41,  72,  36,  23,  62,   7, -17,
  -47,  60,  37,  65,  84, 129,  73,  44,
   -9,  17,  19,  53,  37,  69,  18,  22,
  -13,   4,  16,  13,  28,  19,  21,  -8,
  -23,  -9,  12,  10,  19,  17,  25, -16,
  -29, -53, -12,  -3,  -1,  18, -14, -19,
 -105, -21, -58, -33, -17, -28, -19, -23,
];

export const PESTO_EG_KNIGHT: readonly number[] = [
  -58, -38, -13, -28, -31, -27, -63, -99,
  -25,  -8, -25,  -2,  -9, -25, -24, -52,
  -24, -20,  10,   9,  -1,  -9, -19, -41,
  -17,   3,  22,  22,  22,  11,   8, -18,
  -18,  -6,  16,  25,  16,  17,   4, -18,
  -23,  -3,  -1,  15,  10,  -3, -20, -22,
  -42, -20, -10,  -5,  -2, -20, -23, -44,
  -29, -51, -23, -15, -22, -18, -50, -64,
];

export const PESTO_MG_BISHOP: readonly number[] = [
  -29,   4, -82, -37, -25, -42,   7,  -8,
  -26,  16, -18, -13,  30,  59,  18, -47,
  -16,  37,  43,  40,  35,  50,  37,  -2,
   -4,   5,  19,  50,  37,  37,   7,  -2,
   -6,  13,  13,  26,  34,  12,  10,   4,
    0,  15,  15,  15,  14,  27,  18,  10,
    4,  15,  16,   0,   7,  21,  33,   1,
  -33,  -3, -14, -21, -13, -12, -39, -21,
];

export const PESTO_EG_BISHOP: readonly number[] = [
  -14, -21, -11,  -8,  -7,  -9, -17, -24,
   -8,  -4,   7, -12,  -3, -13,  -4, -14,
    2,  -8,   0,  -1,  -2,   6,   0,   4,
   -3,   9,  12,   9,  14,  10,   3,   2,
   -6,   3,  13,  19,   7,  10,  -3,  -9,
  -12,  -3,   8,  10,  13,   3,  -7, -15,
  -14, -18,  -7,  -1,   4,  -9, -15, -27,
  -23,  -9, -23,  -5,  -9, -16,  -5, -17,
];

export const PESTO_MG_ROOK: readonly number[] = [
   32,  42,  32,  51,  63,   9,  31,  43,
   27,  32,  58,  62,  80,  67,  26,  44,
   -5,  19,  26,  36,  17,  45,  61,  16,
  -24, -11,   7,  26,  24,  35,  -8, -20,
  -36, -26, -12,  -1,   9,  -7,   6, -23,
  -45, -25, -16, -17,   3,   0,  -5, -33,
  -44, -16, -20,  -9,  -1,  11,  -6, -71,
  -19, -13,   1,  17,  16,   7, -37, -26,
];

export const PESTO_EG_ROOK: readonly number[] = [
   13,  10,  18,  15,  12,  12,   8,   5,
   11,  13,  13,  11,  -3,   3,   8,   3,
    7,   7,   7,   5,   4,  -3,  -5,  -3,
    4,   3,  13,   1,   2,   1,  -1,   2,
    3,   5,   8,   4,  -5,  -6,  -8, -11,
   -4,   0,  -5,  -1,  -7, -12,  -8, -16,
   -6,  -6,   0,   2,  -9,  -9, -11,  -3,
   -9,   2,   3,  -1,  -5, -13,   4, -20,
];

export const PESTO_MG_QUEEN: readonly number[] = [
  -28,   0,  29,  12,  59,  44,  43,  45,
  -24, -39,  -5,   1, -16,  57,  28,  54,
  -13, -17,   7,   8,  29,  56,  47,  57,
  -27, -27, -16, -16,  -1,  17,  -2,   1,
   -9, -26,  -9, -10,  -2,  -4,   3,  -3,
  -14,   2, -11,  -2,  -5,   2,  14,   5,
  -35,  -8,  11,   2,   8,  15,  -3,   1,
   -1, -18,  -9,  10, -15, -25, -31, -50,
];

export const PESTO_EG_QUEEN: readonly number[] = [
   -9,  22,  22,  27,  27,  19,  10,  20,
  -17,  20,  32,  41,  58,  25,  30,   0,
  -20,   6,   9,  49,  47,  35,  19,   9,
    3,  22,  24,  45,  57,  40,  57,  36,
  -18,  28,  19,  47,  31,  34,  39,  23,
  -16, -27,  15,   6,   9,  17,  10,   5,
  -22, -23, -30, -16, -16, -23, -36, -32,
  -33, -28, -22, -43,  -5, -32, -20, -41,
];

export const PESTO_MG_KING: readonly number[] = [
  -65,  23,  16, -15, -56, -34,   2,  13,
   29,  -1, -20,  -7,  -8,  -4, -38, -29,
   -9,  24,   2, -16, -20,   6,  22, -22,
  -17, -20, -12, -27, -30, -25, -14, -36,
  -49,  -1, -27, -39, -46, -44, -33, -51,
  -14, -14, -22, -46, -44, -30, -15, -27,
    1,   7,  -8, -64, -43, -16,   9,   8,
  -15,  36,  12, -54,   8, -28,  24,  14,
];

export const PESTO_EG_KING: readonly number[] = [
  -74, -35, -18, -18, -11,  15,   4, -17,
  -12,  17,  14,  17,  17,  38,  23,  11,
   10,  17,  23,  15,  20,  45,  44,  13,
   -8,  22,  24,  27,  26,  33,  26,   3,
  -18,  -4,  21,  24,  27,  23,   9, -11,
  -19,  -3,  11,  21,  23,  16,   7,  -9,
  -27, -11,   4,  13,  14,   4,  -5, -17,
  -53, -34, -21, -11, -28, -14, -24, -43,
];

const MG_TABLES: readonly (readonly number[] | null)[] = [
  null,
  PESTO_MG_PAWN,
  PESTO_MG_KNIGHT,
  PESTO_MG_BISHOP,
  PESTO_MG_ROOK,
  PESTO_MG_QUEEN,
  PESTO_MG_KING,
];

const EG_TABLES: readonly (readonly number[] | null)[] = [
  null,
  PESTO_EG_PAWN,
  PESTO_EG_KNIGHT,
  PESTO_EG_BISHOP,
  PESTO_EG_ROOK,
  PESTO_EG_QUEEN,
  PESTO_EG_KING,
];

/**
 * Signed White-perspective PST tables indexed by `(pieceCode << 7) | sq88`.
 * Separate from Material so custom EvalWeights can scale Material and PST independently
 * while still maintaining O(1) incremental updates in makeMove/unmakeMove.
 */
export const PST_MG_SIGNED = new Int32Array(16 * 128);
export const PST_EG_SIGNED = new Int32Array(16 * 128);

export const MAT_MG_SIGNED = new Int32Array(16);
export const MAT_EG_SIGNED = new Int32Array(16);
export const PIECE_PHASE = new Int32Array(16);

for (let pt = PAWN; pt <= KING; pt++) {
  const wCode = pt;
  const bCode = pt | 8;
  MAT_MG_SIGNED[wCode] = MG_VALUE[pt];
  MAT_MG_SIGNED[bCode] = -MG_VALUE[pt];
  MAT_EG_SIGNED[wCode] = EG_VALUE[pt];
  MAT_EG_SIGNED[bCode] = -EG_VALUE[pt];
  PIECE_PHASE[wCode] = PHASE_WEIGHT[pt];
  PIECE_PHASE[bCode] = PHASE_WEIGHT[pt];

  const mgTbl = MG_TABLES[pt]!;
  const egTbl = EG_TABLES[pt]!;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq88 = (r << 4) | c;
      const wIdx64 = (r << 3) | c;
      const bIdx64 = ((7 - r) << 3) | c;

      PST_MG_SIGNED[(wCode << 7) | sq88] = mgTbl[wIdx64];
      PST_EG_SIGNED[(wCode << 7) | sq88] = egTbl[wIdx64];

      PST_MG_SIGNED[(bCode << 7) | sq88] = -mgTbl[bIdx64];
      PST_EG_SIGNED[(bCode << 7) | sq88] = -egTbl[bIdx64];
    }
  }
}

/* ============================================================================
 * 3. CASTLING RIGHTS MASK TABLE (0x88)
 * Updating castling rights on any move is simply:
 *   castling &= CASTLING_MASK[from] & CASTLING_MASK[to];
 * ========================================================================== */

export const CASTLING_MASK = new Uint8Array(128);
CASTLING_MASK.fill(15);
// Black back rank (row 0): a8=0x00, e8=0x04, h8=0x07
CASTLING_MASK[0x00] = 15 & ~CASTLE_BQ;
CASTLING_MASK[0x04] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLING_MASK[0x07] = 15 & ~CASTLE_BK;
// White back rank (row 7): a1=0x70, e1=0x74, h1=0x77
CASTLING_MASK[0x70] = 15 & ~CASTLE_WQ;
CASTLING_MASK[0x74] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLING_MASK[0x77] = 15 & ~CASTLE_WK;

/* ============================================================================
 * 4. MVV-LVA & DIRECTION OFFSETS
 * ========================================================================== */

export const MVV_LVA = new Int32Array(16 * 16);
for (let victim = 1; victim < 16; victim++) {
  const vt = victim & 7;
  if (vt < PAWN || vt > KING) continue;
  for (let attacker = 1; attacker < 16; attacker++) {
    const at = attacker & 7;
    if (at < PAWN || at > KING) continue;
    MVV_LVA[(victim << 4) | attacker] = SEE_VALUE[vt] * 10 - at;
  }
}

export const KNIGHT_OFFSETS_88 = new Int8Array([-33, -31, -18, -14, 14, 18, 31, 33]);
export const KING_OFFSETS_88 = new Int8Array([-17, -16, -15, -1, 1, 15, 16, 17]);
export const BISHOP_DIRS_88 = new Int8Array([-17, -15, 15, 17]);
export const ROOK_DIRS_88 = new Int8Array([-16, -1, 1, 16]);
export const QUEEN_DIRS_88 = new Int8Array([-17, -16, -15, -1, 1, 15, 16, 17]);

/* ============================================================================
 * 5. PRECOMPUTED LOGARITHMIC LMR REDUCTION TABLE
 * R = Math.floor(0.75 + Math.log(depth) * Math.log(moveIndex) / 2.25)
 * ========================================================================== */

export const LMR_TABLE = new Int8Array(64 * 64);
for (let d = 1; d < 64; d++) {
  for (let m = 1; m < 64; m++) {
    const r = Math.floor(0.75 + (Math.log(d) * Math.log(m)) / 2.25);
    LMR_TABLE[(d << 6) | m] = Math.max(1, Math.min(d - 1, r));
  }
}

/* ============================================================================
 * 6. KING SAFETY NON-LINEAR ATTACK WEIGHT TABLE (MIDDLEGAME)
 * Indexed by cumulative enemy attack units against the 3x3 King Zone
 * (Knight=2, Bishop=2, Rook=3, Queen=5). Non-linear quadratic ramp mirrors
 * Stockfish/Fruit king danger scaling.
 * ========================================================================== */

export const KING_ATTACK_WEIGHT = new Int16Array([
    0,   0,   1,   2,   3,   5,   7,   9,  12,  15,
   18,  22,  26,  30,  35,  39,  44,  50,  56,  62,
   68,  75,  82,  85,  89,  97, 105, 113, 122, 131,
  140, 150, 169, 180, 191, 202, 213, 225, 237, 248,
  260, 272, 283, 295, 307, 319, 330, 342, 354, 366,
  377, 389, 401, 412, 424, 436, 448, 459, 471, 483,
  494, 500, 500, 500, 500, 500, 500, 500, 500, 500,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500,
]);

export const PIECE_ATTACK_UNITS = new Int8Array([0, 0, 2, 2, 3, 5, 0]);

export const PASSED_PAWN_MG = new Int16Array([0, 5, 12, 22, 42, 72, 115, 0]);
export const PASSED_PAWN_EG = new Int16Array([0, 12, 26, 48, 86, 138, 210, 0]);

export const ALL_WHITE_PIECES = new Int8Array([WP, WN, WB, WR, WQ, WK]);
export const ALL_BLACK_PIECES = new Int8Array([BP, BN, BB, BR, BQ, BK]);
