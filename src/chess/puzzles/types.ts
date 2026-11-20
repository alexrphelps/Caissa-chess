export interface ChessPuzzle {
  id: string;
  fen: string;               // Position BEFORE the opponent's setup move
  moves: string[];           // Solution move sequence in UCI format (e.g., ["e7e5", "g1f3", "b8c6"]):
                             // moves[0] = Opponent setup blunder / triggering move
                             // moves[1] = Player first response (correct)
                             // moves[2] = Opponent response
                             // moves[3] = Player follow-up (if applicable)
  rating: number;            // Difficulty rating (400 to 2600+)
  ratingDeviation?: number;
  themes: string[];          // Tags: "pin", "fork", "endgame", "zugzwang", "defensiveMove", etc.
  description?: string;      // Optional motif label or context
}

export type RatingBand =
  | '0400_0800'
  | '0800_1200'
  | '1200_1600'
  | '1600_2000'
  | '2000_2400'
  | '2400_plus';

export interface RatingBandInfo {
  band: RatingBand;
  label: string;
  minRating: number;
  maxRating: number;
  description: string;
}

export const RATING_BANDS: Record<RatingBand, RatingBandInfo> = {
  '0400_0800': {
    band: '0400_0800',
    label: 'Novice (400 - 800)',
    minRating: 400,
    maxRating: 800,
    description: 'Fundamental hanging pieces, simple forks, and elementary back-rank mates.',
  },
  '0800_1200': {
    band: '0800_1200',
    label: 'Casual (800 - 1200)',
    minRating: 800,
    maxRating: 1200,
    description: 'Direct pins, skewers, discovered attacks, and classical mates.',
  },
  '1200_1600': {
    band: '1200_1600',
    label: 'Intermediate (1200 - 1600)',
    minRating: 1200,
    maxRating: 1600,
    description: 'Zwischenzug, decoys, clearance, king & pawn opposition, and Lucena positions.',
  },
  '1600_2000': {
    band: '1600_2000',
    label: 'Advanced (1600 - 2000)',
    minRating: 1600,
    maxRating: 2000,
    description: 'Philidor endgames, smothered mates, multi-piece deflects, and quiet positional traps.',
  },
  '2000_2400': {
    band: '2000_2400',
    label: 'Expert (2000 - 2400)',
    minRating: 2000,
    maxRating: 2400,
    description: 'Zugzwang, defensive survival resources, perpetual check swindles, and Boden mates.',
  },
  '2400_plus': {
    band: '2400_plus',
    label: 'Master (2400+)',
    minRating: 2400,
    maxRating: 3000,
    description: 'Deep counter-intuitive combinations, subtle prophylaxis, and exquisite underpromotions.',
  },
};

export interface PlayerPuzzleStats {
  rating: number;
  peakRating: number;
  totalSolved: number;
  totalFailed: number;
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: number;
}

export type HintTier = 0 | 1 | 2 | 3; // 0 = None, 1 = Piece, 2 = Destination, 3 = Full Line

export type PuzzleStepStatus =
  | 'idle'             // Ready, awaiting setup move
  | 'playing_setup'    // Animate opponent setup move
  | 'player_turn'      // Awaiting player move
  | 'opponent_turn'    // Awaiting opponent response
  | 'evaluating_alt'   // Evaluating non-catalog legal move with local engine
  | 'solved'           // All moves successfully completed
  | 'failed'           // Wrong move played
  | 'revealed';        // Player requested full solution

export interface ActivePuzzleSession {
  puzzle: ChessPuzzle;
  currentMoveIndex: number;     // Index in puzzle.moves (0 = setup, 1 = player first move, etc.)
  stepStatus: PuzzleStepStatus;
  hintTier: HintTier;
  isAssisted: boolean;          // True if any hint tier used
  hasFailedCurrent: boolean;    // First attempt failed (deducts rating once)
  ratingDelta: number | null;   // Earned or lost rating points
  startTimeMs: number;
  userMoveHistory: string[];    // User moves played in UCI
}

export interface PlayedPuzzleEntry {
  puzzleId: string;
  puzzle: ChessPuzzle;
  outcome: 'solved' | 'failed' | 'assisted';
  delta: number;
  timestamp: number;
}

