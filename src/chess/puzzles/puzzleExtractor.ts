import { fenToGameState, generateLegalMoves, makeMove, oppositeColor } from '../engine';
import { GameState, Move, Square } from '../types';
import { getRatingBandForRating } from './ratingEngine';
import { ChessPuzzle, RatingBand } from './types';

/**
 * Converts a UCI move string (e.g., 'e2e4', 'g1f3', 'e7e8q') into a verified Move object in gameState.
 */
export function uciToMove(state: GameState, uci: string): Move | null {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promoChar = uci.length >= 5 ? uci[4].toLowerCase() : undefined;

  const legalMoves = generateLegalMoves(state);
  const found = legalMoves.find(
    (m) =>
      m.from === from &&
      m.to === to &&
      (!promoChar || (m.promotion && m.promotion.toLowerCase() === promoChar))
  );

  return found ?? null;
}

/**
 * Converts an internal Move object to standard UCI 4-5 char string.
 */
export function moveToUci(move: Move): string {
  const promo = move.promotion ? move.promotion.toLowerCase() : '';
  return `${move.from}${move.to}${promo}`;
}

/**
 * Validates that a ChessPuzzle's FEN is valid and that every move in the solution
 * sequence is strictly legal according to the chess engine rules.
 */
export function validatePuzzle(puzzle: ChessPuzzle): { valid: boolean; error?: string } {
  const rootState = fenToGameState(puzzle.fen);
  if (!rootState) {
    return { valid: false, error: `Invalid FEN: ${puzzle.fen}` };
  }

  if (!Array.isArray(puzzle.moves) || puzzle.moves.length < 2) {
    return { valid: false, error: `Puzzle requires at least 2 moves (setup + solution), got ${puzzle.moves?.length}` };
  }

  let currentState = rootState;
  for (let i = 0; i < puzzle.moves.length; i++) {
    const uci = puzzle.moves[i];
    const move = uciToMove(currentState, uci);
    if (!move) {
      return {
        valid: false,
        error: `Move #${i} (${uci}) is not legal in position (Ply ${i}, Turn ${currentState.turn})`,
      };
    }
    currentState = makeMove(currentState, move);
  }

  return { valid: true };
}

/**
 * Parses a single row from the Lichess Open Puzzle Database CSV:
 * Columns: PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags
 */
export function parseLichessCsvLine(csvLine: string): ChessPuzzle | null {
  const trimmed = csvLine.trim();
  if (!trimmed || trimmed.startsWith('PuzzleId')) return null;

  // Split with respect to comma
  const parts = trimmed.split(',');
  if (parts.length < 5) return null;

  const [id, fen, movesStr, ratingStr, rdStr, , , themesStr = ''] = parts;
  const rating = parseInt(ratingStr, 10);
  if (isNaN(rating)) return null;

  const moves = movesStr.trim().split(/\s+/).filter(Boolean);
  if (moves.length < 2) return null;

  const themes = themesStr
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => formatThemeTag(t));

  const puzzle: ChessPuzzle = {
    id,
    fen: fen.trim(),
    moves,
    rating,
    ratingDeviation: rdStr ? parseInt(rdStr, 10) : undefined,
    themes,
  };

  const validation = validatePuzzle(puzzle);
  if (!validation.valid) {
    return null;
  }

  return puzzle;
}

/**
 * Formats camelCase or lower_case theme tags into readable UI labels.
 */
export function formatThemeTag(tag: string): string {
  const dictionary: Record<string, string> = {
    crushing: 'Crushing Advantage',
    hangingPiece: 'Hanging Piece',
    fork: 'Fork',
    pin: 'Pin',
    skewer: 'Skewer',
    discoveredAttack: 'Discovered Attack',
    deflection: 'Deflection',
    decoy: 'Decoy',
    interference: 'Interference',
    clearance: 'Clearance',
    attraction: 'Attraction',
    intermezzo: 'Zwischenzug',
    zwischenzug: 'Zwischenzug',
    endgame: 'Endgame',
    pawnEndgame: 'King & Pawn Endgame',
    rookEndgame: 'Rook Endgame',
    bishopEndgame: 'Bishop Endgame',
    knightEndgame: 'Knight Endgame',
    queenEndgame: 'Queen Endgame',
    zugzwang: 'Zugzwang',
    defensiveMove: 'Defensive Resource',
    perpetualCheck: 'Perpetual Check',
    stalemate: 'Stalemate Swindle',
    underPromotion: 'Underpromotion',
    quietMove: 'Quiet Positional Move',
    trappedPiece: 'Trapped Piece',
    prophylaxis: 'Prophylaxis',
    mateIn1: 'Mate in 1',
    mateIn2: 'Mate in 2',
    mateIn3: 'Mate in 3',
    smotheredMate: 'Smothered Mate',
    arabianMate: 'Arabian Mate',
    anastasiaMate: "Anastasia's Mate",
    bodenMate: "Boden's Mate",
    hookMate: 'Hook Mate',
    backRankMate: 'Back-Rank Mate',
    lucenaPosition: 'Lucena Bridge',
    philidorDefense: 'Philidor Defense',
  };

  if (dictionary[tag]) {
    return dictionary[tag];
  }

  // Fallback: convert camelCase or snake_case to Title Case
  return tag
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Ingests a raw Lichess CSV string, parses each line, validates chess legality,
 * and partitions puzzles into rating buckets.
 */
export function parseLichessCsvChunk(csvData: string): ChessPuzzle[] {
  const lines = csvData.split('\n');
  const validPuzzles: ChessPuzzle[] = [];

  for (const line of lines) {
    const puzzle = parseLichessCsvLine(line);
    if (puzzle) {
      validPuzzles.push(puzzle);
    }
  }

  return validPuzzles;
}

/**
 * Partitions an array of verified ChessPuzzles into rating-banded collections.
 */
export function exportPuzzlesToBuckets(puzzles: ChessPuzzle[]): Record<RatingBand, ChessPuzzle[]> {
  const buckets: Record<RatingBand, ChessPuzzle[]> = {
    '0400_0800': [],
    '0800_1200': [],
    '1200_1600': [],
    '1600_2000': [],
    '2000_2400': [],
    '2400_plus': [],
  };

  for (const puzzle of puzzles) {
    const band = getRatingBandForRating(puzzle.rating);
    buckets[band].push(puzzle);
  }

  return buckets;
}
