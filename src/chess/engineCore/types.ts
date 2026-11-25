import { ChessEngineConfig, Color, PieceType, PromotionPieceType, Square } from '../types';

/* ============================================================================
 * 0x88 BOARD & PIECE ENCODING (ZERO-ALLOCATION SMI REPRESENTATION)
 * - 0 = EMPTY
 * - Piece type in low 3 bits: 1=P, 2=N, 3=B, 4=R, 5=Q, 6=K
 * - Color bit in bit 3: 0=White, 8=Black
 *   White pieces: 1..6  (WP..WK)
 *   Black pieces: 9..14 (BP..BK)
 * - Square index: 0x88 layout where row 0 = rank 8, row 7 = rank 1,
 *   sq88 = (row << 4) | col. Valid iff (sq88 & 0x88) === 0.
 * ========================================================================== */

export const EMPTY = 0;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const WHITE = 0;
export const BLACK = 1;
export const COLOR_BIT = 8;

export const WP = PAWN;
export const WN = KNIGHT;
export const WB = BISHOP;
export const WR = ROOK;
export const WQ = QUEEN;
export const WK = KING;

export const BP = PAWN | COLOR_BIT;
export const BN = KNIGHT | COLOR_BIT;
export const BB = BISHOP | COLOR_BIT;
export const BR = ROOK | COLOR_BIT;
export const BQ = QUEEN | COLOR_BIT;
export const BK = KING | COLOR_BIT;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

/* ============================================================================
 * 32-BIT PACKED MOVE LAYOUT (FITS IN V8 31-BIT SMI WHEN UNSIGNED < 2^30)
 * Bits  0..6  (7 bits): from square (0x88: 0..119)
 * Bits  7..13 (7 bits): to square (0x88: 0..119)
 * Bits 14..17 (4 bits): captured piece code (0..14)
 * Bits 18..20 (3 bits): promotion piece type (0=none, 2=N, 3=B, 4=R, 5=Q)
 * Bit  21     (1 bit):  FLAG_EP (en passant capture)
 * Bit  22     (1 bit):  FLAG_DOUBLE_PUSH (2-square pawn push)
 * Bit  23     (1 bit):  FLAG_CASTLE_K (kingside castle)
 * Bit  24     (1 bit):  FLAG_CASTLE_Q (queenside castle)
 * ========================================================================== */

export const MOVE_FLAG_EP = 1 << 21;
export const MOVE_FLAG_DOUBLE_PUSH = 1 << 22;
export const MOVE_FLAG_CASTLE_K = 1 << 23;
export const MOVE_FLAG_CASTLE_Q = 1 << 24;
export const MOVE_FLAG_CASTLE = MOVE_FLAG_CASTLE_K | MOVE_FLAG_CASTLE_Q;

export type FastMove = number;

export function encodeMove(
  from: number,
  to: number,
  captured: number,
  promo: number,
  flags: number
): FastMove {
  return (
    from |
    (to << 7) |
    (captured << 14) |
    (promo << 18) |
    flags
  );
}

export function moveFrom(m: FastMove): number {
  return m & 0x7f;
}

export function moveTo(m: FastMove): number {
  return (m >> 7) & 0x7f;
}

export function moveCaptured(m: FastMove): number {
  return (m >> 14) & 0xf;
}

export function movePromo(m: FastMove): number {
  return (m >> 18) & 0x7;
}

export function isCaptureMove(m: FastMove): boolean {
  return ((m >> 14) & 0xf) !== 0;
}

export function isPromoMove(m: FastMove): boolean {
  return ((m >> 18) & 0x7) !== 0;
}

export function isTacticalMove(m: FastMove): boolean {
  return (m & 0x1fc000) !== 0; // captured (bits 14..17) or promo (bits 18..20)
}

/* ============================================================================
 * 16-BIT PACKED TT MOVE LAYOUT
 * Bits  0..5  (6 bits): from64 (0..63)
 * Bits  6..11 (6 bits): to64 (0..63)
 * Bits 12..14 (3 bits): promo (0=none, 2=N, 3=B, 4=R, 5=Q)
 * ========================================================================== */

export function sq88To64(sq88: number): number {
  return ((sq88 >> 4) << 3) | (sq88 & 7);
}

export function sq64To88(sq64: number): number {
  return ((sq64 >> 3) << 4) | (sq64 & 7);
}

export function packTTMove(m: FastMove): number {
  if (m === 0) return 0;
  const from64 = sq88To64(m & 0x7f);
  const to64 = sq88To64((m >> 7) & 0x7f);
  const promo = (m >> 18) & 0x7;
  return from64 | (to64 << 6) | (promo << 12);
}

export function matchesTTMove(m: FastMove, ttMove16: number): boolean {
  if (ttMove16 === 0) return false;
  return packTTMove(m) === ttMove16;
}

/* ============================================================================
 * COORDINATE & PIECE STRING CONVERSION HELPERS (BOUNDARY ONLY)
 * ========================================================================== */

const FILE_CHARS = 'abcdefgh';
const RANK_CHARS = '87654321';

export function sq88ToAlgebraic(sq88: number): Square {
  const row = sq88 >> 4;
  const col = sq88 & 7;
  return FILE_CHARS[col] + RANK_CHARS[row];
}

export function algebraicToSq88(sq: Square): number {
  if (!sq || sq.length !== 2) return -1;
  const col = sq.charCodeAt(0) - 97; // 'a' = 97
  const row = 56 - sq.charCodeAt(1); // '8' = 56
  if (row < 0 || row > 7 || col < 0 || col > 7) return -1;
  return (row << 4) | col;
}

export function pieceTypeFromChar(ch: PieceType): number {
  switch (ch) {
    case 'p': return PAWN;
    case 'n': return KNIGHT;
    case 'b': return BISHOP;
    case 'r': return ROOK;
    case 'q': return QUEEN;
    case 'k': return KING;
  }
}

export function pieceCodeFromPiece(type: PieceType, color: Color): number {
  return pieceTypeFromChar(type) | (color === 'b' ? COLOR_BIT : 0);
}

export function pieceTypeToChar(pt: number): PieceType {
  switch (pt) {
    case PAWN: return 'p';
    case KNIGHT: return 'n';
    case BISHOP: return 'b';
    case ROOK: return 'r';
    case QUEEN: return 'q';
    case KING: return 'k';
    default: return 'p';
  }
}

export function promoTypeToChar(promo: number): PromotionPieceType | undefined {
  switch (promo) {
    case QUEEN: return 'q';
    case ROOK: return 'r';
    case BISHOP: return 'b';
    case KNIGHT: return 'n';
    default: return undefined;
  }
}

export function fastMoveToUci(m: FastMove): string {
  if (m === 0) return '0000';
  const from = sq88ToAlgebraic(moveFrom(m));
  const to = sq88ToAlgebraic(moveTo(m));
  const promo = promoTypeToChar(movePromo(m));
  return promo ? `${from}${to}${promo}` : `${from}${to}`;
}

/* ============================================================================
 * INTERNAL SEARCH CONSTANTS & INFO INTERFACES
 * ========================================================================== */

export const MAX_PLY = 64;
export const MAX_GAME_PLY = 1024;
export const INTERNAL_INF = 32000;
export const INTERNAL_MATE = 30000;
export const INTERNAL_MATE_BOUND = 29000;

export interface SearchInfoEvent {
  depth: number;
  seldepth: number;
  score: number; // Centipawns (side to move perspective, or mate distance)
  isMate: boolean;
  mateInPlies?: number;
  nodes: number;
  nps: number;
  timeMs: number;
  ttHits: number;
  pvUci: string[];
}

export interface FastSearchOptions {
  maxDepth: number;
  maxTimeMs: number;
  softTimeMs?: number;
  maxNodes?: number;
  config: ChessEngineConfig;
  multiPv?: number;
  onInfo?: (info: SearchInfoEvent) => void;
  rng?: () => number;
  /** Softmax temperature / top-N randomness for calibrated lower Elo levels */
  softmaxTemp?: number;
}

export interface FastMultiPVLine {
  move: FastMove;
  uci: string;
  score: number; // Side to move perspective (internal scale mapped to app scale)
  pv: FastMove[];
}

export interface FastSearchOutcome {
  bestMove: FastMove;
  bestUci: string;
  score: number; // Side to move perspective (mapped to app MATE_SCORE=100000 scale)
  depth: number;
  seldepth: number;
  nodes: number;
  nps: number;
  ttHits: number;
  elapsedMs: number;
  pv: FastMove[];
  multiPvLines?: FastMultiPVLine[];
}
