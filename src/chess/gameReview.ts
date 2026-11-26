import {
  evaluateBoardWhitePerspective,
  formatEvalScore,
} from './evaluation';
import {
  computeWinProbability,
  searchMultiPV,
} from './ai';
import { Color, GameState, Move, MoveRecord, Square } from './types';

export type MoveClassification =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface AnalyzedPlyReview {
  plyIndex: number; // 0-based index in move history
  turnNumber: number;
  color: Color;
  playedMove: Move;
  playedSan: string;
  bestMove: Move;
  bestSan: string;
  evalWhitePerspective: number; // In centipawns
  formattedEval: string;
  winProb: number; // 0..100
  centipawnLoss: number;
  deltaWinProb: number; // 0..1
  classification: MoveClassification;
  coachExplanation: string;
  isTurningPoint: boolean;
}

export interface TurningPoint {
  plyIndex: number;
  turnNumber: number;
  color: Color;
  playedSan: string;
  bestSan: string;
  bestMove: Move;
  centipawnLoss: number;
  classification: MoveClassification;
  title: string;
  description: string;
}

export interface GameReviewReport {
  totalPlies: number;
  whiteAccuracy: number; // 0 to 100
  blackAccuracy: number; // 0 to 100
  classificationCounts: {
    w: Record<MoveClassification, number>;
    b: Record<MoveClassification, number>;
  };
  evalCurve: number[]; // Eval at each ply from White's perspective
  plies: AnalyzedPlyReview[];
  turningPoints: TurningPoint[];
}

export const CLASSIFICATION_COLORS: Record<MoveClassification, { bg: string; text: string; label: string; badge: string }> = {
  best: {
    bg: '#15803D',
    text: '#22C55E',
    label: 'Best Move',
    badge: '★ Best',
  },
  excellent: {
    bg: '#0E7490',
    text: '#06B6D4',
    label: 'Excellent',
    badge: '✓ Excellent',
  },
  good: {
    bg: '#1E40AF',
    text: '#60A5FA',
    label: 'Good',
    badge: 'Good',
  },
  inaccuracy: {
    bg: '#854D0E',
    text: '#FACC15',
    label: 'Inaccuracy',
    badge: '?! Inaccuracy',
  },
  mistake: {
    bg: '#C2410C',
    text: '#FB923C',
    label: 'Mistake',
    badge: '? Mistake',
  },
  blunder: {
    bg: '#991B1B',
    text: '#EF4444',
    label: 'Blunder',
    badge: '?? Blunder',
  },
};

/**
 * Classifies a move based on centipawn loss and win probability drop.
 */
export function classifyMoveQuality(
  cpl: number,
  deltaWinProb: number,
  isExactTopMove: boolean
): MoveClassification {
  if (isExactTopMove || cpl <= 15 || deltaWinProb <= 0.02) {
    return 'best';
  }
  if (cpl <= 40 || deltaWinProb <= 0.05) {
    return 'excellent';
  }
  if (cpl <= 85 || deltaWinProb <= 0.10) {
    return 'good';
  }
  if (cpl <= 180 || deltaWinProb <= 0.20) {
    return 'inaccuracy';
  }
  if (cpl <= 320 || deltaWinProb <= 0.35) {
    return 'mistake';
  }
  return 'blunder';
}

/**
 * Calculates CAPS-style player accuracy (0% to 100%) from centipawn loss values.
 */
export function calculatePlayerAccuracy(cplValues: number[]): number {
  if (cplValues.length === 0) return 100;
  let sum = 0;
  for (const cpl of cplValues) {
    // Standard exponential decay weighting (0 loss = 1.0, 100 loss = 0.67, 300 loss = 0.30)
    sum += Math.exp(-0.004 * Math.max(0, cpl));
  }
  const avg = sum / cplValues.length;
  return Math.min(100, Math.max(0, Math.round(avg * 1000) / 10));
}

/**
 * Generates an educational coach explanation for a move classification.
 */
function generateExplanation(
  classification: MoveClassification,
  playedSan: string,
  bestSan: string,
  color: Color,
  turnNumber: number
): string {
  const side = color === 'w' ? 'White' : 'Black';
  switch (classification) {
    case 'best':
      return `Move ${turnNumber} ${playedSan} was the engine's top choice, maximizing active coordination and safety.`;
    case 'excellent':
      return `Move ${turnNumber} ${playedSan} was strong and sound, maintaining the balance of the position.`;
    case 'good':
      return `Solid move. Keeps steady control without conceding substantial weaknesses.`;
    case 'inaccuracy':
      return `Slight inaccuracy (${playedSan}). Preferable was ${bestSan}, which exerts sharper tactical pressure.`;
    case 'mistake':
      return `Mistake that conceded key initiative to ${side === 'White' ? 'Black' : 'White'}. ${bestSan} was much more decisive.`;
    case 'blunder':
      return `Critical blunder on move ${turnNumber} (${playedSan})! Surrendered material or permitted tactical counterplay. ${bestSan} was required.`;
  }
}

export interface GameReviewProgressEvent {
  completedPlies: number;
  totalPlies: number;
  evalCurve: number[];
}

/**
 * Performs a comprehensive post-game analysis on a full stateStack.
 * Can be run synchronously or wrapped in a Web Worker with live progress streaming.
 */
export function generateGameReview(
  stateStack: GameState[],
  onProgress?: (progress: GameReviewProgressEvent) => void
): GameReviewReport {
  if (stateStack.length <= 1) {
    return {
      totalPlies: 0,
      whiteAccuracy: 100,
      blackAccuracy: 100,
      classificationCounts: {
        w: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
        b: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
      },
      evalCurve: [0],
      plies: [],
      turningPoints: [],
    };
  }

  const totalPliesToAnalyze = stateStack.length - 1;
  const plies: AnalyzedPlyReview[] = [];
  const evalCurve: number[] = [0];
  const whiteCpl: number[] = [];
  const blackCpl: number[] = [];
  const counts = {
    w: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
    b: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
  };
  const turningPoints: TurningPoint[] = [];

  for (let i = 0; i < totalPliesToAnalyze; i++) {
    const stateBefore = stateStack[i];
    const stateAfter = stateStack[i + 1];
    const activeColor = stateBefore.turn;
    const history = stateAfter.moveHistory;
    const lastRecord = history[history.length - 1];
    if (!lastRecord) continue;

    const playedMove = lastRecord.move;
    const playedSan = lastRecord.san;
    const turnNumber = lastRecord.turnNumber;

    // Search top moves in the position before the move with depth 3 + quiescence
    const searchRes = searchMultiPV(stateBefore, {
      multiPvCount: 3,
      maxDepth: 3,
      maxTimeMs: 90,
      forCoach: true,
    });
    const topItem = searchRes.items[0];

    let bestMove: Move = playedMove;
    let bestSan: string = playedSan;
    let bestScoreForTurn = 0;

    if (topItem) {
      bestMove = topItem.move;
      bestSan = topItem.san;
      bestScoreForTurn = topItem.scoreForTurn;
    }

    const isExactTop =
      topItem &&
      topItem.move.from === playedMove.from &&
      topItem.move.to === playedMove.to &&
      topItem.move.promotion === playedMove.promotion;

    // Calculate score of played move
    let playedScoreForTurn = bestScoreForTurn;
    if (stateAfter.status === 'checkmate') {
      playedScoreForTurn = 100000;
    } else if (stateAfter.status !== 'playing') {
      playedScoreForTurn = 0;
    } else if (!isExactTop) {
      const matchInPv = searchRes.items.find(
        (it) =>
          it.move.from === playedMove.from &&
          it.move.to === playedMove.to &&
          it.move.promotion === playedMove.promotion
      );

      if (matchInPv) {
        playedScoreForTurn = matchInPv.scoreForTurn;
      } else {
        // Quick tactical search after the played move so sacrifices & tactics aren't misread by raw material
        const afterSearch = searchMultiPV(stateAfter, {
          multiPvCount: 1,
          maxDepth: 2,
          maxTimeMs: 45,
          forCoach: true,
        });
        const oppBest = afterSearch.items[0];
        if (oppBest) {
          playedScoreForTurn =
            activeColor === 'w' ? oppBest.whiteScore : -oppBest.whiteScore;
        } else {
          const whitePerspective = evaluateBoardWhitePerspective(
            stateAfter.board,
            'club'
          );
          playedScoreForTurn =
            activeColor === 'w' ? whitePerspective : -whitePerspective;
        }
      }
    }

    const cpl = isExactTop ? 0 : Math.max(0, bestScoreForTurn - playedScoreForTurn);
    const winProbBest = computeWinProbability(bestScoreForTurn) / 100;
    const winProbPlayed = computeWinProbability(playedScoreForTurn) / 100;
    const deltaWinProb = Math.max(0, winProbBest - winProbPlayed);

    const classification = classifyMoveQuality(cpl, deltaWinProb, Boolean(isExactTop));
    counts[activeColor][classification]++;

    if (activeColor === 'w') {
      whiteCpl.push(cpl);
    } else {
      blackCpl.push(cpl);
    }

    const evalWhite =
      activeColor === 'w' ? playedScoreForTurn : -playedScoreForTurn;
    evalCurve.push(evalWhite);

    const isTurningPoint =
      classification === 'blunder' ||
      (classification === 'mistake' && cpl >= 200) ||
      deltaWinProb >= 0.22;

    const explanation = generateExplanation(
      classification,
      playedSan,
      bestSan,
      activeColor,
      turnNumber
    );

    const analyzedPly: AnalyzedPlyReview = {
      plyIndex: i,
      turnNumber,
      color: activeColor,
      playedMove,
      playedSan,
      bestMove,
      bestSan,
      evalWhitePerspective: evalWhite,
      formattedEval: formatEvalScore(evalWhite),
      winProb: Math.round(computeWinProbability(evalWhite)),
      centipawnLoss: cpl,
      deltaWinProb,
      classification,
      coachExplanation: explanation,
      isTurningPoint,
    };

    plies.push(analyzedPly);

    if (isTurningPoint) {
      turningPoints.push({
        plyIndex: i,
        turnNumber,
        color: activeColor,
        playedSan,
        bestSan,
        bestMove,
        centipawnLoss: cpl,
        classification,
        title: `${activeColor === 'w' ? 'White' : 'Black'} ${CLASSIFICATION_COLORS[classification].label} on Move ${turnNumber}`,
        description: explanation,
      });
    }

    if (onProgress && ((i + 1) % 2 === 0 || i + 1 === totalPliesToAnalyze)) {
      onProgress({
        completedPlies: i + 1,
        totalPlies: totalPliesToAnalyze,
        evalCurve: [...evalCurve],
      });
    }
  }

  const whiteAccuracy = calculatePlayerAccuracy(whiteCpl);
  const blackAccuracy = calculatePlayerAccuracy(blackCpl);

  return {
    totalPlies: plies.length,
    whiteAccuracy,
    blackAccuracy,
    classificationCounts: counts,
    evalCurve,
    plies,
    turningPoints,
  };
}
