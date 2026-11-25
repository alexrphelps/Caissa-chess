import { Color, GameState, PieceType, PromotionPieceType, Square } from './types';

export interface PgnHeaders {
  Event: string;
  Site: string;
  Date: string;
  Round: string;
  White: string;
  Black: string;
  Result: string;
  WhiteElo?: string;
  BlackElo?: string;
  ECO?: string;
  Opening?: string;
  SetUp?: string;
  FEN?: string;
  [key: string]: string | undefined;
}

export interface TimelineMoveFlags {
  check: boolean;
  checkmate: boolean;
  stalemate: boolean;
  castle: 'K' | 'Q' | null;
  promotion: PromotionPieceType | null;
  enPassant: boolean;
  capture: boolean;
}

export interface TimelineNode {
  ply: number; // 0 = starting position, 1..N = after each move
  fen: string;
  san: string | null; // null for ply 0
  from: Square | null;
  to: Square | null;
  captured: PieceType | null;
  flags: TimelineMoveFlags;
  comment: string | null;
  nag: string | null;
  turnNumber: number;
  color: Color | null; // Side that played this move (null for ply 0)
  gameState: GameState;
}

export interface ParsedPgnGame {
  id: string;
  headers: PgnHeaders;
  timeline: TimelineNode[];
  startingFen: string;
  isCustomStart: boolean;
  result: string; // '1-0' | '0-1' | '1/2-1/2' | '*'
  description?: string;
  theme?: FamousGameTheme;
  rawPgn: string;
  parseWarning?: string;
}

export interface PgnBatchGameError {
  index: number;
  title: string;
  error: string;
}

export interface PgnParseBatchResult {
  games: ParsedPgnGame[];
  errors: PgnBatchGameError[];
}

export type FamousGameTheme =
  | 'Sacrifice'
  | 'Positional'
  | 'Endgame'
  | 'World Championship'
  | 'Attack'
  | 'Instructional';

export type FamousGameEra =
  | 'Modern (2010–2024)'
  | 'Classic (1950–2009)'
  | 'Early (1851–1949)';

export interface FamousGameEntry {
  id: string;
  title: string;
  subtitle: string;
  white: string;
  black: string;
  event: string;
  year: number;
  result: string;
  eco: string;
  opening: string;
  theme: FamousGameTheme;
  keyMove?: string;
  description: string;
  pgn: string;
}

export type BranchPlayChoice = Color | 'both';

export interface ReplayBranchOrigin {
  game: ParsedPgnGame;
  branchPly: number;
}
