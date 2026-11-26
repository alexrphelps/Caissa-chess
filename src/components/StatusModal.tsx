import React from 'react';
import { calculateMaterialBalance } from '../chess/engine';
import { Color, GameMode, GameState, ShellState } from '../chess/types';

interface StatusModalProps {
  shellState: ShellState;
  gameState: GameState;
  gameMode: GameMode;
  playerColor: Color;
  onResume: () => void;
  onNewGame: () => void;
  onReturnToTitle: () => void;
  onInspectBoard: () => void;
  onOpenSavedGames?: () => void;
  onOpenGameReview?: () => void;
  onOpenInReplay?: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  shellState,
  gameState,
  gameMode,
  playerColor,
  onResume,
  onNewGame,
  onReturnToTitle,
  onInspectBoard,
  onOpenSavedGames,
  onOpenGameReview,
  onOpenInReplay,
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

  if (gameState.status === 'checkmate') {
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
      className="fixed inset-0 z-40 bg-[#0B100E]/80 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-[#17211C] border-2 border-[#C6923A] rounded-xl p-6 shadow-[0_24px_60px_rgba(0,0,0,0.85)] space-y-6 text-center">
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

        <div className="space-y-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onNewGame}
            className="w-full py-3 px-5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Play Again
          </button>
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
