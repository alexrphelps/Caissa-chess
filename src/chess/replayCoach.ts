import {
  computeWinProbability,
  evaluateCaptureGain,
  MATE_THRESHOLD,
  searchMultiPV,
} from './ai';
import {
  calculateMaterialBalance,
  isKingInCheck,
  oppositeColor,
  PIECE_VALUES,
} from './engine';
import {
  evaluateBoardWhitePerspective,
  evaluateTaperedBreakdown,
  formatEvalScore,
} from './evaluation';
import {
  CLASSIFICATION_COLORS,
  classifyMoveQuality,
  MoveClassification,
} from './gameReview';
import { analyzeOpeningAndStrategy } from './openingBook';
import {
  ReplayMoveVerdict,
  ReplayPlyCoachInsight,
  TimelineNode,
} from './pgnTypes';
import {
  analyzeTacticsDeep,
  detectKnightOutpostReason,
  detectOpponentThreat,
  detectPassedPawnAdvanceReason,
  detectPinOrSkewerTarget,
  detectRookFileAnd7thRankReason,
  RecommendedMove,
  TacticalMotifTag,
} from './tacticsHelper';
import { Color, GameState, Move, PieceType } from './types';

const PIECE_SORT_ORDER: Record<PieceType, number> = {
  q: 5,
  r: 4,
  b: 3,
  n: 2,
  p: 1,
  k: 0,
};

const PIECE_LABELS: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

export const REPLAY_VERDICT_META: Record<
  ReplayMoveVerdict,
  { label: string; symbol: string; textClass: string; borderClass: string; hex: string }
> = {
  start: {
    label: 'Starting Position',
    symbol: 'Start',
    textClass: 'text-[#EADBC8]',
    borderClass: 'border-[#34463C]',
    hex: '#EADBC8',
  },
  book: {
    label: 'Opening Book',
    symbol: 'Book',
    textClass: 'text-[#C6923A]',
    borderClass: 'border-[#C6923A]/50',
    hex: '#C6923A',
  },
  sacrifice: {
    label: 'Brilliant Sacrifice',
    symbol: '!!',
    textClass: 'text-[#2DD4BF]',
    borderClass: 'border-[#2DD4BF]/60',
    hex: '#2DD4BF',
  },
  best: {
    label: 'Best Move',
    symbol: '★',
    textClass: 'text-[#4ADE80]',
    borderClass: 'border-[#22C55E]/50',
    hex: '#22C55E',
  },
  excellent: {
    label: 'Excellent',
    symbol: '✓',
    textClass: 'text-[#22D3EE]',
    borderClass: 'border-[#06B6D4]/50',
    hex: '#06B6D4',
  },
  good: {
    label: 'Good Move',
    symbol: '○',
    textClass: 'text-[#93C5FD]',
    borderClass: 'border-[#60A5FA]/50',
    hex: '#60A5FA',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    symbol: '?!',
    textClass: 'text-[#FACC15]',
    borderClass: 'border-[#EAB308]/50',
    hex: '#FACC15',
  },
  mistake: {
    label: 'Mistake',
    symbol: '?',
    textClass: 'text-[#FB923C]',
    borderClass: 'border-[#F97316]/50',
    hex: '#FB923C',
  },
  blunder: {
    label: 'Blunder',
    symbol: '??',
    textClass: 'text-[#F87171]',
    borderClass: 'border-[#EF4444]/60',
    hex: '#EF4444',
  },
};

/**
 * Sorts captured pieces from highest value to lowest (Q, R, B, N, P).
 */
export function sortCapturedPieces(pieces: PieceType[]): PieceType[] {
  return [...pieces].sort(
    (a, b) => (PIECE_SORT_ORDER[b] ?? 0) - (PIECE_SORT_ORDER[a] ?? 0)
  );
}

/**
 * Converts a White-perspective centipawn evaluation into a smooth 0..100% bar fill
 * percentage (with crisp 4%..96% bounds for normal play and 100%/0% for forced mate),
 * plus a short formatted score label.
 */
export function computeEvalBarMetrics(evalWhiteCp: number): {
  whitePct: number;
  label: string;
  whiteLeading: boolean;
  isMate: boolean;
} {
  if (!Number.isFinite(evalWhiteCp)) {
    return {
      whitePct: 50,
      label: '0.0',
      whiteLeading: true,
      isMate: false,
    };
  }

  const isMate = Math.abs(evalWhiteCp) >= MATE_THRESHOLD;
  if (isMate) {
    const pliesToMate = Math.max(1, Math.round(100000 - Math.abs(evalWhiteCp)));
    const movesToMate = Math.max(1, Math.ceil(pliesToMate / 2));
    return {
      whitePct: evalWhiteCp > 0 ? 100 : 0,
      label: `M${movesToMate}`,
      whiteLeading: evalWhiteCp > 0,
      isMate: true,
    };
  }

  // Smooth sigmoid centered at 0 cp (~400cp ≈ 88% visual fill, clamped 4..96%)
  const winProb = 1 / (1 + Math.exp(-0.0042 * evalWhiteCp));
  const whitePct = Math.max(4, Math.min(96, Math.round(winProb * 1000) / 10));
  const pawns = Math.abs(evalWhiteCp) / 100;
  const label =
    pawns < 0.05
      ? '0.0'
      : pawns >= 10
      ? `${evalWhiteCp > 0 ? '+' : '-'}${Math.round(pawns)}`
      : `${evalWhiteCp > 0 ? '+' : '-'}${pawns.toFixed(1)}`;

  return {
    whitePct,
    label,
    whiteLeading: evalWhiteCp >= 0,
    isMate: false,
  };
}

/**
 * Returns a short, deterministic motif & plan explanation for an arbitrary played move
 * even when it was not in the engine's top 3 candidate list.
 */
function describePlayedMovePlan(
  stateBefore: GameState,
  move: Move,
  san: string,
  stateAfter: GameState,
  classification: ReplayMoveVerdict,
  bestAlt: RecommendedMove | undefined
): { motif: TacticalMotifTag; planSummary: string; followUpNote: string } {
  const mover = stateBefore.turn;
  const enemy = oppositeColor(mover);
  const pieceName = PIECE_LABELS[move.piece.type];

  if (stateAfter.status === 'checkmate') {
    return {
      motif: 'CHECKMATE',
      planSummary: `${san} delivers checkmate—the ${enemy === 'w' ? 'White' : 'Black'} king has no legal escape.`,
      followUpNote: 'Game concludes immediately.',
    };
  }

  if (stateAfter.status === 'stalemate' || stateAfter.status.startsWith('draw_')) {
    return {
      motif: 'POSITIONAL',
      planSummary: `${san} brings the game to a FIDE draw (${stateAfter.status.replace('draw_', '').replace(/_/g, ' ')}).`,
      followUpNote: 'Position is drawn.',
    };
  }

  const pinOrSkewer = detectPinOrSkewerTarget(stateAfter.board, move, mover);
  const knightOutpost = !move.captured
    ? detectKnightOutpostReason(stateAfter.board, move, mover)
    : null;
  const rookFile = !move.captured
    ? detectRookFileAnd7thRankReason(stateBefore.board, stateAfter.board, move, mover)
    : null;
  const passedPawn = !move.captured
    ? detectPassedPawnAdvanceReason(stateAfter.board, move, mover)
    : null;

  const baseBreakdown = evaluateTaperedBreakdown(stateBefore.board, mover, 'club');
  const afterBreakdown = evaluateTaperedBreakdown(stateAfter.board, mover, 'club');
  const mobDelta = afterBreakdown.mobility - baseBreakdown.mobility;
  const kingDelta = afterBreakdown.kingSafety - baseBreakdown.kingSafety;
  const pawnDelta = afterBreakdown.pawnStructure - baseBreakdown.pawnStructure;

  let motif: TacticalMotifTag = 'POSITIONAL';
  let idea = `Repositions the ${pieceName} to ${move.to}`;

  if (classification === 'sacrifice') {
    motif = 'WINNING CAPTURE';
    idea = `Dynamic sacrifice with ${san}, investing material for sharp initiative and concrete tactical pressure`;
  } else if (move.isCastle === 'K') {
    motif = 'KING SAFETY';
    idea = 'Castles kingside to shelter the king and connect rooks';
  } else if (move.isCastle === 'Q') {
    motif = 'KING SAFETY';
    idea = 'Castles queenside, tucking the king away and bringing the rook immediately to the central d-file';
  } else if (move.promotion) {
    motif = 'PASSED PAWN';
    idea = `Promotes the pawn to a ${PIECE_LABELS[move.promotion]} on ${move.to}`;
  } else if (pinOrSkewer) {
    motif = 'PIN / SKEWER';
    idea = pinOrSkewer;
  } else if (knightOutpost) {
    motif = 'OUTPOST';
    idea = knightOutpost;
  } else if (rookFile) {
    motif = 'OPEN FILE / 7TH RANK';
    idea = rookFile;
  } else if (passedPawn) {
    motif = 'PASSED PAWN';
    idea = passedPawn;
  } else if (move.captured) {
    const capName = PIECE_LABELS[move.captured.type];
    const netGain = evaluateCaptureGain(stateBefore.board, move, mover);
    if (netGain >= 80) {
      motif = 'WINNING CAPTURE';
      idea = `Captures the ${capName} on ${move.to} for a favorable material gain`;
    } else if (netGain >= 0) {
      idea = `Trades ${pieceName} for the ${capName} on ${move.to}`;
    } else {
      idea = `Captures the ${capName} on ${move.to}, though the square is heavily defended`;
    }
  } else if (isKingInCheck(stateAfter.board, enemy)) {
    motif = 'CENTER & TEMPO';
    idea = `Delivers check with ${san} to seize tempo against the opponent's king`;
  } else if (mobDelta >= 20) {
    motif = 'CENTER & TEMPO';
    idea = `Activates the ${pieceName} on ${move.to}, expanding piece mobility (+${(mobDelta / 100).toFixed(1)})`;
  } else if (kingDelta >= 20) {
    motif = 'KING SAFETY';
    idea = `Improves king shelter and defensive cohesion (+${(kingDelta / 100).toFixed(1)})`;
  } else if (pawnDelta >= 15) {
    idea = `Strengthens pawn structure and square control around ${move.to}`;
  }

  let planSummary = `${idea}.`;
  let followUpNote = 'Check the alternatives below to compare engine continuations.';

  if (
    classification === 'blunder' ||
    classification === 'mistake' ||
    classification === 'inaccuracy'
  ) {
    const severityText =
      classification === 'blunder'
        ? 'concedes decisive tactical counterplay or material'
        : classification === 'mistake'
        ? 'gives up meaningful initiative'
        : 'is slightly imprecise';
    planSummary = `${idea}, but ${san} ${severityText}.`;
    if (bestAlt) {
      followUpNote = `Preferable was ${bestAlt.san} (${bestAlt.formattedEval}): ${bestAlt.headline}.`;
    }
  } else if (bestAlt && bestAlt.san !== san) {
    followUpNote = `Comparable alternative: ${bestAlt.san} (${bestAlt.formattedEval}) — ${bestAlt.headline}.`;
  }

  return { motif, planSummary, followUpNote };
}

/**
 * Performs comprehensive single-ply Tactical Coach analysis for Replay Studio:
 * - Grades the move just played (comparing against Top 3 Multi-PV candidates before the move)
 * - Detects Brilliant Sacrifices, Opening Book theory, tactical motifs, and positional ideas
 * - Surfaces Top 2-3 alternative options with PVs and board arrow coordinates
 * - Inspects the resulting board (`stateAfter`) for active threats / opponent's sharpest reply
 */
export function analyzeReplayPly(
  stateBefore: GameState | null,
  playedNode: TimelineNode,
  stateAfter: GameState,
  options?: {
    cacheKey?: string;
    maxDepth?: number;
    maxTimeMs?: number;
  }
): ReplayPlyCoachInsight {
  const startWall = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const cacheKey = options?.cacheKey ?? `${playedNode.ply}:${playedNode.fen}`;
  const maxDepth = options?.maxDepth ?? 6;
  const maxTimeMs = options?.maxTimeMs ?? 380;

  const openingInfo =
    stateAfter.fullMoveNumber <= 16 ? analyzeOpeningAndStrategy(stateAfter) : null;

  // Case 1: Ply 0 (Starting position or custom FEN before any moves)
  if (!stateBefore || !playedNode.san || !playedNode.color) {
    const startAnalysis = analyzeTacticsDeep(stateAfter, maxDepth, maxTimeMs);
    const best = startAnalysis.topMoves[0];
    const evalWhiteCp =
      best?.engineEval ?? evaluateBoardWhitePerspective(stateAfter.board, 'club');
    const formattedEval = best?.formattedEval ?? formatEvalScore(evalWhiteCp);
    const elapsedMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startWall
    );

    return {
      cacheKey,
      ply: playedNode.ply,
      playedSan: null,
      playedColor: null,
      verdict: 'start',
      verdictLabel: REPLAY_VERDICT_META.start.label,
      verdictSymbol: REPLAY_VERDICT_META.start.symbol,
      evalWhiteCp,
      formattedEval,
      centipawnLoss: 0,
      motif: best?.tacticalMotif ?? 'CENTER & TEMPO',
      planSummary: best
        ? `${stateAfter.turn === 'w' ? 'White' : 'Black'} to move. Top opening choice is ${best.san}: ${best.coachWhy}`
        : 'Starting position ready. Step forward or drag a piece to explore lines.',
      followUpNote: best?.followUpPlan ?? 'Step forward to review the game move by move.',
      bestAlternativeSan: best?.san ?? null,
      alternatives: startAnalysis.topMoves.slice(0, 3),
      afterMoveThreat: startAnalysis.opponentThreat,
      openingInfo,
      searchDepth: startAnalysis.searchDepth,
      elapsedMs,
    };
  }

  // Case 2: Analyze the move that led from `stateBefore` -> `stateAfter`
  const lastRecord = stateAfter.moveHistory[stateAfter.moveHistory.length - 1];
  const playedMove: Move | null = lastRecord?.move ?? null;
  const playedSan = playedNode.san;
  const playedColor = playedNode.color;
  const signForWhite = playedColor === 'w' ? 1 : -1;

  // Multi-PV search on the position BEFORE the move to discover best move & alternatives
  const beforeAnalysis = analyzeTacticsDeep(stateBefore, maxDepth, maxTimeMs);
  const topMovesBefore = beforeAnalysis.topMoves;
  const bestCandidate = topMovesBefore[0];

  const matchedCandidate = playedMove
    ? topMovesBefore.find(
        (m) =>
          m.from === playedMove.from &&
          m.to === playedMove.to &&
          m.move.promotion === playedMove.promotion
      )
    : undefined;

  const isExactTop = Boolean(
    matchedCandidate && bestCandidate && matchedCandidate.rank === 1
  );

  // Compute score of best move and played move from the mover's perspective
  const bestScoreForTurn = bestCandidate
    ? bestCandidate.engineEval * signForWhite
    : evaluateBoardWhitePerspective(stateBefore.board, 'club') * signForWhite;

  let playedScoreForTurn = bestScoreForTurn;
  let evalWhiteCp = bestCandidate?.engineEval ?? 0;

  if (stateAfter.status === 'checkmate') {
    playedScoreForTurn = 100000;
    evalWhiteCp = 100000 * signForWhite;
  } else if (stateAfter.status !== 'playing') {
    playedScoreForTurn = 0;
    evalWhiteCp = 0;
  } else if (matchedCandidate) {
    evalWhiteCp = matchedCandidate.engineEval;
    playedScoreForTurn = evalWhiteCp * signForWhite;
  } else {
    // Evaluate resulting board with a quick search from opponent's turn so CPL is tactically sound
    const afterSearch = searchMultiPV(stateAfter, {
      multiPvCount: 1,
      maxDepth: Math.max(3, Math.min(5, maxDepth - 1)),
      maxTimeMs: Math.max(80, Math.round(maxTimeMs * 0.35)),
      forCoach: true,
    });
    const oppBest = afterSearch.items[0];
    if (oppBest) {
      evalWhiteCp = oppBest.whiteScore;
      playedScoreForTurn = evalWhiteCp * signForWhite;
    } else {
      evalWhiteCp = evaluateBoardWhitePerspective(stateAfter.board, 'club');
      playedScoreForTurn = evalWhiteCp * signForWhite;
    }
  }

  const cpl = isExactTop ? 0 : Math.max(0, bestScoreForTurn - playedScoreForTurn);
  const winProbBest = computeWinProbability(bestScoreForTurn) / 100;
  const winProbPlayed = computeWinProbability(playedScoreForTurn) / 100;
  const deltaWinProb = Math.max(0, winProbBest - winProbPlayed);

  const rawClass: MoveClassification = classifyMoveQuality(
    cpl,
    deltaWinProb,
    isExactTop
  );

  // Detect Opening Book move or Brilliant Sacrifice
  const matBefore = calculateMaterialBalance(stateBefore.board);
  const matAfter = calculateMaterialBalance(stateAfter.board);
  const moverMatBefore = playedColor === 'w' ? matBefore.diff : -matBefore.diff;
  const moverMatAfter = playedColor === 'w' ? matAfter.diff : -matAfter.diff;
  const droppedMaterial = moverMatBefore - moverMatAfter;
  const isCaptureSacrifice =
    playedMove &&
    playedMove.captured &&
    PIECE_VALUES[playedMove.piece.type] - PIECE_VALUES[playedMove.captured.type] >= 180;
  const isPositionalSacrifice =
    (playedNode.nag === '!!' || droppedMaterial >= 2 || Boolean(isCaptureSacrifice)) &&
    (rawClass === 'best' || rawClass === 'excellent') &&
    playedScoreForTurn >= -40 &&
    playedNode.ply >= 8;

  const isBookMove =
    Boolean(openingInfo && openingInfo.phase === 'opening_book') &&
    (rawClass === 'best' || rawClass === 'excellent' || rawClass === 'good') &&
    !isPositionalSacrifice &&
    playedNode.ply <= 16;

  let verdict: ReplayMoveVerdict = rawClass;
  if (isPositionalSacrifice) {
    verdict = 'sacrifice';
  } else if (isBookMove) {
    verdict = 'book';
  }

  const verdictMeta = REPLAY_VERDICT_META[verdict];

  // Build coach explanation & follow-up plan
  let motif: TacticalMotifTag = matchedCandidate?.tacticalMotif ?? 'POSITIONAL';
  let planSummary = '';
  let followUpNote = '';

  if (matchedCandidate && verdict !== 'inaccuracy' && verdict !== 'mistake' && verdict !== 'blunder') {
    planSummary =
      verdict === 'sacrifice'
        ? `Brilliant tactical sacrifice (${playedSan})! ${matchedCandidate.coachWhy}`
        : verdict === 'book' && openingInfo
        ? `${openingInfo.fullTitle} (${openingInfo.eco}). ${openingInfo.commentary}`
        : matchedCandidate.coachWhy;
    followUpNote = matchedCandidate.followUpPlan;
  } else if (playedMove) {
    const described = describePlayedMovePlan(
      stateBefore,
      playedMove,
      playedSan,
      stateAfter,
      verdict,
      bestCandidate
    );
    motif = described.motif;
    planSummary = described.planSummary;
    followUpNote = described.followUpNote;
  } else {
    planSummary = `${CLASSIFICATION_COLORS[rawClass].label}: ${playedSan}.`;
    followUpNote = bestCandidate
      ? `Engine preferred ${bestCandidate.san} (${bestCandidate.formattedEval}).`
      : '';
  }

  // Filter alternatives: show up to 3 concrete options (prioritize alternatives different from played move when played move was #1)
  const distinctAlts = topMovesBefore.filter(
    (m) =>
      !playedMove ||
      m.from !== playedMove.from ||
      m.to !== playedMove.to ||
      m.move.promotion !== playedMove.promotion
  );
  const alternatives = isExactTop
    ? distinctAlts.slice(0, 3)
    : topMovesBefore.slice(0, 3);

  // Inspect resulting position for active threats / opponent's main reply
  const afterMoveThreat =
    stateAfter.status === 'playing'
      ? detectOpponentThreat(stateAfter, {
          maxDepth: 5,
          maxTimeMs: 75,
        })
      : null;

  const formattedEval =
    stateAfter.status === 'checkmate'
      ? signForWhite > 0
        ? 'M0'
        : '-M0'
      : formatEvalScore(evalWhiteCp);

  const elapsedMs = Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startWall
  );

  return {
    cacheKey,
    ply: playedNode.ply,
    playedSan,
    playedColor,
    verdict,
    verdictLabel: verdictMeta.label,
    verdictSymbol: verdictMeta.symbol,
    evalWhiteCp,
    formattedEval,
    centipawnLoss: Math.round(cpl),
    motif,
    planSummary,
    followUpNote,
    bestAlternativeSan:
      bestCandidate && !isExactTop ? bestCandidate.san : distinctAlts[0]?.san ?? null,
    alternatives,
    afterMoveThreat,
    openingInfo:
      openingInfo && openingInfo.phase !== 'standby' ? openingInfo : null,
    searchDepth: beforeAnalysis.searchDepth,
    elapsedMs,
  };
}
