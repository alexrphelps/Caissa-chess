import { PlayerPuzzleStats, RatingBand } from './types';

export const PUZZLE_STATS_STORAGE_KEY = 'caissa_player_puzzle_stats';
export const PUZZLE_HISTORY_STORAGE_KEY = 'caissa_puzzle_history';
export const MAX_RECENT_HISTORY_SIZE = 150;
export const DEFAULT_INITIAL_RATING = 1000;

export const INITIAL_PLAYER_STATS: PlayerPuzzleStats = {
  rating: DEFAULT_INITIAL_RATING,
  peakRating: DEFAULT_INITIAL_RATING,
  totalSolved: 0,
  totalFailed: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastPlayedDate: Date.now(),
};

/**
 * Calculates rating delta using standard Elo/Glicko-aligned formulas scaled to the puzzle difficulty.
 * - Solved on first attempt: +16 to +32 points (scaled by puzzle rating vs user rating).
 * - Failed on first attempt: -12 to -24 points.
 * - Hint used (assisted): 0 points.
 */
export function calculateRatingDelta(
  userRating: number,
  puzzleRating: number,
  outcome: 'solved' | 'failed' | 'assisted'
): number {
  if (outcome === 'assisted') {
    return 0;
  }

  // Expected score for the user against the puzzle
  const expected = 1 / (1 + 10 ** ((puzzleRating - userRating) / 400));

  if (outcome === 'solved') {
    // K-factor = 32, clamped strictly between +16 and +32
    const rawDelta = Math.round(32 * (1 - expected));
    return Math.max(16, Math.min(32, rawDelta));
  }

  // outcome === 'failed'
  // K-factor = 32, clamped strictly between -24 and -12
  const rawDelta = Math.round(32 * (0 - expected));
  return Math.min(-12, Math.max(-24, rawDelta));
}

/**
 * Updates player puzzle statistics following a completed or failed puzzle attempt.
 */
export function updatePlayerStats(
  current: PlayerPuzzleStats,
  puzzleRating: number,
  outcome: 'solved' | 'failed' | 'assisted'
): { updatedStats: PlayerPuzzleStats; delta: number } {
  const delta = calculateRatingDelta(current.rating, puzzleRating, outcome);
  const newRating = Math.max(100, Math.min(3200, current.rating + delta));
  const newPeak = Math.max(current.peakRating, newRating);

  let newStreak = current.currentStreak;
  let newBestStreak = current.bestStreak;
  let totalSolved = current.totalSolved;
  let totalFailed = current.totalFailed;

  if (outcome === 'solved') {
    totalSolved++;
    newStreak++;
    newBestStreak = Math.max(newBestStreak, newStreak);
  } else if (outcome === 'failed') {
    totalFailed++;
    newStreak = 0;
  }
  // Assisted solves do not break a streak, but don't increase it either

  const updatedStats: PlayerPuzzleStats = {
    rating: newRating,
    peakRating: newPeak,
    totalSolved,
    totalFailed,
    currentStreak: newStreak,
    bestStreak: newBestStreak,
    lastPlayedDate: Date.now(),
  };

  return { updatedStats, delta };
}

/**
 * Maps a numerical Elo rating to its corresponding rating band identifier.
 */
export function getRatingBandForRating(rating: number): RatingBand {
  if (rating < 800) return '0400_0800';
  if (rating < 1200) return '0800_1200';
  if (rating < 1600) return '1200_1600';
  if (rating < 2000) return '1600_2000';
  if (rating < 2400) return '2000_2400';
  return '2400_plus';
}

/**
 * Loads player puzzle stats from localStorage with fallback defaults.
 */
export function loadPlayerPuzzleStats(): PlayerPuzzleStats {
  if (typeof window === 'undefined') return { ...INITIAL_PLAYER_STATS };
  try {
    const raw = window.localStorage.getItem(PUZZLE_STATS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.rating === 'number') {
        return {
          rating: Math.round(parsed.rating),
          peakRating: Math.round(parsed.peakRating ?? parsed.rating),
          totalSolved: Math.max(0, parsed.totalSolved ?? 0),
          totalFailed: Math.max(0, parsed.totalFailed ?? 0),
          currentStreak: Math.max(0, parsed.currentStreak ?? 0),
          bestStreak: Math.max(0, parsed.bestStreak ?? 0),
          lastPlayedDate: parsed.lastPlayedDate ?? Date.now(),
        };
      }
    }
  } catch {}
  return { ...INITIAL_PLAYER_STATS };
}

/**
 * Persists player puzzle stats to localStorage.
 */
export function savePlayerPuzzleStats(stats: PlayerPuzzleStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PUZZLE_STATS_STORAGE_KEY,
      JSON.stringify(stats)
    );
  } catch {}
}

export const PUZZLE_RECORDS_STORAGE_KEY = 'caissa_puzzle_records';

/**
 * Loads recent played puzzle IDs to prevent serving duplicate puzzles.
 */
export function loadPlayedPuzzleIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const ids = new Set<string>();
  try {
    const raw = window.localStorage.getItem(PUZZLE_HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((id) => typeof id === 'string' && ids.add(id));
      }
    }
  } catch {}

  try {
    const rawRecords = window.localStorage.getItem(PUZZLE_RECORDS_STORAGE_KEY);
    if (rawRecords) {
      const parsedRecords = JSON.parse(rawRecords);
      if (Array.isArray(parsedRecords)) {
        parsedRecords.forEach((r) => r?.puzzleId && ids.add(r.puzzleId));
      }
    }
  } catch {}

  return ids;
}

/**
 * Saves a recently played puzzle ID to localStorage (sliding window of 150 items).
 */
export function recordPlayedPuzzleId(puzzleId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadPlayedPuzzleIds();
    current.add(puzzleId);
    const array = Array.from(current);
    const truncated = array.slice(-MAX_RECENT_HISTORY_SIZE);
    window.localStorage.setItem(
      PUZZLE_HISTORY_STORAGE_KEY,
      JSON.stringify(truncated)
    );
  } catch {}
}

/**
 * Loads full detailed past puzzle history records (newest first).
 */
export function loadPlayedPuzzleRecords(): import('./types').PlayedPuzzleEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PUZZLE_RECORDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      }
    }
  } catch {}
  return [];
}

/**
 * Records or updates a played puzzle attempt in full history.
 */
export function recordPlayedPuzzleRecord(entry: import('./types').PlayedPuzzleEntry): void {
  if (typeof window === 'undefined') return;
  try {
    recordPlayedPuzzleId(entry.puzzleId);
    const records = loadPlayedPuzzleRecords();
    const existingIndex = records.findIndex((r) => r.puzzleId === entry.puzzleId);

    if (existingIndex >= 0) {
      records[existingIndex] = {
        ...records[existingIndex],
        ...entry,
        timestamp: entry.timestamp || Date.now(),
      };
    } else {
      records.unshift(entry);
    }

    const truncated = records.slice(0, MAX_RECENT_HISTORY_SIZE);
    window.localStorage.setItem(
      PUZZLE_RECORDS_STORAGE_KEY,
      JSON.stringify(truncated)
    );
  } catch {}
}

/**
 * Clears all stored puzzle history records and played IDs.
 */
export function clearPlayedPuzzleRecords(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUZZLE_RECORDS_STORAGE_KEY);
    window.localStorage.removeItem(PUZZLE_HISTORY_STORAGE_KEY);
  } catch {}
}

