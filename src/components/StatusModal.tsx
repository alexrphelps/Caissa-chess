import React from 'react';
import { calculateMaterialBalance } from '../chess/engine';
import { RatedMatchResultSummary } from '../chess/ratedJourney';
import { Color, GameMode, GameState, ShellState } from '../chess/types';

interface StatusModalProps {
  shellState: ShellState;
  gameState: GameState;
  gameMode: GameMode;
  playerColor: Color;
  isRatedJourneyGame?: boolean;
  isScoringRatedMatch?: boolean;
  ratedScoringProgress?: { completed: number; total: number } | null;
  ratedMatchSummary?: RatedMatchResultSummary | null;
  onResume: () => void;
  onNewGame: () => void;
  onReturnToTitle: () => void;
  onInspectBoard: () => void;
  onOpenSavedGames?: () => void;
  onOpenGameReview?: () => void;
  onOpenInReplay?: () => void;
  onNextRatedMatch?: () => void;
  onOpenJourneyHub?: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  shellState,
  gameState,
  gameMode,
  playerColor,
  isRatedJourneyGame = false,
  isScoringRatedMatch = false,
  ratedScoringProgress = null,
  ratedMatchSummary = null,
  onResume,
  onNewGame,
  onReturnToTitle,
  onInspectBoard,
  onOpenSavedGames,
  onOpenGameReview,
  onOpenInReplay,
  onNextRatedMatch,
  onOpenJourneyHub,
}) => {
  if (shellState !== 'paused' && shellState !== 'gameover') {
    return null;
  }

  const material = calculateMaterialBalance(gameState.board);
  const totalPlies = gameState.moveHistory.length;
  const fullMoves = gameState.fullMoveNumber;

  if (shellState === 'paused') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Game Paused"
        className="fixed inset-0 z-40 bg-[#0B100E]/80 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md bg-[#17211C] border-2 border-[#C6923A] rounded-xl p-6 shadow-[0_24px_60px_rgba(0,0,0,0.8)] space-y-6 text-center">
          <div className="space-y-1">
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#C6923A]">
              MATCH SUSPENDED
            </span>
            <h2
              className="text-2xl font-bold text-[#F4EFE6]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Game Paused
            </h2>
          </div>

          {/* 3 Tabular Stat Tiles */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-3">
              <div className="text-[11px] font-mono uppercase text-[#A69F91]">
                MOVE
              </div>
              <div className="text-lg font-bold font-mono text-[#F4EFE6] tabular-nums mt-0.5">
                {fullMoves}
              </div>
            </div>
            <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-3">
              <div className="text-[11px] font-mono uppercase text-[#A69F91]">
                PLIES
              </div>
              <div className="text-lg font-bold font-mono text-[#F4EFE6] tabular-nums mt-0.5">
                {totalPlies}
              </div>
            </div>
            <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-3">
              <div className="text-[11px] font-mono uppercase text-[#A69F91]">
                BALANCE
              </div>
              <div className="text-lg font-bold font-mono text-[#C6923A] tabular-nums mt-0.5">
                {material.diff === 0
                  ? '0'
                  : material.diff > 0
                  ? `+${material.diff} W`
                  : `+${Math.abs(material.diff)} B`}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 px-5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Resume Match
            </button>
            {onOpenSavedGames && (
              <button
                type="button"
                data-testid="pause-saved-games-btn"
                onClick={onOpenSavedGames}
                className="w-full py-2.5 px-4 rounded-lg bg-[#1D2922] hover:bg-[#25352C] border border-[#3A4E42] text-xs font-semibold text-[#EADBC8] hover:text-[#F4EFE6] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="text-[#C6923A]">📁</span>
                <span>Save Session / Stored Games [S]</span>
              </button>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onNewGame}
                className="py-2.5 px-4 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Restart Match
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="py-2.5 px-4 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Game Over Modal ('gameover')
  let outcomeKicker = 'MATCH CONCLUDED';
  let outcomeTitle = 'Game Over';
  let outcomeReason = '';

  if (ratedMatchSummary?.termination === 'resignation') {
    outcomeKicker = 'RATED MATCH · RESIGNATION';
    outcomeTitle = 'You Resigned the Match';
    outcomeReason = `Concluded on move ${fullMoves} against AI ${ratedMatchSummary.opponentElo} Elo.`;
  } else if (ratedMatchSummary?.wasAbortedTooShort) {
    outcomeKicker = 'RATED MATCH · ABORTED EARLY';
    outcomeTitle = 'Match Ended Early (Unrated)';
    outcomeReason = `Fewer than 6 player moves were played (${ratedMatchSummary.playerMoves} ${
      ratedMatchSummary.playerMoves === 1 ? 'move' : 'moves'
    }), so your rating was not affected.`;
  } else if (gameState.status === 'checkmate') {
    const winnerName = gameState.winner === 'w' ? 'White' : 'Black';
    if (gameMode === 'ai') {
      const playerWon = gameState.winner === playerColor;
      outcomeKicker = playerWon ? 'VICTORY BY CHECKMATE' : 'DEFEAT BY CHECKMATE';
      outcomeTitle = playerWon ? 'You Won by Checkmate!' : 'AI Won by Checkmate';
    } else {
      outcomeKicker = 'DECISIVE VICTORY';
      outcomeTitle = `${winnerName} Wins by Checkmate`;
    }
    const lastSan =
      gameState.moveHistory[gameState.moveHistory.length - 1]?.san ?? '';
    outcomeReason = `Concluded on move ${fullMoves} (${lastSan})`;
  } else if (gameState.status === 'stalemate') {
    outcomeKicker = 'FIDE DRAW RULE';
    outcomeTitle = 'Draw by Stalemate';
    outcomeReason = `${
      gameState.turn === 'w' ? 'White' : 'Black'
    } has no legal moves available and is not in check.`;
  } else if (gameState.status === 'draw_insufficient') {
    outcomeKicker = 'FIDE DRAW RULE';
    outcomeTitle = 'Draw · Insufficient Material';
    outcomeReason = 'Neither side has sufficient mating material on the board.';
  } else if (gameState.status === 'draw_fifty_move') {
    outcomeKicker = 'FIDE DRAW RULE';
    outcomeTitle = 'Draw · Fifty-Move Rule';
    outcomeReason = '50 consecutive moves completed without a pawn advance or capture.';
  } else if (gameState.status === 'draw_seventy_five_move') {
    outcomeKicker = 'MANDATORY FIDE DRAW (RULE 9.6.2)';
    outcomeTitle = 'Draw · 75-Move Rule';
    outcomeReason = '75 consecutive full moves completed without a pawn advance or capture (mandatory draw).';
  } else if (gameState.status === 'draw_repetition') {
    outcomeKicker = 'FIDE DRAW RULE';
    outcomeTitle = 'Draw · Threefold Repetition';
    outcomeReason = 'The exact board position, castling rights, and en passant state occurred 3 times.';
  } else if (gameState.status === 'draw_fivefold_repetition') {
    outcomeKicker = 'MANDATORY FIDE DRAW (RULE 9.6.1)';
    outcomeTitle = 'Draw · Fivefold Repetition';
    outcomeReason = 'The exact position occurred 5 times on consecutive or non-consecutive turns (mandatory draw).';
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={outcomeTitle}
      className="fixed inset-0 z-40 bg-[#0B100E]/80 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-md bg-[#17211C] border-2 border-[#C6923A] rounded-xl p-6 shadow-[0_24px_60px_rgba(0,0,0,0.85)] space-y-5 text-center my-auto">
        <div className="space-y-1.5">
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#C6923A]">
            {outcomeKicker}
          </span>
          <h2
            className="text-2xl font-bold text-[#F4EFE6]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {outcomeTitle}
          </h2>
          <p className="text-xs text-[#A69F91]">{outcomeReason}</p>
        </div>

        {/* Mastery / Match Summary Metrics */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-3">
            <div className="text-[11px] font-mono uppercase text-[#A69F91]">
              MOVES
            </div>
            <div className="text-lg font-bold font-mono text-[#F4EFE6] tabular-nums mt-0.5">
              {fullMoves}
            </div>
          </div>
          <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-3">
            <div className="text-[11px] font-mono uppercase text-[#A69F91]">
              CAPTURES
            </div>
            <div className="text-lg font-bold font-mono text-[#F4EFE6] tabular-nums mt-0.5">
              {gameState.capturedByWhite.length +
                gameState.capturedByBlack.length}
            </div>
          </div>
          <div className="bg-[#121A16] border border-[#26342C] rounded-lg p-3">
            <div className="text-[11px] font-mono uppercase text-[#A69F91]">
              MATERIAL
            </div>
            <div className="text-lg font-bold font-mono text-[#C6923A] tabular-nums mt-0.5">
              {material.diff === 0
                ? 'EVEN'
                : material.diff > 0
                ? `+${material.diff} W`
                : `+${Math.abs(material.diff)} B`}
            </div>
          </div>
        </div>

        {/* Rated Journey Post-Game Rating Card */}
        {isRatedJourneyGame && (
          <div
            data-testid="rated-match-summary-card"
            className="p-4 rounded-xl bg-[#121A16] border border-[#2D4036] space-y-3 text-left"
          >
            {isScoringRatedMatch || !ratedMatchSummary ? (
              <div className="py-2 text-center space-y-1.5">
                <div className="text-xs font-mono font-semibold text-[#C6923A]">
                  Evaluating move accuracy & updating rating...
                </div>
                {ratedScoringProgress && ratedScoringProgress.total > 0 && (
                  <div className="text-[11px] font-mono text-[#A69F91] tabular-nums">
                    Scored {ratedScoringProgress.completed} /{' '}
                    {ratedScoringProgress.total} player moves
                  </div>
                )}
              </div>
            ) : ratedMatchSummary.wasAbortedTooShort ? (
              <div className="space-y-1 text-center">
                <div className="text-xs font-mono font-bold text-[#EADBC8]">
                  Rating Unchanged · {ratedMatchSummary.ratingAfter} Elo
                </div>
                <div className="text-[11px] text-[#A69F91]">
                  Play at least 6 moves for a resignation to count toward your
                  Rated Journey.
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2 pb-2.5 border-b border-[#223029]">
                  <div>
                    <div className="text-[11px] font-mono text-[#A69F91]">
                      Updated Rating ·{' '}
                      {ratedMatchSummary.isProvisionalAfter
                        ? `Provisional (${ratedMatchSummary.placementCountAfter}/5)`
                        : 'Established'}
                    </div>
                    <div className="flex items-baseline gap-2 mt-0.5 font-mono tabular-nums">
                      <span className="text-xs text-[#8E8779]">
                        {ratedMatchSummary.ratingBefore}
                      </span>
                      <span className="text-xs text-[#8E8779]">→</span>
                      <span
                        data-testid="rated-summary-new-elo"
                        className="text-2xl font-bold text-[#F4EFE6]"
                      >
                        {ratedMatchSummary.ratingAfter}
                      </span>
                      <span className="text-[11px] text-[#A69F91]">
                        ±{ratedMatchSummary.rdAfter}
                      </span>
                    </div>
                  </div>
                  <div
                    data-testid="rated-summary-delta"
                    className={`text-lg font-mono font-bold tabular-nums ${
                      ratedMatchSummary.delta > 0
                        ? 'text-[#4ADE80]'
                        : ratedMatchSummary.delta < 0
                        ? 'text-[#F87171]'
                        : 'text-[#EADBC8]'
                    }`}
                  >
                    {ratedMatchSummary.delta > 0
                      ? `+${ratedMatchSummary.delta}`
                      : ratedMatchSummary.delta}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                  <div className="py-1.5 px-2 rounded bg-[#17221C]">
                    <div className="text-[10px] text-[#8E8779]">ACCURACY</div>
                    <div className="text-xs font-bold text-[#4ADE80] mt-0.5">
                      {ratedMatchSummary.accuracy}%
                    </div>
                  </div>
                  <div className="py-1.5 px-2 rounded bg-[#17221C]">
                    <div className="text-[10px] text-[#8E8779]">PERF ELO</div>
                    <div className="text-xs font-bold text-[#F4EFE6] mt-0.5">
                      {ratedMatchSummary.performanceRating}
                    </div>
                  </div>
                  <div className="py-1.5 px-2 rounded bg-[#17221C]">
                    <div className="text-[10px] text-[#8E8779]">UNDOS USED</div>
                    <div className="text-xs font-bold text-[#C6923A] mt-0.5">
                      {ratedMatchSummary.undosUsed}/
                      {ratedMatchSummary.undosAllowed}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-[#A69F91] font-mono tabular-nums flex items-center justify-between gap-2">
                  <span>
                    Blunders: {ratedMatchSummary.blunders} · Mistakes:{' '}
                    {ratedMatchSummary.mistakes}
                  </span>
                  {ratedMatchSummary.undoPenaltyPct > 0 && (
                    <span className="text-[#FACC15]">
                      -{ratedMatchSummary.undoPenaltyPct}% undo dampening
                    </span>
                  )}
                </div>

                {(ratedMatchSummary.promotedTier ||
                  ratedMatchSummary.undoBudgetChanged ||
                  ratedMatchSummary.blunderAlertsGraduated) && (
                  <div className="pt-2 border-t border-[#223029] space-y-1 text-xs">
                    {ratedMatchSummary.promotedTier && (
                      <div className="font-semibold text-[#4ADE80]">
                        Rank Promoted: {ratedMatchSummary.tierAfter.name}!
                      </div>
                    )}
                    {ratedMatchSummary.undoBudgetChanged && (
                      <div className="text-[#C6923A] font-mono text-[11px] tabular-nums">
                        Undo allowance adjusted: {ratedMatchSummary.undosBefore}{' '}
                        → {ratedMatchSummary.undosAfter} per game
                      </div>
                    )}
                    {ratedMatchSummary.blunderAlertsGraduated && (
                      <div className="text-[#EADBC8] text-[11px]">
                        Graduated past 1000 Elo — Blunder Alerts are now off.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="space-y-2.5">
          {isRatedJourneyGame && onNextRatedMatch ? (
            <button
              type="button"
              data-start="true"
              data-testid="gameover-next-rated-btn"
              disabled={isScoringRatedMatch}
              onClick={onNextRatedMatch}
              className="w-full py-3 px-5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] disabled:opacity-60 text-[#111815] font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {ratedMatchSummary
                ? `Next Match · vs. AI ${ratedMatchSummary.nextOpponentElo} Elo (${
                    ratedMatchSummary.nextColor === 'w' ? 'White' : 'Black'
                  })`
                : 'Next Rated Match'}
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onNewGame}
              className="w-full py-3 px-5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Play Again
            </button>
          )}
          {isRatedJourneyGame && onOpenJourneyHub && (
            <button
              type="button"
              data-testid="gameover-journey-hub-btn"
              onClick={onOpenJourneyHub}
              className="w-full py-2.5 px-4 rounded-lg bg-[#1D2B24] hover:bg-[#273930] border border-[#4ADE80]/50 text-xs font-semibold text-[#4ADE80] transition-colors cursor-pointer whitespace-nowrap"
            >
              Open Rated Journey Hub
            </button>
          )}
          {onOpenGameReview && (
            <button
              type="button"
              data-testid="gameover-review-btn"
              onClick={onOpenGameReview}
              className="w-full py-2.5 px-4 rounded-lg bg-[#16291F] hover:bg-[#1E382A] border-2 border-[#22C55E]/60 text-xs font-bold text-[#22C55E] hover:text-[#4ADE80] transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span>📊</span>
              <span>Review Match & Accuracies</span>
            </button>
          )}
          {onOpenInReplay && (
            <button
              type="button"
              data-testid="gameover-open-replay-btn"
              onClick={onOpenInReplay}
              className="w-full py-2.5 px-4 rounded-lg bg-[#1D2922] hover:bg-[#25352C] border border-[#C6923A]/60 text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>Open in Replay Studio</span>
            </button>
          )}
          {onOpenSavedGames && (
            <button
              type="button"
              data-testid="gameover-saved-archive-btn"
              onClick={onOpenSavedGames}
              className="w-full py-2.5 px-4 rounded-lg bg-[#1D2922] hover:bg-[#25352C] border border-[#3A4E42] text-xs font-semibold text-[#EADBC8] hover:text-[#F4EFE6] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="text-[#C6923A]">📁</span>
              <span>Save Match to Archive / PGN</span>
            </button>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onInspectBoard}
              className="py-2.5 px-4 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Inspect Final Board
            </button>
            <button
              type="button"
              onClick={onReturnToTitle}
              className="py-2.5 px-4 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Title Screen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
