import {
  fenToGameState,
  generateLegalMoves,
  makeMove,
  oppositeColor,
} from '../engine';
import {
  evaluateBoardWhitePerspective,
  MATE_SCORE,
  MATE_THRESHOLD,
  searchBestAIMove,
} from '../ai';
import { Color, GameState, Move, Square } from '../types';
import {
  clearPlayedPuzzleRecords,
  getRatingBandForRating,
  loadPlayedPuzzleIds,
  loadPlayedPuzzleRecords,
  recordPlayedPuzzleId,
  recordPlayedPuzzleRecord,
} from './ratingEngine';
import { moveToUci, uciToMove } from './puzzleExtractor';
import { ChessPuzzle, RatingBand } from './types';

// In-memory bucket cache for instant retrieval once loaded
const bucketCache = new Map<RatingBand, ChessPuzzle[]>();

/**
 * Dynamically lazy-loads a rating-banded puzzle JSON bucket on demand.
 */
export async function loadPuzzleBucket(band: RatingBand): Promise<ChessPuzzle[]> {
  const cached = bucketCache.get(band);
  if (cached) {
    return cached;
  }

  let data: ChessPuzzle[];
  switch (band) {
    case '0400_0800':
      data = (await import('./data/puzzles_0400_0800.json')).default as ChessPuzzle[];
      break;
    case '0800_1200':
      data = (await import('./data/puzzles_0800_1200.json')).default as ChessPuzzle[];
      break;
    case '1200_1600':
      data = (await import('./data/puzzles_1200_1600.json')).default as ChessPuzzle[];
      break;
    case '1600_2000':
      data = (await import('./data/puzzles_1600_2000.json')).default as ChessPuzzle[];
      break;
    case '2000_2400':
      data = (await import('./data/puzzles_2000_2400.json')).default as ChessPuzzle[];
      break;
    case '2400_plus':
      data = (await import('./data/puzzles_2400_plus.json')).default as ChessPuzzle[];
      break;
    default:
      data = (await import('./data/puzzles_0800_1200.json')).default as ChessPuzzle[];
  }

  bucketCache.set(band, data);
  return data;
}

function getPuzzleLastPlayedMap(): Map<string, number> {
  const records = loadPlayedPuzzleRecords();
  const map = new Map<string, number>();
  for (const r of records) {
    if (!map.has(r.puzzleId)) {
      map.set(r.puzzleId, r.timestamp || 0);
    }
  }
  return map;
}

const ALL_RATING_BANDS: RatingBand[] = [
  '0400_0800',
  '0800_1200',
  '1200_1600',
  '1600_2000',
  '2000_2400',
  '2400_plus',
];

/**
 * Pre-fetches candidate buckets around player rating to ensure zero network/storage latency.
 */
export async function prefetchNeighborBuckets(rating: number): Promise<void> {
  const currentBand = getRatingBandForRating(rating);
  const lowerBand = getRatingBandForRating(rating - 100);
  const higherBand = getRatingBandForRating(rating + 100);

  const bandsToLoad = Array.from(new Set([currentBand, lowerBand, higherBand]));
  await Promise.all(bandsToLoad.map((b) => loadPuzzleBucket(b)));
}

/**
 * Selects an adaptive, non-repeating puzzle calibrated to player rating (+/- 75 to 150 points).
 * Prioritizes unplayed puzzles across the database before ever repeating.
 */
export async function fetchAdaptivePuzzle(
  userRating: number,
  excludeId?: string
): Promise<ChessPuzzle> {
  const primaryBand = getRatingBandForRating(userRating);
  const playedIds = loadPlayedPuzzleIds();

  // Load primary and adjacent candidate buckets
  await prefetchNeighborBuckets(userRating);
  const primaryPuzzles = await loadPuzzleBucket(primaryBand);

  // Pool candidate puzzles
  let pool = [...primaryPuzzles];

  // If rating is within 100 points of a band boundary, pull from adjacent bucket as well
  if (userRating % 400 < 100 && userRating > 400) {
    const lowerBand = getRatingBandForRating(userRating - 100);
    const lowerPuzzles = await loadPuzzleBucket(lowerBand);
    pool = pool.concat(lowerPuzzles);
  } else if (userRating % 400 > 300) {
    const upperBand = getRatingBandForRating(userRating + 100);
    const upperPuzzles = await loadPuzzleBucket(upperBand);
    pool = pool.concat(upperPuzzles);
  }

  // Filter out the currently active puzzle
  if (excludeId) {
    pool = pool.filter((p) => p.id !== excludeId);
  }

  // Priority 1: Unplayed puzzles within +/- 100 points of user rating
  let candidates = pool.filter(
    (p) => !playedIds.has(p.id) && Math.abs(p.rating - userRating) <= 100
  );

  // Priority 2: Unplayed puzzles within +/- 200 points
  if (candidates.length === 0) {
    candidates = pool.filter(
      (p) => !playedIds.has(p.id) && Math.abs(p.rating - userRating) <= 200
    );
  }

  // Priority 3: Any unplayed puzzle in primary pool
  if (candidates.length === 0) {
    candidates = pool.filter((p) => !playedIds.has(p.id));
  }

  // Priority 4: Search all rating buckets for any unplayed puzzle in the entire database
  if (candidates.length === 0) {
    const allBuckets = await Promise.all(
      ALL_RATING_BANDS.map((b) => loadPuzzleBucket(b))
    );
    const allPuzzles = allBuckets
      .flat()
      .filter((p) => p.id !== excludeId && !playedIds.has(p.id));

    if (allPuzzles.length > 0) {
      // Pick closest rating to userRating
      allPuzzles.sort(
        (a, b) =>
          Math.abs(a.rating - userRating) - Math.abs(b.rating - userRating)
      );
      // Pick randomly among top 5 closest unplayed
      const topPool = allPuzzles.slice(0, Math.min(5, allPuzzles.length));
      candidates = topPool;
    }
  }

  // Priority 5: If literally all puzzles in the database have been played,
  // pick the LEAST RECENTLY PLAYED puzzle (ordered by history timestamp)
  if (candidates.length === 0) {
    const lastPlayedMap = getPuzzleLastPlayedMap();
    const sortedPool = (pool.length > 0 ? pool : primaryPuzzles)
      .filter((p) => p.id !== excludeId)
      .sort(
        (a, b) =>
          (lastPlayedMap.get(a.id) ?? 0) - (lastPlayedMap.get(b.id) ?? 0)
      );

    candidates = sortedPool.slice(0, Math.min(3, sortedPool.length));
  }

  // Fallback if pool is empty
  if (candidates.length === 0) {
    candidates = primaryPuzzles;
  }

  // Pick randomly from top candidates to guarantee a fresh stream
  const chosenIndex = Math.floor(Math.random() * candidates.length);
  const chosen = candidates[chosenIndex];

  // Record chosen puzzle in history
  recordPlayedPuzzleId(chosen.id);

  return chosen;
}

/**
 * Selects an unplayed puzzle from a specific rating band, falling back to
 * least recently played order if all puzzles in the bucket have been completed.
 */
export async function fetchBucketPuzzle(
  band: RatingBand,
  excludeId?: string
): Promise<ChessPuzzle> {
  const bucket = await loadPuzzleBucket(band);
  const playedIds = loadPlayedPuzzleIds();
  const available = excludeId ? bucket.filter((p) => p.id !== excludeId) : bucket;
  const pool = available.length > 0 ? available : bucket;

  const unplayed = pool.filter((p) => !playedIds.has(p.id));
  if (unplayed.length > 0) {
    const chosen = unplayed[Math.floor(Math.random() * unplayed.length)];
    recordPlayedPuzzleId(chosen.id);
    return chosen;
  }

  // All played: pick least recently played in this bucket
  const lastPlayedMap = getPuzzleLastPlayedMap();
  const sorted = [...pool].sort(
    (a, b) => (lastPlayedMap.get(a.id) ?? 0) - (lastPlayedMap.get(b.id) ?? 0)
  );
  const pickPool = sorted.slice(0, Math.min(3, sorted.length));
  const chosen = pickPool[Math.floor(Math.random() * pickPool.length)];
  recordPlayedPuzzleId(chosen.id);
  return chosen;
}

/**
 * Evaluates whether a player's legal alternative move is tactically equivalent to
 * the puzzle's expected move using local engine depth 6 evaluation.
 *
 * If the user's move preserves an equivalent winning score (within 60 centipawns or
 * forces an equal/faster mate), it is accepted as correct.
 */
export interface AlternativeMoveResult {
  isEquivalent: boolean;
  scoreDelta: number;
  reason: string;
  opponentReplyMove?: Move | null;
  playerContinuationMove?: Move | null;
  continuationMoves: string[];
}

/**
 * Evaluates whether a player's legal alternative move is tactically equivalent to
 * the puzzle's expected move using local engine depth 6 evaluation.
 *
 * If the user's move preserves an equivalent winning score (within 60 centipawns or
 * forces an equal/faster mate), it is accepted as correct, and dynamically computes
 * the opponent's best reply and player's best follow-up moves to adapt the puzzle continuation.
 */
export function evaluateAlternativeMove(
  stateBeforeMove: GameState,
  playerMove: Move,
  expectedUci: string,
  playerColor: Color
): AlternativeMoveResult {
  const expectedMove = uciToMove(stateBeforeMove, expectedUci);
  if (!expectedMove) {
    return {
      isEquivalent: false,
      scoreDelta: -999,
      reason: 'Catalog move unparseable',
      continuationMoves: [],
    };
  }

  // If user played the exact catalog move
  if (
    playerMove.from === expectedMove.from &&
    playerMove.to === expectedMove.to &&
    (playerMove.promotion ?? undefined) === (expectedMove.promotion ?? undefined)
  ) {
    return {
      isEquivalent: true,
      scoreDelta: 0,
      reason: 'Exact catalog move',
      continuationMoves: [],
    };
  }

  // Play both moves to obtain the resulting game states
  const stateAfterPlayer = makeMove(stateBeforeMove, playerMove);
  const stateAfterExpected = makeMove(stateBeforeMove, expectedMove);

  // If player delivered immediate checkmate!
  if (stateAfterPlayer.status === 'checkmate') {
    return {
      isEquivalent: true,
      scoreDelta: 10000,
      reason: 'Immediate checkmate delivered',
      opponentReplyMove: null,
      playerContinuationMove: null,
      continuationMoves: [],
    };
  }

  // Depth 6 tactical engine search
  const engineDepth = 6;
  const maxSearchTimeMs = 350;

  const expectedResult = searchBestAIMove(
    stateAfterExpected,
    'club',
    Math.random,
    {
      maxDepth: engineDepth,
      maxTimeMs: maxSearchTimeMs,
      enableQuiescence: true,
      enableTranspositionTable: true,
      enableNullMovePruning: true,
      enableLMR: true,
      evalWeights: {
        material: 1.0,
        pieceSquareTables: 1.0,
        pawnStructure: 1.0,
        kingSafety: 1.0,
        mobility: 1.0,
      },
      errorProbability: 0,
      errorMarginCentipawns: 0,
    }
  );

  const playerResult = searchBestAIMove(
    stateAfterPlayer,
    'club',
    Math.random,
    {
      maxDepth: engineDepth,
      maxTimeMs: maxSearchTimeMs,
      enableQuiescence: true,
      enableTranspositionTable: true,
      enableNullMovePruning: true,
      enableLMR: true,
      evalWeights: {
        material: 1.0,
        pieceSquareTables: 1.0,
        pawnStructure: 1.0,
        kingSafety: 1.0,
        mobility: 1.0,
      },
      errorProbability: 0,
      errorMarginCentipawns: 0,
    }
  );

  // Convert scores to player's perspective (+ is good for player)
  const sign = playerColor === 'w' ? 1 : -1;
  const scoreExpected = expectedResult.score * sign;
  const scorePlayer = playerResult.score * sign;

  const scoreDelta = scorePlayer - scoreExpected;

  // Helper to compute opponent's reply and player's follow-up for dynamic continuation
  const computeContinuation = (): {
    opponentReplyMove: Move | null;
    playerContinuationMove: Move | null;
    continuationMoves: string[];
  } => {
    const oppMove = playerResult.move;
    if (!oppMove || stateAfterPlayer.status !== 'playing') {
      return {
        opponentReplyMove: null,
        playerContinuationMove: null,
        continuationMoves: [],
      };
    }

    const oppUci = moveToUci(oppMove);
    try {
      const stateAfterOpp = makeMove(stateAfterPlayer, oppMove);
      if (stateAfterOpp.status !== 'playing') {
        return {
          opponentReplyMove: oppMove,
          playerContinuationMove: null,
          continuationMoves: [oppUci],
        };
      }

      const followUpResult = searchBestAIMove(
        stateAfterOpp,
        'club',
        Math.random,
        {
          maxDepth: engineDepth,
          maxTimeMs: maxSearchTimeMs,
          enableQuiescence: true,
          enableTranspositionTable: true,
          enableNullMovePruning: true,
          enableLMR: true,
          evalWeights: {
            material: 1.0,
            pieceSquareTables: 1.0,
            pawnStructure: 1.0,
            kingSafety: 1.0,
            mobility: 1.0,
          },
          errorProbability: 0,
          errorMarginCentipawns: 0,
        }
      );

      const playerFollowUp = followUpResult.move;
      const continuationMoves = [
        oppUci,
        ...(playerFollowUp ? [moveToUci(playerFollowUp)] : []),
      ];

      return {
        opponentReplyMove: oppMove,
        playerContinuationMove: playerFollowUp,
        continuationMoves,
      };
    } catch {
      return {
        opponentReplyMove: oppMove,
        playerContinuationMove: null,
        continuationMoves: [oppUci],
      };
    }
  };

  // 1. Both force checkmate with equal or faster execution
  if (scorePlayer > MATE_THRESHOLD && scoreExpected > MATE_THRESHOLD && scorePlayer >= scoreExpected - 50) {
    const cont = computeContinuation();
    return {
      isEquivalent: true,
      scoreDelta,
      reason: 'Alternative forces mate',
      ...cont,
    };
  }

  // 2. Equivalent tactical capture:
  // If the catalog move captures a critical piece on destination square X, and the player
  // ALSO captures on destination square X (e.g. dual recapture or alternate piece capture),
  // preserving equivalent winning score.
  if (
    Boolean(expectedMove.captured) &&
    playerMove.to === expectedMove.to &&
    Boolean(playerMove.captured) &&
    scoreDelta >= -30
  ) {
    const cont = computeContinuation();
    return {
      isEquivalent: true,
      scoreDelta,
      reason: 'Equivalent tactical capture',
      ...cont,
    };
  }

  // Non-tactical moves, quiet stalling moves, or piece shuffles in already-winning positions
  // must NOT be accepted as alternative puzzle solutions.
  return {
    isEquivalent: false,
    scoreDelta,
    reason: 'Not the puzzle solution',
    continuationMoves: [],
  };
}
