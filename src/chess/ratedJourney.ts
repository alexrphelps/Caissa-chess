import { computeWinProbability, searchMultiPV } from './ai';
import { generateLegalMoves } from './engine';
import {
  evaluateBoardWhitePerspective,
  MAX_ENGINE_ELO,
  MIN_ENGINE_ELO,
} from './evaluation';
import {
  calculatePlayerAccuracy,
  classifyMoveQuality,
  MoveClassification,
} from './gameReview';
import { analyzeOpeningAndStrategy } from './openingBook';
import { Color, GameState, StoredGameSession } from './types';

export const RATED_JOURNEY_STORAGE_KEY = 'caissa_rated_journey_profile';
export const MIN_RATED_PLAYER_MOVES = 6;
export const MAX_JOURNEY_HISTORY = 80;
export const BLUNDER_ALERT_MAX_ELO = 1000;
export const UNDO_GAIN_DAMPENING_PER_USE = 0.12;
export const MAX_UNDO_GAIN_DAMPENING = 0.36;

export type StartingTierId = 'beginner' | 'medium' | 'hard' | 'master';

export interface StartingTierOption {
  id: StartingTierId;
  name: string;
  eloLabel: string;
  startingElo: number;
  startingRd: number;
  undosPerGame: number;
  blunderAlerts: boolean;
  summary: string;
}

export const STARTING_TIER_OPTIONS: readonly StartingTierOption[] = [
  {
    id: 'beginner',
    name: 'Beginner',
    eloLabel: '600 Elo',
    startingElo: 600,
    startingRd: 220,
    undosPerGame: 3,
    blunderAlerts: true,
    summary: 'New to chess or learning piece safety. Starts with 3 Undos and Blunder Alerts.',
  },
  {
    id: 'medium',
    name: 'Medium',
    eloLabel: '1050 Elo',
    startingElo: 1050,
    startingRd: 200,
    undosPerGame: 2,
    blunderAlerts: false,
    summary: 'Knows basic openings and tactics. Starts with 2 Undos and unassisted play.',
  },
  {
    id: 'hard',
    name: 'Hard',
    eloLabel: '1550 Elo',
    startingElo: 1550,
    startingRd: 180,
    undosPerGame: 1,
    blunderAlerts: false,
    summary: 'Experienced club player. Starts with 1 Undo and sharp tactical opponents.',
  },
  {
    id: 'master',
    name: 'Master Challenge',
    eloLabel: '2000 Elo',
    startingElo: 2000,
    startingRd: 160,
    undosPerGame: 0,
    blunderAlerts: false,
    summary: 'Strict competitive test from game one. Zero undos, full engine calculation.',
  },
] as const;

export interface RankTierInfo {
  id: string;
  name: string;
  minElo: number;
  maxElo: number;
  nextTierName: string | null;
  nextTierElo: number | null;
  progressPct: number;
  undosAllowed: number;
}

interface RankTierDef {
  id: string;
  name: string;
  minElo: number;
  maxElo: number;
}

const RANK_TIERS: readonly RankTierDef[] = [
  { id: 'apprentice', name: 'Apprentice', minElo: 400, maxElo: 799 },
  { id: 'contender', name: 'Club Contender', minElo: 800, maxElo: 1149 },
  { id: 'tactician', name: 'Tactician', minElo: 1150, maxElo: 1499 },
  { id: 'strategist', name: 'Strategist', minElo: 1500, maxElo: 1849 },
  { id: 'candidate', name: 'Candidate Master', minElo: 1850, maxElo: 2199 },
  { id: 'master', name: 'Salon Master', minElo: 2200, maxElo: 2549 },
  { id: 'grandmaster', name: 'Grandmaster', minElo: 2550, maxElo: 3000 },
];

export interface UndoLadderStep {
  undos: number;
  rangeLabel: string;
  minElo: number;
  maxElo: number;
  note: string;
}

export const UNDO_LADDER_STEPS: readonly UndoLadderStep[] = [
  { undos: 3, rangeLabel: '400–899 Elo', minElo: 400, maxElo: 899, note: 'Beginner safety net' },
  { undos: 2, rangeLabel: '900–1249 Elo', minElo: 900, maxElo: 1249, note: 'Developing discipline' },
  { undos: 1, rangeLabel: '1250–1599 Elo', minElo: 1250, maxElo: 1599, note: 'Single lifeline' },
  { undos: 0, rangeLabel: '1600+ Elo', minElo: 1600, maxElo: 3000, note: 'Strict touch-move' },
];

export type RatedMatchOutcome = 'win' | 'draw' | 'loss';

export type RatedMatchTermination =
  | 'checkmate'
  | 'resignation'
  | 'stalemate'
  | 'draw'
  | 'aborted';

export interface ScoredPlayerPly {
  plyIndex: number;
  turnNumber: number;
  color: Color;
  playedSan: string;
  bestSan: string;
  centipawnLoss: number;
  deltaWinProb: number;
  classification: MoveClassification;
  isBookOrForced: boolean;
  isDecidedPosition: boolean;
  evalBeforeWhite: number;
}

export interface RatedMatchRecord {
  id: string;
  playedAt: number;
  opponentElo: number;
  playerColor: Color;
  outcome: RatedMatchOutcome;
  termination: RatedMatchTermination;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  rdAfter: number;
  performanceRating: number;
  accuracy: number;
  blunders: number;
  mistakes: number;
  undosUsed: number;
  undosAllowed: number;
  playerMoves: number;
  totalPlies: number;
  sessionId?: string;
}

export interface RatedMatchResultSummary {
  wasAbortedTooShort: boolean;
  outcome: RatedMatchOutcome;
  termination: RatedMatchTermination;
  opponentElo: number;
  playerColor: Color;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  rdBefore: number;
  rdAfter: number;
  isProvisionalAfter: boolean;
  placementCountAfter: number;
  performanceRating: number;
  accuracy: number;
  blunders: number;
  mistakes: number;
  playerMoves: number;
  undosUsed: number;
  undosAllowed: number;
  undoPenaltyPct: number;
  tierBefore: RankTierInfo;
  tierAfter: RankTierInfo;
  promotedTier: boolean;
  undosBefore: number;
  undosAfter: number;
  undoBudgetChanged: boolean;
  blunderAlertsGraduated: boolean;
  nextOpponentElo: number;
  nextColor: Color;
  sessionId?: string;
}

export interface RatedJourneyProfile {
  initialized: boolean;
  startingTier: StartingTierId;
  rating: number;
  rd: number;
  volatility: number;
  peakRating: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  currentStreak: number; // Positive for win streak, negative for loss streak
  bestStreak: number;
  nextColor: Color;
  nextOpponentElo: number;
  history: RatedMatchRecord[];
  createdAt: number;
  updatedAt: number;
}

export interface SavedGamesCalibrationProgress {
  completedGames: number;
  totalGames: number;
  currentGameTitle: string;
}

export interface SavedGamesCalibrationResult {
  gamesAnalyzed: number;
  pliesAnalyzed: number;
  avgAccuracy: number;
  blunderRate: number;
  estimatedElo: number;
  suggestedTier: StartingTierId;
  puzzleRatingPrior: number | null;
}

export function clampElo(elo: number): number {
  return Math.max(MIN_ENGINE_ELO, Math.min(MAX_ENGINE_ELO, Math.round(elo)));
}

export function roundToNearest25(elo: number): number {
  return clampElo(Math.round(elo / 25) * 25);
}

/**
 * Progressive undo budget that starts at 3 for beginners and tapers cleanly as rating rises.
 */
export function getUndoAllowanceForRating(rating: number): number {
  if (rating < 900) return 3;
  if (rating < 1250) return 2;
  if (rating < 1600) return 1;
  return 0;
}

/**
 * Below 1000 Elo, beginners receive a quiet Blunder Alert after major mistakes so they can decide whether to use an Undo.
 */
export function isBlunderAlertEnabledForRating(rating: number): boolean {
  return rating < BLUNDER_ALERT_MAX_ELO;
}

/**
 * Maps a numeric Elo rating to its salon rank tier and progress toward the next tier.
 */
export function getRankTierForRating(rating: number): RankTierInfo {
  const clamped = clampElo(rating);
  let idx = RANK_TIERS.findIndex(
    (t) => clamped >= t.minElo && clamped <= t.maxElo
  );
  if (idx < 0) {
    idx = clamped < RANK_TIERS[0].minElo ? 0 : RANK_TIERS.length - 1;
  }
  const tier = RANK_TIERS[idx];
  const next = idx + 1 < RANK_TIERS.length ? RANK_TIERS[idx + 1] : null;
  const span = Math.max(1, (next ? next.minElo : tier.maxElo) - tier.minElo);
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((clamped - tier.minElo) / span) * 100)))
    : 100;

  return {
    id: tier.id,
    name: tier.name,
    minElo: tier.minElo,
    maxElo: tier.maxElo,
    nextTierName: next ? next.name : null,
    nextTierElo: next ? next.minElo : null,
    progressPct,
    undosAllowed: getUndoAllowanceForRating(clamped),
  };
}

export function getStartingTierOption(id: StartingTierId): StartingTierOption {
  return (
    STARTING_TIER_OPTIONS.find((opt) => opt.id === id) ??
    STARTING_TIER_OPTIONS[0]
  );
}

export function suggestStartingTierForElo(elo: number): StartingTierId {
  if (elo < 850) return 'beginner';
  if (elo < 1350) return 'medium';
  if (elo < 1800) return 'hard';
  return 'master';
}

export function createUninitializedJourneyProfile(): RatedJourneyProfile {
  const now = Date.now();
  return {
    initialized: false,
    startingTier: 'beginner',
    rating: 600,
    rd: 220,
    volatility: 0.06,
    peakRating: 600,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    nextColor: 'w',
    nextOpponentElo: 575,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Initializes a brand-new Rated Journey profile from the user's chosen starting tier
 * (or calibrated Elo estimate from saved games).
 */
export function createInitialJourneyProfile(
  tierId: StartingTierId,
  customStartingElo?: number
): RatedJourneyProfile {
  const opt = getStartingTierOption(tierId);
  const rating = clampElo(customStartingElo ?? opt.startingElo);
  const now = Date.now();
  // First match is gently welcoming (-25 Elo for Beginner/Medium, even for Hard/Master)
  const welcomeOffset = tierId === 'beginner' || tierId === 'medium' ? -25 : 0;
  const nextOpponentElo = roundToNearest25(rating + welcomeOffset);

  return {
    initialized: true,
    startingTier: tierId,
    rating,
    rd: opt.startingRd,
    volatility: 0.06,
    peakRating: rating,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    nextColor: 'w',
    nextOpponentElo,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Scores a single player move using the tactical engine (depth 3 + quiescence) while
 * tagging opening book moves, forced single-legal-move turns, and dead-decided positions
 * so non-representative moves don't distort rating estimates.
 */
export function scoreSinglePlayerPly(
  stateBefore: GameState,
  stateAfter: GameState,
  plyIndex: number,
  options?: { maxDepth?: number; maxTimeMs?: number }
): ScoredPlayerPly {
  const activeColor = stateBefore.turn;
  const history = stateAfter.moveHistory;
  const lastRecord = history[history.length - 1];
  const playedMove = lastRecord?.move;
  const playedSan = lastRecord?.san ?? '—';
  const turnNumber = lastRecord?.turnNumber ?? stateBefore.fullMoveNumber;

  const legalCount = generateLegalMoves(stateBefore).length;
  const isForced = legalCount <= 1;

  // Opening book check on first 8 plies
  const openingInfo =
    plyIndex < 8 ? analyzeOpeningAndStrategy(stateAfter) : null;
  const isBookMove =
    plyIndex < 8 &&
    Boolean(
      openingInfo &&
        openingInfo.family &&
        openingInfo.family !== 'Standard Starting Position' &&
        (openingInfo.moveProgressLabel.startsWith('Book Line') ||
          openingInfo.moveProgressLabel.startsWith('Transposed'))
    );

  const maxDepth = options?.maxDepth ?? 3;
  const maxTimeMs = options?.maxTimeMs ?? 75;

  const searchRes = searchMultiPV(stateBefore, {
    multiPvCount: 3,
    maxDepth,
    maxTimeMs,
    forCoach: true,
  });
  const topItem = searchRes.items[0];

  const bestSan = topItem?.san ?? playedSan;
  const bestScoreForTurn = topItem?.scoreForTurn ?? 0;
  const evalBeforeWhite =
    activeColor === 'w' ? bestScoreForTurn : -bestScoreForTurn;

  const isExactTop = Boolean(
    topItem &&
      playedMove &&
      topItem.move.from === playedMove.from &&
      topItem.move.to === playedMove.to &&
      topItem.move.promotion === playedMove.promotion
  );

  let playedScoreForTurn = bestScoreForTurn;
  if (stateAfter.status === 'checkmate') {
    playedScoreForTurn = 100000;
  } else if (stateAfter.status !== 'playing') {
    playedScoreForTurn = 0;
  } else if (!isExactTop && playedMove) {
    const matchInPv = searchRes.items.find(
      (it) =>
        it.move.from === playedMove.from &&
        it.move.to === playedMove.to &&
        it.move.promotion === playedMove.promotion
    );
    if (matchInPv) {
      playedScoreForTurn = matchInPv.scoreForTurn;
    } else {
      const afterSearch = searchMultiPV(stateAfter, {
        multiPvCount: 1,
        maxDepth: 2,
        maxTimeMs: 40,
        forCoach: true,
      });
      const oppBest = afterSearch.items[0];
      if (oppBest) {
        playedScoreForTurn =
          activeColor === 'w' ? oppBest.whiteScore : -oppBest.whiteScore;
      } else {
        const whiteEval = evaluateBoardWhitePerspective(
          stateAfter.board,
          'club'
        );
        playedScoreForTurn = activeColor === 'w' ? whiteEval : -whiteEval;
      }
    }
  }

  const cpl = isExactTop
    ? 0
    : Math.max(0, bestScoreForTurn - playedScoreForTurn);
  const winProbBest = computeWinProbability(bestScoreForTurn) / 100;
  const winProbPlayed = computeWinProbability(playedScoreForTurn) / 100;
  const deltaWinProb = Math.max(0, winProbBest - winProbPlayed);
  const classification = classifyMoveQuality(cpl, deltaWinProb, isExactTop);

  // Exclude moves where the position was already completely decided (> 6.5 pawns)
  // unless the player threw away a winning position into a losing/equal one.
  const isAlreadyDecided =
    Math.abs(bestScoreForTurn) > 650 &&
    Math.sign(bestScoreForTurn) === Math.sign(playedScoreForTurn) &&
    Math.abs(playedScoreForTurn) > 400;

  return {
    plyIndex,
    turnNumber,
    color: activeColor,
    playedSan,
    bestSan,
    centipawnLoss: Math.round(cpl),
    deltaWinProb,
    classification,
    isBookOrForced: isForced || isBookMove,
    isDecidedPosition: isAlreadyDecided,
    evalBeforeWhite,
  };
}

/**
 * Checks whether a scored player ply qualifies as a severe beginner blunder
 * worth surfacing in the <1000 Elo Blunder Alert banner.
 */
export function isSevereBlunderPly(ply: ScoredPlayerPly): boolean {
  if (ply.isBookOrForced || ply.isDecidedPosition) return false;
  return (
    ply.classification === 'blunder' ||
    ply.centipawnLoss >= 260 ||
    ply.deltaWinProb >= 0.25
  );
}

/**
 * Scores all player plies in a stateStack, reusing any already-scored plies from live background scoring.
 */
export function scoreMissingPlayerPlies(
  stateStack: GameState[],
  playerColor: Color,
  existingScores: Record<number, ScoredPlayerPly> = {},
  onProgress?: (completed: number, total: number) => void
): ScoredPlayerPly[] {
  const playerPlyIndices: number[] = [];
  for (let i = 0; i < stateStack.length - 1; i++) {
    if (stateStack[i].turn === playerColor) {
      playerPlyIndices.push(i);
    }
  }

  const results: ScoredPlayerPly[] = [];
  let completed = 0;
  const total = playerPlyIndices.length;

  for (const plyIndex of playerPlyIndices) {
    const cached = existingScores[plyIndex];
    if (cached) {
      results.push(cached);
    } else {
      const scored = scoreSinglePlayerPly(
        stateStack[plyIndex],
        stateStack[plyIndex + 1],
        plyIndex
      );
      results.push(scored);
    }
    completed++;
    if (onProgress) {
      onProgress(completed, total);
    }
  }

  return results;
}

export interface MoveQualityMetrics {
  accuracy: number;
  avgDeltaWinProb: number;
  blunders: number;
  mistakes: number;
  blunderRate: number;
  performanceRating: number;
  representativeCount: number;
}

/**
 * Converts per-ply move scores into a single-game Move Quality summary and
 * Estimated Game Performance Rating (GPR) calibrated across Caïssa's 400–3000 Elo curve.
 */
export function computeGamePerformanceMetrics(
  scoredPlies: ScoredPlayerPly[],
  opponentElo: number,
  outcome: RatedMatchOutcome
): MoveQualityMetrics {
  if (scoredPlies.length === 0) {
    const fallbackGpr = clampElo(
      opponentElo + (outcome === 'win' ? 120 : outcome === 'loss' ? -120 : 0)
    );
    return {
      accuracy: 75,
      avgDeltaWinProb: 0.05,
      blunders: 0,
      mistakes: 0,
      blunderRate: 0,
      performanceRating: fallbackGpr,
      representativeCount: 0,
    };
  }

  const representative = scoredPlies.filter(
    (p) => !p.isBookOrForced && !p.isDecidedPosition
  );
  const sample = representative.length >= 3 ? representative : scoredPlies;

  const cpls = sample.map((p) => p.centipawnLoss);
  const accuracy = calculatePlayerAccuracy(cpls);

  const avgDeltaWinProb =
    sample.reduce((sum, p) => sum + p.deltaWinProb, 0) / sample.length;

  let blunders = 0;
  let mistakes = 0;
  for (const p of scoredPlies) {
    if (p.classification === 'blunder') blunders++;
    else if (p.classification === 'mistake') mistakes++;
  }
  const blunderRate = blunders / Math.max(1, sample.length);

  // Calibrated piecewise mapping from CAPS accuracy + win-probability discipline to Elo:
  // ~45% acc -> 450 Elo, ~65% -> 850, ~78% -> 1250, ~88% -> 1700, ~95% -> 2250, ~99% -> 2750
  let accuracyElo: number;
  if (accuracy <= 50) {
    accuracyElo = 400 + (accuracy / 50) * 180;
  } else if (accuracy <= 70) {
    accuracyElo = 580 + ((accuracy - 50) / 20) * 420;
  } else if (accuracy <= 85) {
    accuracyElo = 1000 + ((accuracy - 70) / 15) * 580;
  } else if (accuracy <= 94) {
    accuracyElo = 1580 + ((accuracy - 85) / 9) * 620;
  } else {
    accuracyElo = 2200 + ((accuracy - 94) / 6) * 650;
  }

  // Penalize high win-probability loss & frequent blunders; reward clean 0-blunder play
  const winProbPenalty = Math.min(350, avgDeltaWinProb * 1700);
  const blunderPenalty = Math.min(280, blunderRate * 950);
  const cleanBonus = blunders === 0 && sample.length >= 8 ? 65 : 0;

  const rawMoveElo = clampElo(
    accuracyElo - winProbPenalty * 0.35 - blunderPenalty * 0.4 + cleanBonus
  );

  // Anchor firmly to opponent strength + outcome so winning free pieces off a 600 bot
  // never inflates a beginner's GPR by +500 Elo, while still rewarding clean play.
  const outcomeAnchor =
    opponentElo + (outcome === 'win' ? 140 : outcome === 'loss' ? -150 : 0);
  const maxAboveOpponent = outcome === 'win' ? 240 : outcome === 'draw' ? 140 : 60;
  const maxBelowOpponent = outcome === 'loss' ? 280 : outcome === 'draw' ? 150 : 80;

  const blendedGpr = rawMoveElo * 0.55 + outcomeAnchor * 0.45;
  const performanceRating = clampElo(
    Math.max(
      opponentElo - maxBelowOpponent,
      Math.min(opponentElo + maxAboveOpponent, blendedGpr)
    )
  );

  return {
    accuracy,
    avgDeltaWinProb,
    blunders,
    mistakes,
    blunderRate,
    performanceRating,
    representativeCount: sample.length,
  };
}

/**
 * Standard Glicko-2 single-opponent update (Mark Glickman's algorithm, tau = 0.5).
 */
export function computeGlicko2Update(
  playerRating: number,
  playerRd: number,
  playerVol: number,
  opponentElo: number,
  score: 0 | 0.5 | 1
): { rating: number; rd: number; volatility: number } {
  const SCALE = 173.7178;
  const TAU = 0.5;
  const EPSILON = 0.000001;

  const mu = (playerRating - 1500) / SCALE;
  const phi = Math.max(45, Math.min(350, playerRd)) / SCALE;
  const sigma = Math.max(0.03, Math.min(0.15, playerVol));

  const muJ = (opponentElo - 1500) / SCALE;
  const phiJ = 45 / SCALE; // Calibrated AI bot has low rating deviation

  const g = 1 / Math.sqrt(1 + (3 * phiJ * phiJ) / (Math.PI * Math.PI));
  const E = 1 / (1 + Math.exp(-g * (mu - muJ)));
  const v = 1 / Math.max(1e-9, g * g * E * (1 - E));
  const delta = v * g * (score - E);

  // Iterative volatility convergence (Illinois algorithm)
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const phi2 = phi * phi;
    const d2 = delta * delta;
    const num = ex * (d2 - phi2 - v - ex);
    const den = 2 * Math.pow(phi2 + v + ex, 2);
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0 && k < 25) {
      k++;
    }
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > EPSILON && guard < 40) {
    guard++;
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  const newSigma = Math.max(0.03, Math.min(0.12, Math.exp(A / 2)));
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * g * (score - E);

  const newRating = clampElo(1500 + SCALE * newMu);
  const newRd = Math.max(55, Math.min(350, Math.round(SCALE * newPhi)));

  return {
    rating: newRating,
    rd: newRd,
    volatility: Math.round(newSigma * 10000) / 10000,
  };
}

/**
 * Calculates the next AI opponent's exact target Elo based on the player's new rating,
 * match outcome, momentum streak, accuracy, and provisional placement state.
 */
export function calculateNextOpponentElo(params: {
  newRating: number;
  outcome: RatedMatchOutcome;
  currentStreak: number;
  accuracy: number;
  isProvisional: boolean;
}): number {
  const { newRating, outcome, currentStreak, accuracy } = params;

  let offset = 0;
  if (outcome === 'win') {
    // Measured step-up (+25 base, +50 on 2-3 streak, +75 on 4+ streak) so wins never
    // catapult the player past their comfort band into an unwinnable wall.
    offset = 25;
    if (currentStreak >= 2) offset += 25;
    if (currentStreak >= 4) offset += 25;
  } else if (outcome === 'loss') {
    // Progressive relief on losing streaks (-25 -> -50 -> -75 -> -100) so players quickly
    // get fair, winnable opponents if they ever overshoot their rating.
    const lossRun = Math.abs(Math.min(0, currentStreak));
    if (lossRun >= 4) offset = -100;
    else if (lossRun === 3) offset = -75;
    else if (lossRun === 2) offset = -50;
    else offset = -25;
  } else {
    offset = accuracy >= 88 ? 25 : 0;
  }

  return roundToNearest25(newRating + offset);
}

/**
 * Full hybrid rating update combining Glicko-2 outcome math, engine Move-Quality GPR,
 * progressive undo dampening, and adaptive next-opponent calculation.
 */
export function applyRatedMatchResult(
  profile: RatedJourneyProfile,
  params: {
    opponentElo: number;
    playerColor: Color;
    outcome: RatedMatchOutcome;
    termination: RatedMatchTermination;
    scoredPlies: ScoredPlayerPly[];
    undosUsed: number;
    undosAllowed: number;
    totalPlies: number;
    sessionId?: string;
    playedAt?: number;
  }
): {
  updatedProfile: RatedJourneyProfile;
  summary: RatedMatchResultSummary;
} {
  const {
    opponentElo,
    playerColor,
    outcome,
    termination,
    scoredPlies,
    undosUsed,
    undosAllowed,
    totalPlies,
    sessionId,
    playedAt = Date.now(),
  } = params;

  const tierBefore = getRankTierForRating(profile.rating);
  const undosBefore = getUndoAllowanceForRating(profile.rating);
  const blunderAlertsBefore = isBlunderAlertEnabledForRating(profile.rating);

  const metrics = computeGamePerformanceMetrics(
    scoredPlies,
    opponentElo,
    outcome
  );

  // Short aborts (< 6 player moves on resignation) do not corrupt rating
  const playerMoves = scoredPlies.length;
  if (
    termination === 'aborted' ||
    (termination === 'resignation' && playerMoves < MIN_RATED_PLAYER_MOVES)
  ) {
    const summary: RatedMatchResultSummary = {
      wasAbortedTooShort: true,
      outcome,
      termination: 'aborted',
      opponentElo,
      playerColor,
      ratingBefore: profile.rating,
      ratingAfter: profile.rating,
      delta: 0,
      rdBefore: profile.rd,
      rdAfter: profile.rd,
      isProvisionalAfter: profile.gamesPlayed < 5 || profile.rd > 150,
      placementCountAfter: Math.min(5, profile.gamesPlayed),
      performanceRating: metrics.performanceRating,
      accuracy: metrics.accuracy,
      blunders: metrics.blunders,
      mistakes: metrics.mistakes,
      playerMoves,
      undosUsed,
      undosAllowed,
      undoPenaltyPct: 0,
      tierBefore,
      tierAfter: tierBefore,
      promotedTier: false,
      undosBefore,
      undosAfter: undosBefore,
      undoBudgetChanged: false,
      blunderAlertsGraduated: false,
      nextOpponentElo: profile.nextOpponentElo,
      nextColor: profile.nextColor,
      sessionId,
    };
    return { updatedProfile: profile, summary };
  }

  const scoreValue: 0 | 0.5 | 1 =
    outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;

  // 1. Outcome-based Glicko-2 update
  const glicko = computeGlicko2Update(
    profile.rating,
    profile.rd,
    profile.volatility,
    opponentElo,
    scoreValue
  );
  const outcomeDelta = glicko.rating - profile.rating;

  // 2. Move-quality pull toward Game Performance Rating (GPR)
  const isProvisionalBefore = profile.gamesPlayed < 5 || profile.rd > 150;
  const gprWeight = isProvisionalBefore ? 0.24 : 0.16;
  const maxGprPull = isProvisionalBefore ? 45 : 28;
  const rawGprPull = (metrics.performanceRating - profile.rating) * gprWeight;
  const clampedGprPull = Math.max(-maxGprPull, Math.min(maxGprPull, rawGprPull));

  let nextStreak = 0;
  if (outcome === 'win') {
    nextStreak = profile.currentStreak >= 0 ? profile.currentStreak + 1 : 1;
  } else if (outcome === 'loss') {
    nextStreak = profile.currentStreak <= 0 ? profile.currentStreak - 1 : -1;
  }
  const nextLossStreak = nextStreak < 0 ? Math.abs(nextStreak) : 0;
  const nextWinStreak = nextStreak > 0 ? nextStreak : 0;

  // Blend outcome and move quality
  let combinedDelta =
    outcomeDelta * (1 - gprWeight * 0.45) + clampedGprPull;

  // Ensure decisive outcomes always move in the expected direction (never lose Elo on a win,
  // never gain Elo on a loss), keep early climbs steady (+15..+85), and apply progressive
  // loss-streak self-correction so over-placed players return quickly to fair matches.
  if (outcome === 'win') {
    const minWinGain = isProvisionalBefore ? 15 : 10;
    const maxWinGain = isProvisionalBefore ? 85 : 55;
    combinedDelta = Math.max(minWinGain, Math.min(maxWinGain, combinedDelta));
    if (!isProvisionalBefore && nextWinStreak >= 3) {
      const streakBoost = Math.min(30, (nextWinStreak - 2) * 15);
      combinedDelta = Math.min(85, combinedDelta + streakBoost);
    }
  } else if (outcome === 'loss') {
    const minLossDrop = isProvisionalBefore ? -18 : -12;
    const maxLossDrop = isProvisionalBefore ? -115 : -65;
    combinedDelta = Math.min(minLossDrop, Math.max(maxLossDrop, combinedDelta));

    // Loss-streak self-correction: accelerate descent on 2, 3, 4+ consecutive losses
    if (nextLossStreak === 2) {
      combinedDelta = Math.min(-40, combinedDelta * 1.35 - 12);
    } else if (nextLossStreak === 3) {
      combinedDelta = Math.min(-62, combinedDelta * 1.65 - 24);
    } else if (nextLossStreak >= 4) {
      combinedDelta = Math.min(-85, combinedDelta * 1.95 - 36);
    }
    combinedDelta = Math.max(-145, combinedDelta);
  } else {
    const maxDrawSwing = isProvisionalBefore ? 40 : 25;
    combinedDelta = Math.max(-maxDrawSwing, Math.min(maxDrawSwing, combinedDelta));
  }

  // 3. Apply gentle Undo dampening to positive rating gains (12% per undo, max 36%)
  const safeUndosUsed = Math.max(0, Math.floor(undosUsed));
  let undoPenaltyPct = 0;
  if (combinedDelta > 0 && safeUndosUsed > 0) {
    const dampening = Math.min(
      MAX_UNDO_GAIN_DAMPENING,
      safeUndosUsed * UNDO_GAIN_DAMPENING_PER_USE
    );
    undoPenaltyPct = Math.round(dampening * 100);
    combinedDelta = Math.max(
      outcome === 'win' ? 6 : 0,
      combinedDelta * (1 - dampening)
    );
  }

  const finalDelta = Math.round(combinedDelta);
  const newRating = clampElo(profile.rating + finalDelta);
  const actualDelta = newRating - profile.rating;

  // Slightly faster RD reduction when game had solid sample of moves;
  // re-inflate RD on 2+ loss streaks (or 3+ win streaks) so rating stays responsive if miscalibrated.
  const rdBonusTighten = metrics.representativeCount >= 10 ? 5 : 0;
  let newRd = Math.max(55, glicko.rd - rdBonusTighten);
  if (nextLossStreak >= 2) {
    newRd = Math.min(240, Math.max(newRd, glicko.rd + nextLossStreak * 18));
  } else if (nextWinStreak >= 3) {
    newRd = Math.min(200, Math.max(newRd, glicko.rd + 10));
  }
  const newGamesPlayed = profile.gamesPlayed + 1;
  const isProvisionalAfter = newGamesPlayed < 5 || newRd > 150;

  const nextBestStreak = Math.max(profile.bestStreak, nextStreak);
  const nextColor: Color = playerColor === 'w' ? 'b' : 'w';
  const nextOpponentElo = calculateNextOpponentElo({
    newRating,
    outcome,
    currentStreak: nextStreak,
    accuracy: metrics.accuracy,
    isProvisional: isProvisionalAfter,
  });

  const record: RatedMatchRecord = {
    id: `rated_${playedAt}_${Math.random().toString(36).slice(2, 7)}`,
    playedAt,
    opponentElo,
    playerColor,
    outcome,
    termination,
    ratingBefore: profile.rating,
    ratingAfter: newRating,
    delta: actualDelta,
    rdAfter: newRd,
    performanceRating: metrics.performanceRating,
    accuracy: metrics.accuracy,
    blunders: metrics.blunders,
    mistakes: metrics.mistakes,
    undosUsed: safeUndosUsed,
    undosAllowed,
    playerMoves,
    totalPlies,
    sessionId,
  };

  const updatedProfile: RatedJourneyProfile = {
    ...profile,
    initialized: true,
    rating: newRating,
    rd: newRd,
    volatility: glicko.volatility,
    peakRating: Math.max(profile.peakRating, newRating),
    gamesPlayed: newGamesPlayed,
    wins: profile.wins + (outcome === 'win' ? 1 : 0),
    draws: profile.draws + (outcome === 'draw' ? 1 : 0),
    losses: profile.losses + (outcome === 'loss' ? 1 : 0),
    currentStreak: nextStreak,
    bestStreak: nextBestStreak,
    nextColor,
    nextOpponentElo,
    history: [record, ...profile.history].slice(0, MAX_JOURNEY_HISTORY),
    updatedAt: playedAt,
  };

  const tierAfter = getRankTierForRating(newRating);
  const undosAfter = getUndoAllowanceForRating(newRating);
  const blunderAlertsAfter = isBlunderAlertEnabledForRating(newRating);

  const summary: RatedMatchResultSummary = {
    wasAbortedTooShort: false,
    outcome,
    termination,
    opponentElo,
    playerColor,
    ratingBefore: profile.rating,
    ratingAfter: newRating,
    delta: actualDelta,
    rdBefore: profile.rd,
    rdAfter: newRd,
    isProvisionalAfter,
    placementCountAfter: Math.min(5, newGamesPlayed),
    performanceRating: metrics.performanceRating,
    accuracy: metrics.accuracy,
    blunders: metrics.blunders,
    mistakes: metrics.mistakes,
    playerMoves,
    undosUsed: safeUndosUsed,
    undosAllowed,
    undoPenaltyPct,
    tierBefore,
    tierAfter,
    promotedTier: tierAfter.minElo > tierBefore.minElo,
    undosBefore,
    undosAfter,
    undoBudgetChanged: undosAfter !== undosBefore,
    blunderAlertsGraduated: blunderAlertsBefore && !blunderAlertsAfter,
    nextOpponentElo,
    nextColor,
    sessionId,
  };

  return { updatedProfile, summary };
}

/**
 * Scans saved AI games from localStorage (up to the 5 most recent with >= 10 plies)
 * and optionally blends existing puzzle rating as a soft prior to suggest a starting tier.
 */
export function calibrateFromSavedSessions(
  sessions: StoredGameSession[],
  puzzleRatingPrior?: number | null,
  onProgress?: (progress: SavedGamesCalibrationProgress) => void
): SavedGamesCalibrationResult {
  const eligible = sessions
    .filter(
      (s) =>
        s.gameMode === 'ai' &&
        Array.isArray(s.stateStack) &&
        s.stateStack.length >= 11
    )
    .slice(0, 5);

  if (eligible.length === 0) {
    const fallbackElo =
      typeof puzzleRatingPrior === 'number' && puzzleRatingPrior >= 400
        ? clampElo(puzzleRatingPrior * 0.85)
        : 600;
    return {
      gamesAnalyzed: 0,
      pliesAnalyzed: 0,
      avgAccuracy: 0,
      blunderRate: 0,
      estimatedElo: roundToNearest25(fallbackElo),
      suggestedTier: suggestStartingTierForElo(fallbackElo),
      puzzleRatingPrior: puzzleRatingPrior ?? null,
    };
  }

  let totalPliesAnalyzed = 0;
  let totalBlunders = 0;
  let accSum = 0;
  let gprSum = 0;

  for (let i = 0; i < eligible.length; i++) {
    const session = eligible[i];
    if (onProgress) {
      onProgress({
        completedGames: i,
        totalGames: eligible.length,
        currentGameTitle: session.title,
      });
    }

    // Sample up to 24 player moves per game to keep calibration snappy (<2s total)
    const playerIndices: number[] = [];
    for (let ply = 0; ply < session.stateStack.length - 1; ply++) {
      if (session.stateStack[ply].turn === session.playerColor) {
        playerIndices.push(ply);
      }
    }
    const stride = Math.max(1, Math.ceil(playerIndices.length / 20));
    const sampledIndices = playerIndices.filter((_, idx) => idx % stride === 0);

    const scoredPlies: ScoredPlayerPly[] = sampledIndices.map((plyIdx) =>
      scoreSinglePlayerPly(
        session.stateStack[plyIdx],
        session.stateStack[plyIdx + 1],
        plyIdx,
        { maxDepth: 2, maxTimeMs: 45 }
      )
    );

    let outcome: RatedMatchOutcome = 'draw';
    if (session.status === 'checkmate') {
      outcome = session.winner === session.playerColor ? 'win' : 'loss';
    }
    const oppElo = session.engineProfile?.elo ?? 1000;
    const metrics = computeGamePerformanceMetrics(scoredPlies, oppElo, outcome);

    totalPliesAnalyzed += scoredPlies.length;
    totalBlunders += metrics.blunders;
    accSum += metrics.accuracy;
    gprSum += metrics.performanceRating;

    if (onProgress) {
      onProgress({
        completedGames: i + 1,
        totalGames: eligible.length,
        currentGameTitle: session.title,
      });
    }
  }

  const avgAccuracy = Math.round((accSum / eligible.length) * 10) / 10;
  const blunderRate =
    totalPliesAnalyzed > 0
      ? Math.round((totalBlunders / totalPliesAnalyzed) * 1000) / 1000
      : 0;
  let estimatedElo = gprSum / eligible.length;

  // Blend puzzle rating lightly (15%) if user has solved puzzles
  if (typeof puzzleRatingPrior === 'number' && puzzleRatingPrior >= 400) {
    estimatedElo = estimatedElo * 0.85 + puzzleRatingPrior * 0.15;
  }

  const roundedElo = roundToNearest25(estimatedElo);

  return {
    gamesAnalyzed: eligible.length,
    pliesAnalyzed: totalPliesAnalyzed,
    avgAccuracy,
    blunderRate,
    estimatedElo: roundedElo,
    suggestedTier: suggestStartingTierForElo(roundedElo),
    puzzleRatingPrior: puzzleRatingPrior ?? null,
  };
}

/**
 * Validates and hydrates a RatedJourneyProfile from untrusted JSON.
 */
export function parseJourneyProfile(raw: string | null): RatedJourneyProfile {
  if (!raw) return createUninitializedJourneyProfile();
  try {
    const parsed = JSON.parse(raw) as Partial<RatedJourneyProfile>;
    if (!parsed || typeof parsed !== 'object') {
      return createUninitializedJourneyProfile();
    }
    if (!parsed.initialized) {
      return createUninitializedJourneyProfile();
    }
    const rating =
      typeof parsed.rating === 'number' && Number.isFinite(parsed.rating)
        ? clampElo(parsed.rating)
        : 600;
    const rd =
      typeof parsed.rd === 'number' && Number.isFinite(parsed.rd)
        ? Math.max(55, Math.min(350, Math.round(parsed.rd)))
        : 280;
    const volatility =
      typeof parsed.volatility === 'number' && Number.isFinite(parsed.volatility)
        ? Math.max(0.03, Math.min(0.15, parsed.volatility))
        : 0.06;
    const startingTier: StartingTierId =
      parsed.startingTier === 'beginner' ||
      parsed.startingTier === 'medium' ||
      parsed.startingTier === 'hard' ||
      parsed.startingTier === 'master'
        ? parsed.startingTier
        : 'beginner';
    const nextColor: Color = parsed.nextColor === 'b' ? 'b' : 'w';
    const nextOpponentElo =
      typeof parsed.nextOpponentElo === 'number' &&
      Number.isFinite(parsed.nextOpponentElo)
        ? roundToNearest25(parsed.nextOpponentElo)
        : roundToNearest25(rating);

    const history = Array.isArray(parsed.history)
      ? parsed.history
          .filter(
            (h): h is RatedMatchRecord =>
              Boolean(h) &&
              typeof h.id === 'string' &&
              typeof h.ratingAfter === 'number' &&
              typeof h.opponentElo === 'number'
          )
          .slice(0, MAX_JOURNEY_HISTORY)
      : [];

    return {
      initialized: true,
      startingTier,
      rating,
      rd,
      volatility,
      peakRating: Math.max(
        rating,
        typeof parsed.peakRating === 'number' ? clampElo(parsed.peakRating) : rating
      ),
      gamesPlayed: Math.max(0, Number(parsed.gamesPlayed) || history.length),
      wins: Math.max(0, Number(parsed.wins) || 0),
      draws: Math.max(0, Number(parsed.draws) || 0),
      losses: Math.max(0, Number(parsed.losses) || 0),
      currentStreak: Number(parsed.currentStreak) || 0,
      bestStreak: Math.max(0, Number(parsed.bestStreak) || 0),
      nextColor,
      nextOpponentElo,
      history,
      createdAt: Number(parsed.createdAt) || Date.now(),
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return createUninitializedJourneyProfile();
  }
}

export function loadJourneyProfile(): RatedJourneyProfile {
  if (typeof window === 'undefined') {
    return createUninitializedJourneyProfile();
  }
  try {
    return parseJourneyProfile(
      window.localStorage.getItem(RATED_JOURNEY_STORAGE_KEY)
    );
  } catch {
    return createUninitializedJourneyProfile();
  }
}

export function saveJourneyProfile(profile: RatedJourneyProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      RATED_JOURNEY_STORAGE_KEY,
      JSON.stringify(profile)
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function clearJourneyProfile(): RatedJourneyProfile {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(RATED_JOURNEY_STORAGE_KEY);
    } catch {}
  }
  return createUninitializedJourneyProfile();
}
