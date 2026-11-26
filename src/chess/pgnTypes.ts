import { MoveClassification } from './gameReview';
import { OpeningAnalysisResult } from './openingBook';
import { OpponentThreatInfo, RecommendedMove, TacticalMotifTag } from './tacticsHelper';
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

export interface PgnVariationLine {
  id: string;
  label: string; // e.g. "18... Nxd6 19. Bxd6"
  nodes: TimelineNode[]; // Sequence of variation moves branching from parent ply - 1
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
  clock?: string | null; // Parsed from [%clk H:MM:SS]
  pgnEval?: number | null; // Centipawns (White perspective) parsed from [%eval ...]
  pgnEvalFormatted?: string | null; // Formatted e.g. "+0.4", "M3"
  variations?: PgnVariationLine[]; // Parsed RAV (...) sidelines branching at this ply
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

export interface SidelineState {
  anchorPly: number; // Mainline ply index that the sideline branched off of
  label: string; // e.g. "What-If Sideline", "Coach Alternative", or "PGN Variation"
  nodes: TimelineNode[]; // Sideline moves (nodes[0] is the first move after anchorPly)
  activeIndex: number; // 0..nodes.length - 1
}

export type ReplayMoveVerdict = MoveClassification | 'book' | 'sacrifice' | 'start';

export interface ReplayPlyCoachInsight {
  cacheKey: string;
  ply: number;
  playedSan: string | null;
  playedColor: Color | null;
  verdict: ReplayMoveVerdict;
  verdictLabel: string; // e.g. "Best Move", "Sacrifice", "Inaccuracy", "Opening Book"
  verdictSymbol: string; // e.g. "★", "!!", "✓", "?!", "?", "??", "Book"
  evalWhiteCp: number; // Centipawns from White perspective after this ply
  formattedEval: string; // e.g. "+1.4", "-0.6", "M3"
  centipawnLoss: number;
  motif: TacticalMotifTag;
  planSummary: string; // Why the played move works or what its idea/error was
  followUpNote: string; // Expected continuation or what the move sets up
  bestAlternativeSan: string | null;
  alternatives: RecommendedMove[]; // Top engine options before this move (or from ply 0)
  afterMoveThreat: OpponentThreatInfo | null; // Active threat / opponent's best reply after this move
  openingInfo: OpeningAnalysisResult | null;
  searchDepth: number;
  elapsedMs: number;
}
