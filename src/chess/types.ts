export type Color = 'w' | 'b';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type PromotionPieceType = 'q' | 'r' | 'b' | 'n';

export interface Piece {
  type: PieceType;
  color: Color;
}

export type Board = (Piece | null)[][];

export interface Coords {
  row: number; // 0 (rank 8) to 7 (rank 1)
  col: number; // 0 (file a) to 7 (file h)
}

export type Square = string; // e.g., 'a1' to 'h8'

export interface CastlingRights {
  wK: boolean; // White King-side (O-O)
  wQ: boolean; // White Queen-side (O-O-O)
  bK: boolean; // Black King-side (O-O)
  bQ: boolean; // Black Queen-side (O-O-O)
}

export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece;
  promotion?: PromotionPieceType;
  isEnPassant?: boolean;
  isCastle?: 'K' | 'Q';
  san?: string;
}

export interface PlannedArrow {
  from: Square;
  to: Square;
}

export type GameStatus =
  | 'playing'
  | 'checkmate'
  | 'stalemate'
  | 'draw_insufficient'
  | 'draw_fifty_move'
  | 'draw_seventy_five_move'
  | 'draw_repetition'
  | 'draw_fivefold_repetition';

export type GameMode = 'ai' | 'pass_and_play';

export type AIDifficulty = 'novice' | 'casual' | 'intermediate' | 'club';

export type AIPresetId =
  | 'novice'
  | 'casual'
  | 'reactive'
  | 'intermediate'
  | 'club_1800'
  | 'club'
  | 'custom';

export type TTFlag = 'EXACT' | 'LOWERBOUND' | 'UPPERBOUND';

export interface EvalWeights {
  material: number;             // Weight multiplier (0.0 - 2.0)
  pieceSquareTables: number;    // Weight multiplier (0.0 - 2.0)
  pawnStructure: number;        // Weight multiplier (0.0 - 2.0)
  kingSafety: number;           // Weight multiplier (0.0 - 2.0)
  mobility: number;             // Weight multiplier (0.0 - 2.0)
}

export interface ChessEngineConfig {
  // Search boundaries
  maxDepth: number;               // 1 to 20+
  maxTimeMs: number;              // 100ms to 15000ms

  // Tactical features
  enableQuiescence: boolean;
  enableTranspositionTable: boolean;
  enableNullMovePruning: boolean;
  enableLMR: boolean;

  // Evaluation weights
  evalWeights: EvalWeights;

  // Handicap & humanization
  errorProbability: number;       // 0.0 (perfect) to 0.5 (frequent inaccuracies)
  errorMarginCentipawns: number;  // Max penalty applied when suboptimal move is chosen
}

export interface EnginePresetInfo {
  id: Exclude<AIPresetId, 'custom'>;
  legacyDifficulty: AIDifficulty;
  name: string;
  shortLabel: string;
  elo: number;
  depthLabel: string;
  description: string;
  config: ChessEngineConfig;
}

export interface SavedEngineProfile {
  id: string;
  name: string;
  elo: number;
  config: ChessEngineConfig;
  createdAt: number;
}

export interface EngineProfileState {
  elo: number; // 400 to 2400
  presetId: AIPresetId;
  isCustom: boolean;
  activeSavedProfileId: string | null;
  config: ChessEngineConfig;
}

export interface AIDifficultyInfo {
  id: AIDifficulty;
  level: 1 | 2 | 3 | 4;
  name: string;
  shortLabel: string;
  elo: number;
  depthLabel: string;
  description: string;
}

export interface AISearchResult {
  move: Move | null;
  difficulty: AIDifficulty;
  depth: number;
  nodes: number;
  score: number; // Centipawns from White's perspective (+ favors White, - favors Black)
  formattedScore: string; // e.g., "+1.4", "-0.5", "M2"
  elapsedMs: number;
  ttHits?: number;
  config?: ChessEngineConfig;
}

export type ShellState = 'title' | 'playing' | 'paused' | 'gameover' | 'puzzles' | 'replay';

export interface MoveRecord {
  move: Move;
  san: string;
  fenHash: string;
  turnNumber: number;
  color: Color;
}

export interface GameState {
  board: Board;
  turn: Color;
  castlingRights: CastlingRights;
  enPassantTarget: Square | null; // The square behind a pawn that just moved 2 squares
  halfMoveClock: number; // Plies since last capture or pawn advance (100 = 50 moves)
  fullMoveNumber: number; // Starts at 1, increments after Black's move
  positionCounts: Record<string, number>;
  moveHistory: MoveRecord[];
  capturedByWhite: PieceType[]; // Black pieces captured by White
  capturedByBlack: PieceType[]; // White pieces captured by Black
  status: GameStatus;
  winner: Color | 'draw' | null;
  inCheck: boolean;
  lastMove: { from: Square; to: Square } | null;
  zobristHash?: bigint;
}

export interface StoredGameSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  gameMode: GameMode;
  playerColor: Color;
  isFlipped: boolean;
  engineProfile: EngineProfileState;
  stateStack: GameState[];
  fen: string;
  turn: Color;
  fullMoveNumber: number;
  plyCount: number;
  status: GameStatus;
  winner: Color | 'draw' | null;
  lastMoveSan: string | null;
  isAutoSave?: boolean;
}
