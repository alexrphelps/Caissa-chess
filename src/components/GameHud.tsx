import React, { useEffect, useRef, useState } from 'react';
import { calculateMaterialBalance } from '../chess/engine';
import {
  AI_DIFFICULTY_LEVELS,
  describeEngineProfileSummary,
  evaluateBoardWhitePerspective,
  formatEvalScore,
  getDifficultyInfo,
  MAX_ENGINE_ELO,
  MIN_ENGINE_ELO,
} from '../chess/evaluation';
import { OpeningAnalysisResult } from '../chess/openingBook';
import { OpeningPrinciplesReport } from '../chess/openingAssistant';
import { RecommendedMove, TacticsAnalysis } from '../chess/tacticsHelper';
import {
  AIDifficulty,
  AIPresetId,
  AISearchResult,
  Color,
  EngineProfileState,
  GameMode,
  GameState,
  MoveRecord,
  PieceType,
} from '../chess/types';
import { ChessPieceSvg, PIECE_NAMES } from './ChessPieceSvg';
import { OpeningPrinciplesHud } from './OpeningPrinciplesHud';

export interface SharedHudProps {
  gameState: GameState;
  gameMode: GameMode;
  playerColor: Color;
  aiDifficulty: AIDifficulty;
  engineProfile?: EngineProfileState;
  lastSearchStats: AISearchResult | null;
  showEngineStats: boolean;
  isFlipped: boolean;
  isAIThinking: boolean;
  canUndo: boolean;
  isMuted: boolean;
  helperMode: boolean;
  showBoardSuggestions: boolean;
  helperAnalysis: TacticsAnalysis | null;
  openingAnalysis: OpeningAnalysisResult;
  openingPrinciplesReport?: OpeningPrinciplesReport;
  highlightedHelperRank: 1 | 2 | 3 | null;
  previewPly: number | null;
  onPreviewPly: (ply: number | null) => void;
  onSelectDifficulty: (difficulty: AIDifficulty) => void;
  onSelectPreset?: (presetId: Exclude<AIPresetId, 'custom'>) => void;
  onChangeElo?: (elo: number) => void;
  onOpenCustomizer?: () => void;
  onToggleEngineStats: () => void;
  onToggleHelperMode: () => void;
  onToggleBoardSuggestions: () => void;
  onHoverHelperRank: (rank: 1 | 2 | 3 | null) => void;
  onPlayRecommendedMove: (rec: RecommendedMove) => void;
  onNewGame: () => void;
  onFlipBoard: () => void;
  onTogglePlayAsColor: (color: Color) => void;
  onToggleGameMode: (mode: GameMode) => void;
  onUndoMove: () => void;
  onOpenPause: () => void;
  onToggleMute: () => void;
  onOpenSavedGames?: () => void;
  onSaveCurrentSession?: () => void;
  savedSessionsCount?: number;
  onOpenPuzzles?: () => void;
  onOpenGameReview?: () => void;
  onCopyFen?: () => void;
  onCopyPgn?: () => void;
}

export function getStatusBannerText(
  gameState: GameState,
  isAIThinking: boolean,
  aiDifficulty: AIDifficulty = 'casual',
  engineProfile?: EngineProfileState
): {
  headline: string;
  subline: string;
  tone: 'neutral' | 'check' | 'gameover';
} {
  const activeSide = gameState.turn === 'w' ? 'White' : 'Black';
  const diffInfo = getDifficultyInfo(aiDifficulty);
  const profileSummary = engineProfile
    ? describeEngineProfileSummary(engineProfile)
    : null;
  const thinkingLabel = profileSummary
    ? profileSummary.title
    : diffInfo.shortLabel;
  const thinkingDepth = profileSummary
    ? profileSummary.depthBadge
    : diffInfo.depthLabel;

  switch (gameState.status) {
    case 'checkmate': {
      const winnerSide = gameState.winner === 'w' ? 'White' : 'Black';
      return {
        headline: `Checkmate · ${winnerSide} Wins`,
        subline: `${activeSide} King has no legal escape`,
        tone: 'gameover',
      };
    }
    case 'stalemate':
      return {
        headline: 'Draw by Stalemate',
        subline: `${activeSide} has no legal moves and is not in check`,
        tone: 'gameover',
      };
    case 'draw_insufficient':
      return {
        headline: 'Draw · Insufficient Material',
        subline: 'Neither side has sufficient material to force checkmate',
        tone: 'gameover',
      };
    case 'draw_fifty_move':
      return {
        headline: 'Draw · Fifty-Move Rule',
        subline: '50 consecutive moves without a pawn advance or capture',
        tone: 'gameover',
      };
    case 'draw_seventy_five_move':
      return {
        headline: 'Draw · 75-Move Rule',
        subline: '75 moves without a pawn advance or capture (FIDE Rule 9.6.2)',
        tone: 'gameover',
      };
    case 'draw_repetition':
      return {
        headline: 'Draw · Threefold Repetition',
        subline: 'Exact position repeated three times',
        tone: 'gameover',
      };
    case 'draw_fivefold_repetition':
      return {
        headline: 'Draw · Fivefold Repetition',
        subline: 'Identical position reached 5 times (FIDE Rule 9.6.1)',
        tone: 'gameover',
      };
    case 'playing':
    default: {
      if (gameState.inCheck) {
        return {
          headline: `${activeSide} to Move · CHECK!`,
          subline: isAIThinking
            ? `AI is calculating... (${thinkingLabel})`
            : `${activeSide} King is under attack — must escape or block`,
          tone: 'check',
        };
      }
      return {
        headline: `${activeSide} to Move`,
        subline: isAIThinking
          ? `AI is calculating... (${thinkingLabel} · ${thinkingDepth})`
          : `Move ${gameState.fullMoveNumber} · Standard FIDE Rules`,
        tone: 'neutral',
      };
    }
  }
}

export function pairMoveHistory(moveHistory: MoveRecord[]): {
  turnNumber: number;
  whiteSan?: string;
  blackSan?: string;
}[] {
  const pairedMoves: {
    turnNumber: number;
    whiteSan?: string;
    blackSan?: string;
  }[] = [];
  for (const record of moveHistory) {
    if (record.color === 'w') {
      pairedMoves.push({
        turnNumber: record.turnNumber,
        whiteSan: record.san,
      });
    } else {
      const lastRow = pairedMoves[pairedMoves.length - 1];
      if (
        lastRow &&
        lastRow.turnNumber === record.turnNumber &&
        !lastRow.blackSan
      ) {
        lastRow.blackSan = record.san;
      } else {
        pairedMoves.push({
          turnNumber: record.turnNumber,
          blackSan: record.san,
        });
      }
    }
  }
  return pairedMoves;
}

export function findMovePlyIndex(
  moveHistory: MoveRecord[],
  turnNumber: number,
  color: Color
): number {
  const idx = moveHistory.findIndex(
    (r) => r.turnNumber === turnNumber && r.color === color
  );
  return idx === -1 ? -1 : idx + 1;
}

export function describeTurnDelta(gameState: GameState): {
  badge: string;
  summary: string;
  detail: string;
} {
  const history = gameState.moveHistory;
  if (history.length === 0) {
    return {
      badge: 'Match Start',
      summary: 'Opening position ready — White has the first move',
      detail:
        'Select one of the Top 3 candidate moves below or click any White piece on the board.',
    };
  }

  const last = history[history.length - 1];
  const mover = last.color === 'w' ? 'White' : 'Black';
  const pieceName = PIECE_NAMES[last.move.piece.type];
  const moveNumberPrefix =
    last.color === 'w' ? `${last.turnNumber}.` : `${last.turnNumber}...`;

  let actionDesc = `moved ${pieceName} (${last.move.from} → ${last.move.to})`;
  if (last.move.isCastle === 'K') {
    actionDesc = 'castled kingside (O-O) to secure the King';
  } else if (last.move.isCastle === 'Q') {
    actionDesc = 'castled queenside (O-O-O) and activated the Rook';
  } else if (last.move.captured) {
    const capName = PIECE_NAMES[last.move.captured.type];
    actionDesc = `captured ${capName} on ${last.move.to} with ${pieceName} (${last.move.from} → ${last.move.to})`;
  }

  const checkSuffix = gameState.inCheck
    ? ' — placing the King in CHECK!'
    : '.';

  const prev = history.length >= 2 ? history[history.length - 2] : null;

  return {
    badge: `Last: ${moveNumberPrefix} ${last.san}`,
    summary: `${mover} ${actionDesc}${checkSuffix}`,
    detail: prev
      ? `Previous ply: ${
          prev.color === 'w' ? 'White' : 'Black'
        } played ${prev.san} (${prev.move.from} → ${prev.move.to})`
      : 'First ply completed — evaluate center control and piece development.',
  };
}

/* ============================================================================
 * 1. FULL-WIDTH TOP HEADER BAR
 * Houses Brand, Turn Status Banner, AI Difficulty & Engine Telemetry,
 * Collapsible Move History Popover, Quick Undo, and Consolidated Options Menu
 * ========================================================================== */
export const TopHeaderBar: React.FC<SharedHudProps> = ({
  gameState,
  gameMode,
  playerColor,
  aiDifficulty,
  engineProfile,
  lastSearchStats,
  showEngineStats,
  isFlipped,
  isAIThinking,
  canUndo,
  isMuted,
  helperMode,
  showBoardSuggestions,
  previewPly,
  onPreviewPly,
  onSelectDifficulty,
  onSelectPreset,
  onChangeElo,
  onOpenCustomizer,
  onToggleEngineStats,
  onToggleHelperMode,
  onToggleBoardSuggestions,
  onNewGame,
  onFlipBoard,
  onTogglePlayAsColor,
  onToggleGameMode,
  onUndoMove,
  onOpenPause,
  onToggleMute,
  onOpenSavedGames,
  onSaveCurrentSession,
  savedSessionsCount = 0,
  onOpenPuzzles,
  onOpenGameReview,
  onCopyFen,
  onCopyPgn,
}) => {
  const [openPopover, setOpenPopover] = useState<'history' | 'options' | null>(
    null
  );
  const popoverContainerRef = useRef<HTMLDivElement | null>(null);
  const moveListRef = useRef<HTMLDivElement | null>(null);

  const handleSetOpenPopover = (target: 'history' | 'options' | null) => {
    setOpenPopover(target);
    if (target !== 'history') {
      onPreviewPly(null);
    }
  };

  const activeDiffInfo = getDifficultyInfo(aiDifficulty);
  const profileSummary = engineProfile
    ? describeEngineProfileSummary(engineProfile)
    : null;
  const statusInfo = getStatusBannerText(
    gameState,
    isAIThinking,
    aiDifficulty,
    engineProfile
  );

  const staticEvalFormatted = formatEvalScore(
    evaluateBoardWhitePerspective(
      gameState.board,
      engineProfile ? engineProfile.config : aiDifficulty
    )
  );
  const displayedEval = lastSearchStats
    ? lastSearchStats.formattedScore
    : staticEvalFormatted;
  const displayedDepth = lastSearchStats
    ? `${lastSearchStats.depth}p${
        (lastSearchStats.config?.enableQuiescence ?? aiDifficulty === 'club')
          ? '+Q'
          : ''
      }`
    : profileSummary
    ? profileSummary.depthBadge
    : aiDifficulty === 'club'
    ? '5-6p+Q'
    : activeDiffInfo.depthLabel;
  const displayedNodes = lastSearchStats ? lastSearchStats.nodes : 0;

  const pairedMoves = pairMoveHistory(gameState.moveHistory);
  const latestMove =
    gameState.moveHistory.length > 0
      ? gameState.moveHistory[gameState.moveHistory.length - 1]
      : null;

  // Quick-select items for the top header bar (keeps legacy testids and adds Reactive + Tune)
  const quickHeaderTiers: {
    id: Exclude<AIPresetId, 'custom'>;
    legacyDiff: AIDifficulty;
    label: string;
    eloBadge: string;
    title: string;
  }[] = [
    {
      id: 'novice',
      legacyDiff: 'novice',
      label: 'Novice',
      eloBadge: '600',
      title: 'Beginner (600 Elo) — Shallow 1-ply lookahead',
    },
    {
      id: 'casual',
      legacyDiff: 'casual',
      label: 'Casual',
      eloBadge: '1000',
      title: 'Casual (1000 Elo) — 2-ply lookahead with light human errors',
    },
    {
      id: 'reactive',
      legacyDiff: 'casual',
      label: 'Reactive',
      eloBadge: '1150',
      title:
        'Reactive (1150 Elo) — Smart piece safety & sound trades without deep multi-turn traps',
    },
    {
      id: 'intermediate',
      legacyDiff: 'intermediate',
      label: 'Interm.',
      eloBadge: '1400',
      title: 'Intermediate (1400 Elo) — 3-ply tactical search with Quiescence',
    },
    {
      id: 'club',
      legacyDiff: 'club',
      label: 'Master',
      eloBadge: '2200',
      title: 'Master (2200 Elo) — Deep classical search with NMP, LMR & TT',
    },
  ];

  // Auto-scroll move history when opened or updated
  useEffect(() => {
    if (openPopover === 'history' && moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [openPopover, gameState.moveHistory.length]);

  // Close popovers on outside click and restore live board state
  useEffect(() => {
    if (!openPopover) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        popoverContainerRef.current &&
        !popoverContainerRef.current.contains(e.target as Node)
      ) {
        setOpenPopover(null);
        onPreviewPly(null);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [openPopover, onPreviewPly]);

  return (
    <header
      data-testid="top-header-bar"
      className="w-full shrink-0 bg-[#151E19] border-b border-[#293830] px-4 sm:px-6 py-2.5 z-30"
    >
      <div className="max-w-[1440px] mx-auto flex flex-nowrap items-center justify-between gap-2.5">
        {/* Zone 1: Brand Identity (Fixed 144px Width) */}
        <div className="w-[144px] flex items-center shrink-0 overflow-hidden">
          <div className="min-w-0 w-full">
            <h1
              className="text-sm sm:text-base font-bold tracking-tight text-[#F4EFE6] leading-tight whitespace-nowrap truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              CAÏSSA CHESS
            </h1>
            <p
              data-testid="header-engine-profile-summary"
              className="text-[11px] text-[#A69F91] mt-0.5 whitespace-nowrap truncate"
            >
              {gameMode === 'ai'
                ? profileSummary && engineProfile
                  ? `${profileSummary.title} · ${engineProfile.config.maxDepth}p${
                      engineProfile.config.enableQuiescence ? '+Q' : ''
                    }`
                  : `${activeDiffInfo.name} · ${activeDiffInfo.depthLabel}`
                : '2-Player Pass & Play'}
            </p>
          </div>
        </div>

        {/* Zone 2: Turn & Status Banner (Compact 256px Width) */}
        <div
          data-testid="game-status-banner"
          className={`w-[244px] xl:w-[264px] shrink-0 h-[46px] px-3.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 transition-colors overflow-hidden ${
            statusInfo.tone === 'check'
              ? 'bg-[#3B1818] border-[#EF4444] text-[#FEE2E2]'
              : statusInfo.tone === 'gameover'
              ? 'bg-[#2C2314] border-[#C6923A] text-[#F4EFE6]'
              : 'bg-[#1D2A23] border-[#2F4238] text-[#F4EFE6]'
          }`}
        >
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <span className="text-xs sm:text-sm font-bold tracking-normal whitespace-nowrap truncate">
              {statusInfo.headline}
            </span>
            <p className="text-[11px] text-[#C6BFA8] truncate leading-tight mt-0.5">
              {statusInfo.subline}
            </p>
          </div>

          <div className="w-[54px] shrink-0 text-right">
            {isAIThinking ? (
              <span
                data-testid="ai-thinking-indicator"
                className="text-[11px] font-mono font-semibold text-[#C6923A] animate-pulse whitespace-nowrap block"
              >
                Thinking
              </span>
            ) : (
              <span className="text-[11px] font-mono text-[#A69F91] tabular-nums whitespace-nowrap block">
                Move {gameState.fullMoveNumber}
              </span>
            )}
          </div>
        </div>

        {/* Zone 3: AI Difficulty, Reactive Preset, Customizer Button & Telemetry Strip */}
        {gameMode === 'ai' && (
          <div
            data-testid="hud-difficulty-panel"
            className="hidden lg:flex items-center justify-between gap-2 h-[46px] bg-[#121A16] border border-[#26342C] rounded-xl px-2.5 py-1.5 shrink-0"
          >
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A69F91] whitespace-nowrap mr-0.5">
                AI:
              </span>
              <div
                role="radiogroup"
                aria-label="In-Game AI Difficulty"
                className="flex items-center gap-0.5"
              >
                {quickHeaderTiers.map((tier) => {
                  const isSelected = engineProfile
                    ? !engineProfile.isCustom && engineProfile.presetId === tier.id
                    : aiDifficulty === tier.legacyDiff && tier.id !== 'reactive';
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      data-testid={`hud-diff-${tier.id}`}
                      onClick={() => {
                        if (onSelectPreset) {
                          onSelectPreset(tier.id);
                        } else {
                          onSelectDifficulty(tier.legacyDiff);
                        }
                      }}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-[#C6923A] text-[#111815] font-bold'
                          : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#212E27]'
                      }`}
                      title={tier.title}
                    >
                      {tier.label}
                    </button>
                  );
                })}
              </div>

              {onOpenCustomizer && (
                <button
                  type="button"
                  data-testid="hud-open-customizer-btn"
                  onClick={onOpenCustomizer}
                  title="Open Granular AI Engine Customizer & Custom Profiles (400–2400 Elo)"
                  className={`ml-1 px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 border ${
                    engineProfile?.isCustom ||
                    engineProfile?.presetId === 'custom' ||
                    engineProfile?.presetId === 'club_1800'
                      ? 'bg-[#C6923A]/20 border-[#C6923A] text-[#C6923A]'
                      : 'bg-[#1B2620] hover:bg-[#25352C] border-[#34463C] text-[#EADBC8]'
                  }`}
                >
                  <span className="tabular-nums">
                    {engineProfile?.elo ?? 1000} Elo
                  </span>
                  <span className="text-[#C6923A]" aria-hidden="true">
                    ⚙
                  </span>
                </button>
              )}
            </div>

            {showEngineStats && (
              <div
                data-testid="engine-telemetry-bar"
                className="hidden xl:flex items-center justify-between w-[206px] pl-2 border-l border-[#26342C] text-[11px] font-mono text-[#A69F91] tabular-nums whitespace-nowrap shrink-0"
              >
                <span className="w-[64px] shrink-0">
                  Depth <strong className="text-[#F4EFE6]">{displayedDepth}</strong>
                </span>
                <span className="w-[78px] shrink-0 text-center">
                  Nodes{' '}
                  <strong className="text-[#F4EFE6]">
                    {displayedNodes.toLocaleString()}
                  </strong>
                </span>
                <span className="w-[56px] shrink-0 text-right">
                  Eval{' '}
                  <strong
                    data-testid="engine-eval-score"
                    className={
                      displayedEval.startsWith('+') || displayedEval.startsWith('M')
                        ? 'text-[#4ADE80]'
                        : displayedEval.startsWith('-')
                        ? 'text-[#F87171]'
                        : 'text-[#EADBC8]'
                    }
                  >
                    {displayedEval}
                  </strong>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Zone 4: Right Controls (Static-Width Moves Popover + Undo + Options Icon) */}
        <div
          ref={popoverContainerRef}
          className="relative flex items-center gap-2 shrink-0"
        >
          {/* Move History Popover Trigger: Fixed 168px Width so Adding Moves Never Shifts Layout */}
          <button
            type="button"
            data-testid="move-history-toggle"
            aria-expanded={openPopover === 'history'}
            onClick={() =>
              handleSetOpenPopover(openPopover === 'history' ? null : 'history')
            }
            className={`w-[168px] h-[46px] px-3.5 rounded-xl border text-xs font-mono font-medium flex items-center justify-between gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              openPopover === 'history'
                ? 'bg-[#25352C] border-[#C6923A] text-[#F4EFE6]'
                : 'bg-[#1D2A23] hover:bg-[#25352C] border-[#34463C] text-[#D6CFC2] hover:text-[#F4EFE6]'
            }`}
          >
            <div className="flex items-center gap-1 min-w-0 truncate">
              <span className="shrink-0 tabular-nums">
                Moves ({gameState.moveHistory.length})
              </span>
              <span className="text-[#C6923A] font-bold tabular-nums truncate">
                {latestMove
                  ? `· ${latestMove.turnNumber}${
                      latestMove.color === 'w' ? '.' : '...'
                    }${latestMove.san}`
                  : '· Start'}
              </span>
            </div>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-3.5 h-3.5 text-[#A69F91] shrink-0 transition-transform duration-150 ${
                openPopover === 'history' ? 'rotate-180' : ''
              }`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {/* Quick Action: Undo Move (Fixed 86px Width & Extra Padding) */}
          <button
            type="button"
            data-testid="quick-undo-button"
            disabled={!canUndo}
            onClick={onUndoMove}
            title={
              isAIThinking && canUndo
                ? 'Undo Move (Cancels AI thinking) [U]'
                : 'Undo Move [U]'
            }
            className={`w-[86px] h-[46px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isAIThinking && canUndo
                ? 'bg-[#2A2318] hover:bg-[#3B2F1F] border-[#C6923A]/80 text-[#F4EFE6] shadow-[0_0_8px_rgba(198,146,58,0.25)]'
                : 'bg-[#212E27] hover:bg-[#2C3D34] disabled:opacity-40 disabled:pointer-events-none border-[#34463C] text-[#F4EFE6]'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M9 14L4 9l5-5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20 20v-7a4 4 0 0 0-4-4H4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Undo</span>
          </button>

          {/* Quick Action: Tactical Puzzles Mode */}
          {onOpenPuzzles && (
            <button
              type="button"
              data-testid="hud-puzzles-btn"
              onClick={onOpenPuzzles}
              title="Tactical Puzzles (Adaptive Rush)"
              className="h-[46px] px-3 rounded-xl border bg-[#162B21] hover:bg-[#1E3B2D] border-emerald-500/50 text-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 text-xs font-mono font-bold"
            >
              <span>⚡</span>
              <span className="hidden sm:inline">Puzzles</span>
            </button>
          )}

          {/* Quick Action: Save Current Match / Saved Games Modal [S] */}
          {onOpenSavedGames && (
            <button
              type="button"
              data-testid="hud-saved-games-btn"
              onClick={onOpenSavedGames}
              title="Saved Game Sessions & Slots [S]"
              className="w-[46px] h-[46px] rounded-xl border bg-[#212E27] hover:bg-[#2C3D34] border-[#34463C] text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0 relative"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-[#C6923A]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {savedSessionsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#C6923A] text-[#111815] text-[9px] font-mono font-bold flex items-center justify-center">
                  {savedSessionsCount}
                </span>
              )}
            </button>
          )}

          {/* Single Consolidated Options Menu Icon Button */}
          <button
            type="button"
            data-testid="options-menu-button"
            aria-label="Game Options"
            aria-expanded={openPopover === 'options'}
            title="Game Options & Controls"
            onClick={() =>
              handleSetOpenPopover(openPopover === 'options' ? null : 'options')
            }
            className={`w-[46px] h-[46px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              openPopover === 'options'
                ? 'bg-[#C6923A] border-[#C6923A] text-[#111815]'
                : 'bg-[#212E27] hover:bg-[#2C3D34] border-[#34463C] text-[#F4EFE6]'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Anchored Dropdown 1: Move History (SAN) Popover */}
          {openPopover === 'history' && (
            <div
              data-testid="move-history-popover"
              role="dialog"
              aria-label="Move History"
              className="absolute right-0 top-[calc(100%+8px)] w-[320px] sm:w-[360px] bg-[#16201B] border border-[#34463C] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.75)] overflow-hidden z-50"
            >
              <div className="px-3.5 py-2.5 bg-[#121A16] border-b border-[#26342C] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#F4EFE6]">
                    Move History (SAN)
                  </span>
                  <span className="text-[11px] font-mono text-[#A69F91] tabular-nums">
                    · {gameState.moveHistory.length} Plies
                  </span>
                </div>
                {previewPly !== null ? (
                  <button
                    type="button"
                    data-testid="return-to-live-board-btn"
                    onClick={() => onPreviewPly(null)}
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#C6923A]/20 hover:bg-[#C6923A]/30 text-[#C6923A] border border-[#C6923A]/40 transition-colors cursor-pointer"
                  >
                    Return to Live
                  </button>
                ) : (
                  <span className="text-[11px] font-mono text-[#857F72] tabular-nums">
                    50-Move: {Math.floor(gameState.halfMoveClock / 2)}/50
                  </span>
                )}
              </div>

              <div
                ref={moveListRef}
                data-testid="move-history-list"
                className="max-h-[280px] overflow-y-auto p-3 font-mono text-xs space-y-1 tabular-nums"
              >
                {pairedMoves.length === 0 ? (
                  <div className="py-8 text-center text-[#7A7467] text-xs">
                    No moves played yet. Make an opening move on the board.
                  </div>
                ) : (
                  pairedMoves.map((row) => {
                    const whitePlyIndex = findMovePlyIndex(
                      gameState.moveHistory,
                      row.turnNumber,
                      'w'
                    );
                    const blackPlyIndex = findMovePlyIndex(
                      gameState.moveHistory,
                      row.turnNumber,
                      'b'
                    );
                    const isWhiteActive =
                      previewPly !== null && previewPly === whitePlyIndex;
                    const isBlackActive =
                      previewPly !== null && previewPly === blackPlyIndex;

                    return (
                      <div
                        key={row.turnNumber}
                        className="grid grid-cols-7 items-center py-0.5 px-2 rounded odd:bg-[#1B2721] text-[#F4EFE6] gap-1"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (whitePlyIndex !== -1) {
                              onPreviewPly(whitePlyIndex);
                            }
                          }}
                          title={`Preview turn ${row.turnNumber}`}
                          className="col-span-1 text-[#857F72] hover:text-[#C6923A] text-left font-mono text-xs cursor-pointer transition-colors"
                        >
                          {row.turnNumber}.
                        </button>
                        {row.whiteSan ? (
                          <button
                            type="button"
                            data-testid={`history-cell-${row.turnNumber}-w`}
                            onClick={() => {
                              onPreviewPly(whitePlyIndex);
                            }}
                            title={`Preview board after ${row.turnNumber}. ${row.whiteSan}`}
                            className={`col-span-3 py-1 px-2 rounded font-semibold text-left transition-colors cursor-pointer truncate ${
                              isWhiteActive
                                ? 'bg-[#C6923A] text-[#111815] font-bold shadow-xs'
                                : 'hover:bg-[#25352C] text-[#F4EFE6]'
                            }`}
                          >
                            {row.whiteSan}
                          </button>
                        ) : (
                          <span className="col-span-3 px-2 text-[#7A7467]">
                            ...
                          </span>
                        )}
                        {row.blackSan ? (
                          <button
                            type="button"
                            data-testid={`history-cell-${row.turnNumber}-b`}
                            onClick={() => {
                              onPreviewPly(blackPlyIndex);
                            }}
                            title={`Preview board after ${row.turnNumber}... ${row.blackSan}`}
                            className={`col-span-3 py-1 px-2 rounded font-semibold text-left transition-colors cursor-pointer truncate ${
                              isBlackActive
                                ? 'bg-[#C6923A] text-[#111815] font-bold shadow-xs'
                                : 'hover:bg-[#25352C] text-[#C6BFA8]'
                            }`}
                          >
                            {row.blackSan}
                          </button>
                        ) : (
                          <span className="col-span-3 px-2 text-[#7A7467]" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Anchored Dropdown 2: Consolidated Options & Game Controls Popover */}
          {openPopover === 'options' && (
            <div
              data-testid="options-menu-popover"
              role="dialog"
              aria-label="Game Options Menu"
              className="absolute right-0 top-[calc(100%+8px)] w-[310px] sm:w-[336px] bg-[#16201B] border border-[#34463C] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.75)] p-3.5 space-y-3 z-50"
            >
              <div className="flex items-center justify-between border-b border-[#26342C] pb-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#F4EFE6]">
                  Match Options & Controls
                </span>
                <span className="text-[10px] font-mono text-[#A69F91]">
                  Shortcuts Active
                </span>
              </div>

              {/* Section 0: AI Engine Strength & Customizer (when vs. AI) */}
              {gameMode === 'ai' && engineProfile && (
                <div className="p-2.5 rounded-lg bg-[#121A16] border border-[#26342C] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#A69F91]">
                      AI Rating ({profileSummary?.title})
                    </span>
                    <span className="text-xs font-mono font-bold text-[#C6923A] tabular-nums">
                      {engineProfile.elo} Elo · {profileSummary?.depthBadge}
                    </span>
                  </div>
                  {onChangeElo && (
                    <input
                      type="range"
                      min={MIN_ENGINE_ELO}
                      max={MAX_ENGINE_ELO}
                      step={25}
                      value={engineProfile.elo}
                      data-testid="options-elo-slider"
                      onChange={(e) => onChangeElo(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#25352C] rounded-lg appearance-none cursor-pointer accent-[#C6923A]"
                    />
                  )}
                  {onOpenCustomizer && (
                    <button
                      type="button"
                      data-testid="options-open-customizer-btn"
                      onClick={() => {
                        setOpenPopover(null);
                        onOpenCustomizer();
                      }}
                      className="w-full h-7 px-2.5 rounded bg-[#212E27] hover:bg-[#2B3B32] border border-[#C6923A]/40 text-[11px] font-semibold text-[#EADBC8] flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <span>Customize AI Engine & Profiles</span>
                      <span className="text-[10px] font-mono text-[#C6923A]">
                        Tune ⚙
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* Section 1: Board & Match Setup */}
              <div className="space-y-1.5">
                {onOpenPuzzles && (
                  <button
                    type="button"
                    data-testid="options-puzzles-btn"
                    onClick={() => {
                      setOpenPopover(null);
                      onOpenPuzzles();
                    }}
                    className="w-full h-8 px-3 rounded-lg bg-[#162B21] hover:bg-[#1E3B2D] border border-emerald-500/50 text-xs font-semibold text-emerald-300 hover:text-emerald-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>⚡</span>
                      <span>Tactical Puzzles Mode</span>
                    </span>
                    <span className="text-[10px] font-mono px-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Adaptive
                    </span>
                  </button>
                )}

                {onOpenSavedGames && (
                  <button
                    type="button"
                    data-testid="options-saved-games-btn"
                    onClick={() => {
                      setOpenPopover(null);
                      onOpenSavedGames();
                    }}
                    className="w-full h-8 px-3 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#EADBC8] hover:text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="text-[#C6923A]">📁</span>
                      <span>Saved Game Sessions</span>
                    </span>
                    <span className="text-[10px] font-mono text-[#C6923A] font-bold">
                      {savedSessionsCount > 0 ? `${savedSessionsCount} Slots` : '[S]'}
                    </span>
                  </button>
                )}

                {onOpenGameReview && (
                  <button
                    type="button"
                    data-testid="options-game-review-btn"
                    onClick={() => {
                      setOpenPopover(null);
                      onOpenGameReview();
                    }}
                    className="w-full h-8 px-3 rounded-lg bg-[#162B21] hover:bg-[#1E3B2D] border border-emerald-500/50 text-xs font-semibold text-emerald-300 hover:text-emerald-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>📊</span>
                      <span>Review Match & Accuracies</span>
                    </span>
                    <span className="text-[10px] font-mono px-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Report
                    </span>
                  </button>
                )}

                {onCopyFen && (
                  <button
                    type="button"
                    data-testid="options-copy-fen-btn"
                    onClick={() => {
                      setOpenPopover(null);
                      onCopyFen();
                    }}
                    className="w-full h-8 px-3 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#EADBC8] hover:text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>📋</span>
                      <span>Copy Position (FEN)</span>
                    </span>
                    <span className="text-[10px] font-mono text-[#A69F91]">
                      Clip
                    </span>
                  </button>
                )}

                {onCopyPgn && (
                  <button
                    type="button"
                    data-testid="options-copy-pgn-btn"
                    onClick={() => {
                      setOpenPopover(null);
                      onCopyPgn();
                    }}
                    className="w-full h-8 px-3 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#EADBC8] hover:text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>📜</span>
                      <span>Copy Match (PGN)</span>
                    </span>
                    <span className="text-[10px] font-mono text-[#A69F91]">
                      PGN
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onFlipBoard();
                    setOpenPopover(null);
                  }}
                  className="w-full h-8 px-3 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>
                    Flip Board ({isFlipped ? 'Black Bottom' : 'White Bottom'})
                  </span>
                  <span className="text-[10px] font-mono text-[#A69F91]">
                    [F]
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onTogglePlayAsColor(playerColor === 'w' ? 'b' : 'w');
                    setOpenPopover(null);
                  }}
                  className="w-full h-8 px-3 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>
                    {playerColor === 'w' ? 'Play as Black' : 'Play as White'}
                  </span>
                  <span className="text-[10px] font-mono text-[#C6923A]">
                    New Match
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onToggleGameMode(
                      gameMode === 'ai' ? 'pass_and_play' : 'ai'
                    );
                    setOpenPopover(null);
                  }}
                  className="w-full h-8 px-3 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>
                    {gameMode === 'ai' ? 'Mode: vs. AI' : 'Mode: 2-Player'}
                  </span>
                  <span className="text-[10px] font-mono text-[#A69F91]">
                    Switch
                  </span>
                </button>
              </div>

              {/* Section 2: Coach & Telemetry Toggles */}
              <div className="pt-2 border-t border-[#26342C] space-y-1.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={helperMode}
                  onClick={onToggleHelperMode}
                  className="w-full h-8 px-3 rounded-lg bg-[#1C2822] hover:bg-[#25352C] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>Helper Mode: {helperMode ? 'ON' : 'OFF'}</span>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      helperMode ? 'text-[#4ADE80]' : 'text-[#A69F91]'
                    }`}
                  >
                    [H]
                  </span>
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={showBoardSuggestions}
                  onClick={onToggleBoardSuggestions}
                  className="w-full h-8 px-3 rounded-lg bg-[#1C2822] hover:bg-[#25352C] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>
                    Board Suggestions: {showBoardSuggestions ? 'ON' : 'OFF'}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      showBoardSuggestions ? 'text-[#C6923A]' : 'text-[#A69F91]'
                    }`}
                  >
                    [B]
                  </span>
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={showEngineStats}
                  data-testid="engine-stats-toggle"
                  onClick={onToggleEngineStats}
                  className="w-full h-8 px-3 rounded-lg bg-[#1C2822] hover:bg-[#25352C] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>Engine Stats: {showEngineStats ? 'ON' : 'OFF'}</span>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      showEngineStats ? 'text-[#C6923A]' : 'text-[#A69F91]'
                    }`}
                  >
                    {showEngineStats ? 'Visible' : 'Hidden'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleMute}
                  className="w-full h-8 px-3 rounded-lg bg-[#1C2822] hover:bg-[#25352C] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>{isMuted ? 'Unmute Audio' : 'Mute Audio'}</span>
                  <span className="text-[10px] font-mono text-[#A69F91]">
                    [M]
                  </span>
                </button>
              </div>

              {/* Section 3: Pause & New Game */}
              <div className="pt-2 border-t border-[#26342C] grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenPopover(null);
                    onOpenPause();
                  }}
                  className="h-8 px-3 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer"
                >
                  Pause [P]
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenPopover(null);
                    onNewGame();
                  }}
                  className="h-8 px-3 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-xs font-bold text-[#111815] transition-colors cursor-pointer"
                >
                  New Game [R]
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

/* ============================================================================
 * 2. WIDE, THIN WHITE vs. BLACK PLAYER STRIP BELOW THE BOARD
 * Displays Turn Indicator, Check Alert, Captured Pieces, and Material Balance
 * ========================================================================== */
interface PlayerRackSegmentProps {
  color: Color;
  label: string;
  isActiveTurn: boolean;
  isInCheck: boolean;
  capturedPieces: PieceType[];
  capturedPieceColor: Color;
  materialAdvantage: number;
}

const PlayerRackSegment: React.FC<PlayerRackSegmentProps> = ({
  color,
  label,
  isActiveTurn,
  isInCheck,
  capturedPieces,
  capturedPieceColor,
  materialAdvantage,
}) => {
  return (
    <div
      className={`h-[44px] flex items-center justify-between px-3 rounded-lg border transition-colors overflow-hidden ${
        isActiveTurn
          ? 'bg-[#1E2B24] border-[#C6923A] shadow-[0_0_0_1px_rgba(198,146,58,0.25)]'
          : 'bg-[#151F1A] border-[#293830]'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border ${
            color === 'w'
              ? 'bg-[#EADBC8] border-[#C6923A] text-[#1A1410]'
              : 'bg-[#1D2125] border-[#525D68] text-[#F4EFE6]'
          }`}
        >
          <span className="text-xs font-bold font-mono">
            {color === 'w' ? 'W' : 'B'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 leading-tight">
            <span className="text-xs font-semibold text-[#F4EFE6] truncate">
              {label}
            </span>
            {isActiveTurn && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#C6923A] font-bold shrink-0">
                · Turn
              </span>
            )}
            {isInCheck && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#F87171] font-bold shrink-0">
                · CHECK
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-0.5 h-3.5 mt-0.5 overflow-hidden"
            aria-label={`Pieces captured by ${color === 'w' ? 'White' : 'Black'}`}
          >
            {capturedPieces.length === 0 ? (
              <span className="text-[10px] text-[#7A7467] font-mono leading-none truncate">
                No captures
              </span>
            ) : (
              capturedPieces.map((pt, i) => (
                <div
                  key={`${pt}-${i}`}
                  className="w-3.5 h-3.5 -ml-0.5 first:ml-0 shrink-0"
                >
                  <ChessPieceSvg type={pt} color={capturedPieceColor} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 pl-2 text-right">
        {materialAdvantage > 0 ? (
          <span className="text-xs font-mono font-bold text-[#C6923A] tabular-nums">
            +{materialAdvantage}
          </span>
        ) : (
          <span className="text-[11px] font-mono text-[#7A7467] tabular-nums">
            Even
          </span>
        )}
      </div>
    </div>
  );
};

export interface UnderBoardPlayerStripProps {
  gameState: GameState;
  gameMode: GameMode;
  playerColor: Color;
  aiDifficulty: AIDifficulty;
  engineProfile?: EngineProfileState;
  previewPly?: number | null;
  totalPlies?: number;
  onPreviewPly?: (ply: number | null) => void;
  onCopyFen?: () => void;
  onCopyPgn?: () => void;
  onOpenGameReview?: () => void;
}

export const UnderBoardPlayerStrip: React.FC<UnderBoardPlayerStripProps> = ({
  gameState,
  gameMode,
  playerColor,
  aiDifficulty,
  engineProfile,
  previewPly = null,
  totalPlies = 0,
  onPreviewPly,
  onCopyFen,
  onCopyPgn,
  onOpenGameReview,
}) => {
  const material = calculateMaterialBalance(gameState.board);
  const whiteAdvantage = Math.max(0, material.diff);
  const blackAdvantage = Math.max(0, -material.diff);
  const activeDiffInfo = getDifficultyInfo(aiDifficulty);
  const profileSummary = engineProfile
    ? describeEngineProfileSummary(engineProfile)
    : null;
  const aiBadge = profileSummary
    ? `${profileSummary.title}`
    : activeDiffInfo.name;

  const whiteLabel =
    gameMode === 'ai'
      ? playerColor === 'w'
        ? 'White (You)'
        : `White (AI · ${aiBadge})`
      : 'White';

  const blackLabel =
    gameMode === 'ai'
      ? playerColor === 'b'
        ? 'Black (You)'
        : `Black (AI · ${aiBadge})`
      : 'Black';

  const isScrubbing = previewPly !== null;
  const currentPly = isScrubbing ? previewPly : totalPlies;
  const canGoBack = currentPly > 0;
  const canGoForward = isScrubbing;

  return (
    <div
      data-testid="under-board-player-strip"
      className="w-full flex flex-col gap-2 shrink-0 select-none"
    >
      <div className="w-full grid grid-cols-2 gap-2.5">
        <PlayerRackSegment
          color="w"
          label={whiteLabel}
          isActiveTurn={
            gameState.status === 'playing' && gameState.turn === 'w'
          }
          isInCheck={gameState.inCheck && gameState.turn === 'w'}
          capturedPieces={gameState.capturedByWhite}
          capturedPieceColor="b"
          materialAdvantage={whiteAdvantage}
        />

        <PlayerRackSegment
          color="b"
          label={blackLabel}
          isActiveTurn={
            gameState.status === 'playing' && gameState.turn === 'b'
          }
          isInCheck={gameState.inCheck && gameState.turn === 'b'}
          capturedPieces={gameState.capturedByBlack}
          capturedPieceColor="w"
          materialAdvantage={blackAdvantage}
        />
      </div>

      {/* Under-Board Move Scrubbing & FEN Export Toolbar */}
      <div
        data-testid="under-board-playback-toolbar"
        className="h-9 px-3 rounded-lg bg-[#141E19] border border-[#26372E] flex items-center justify-between gap-2 text-xs font-mono"
      >
        {/* Playback Scrubbing Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="First Move (Home)"
            aria-label="First Move"
            disabled={!canGoBack || !onPreviewPly}
            onClick={() => onPreviewPly?.(0)}
            className="w-7 h-7 rounded flex items-center justify-center bg-[#1C2822] hover:bg-[#25352C] disabled:opacity-35 disabled:hover:bg-[#1C2822] text-[#EADBC8] transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            |◀
          </button>
          <button
            type="button"
            title="Previous Move (Arrow Left)"
            aria-label="Previous Move"
            disabled={!canGoBack || !onPreviewPly}
            onClick={() => {
              if (onPreviewPly) {
                const next = Math.max(0, currentPly - 1);
                onPreviewPly(next);
              }
            }}
            className="w-7 h-7 rounded flex items-center justify-center bg-[#1C2822] hover:bg-[#25352C] disabled:opacity-35 disabled:hover:bg-[#1C2822] text-[#EADBC8] transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            ◀
          </button>
          <button
            type="button"
            title="Next Move (Arrow Right)"
            aria-label="Next Move"
            disabled={!canGoForward || !onPreviewPly}
            onClick={() => {
              if (onPreviewPly) {
                const next = currentPly + 1;
                onPreviewPly(next >= totalPlies ? null : next);
              }
            }}
            className="w-7 h-7 rounded flex items-center justify-center bg-[#1C2822] hover:bg-[#25352C] disabled:opacity-35 disabled:hover:bg-[#1C2822] text-[#EADBC8] transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            ▶
          </button>
          <button
            type="button"
            title="Live Board (End)"
            aria-label="Live Board"
            disabled={!isScrubbing || !onPreviewPly}
            onClick={() => onPreviewPly?.(null)}
            className="w-7 h-7 rounded flex items-center justify-center bg-[#1C2822] hover:bg-[#25352C] disabled:opacity-35 disabled:hover:bg-[#1C2822] text-[#EADBC8] transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            ▶|
          </button>
        </div>

        {/* Current Status / Ply Indicator */}
        <div className="flex items-center gap-2 text-[11px] truncate">
          {isScrubbing ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[#C6923A] font-bold">
                Reviewing Ply {previewPly} / {totalPlies}
              </span>
              <button
                type="button"
                onClick={() => onPreviewPly?.(null)}
                className="px-1.5 py-0.5 rounded bg-[#C6923A]/20 hover:bg-[#C6923A]/30 text-[#C6923A] text-[10px] uppercase font-bold cursor-pointer"
              >
                Return to Live
              </button>
            </div>
          ) : (
            <span className="text-[#857F72]">
              Live Board · Move {gameState.fullMoveNumber} ({totalPlies} {totalPlies === 1 ? 'ply' : 'plies'})
            </span>
          )}
        </div>

        {/* Action Buttons: FEN, PGN, Review */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onCopyFen && (
            <button
              type="button"
              data-testid="strip-copy-fen-btn"
              title="Copy current board position as FEN string"
              onClick={onCopyFen}
              className="px-2 py-1 rounded bg-[#1C2822] hover:bg-[#283830] border border-[#34463C] text-[11px] font-mono text-[#D6CFC2] hover:text-[#F4EFE6] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span className="text-[#C6923A]">📋</span>
              <span className="hidden sm:inline">FEN</span>
            </button>
          )}

          {onCopyPgn && (
            <button
              type="button"
              data-testid="strip-copy-pgn-btn"
              title="Copy match notation as PGN string"
              onClick={onCopyPgn}
              className="px-2 py-1 rounded bg-[#1C2822] hover:bg-[#283830] border border-[#34463C] text-[11px] font-mono text-[#D6CFC2] hover:text-[#F4EFE6] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span className="text-[#C6923A]">📜</span>
              <span className="hidden sm:inline">PGN</span>
            </button>
          )}

          {onOpenGameReview && (
            <button
              type="button"
              data-testid="strip-review-btn"
              title="Open full game review & move accuracy breakdown"
              onClick={onOpenGameReview}
              className="px-2.5 py-1 rounded bg-[#162B21] hover:bg-[#1E3B2D] border border-emerald-500/50 text-[11px] font-bold font-mono text-emerald-300 hover:text-emerald-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>📊</span>
              <span>Review</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. SPACIOUS TABBED TACTICAL COACH STUDIO (RIGHT PANEL)
 * Separates At-a-Glance Live Tactics from Pause-and-Learn Study & Opening Book
 * ========================================================================== */
function formatSignedPawns(cp: number): string {
  const pawns = cp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export const TacticalCoachPanel: React.FC<{
  gameState: GameState;
  helperMode: boolean;
  showBoardSuggestions: boolean;
  helperAnalysis: TacticsAnalysis | null;
  openingAnalysis: OpeningAnalysisResult;
  openingPrinciplesReport?: OpeningPrinciplesReport;
  highlightedHelperRank: 1 | 2 | 3 | null;
  playerColor?: Color;
  onToggleHelperMode: () => void;
  onToggleBoardSuggestions: () => void;
  onHoverHelperRank: (rank: 1 | 2 | 3 | null) => void;
  onPlayRecommendedMove: (rec: RecommendedMove) => void;
}> = ({
  gameState,
  helperMode,
  showBoardSuggestions,
  helperAnalysis,
  openingAnalysis,
  openingPrinciplesReport,
  highlightedHelperRank,
  playerColor = 'w',
  onToggleHelperMode,
  onToggleBoardSuggestions,
  onHoverHelperRank,
  onPlayRecommendedMove,
}) => {
  const [activeTab, setActiveTab] = useState<'tactics' | 'principles' | 'opening'>('tactics');

  // Preserve last valid analysis during AI calculation so the Coach Studio never collapses or flickers
  const cachedAnalysisRef = useRef<TacticsAnalysis | null>(null);
  if (helperAnalysis) {
    cachedAnalysisRef.current = helperAnalysis;
  }
  const displayAnalysis = helperAnalysis ?? cachedAnalysisRef.current;

  const threatsList = displayAnalysis
    ? Array.from(displayAnalysis.threatenedPieces.values())
    : [];
  const criticalThreats = threatsList.filter((t) => t.level === 'critical');
  const highThreats = threatsList.filter((t) => t.level === 'high');

  const activeCoachRec: RecommendedMove | undefined =
    displayAnalysis?.topMoves.find(
      (m) => m.rank === (highlightedHelperRank ?? 1)
    ) ?? displayAnalysis?.topMoves[0];

  const opponentThreat = displayAnalysis?.opponentThreat ?? null;
  const turnDelta = describeTurnDelta(gameState);
  const isMiddlegamePhase = openingAnalysis.phase === 'middlegame_plan';
  const breakdown = displayAnalysis?.evalBreakdown;

  return (
    <aside
      data-testid="helper-mode-panel"
      className="flex-1 w-full lg:max-w-[540px] xl:max-w-[580px] min-h-0 flex flex-col bg-[#16201B] border border-[#2C3A33] rounded-xl p-4 sm:p-5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] gap-3 overflow-y-auto"
    >
      {/* Top Row: Coach Title, Deep Engine Badge & Helper Mode + Board Suggestions Switches */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#26342C] pb-2.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <h2
            className="text-base sm:text-lg font-bold tracking-tight text-[#F4EFE6] whitespace-nowrap"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Tactical Coach
          </h2>
          {helperMode && displayAnalysis && (
            <span
              data-testid="coach-engine-depth-badge"
              className="text-[11px] font-mono text-[#C6923A] font-semibold whitespace-nowrap tabular-nums"
              title={`64-bit Zobrist Multi-PV + NMP + LMR + Quiescence Checks (${displayAnalysis.searchNodes.toLocaleString()} nodes, ${displayAnalysis.ttHits.toLocaleString()} TT hits in ${displayAnalysis.elapsedMs}ms · Phase ${displayAnalysis.evalBreakdown.gamePhase}/24)`}
            >
              · {displayAnalysis.searchDepth}p+Q
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={helperMode}
            data-testid="helper-mode-toggle"
            onClick={onToggleHelperMode}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
              helperMode
                ? 'bg-[#16A34A]/20 border-[#22C55E] text-[#4ADE80]'
                : 'bg-[#1D2822] border-[#34463C] text-[#A69F91] hover:text-[#F4EFE6]'
            }`}
          >
            Helper Mode: {helperMode ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={showBoardSuggestions}
            data-testid="board-suggestions-toggle"
            onClick={onToggleBoardSuggestions}
            title="Show or hide move suggestion arrows and badges on the chessboard"
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
              !helperMode
                ? 'bg-[#17201B] border-[#26342C] text-[#6E6A5F]'
                : showBoardSuggestions
                ? 'bg-[#C6923A]/20 border-[#C6923A] text-[#F4EFE6]'
                : 'bg-[#1D2822] border-[#34463C] text-[#A69F91] hover:text-[#F4EFE6]'
            }`}
          >
            Board Suggestions: {showBoardSuggestions ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Turn Delta + Live Opponent Threat Predictor Strip */}
      <div
        data-testid="coach-what-changed-banner"
        className="bg-[#121A16] border border-[#26342C] rounded-xl px-3.5 py-2 shrink-0 space-y-1"
      >
        <div className="flex items-center justify-between gap-2 text-xs font-mono">
          <span className="font-bold text-[#C6923A]">{turnDelta.badge}</span>
          <span className="text-[#857F72] tabular-nums">
            {helperMode && displayAnalysis
              ? `${displayAnalysis.evalBreakdown.phaseLabel} · ${displayAnalysis.searchNodes.toLocaleString()}n (${displayAnalysis.ttHits.toLocaleString()} TT)`
              : 'What Changed This Turn'}
          </span>
        </div>
        <p className="text-xs sm:text-sm font-semibold text-[#F4EFE6] leading-snug">
          {turnDelta.summary}
        </p>
        {helperMode && opponentThreat ? (
          <div
            data-testid="coach-opponent-threat"
            data-threat-severity={opponentThreat.severity}
            className="flex items-center justify-between gap-2 pt-0.5 text-xs font-mono"
          >
            <span
              className={`truncate font-semibold ${
                opponentThreat.severity === 'critical'
                  ? 'text-[#F87171]'
                  : opponentThreat.severity === 'high'
                  ? 'text-[#FBBF24]'
                  : 'text-[#A69F91]'
              }`}
              title={
                opponentThreat.continuationLine
                  ? `${opponentThreat.detail} (Threat line: ${opponentThreat.continuationLine})`
                  : opponentThreat.detail
              }
            >
              {opponentThreat.headline}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[#857F72] shrink-0">
              {opponentThreat.severity === 'critical'
                ? 'Counter Now'
                : opponentThreat.severity === 'high'
                ? 'Watch Reply'
                : 'Next Plan'}
            </span>
          </div>
        ) : (
          <p className="text-xs text-[#A69F91] leading-snug">
            {turnDelta.detail}
          </p>
        )}
      </div>

      {/* Tabbed Navigation: Live Tactics vs. Opening Principles vs. Opening Strategy */}
      <div
        role="tablist"
        aria-label="Coach Study Views"
        className="grid grid-cols-3 gap-1 p-1 bg-[#121A16] border border-[#24332B] rounded-xl shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tactics'}
          data-testid="coach-tab-tactics"
          onClick={() => setActiveTab('tactics')}
          className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
            activeTab === 'tactics'
              ? 'bg-[#C6923A] text-[#111815] font-bold shadow-xs'
              : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#1B2721]'
          }`}
        >
          <span>Tactics</span>
          <span
            className={`text-[10px] font-mono ${
              activeTab === 'tactics' ? 'text-[#111815]/80' : 'text-[#857F72]'
            }`}
          >
            · Top 3
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'principles'}
          data-testid="coach-tab-principles"
          onClick={() => setActiveTab('principles')}
          className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
            activeTab === 'principles'
              ? 'bg-[#C6923A] text-[#111815] font-bold shadow-xs'
              : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#1B2721]'
          }`}
        >
          <span>Principles</span>
          <span
            className={`text-[10px] font-mono font-bold ${
              activeTab === 'principles'
                ? 'text-[#111815]/90'
                : 'text-[#22C55E]'
            }`}
          >
            · {openingPrinciplesReport?.grade ?? 'Guide'}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'opening'}
          data-testid="coach-tab-opening"
          onClick={() => setActiveTab('opening')}
          className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
            activeTab === 'opening'
              ? 'bg-[#C6923A] text-[#111815] font-bold shadow-xs'
              : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#1B2721]'
          }`}
        >
          <span>ECO Book</span>
          <span
            className={`text-[10px] font-mono ${
              activeTab === 'opening' ? 'text-[#111815]/80' : 'text-[#857F72]'
            }`}
          >
            · {openingAnalysis.eco}
          </span>
        </button>
      </div>

      {!helperMode ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#121A16] border border-[#24332B] rounded-xl space-y-3">
          <p className="text-sm font-semibold text-[#F4EFE6]">
            Helper Mode is Currently Off
          </p>
          <p className="text-xs text-[#A69F91] max-w-sm leading-relaxed">
            You are playing in standard tournament view without board arrows or
            move recommendations. Press <kbd className="font-mono text-[#EADBC8]">[H]</kbd> or
            click below whenever you want live coaching.
          </p>
          <button
            type="button"
            onClick={onToggleHelperMode}
            className="px-4 py-2 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-xs font-bold text-[#111815] transition-colors cursor-pointer"
          >
            Enable Tactical Coach
          </button>
        </div>
      ) : activeTab === 'tactics' ? (
        /* ====================================================================
         * TAB 1: LIVE TACTICS (AT-A-GLANCE TOP MOVES + PAUSE-AND-LEARN BOX)
         * ================================================================== */
        <div
          className={`flex-1 min-h-0 flex flex-col justify-between gap-2.5 transition-opacity duration-150 ${
            !helperAnalysis ? 'opacity-65' : 'opacity-100'
          }`}
        >
          {/* Opening Milestone Quick Link Banner (Active during first 12 moves) */}
          {openingPrinciplesReport && gameState.fullMoveNumber <= 12 && (
            <button
              type="button"
              data-testid="coach-opening-milestone-pill"
              onClick={() => setActiveTab('principles')}
              className="w-full px-3 py-1.5 rounded-lg bg-[#141D18] hover:bg-[#1A2620] border border-[#273B2F] flex items-center justify-between text-xs transition-colors cursor-pointer shrink-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-[#C6923A] text-xs font-bold">♔ Opening Milestone:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  Grade {openingPrinciplesReport.grade} ({openingPrinciplesReport.overallScore}%)
                </span>
              </div>
              <span className="text-xs text-[#C6923A] font-semibold hover:underline">
                Milestones →
              </span>
            </button>
          )}

          {/* Section A: At a Glance — Top 3 Recommended Moves with Deep Eval & Win% */}
          <div className="space-y-1.5 shrink-0">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#A69F91]">
              <span>MULTI-PV CANDIDATE MOVES (EVAL · WIN%)</span>
              <span>Hover to preview · Click to play</span>
            </div>

            <div
              data-testid="helper-recommendations-list"
              className="space-y-1.5"
            >
              {([1, 2, 3] as const).map((rank) => {
                const rec = displayAnalysis?.topMoves.find(
                  (m) => m.rank === rank
                );
                const rankLabel =
                  rank === 1 ? '#1 Best' : rank === 2 ? '#2 Alt' : '#3 Option';
                const rankColor =
                  rank === 1
                    ? 'text-[#22C55E]'
                    : rank === 2
                    ? 'text-[#06B6D4]'
                    : 'text-[#60A5FA]';
                const isHighlighted =
                  (highlightedHelperRank ?? 1) === rank && Boolean(rec);

                if (!rec) {
                  const hasMateInOne =
                    (displayAnalysis?.topMoves[0]?.score ?? 0) >= 90000;
                  return (
                    <div
                      key={`empty-slot-${rank}`}
                      data-testid={`helper-empty-slot-${rank}`}
                      className="py-2 px-3.5 rounded-xl bg-[#121A16]/60 border border-[#223028] flex items-center text-xs font-mono text-[#6E6A5F]"
                    >
                      {hasMateInOne && rank === 2
                        ? '#2 — Forced Checkmate in 1 Found Above (#1)'
                        : `#${rank} — No additional candidate move`}
                    </div>
                  );
                }

                const evalColor =
                  rec.formattedEval.startsWith('+') ||
                  rec.formattedEval.startsWith('M')
                    ? 'text-[#4ADE80]'
                    : rec.formattedEval.startsWith('-')
                    ? 'text-[#F87171]'
                    : 'text-[#EADBC8]';

                return (
                  <button
                    key={`slot-${rank}`}
                    type="button"
                    data-testid={`helper-rec-item-${rec.rank}`}
                    disabled={!helperAnalysis}
                    onMouseEnter={() => onHoverHelperRank(rec.rank)}
                    onMouseLeave={() => onHoverHelperRank(null)}
                    onFocus={() => onHoverHelperRank(rec.rank)}
                    onBlur={() => onHoverHelperRank(null)}
                    onClick={() => {
                      if (helperAnalysis) onPlayRecommendedMove(rec);
                    }}
                    className={`w-full text-left py-2 px-3.5 rounded-xl flex items-center justify-between gap-2.5 transition-colors cursor-pointer border ${
                      isHighlighted
                        ? 'bg-[#1F2E26] border-[#C6923A] shadow-xs'
                        : 'bg-[#121A16] border-[#24332B] hover:border-[#3A5044]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`text-xs font-mono font-bold shrink-0 ${rankColor}`}
                      >
                        {rankLabel}
                      </span>
                      <span className="text-sm font-mono font-bold text-[#F4EFE6] shrink-0">
                        {rec.san}
                      </span>
                      <span
                        className="text-[#56635B] shrink-0"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="text-xs sm:text-sm text-[#D6CFC2] font-medium truncate">
                        {rec.headline}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono text-xs tabular-nums">
                      <span
                        data-testid={`helper-rec-eval-${rec.rank}`}
                        className={`font-bold ${evalColor}`}
                        title={`Engine Evaluation: ${rec.formattedEval} · Win Probability: ${rec.winProb}%`}
                      >
                        {rec.formattedEval}
                      </span>
                      <span className="text-[11px] text-[#A69F91]">
                        {rec.winProb}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section B: Pause & Learn — Deep-Dive Tactical & Principal Variation Breakdown */}
          <div
            data-testid="coach-commentary-box"
            className="flex-1 min-h-0 p-3.5 rounded-xl bg-[#121A16] border border-[#26362E] flex flex-col justify-between gap-2"
          >
            {activeCoachRec ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-[#223028] pb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#C6923A] truncate">
                        Move #{activeCoachRec.rank} ({activeCoachRec.san})
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#4ADE80] shrink-0">
                        · {activeCoachRec.tacticalMotif}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-[#A69F91] tabular-nums shrink-0">
                      Eval {activeCoachRec.formattedEval} · {activeCoachRec.winProb}% Win
                    </span>
                  </div>

                  {/* Why It Works */}
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#857F72]">
                      Why This Move Works
                    </span>
                    <p className="text-xs sm:text-sm leading-snug text-[#F4EFE6] font-medium">
                      {activeCoachRec.coachWhy}
                    </p>
                  </div>

                  {/* Next-Turn Follow-Up & Principal Variation Line */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#857F72]">
                        Principal Variation & Follow-Up Plan
                      </span>
                      {activeCoachRec.pvFormatted && (
                        <span
                          data-testid="coach-pv-line"
                          className="text-[11px] font-mono text-[#C6923A] truncate tabular-nums"
                        >
                          PV: {activeCoachRec.pvFormatted}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm leading-snug text-[#D6CFC2]">
                      {activeCoachRec.followUpPlan}
                    </p>
                  </div>

                  {/* 3-Step Visual Calculation Sequence */}
                  {activeCoachRec.opponentReply && (
                    <div className="grid grid-cols-3 gap-2 pt-0.5">
                      <div className="p-2 rounded-lg bg-[#17211C] border border-[#26342C] flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono uppercase text-[#22C55E]">
                          1. Your Move
                        </span>
                        <span className="text-xs sm:text-sm font-mono font-bold text-[#F4EFE6] tabular-nums">
                          {activeCoachRec.san}
                        </span>
                        <span className="text-[11px] font-mono text-[#857F72] tabular-nums">
                          {activeCoachRec.from} → {activeCoachRec.to}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-[#17211C] border border-[#26342C] flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono uppercase text-[#F59E0B]">
                          2. Best Reply
                        </span>
                        <span className="text-xs sm:text-sm font-mono font-bold text-[#F4EFE6] tabular-nums">
                          ...{activeCoachRec.opponentReply.san}
                        </span>
                        <span className="text-[11px] font-mono text-[#857F72] tabular-nums">
                          {activeCoachRec.opponentReply.from} →{' '}
                          {activeCoachRec.opponentReply.to}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-[#17211C] border border-[#26342C] flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono uppercase text-[#60A5FA]">
                          3. Follow-Up
                        </span>
                        <span className="text-xs sm:text-sm font-mono font-bold text-[#F4EFE6] tabular-nums">
                          {activeCoachRec.playerFollowUp
                            ? activeCoachRec.playerFollowUp.san
                            : 'Consolidate'}
                        </span>
                        <span className="text-[11px] font-mono text-[#857F72] tabular-nums">
                          {activeCoachRec.playerFollowUp
                            ? `${activeCoachRec.playerFollowUp.from} → ${activeCoachRec.playerFollowUp.to}`
                            : 'Center / King'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tapered Evaluation Breakdown + Piece Safety Audit & Opening Link */}
                <div className="space-y-1.5 pt-1.5 border-t border-[#223028]">
                  {breakdown && (
                    <div
                      data-testid="coach-tapered-breakdown"
                      className="grid grid-cols-4 gap-1.5 text-[11px] font-mono tabular-nums"
                    >
                      <div className="px-2 py-1 rounded bg-[#17211C] border border-[#24332B] flex items-center justify-between">
                        <span className="text-[#857F72]">Mat</span>
                        <span className="text-[#F4EFE6] font-semibold">
                          {formatSignedPawns(breakdown.material)}
                        </span>
                      </div>
                      <div className="px-2 py-1 rounded bg-[#17211C] border border-[#24332B] flex items-center justify-between">
                        <span className="text-[#857F72]">Act</span>
                        <span className="text-[#F4EFE6] font-semibold">
                          {formatSignedPawns(
                            breakdown.mobility + breakdown.pieceSquareTables
                          )}
                        </span>
                      </div>
                      <div className="px-2 py-1 rounded bg-[#17211C] border border-[#24332B] flex items-center justify-between">
                        <span className="text-[#857F72]">Pawn</span>
                        <span className="text-[#F4EFE6] font-semibold">
                          {formatSignedPawns(breakdown.pawnStructure)}
                        </span>
                      </div>
                      <div className="px-2 py-1 rounded bg-[#17211C] border border-[#24332B] flex items-center justify-between">
                        <span className="text-[#857F72]">King</span>
                        <span className="text-[#F4EFE6] font-semibold">
                          {formatSignedPawns(breakdown.kingSafety)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="text-[#857F72]">Board Safety Audit:</span>
                    {criticalThreats.length > 0 ? (
                      <span className="text-[#F87171] font-semibold truncate">
                        Hanging:{' '}
                        {criticalThreats
                          .map(
                            (t) => `${PIECE_NAMES[t.piece.type]} on ${t.square}`
                          )
                          .join(', ')}
                      </span>
                    ) : highThreats.length > 0 ? (
                      <span className="text-[#FB923C] font-semibold truncate">
                        Exchange Risk:{' '}
                        {highThreats
                          .map(
                            (t) => `${PIECE_NAMES[t.piece.type]} on ${t.square}`
                          )
                          .join(', ')}
                      </span>
                    ) : (
                      <span className="text-[#34D399]">
                        All friendly pieces defended
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[#A69F91] truncate">
                      Opening:{' '}
                      <strong className="text-[#D6CFC2]">
                        {openingAnalysis.fullTitle}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('opening')}
                      className="text-xs font-mono font-semibold text-[#C6923A] hover:underline shrink-0 cursor-pointer"
                    >
                      Study Opening →
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs font-mono text-[#7A7467]">
                Evaluating tactical plans...
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'principles' ? (
        /* ====================================================================
         * TAB 2: LIVE OPENING PRINCIPLES CHECKLIST & MILESTONES
         * ================================================================== */
        <div className="flex-1 min-h-0 flex flex-col justify-between overflow-y-auto pr-1 space-y-3">
          {openingPrinciplesReport ? (
            <OpeningPrinciplesHud
              report={openingPrinciplesReport}
              playerColor={playerColor}
            />
          ) : (
            <div className="p-6 text-center text-xs text-[#A69F91]">
              Opening principles are actively monitored during the first 12 moves.
            </div>
          )}

          <div className="p-3 rounded-xl bg-[#121A16] border border-[#24332B] flex items-center justify-between gap-2 text-xs">
            <span className="text-[#A69F91]">Looking for tactical advice?</span>
            <button
              type="button"
              onClick={() => setActiveTab('tactics')}
              className="text-xs font-mono font-semibold text-[#C6923A] hover:underline cursor-pointer"
            >
              ← Back to Live Tactics
            </button>
          </div>
        </div>
      ) : (
        /* ====================================================================
         * TAB 3: OPENING & STRATEGY STUDY (FULL SPACIOUS VIEW)
         * ================================================================== */
        <div
          data-testid="opening-coach-box"
          data-opening-phase={openingAnalysis.phase}
          className="flex-1 min-h-0 flex flex-col justify-between gap-3"
        >
          <div className="space-y-3">
            {/* Card 1: Opening Title, ECO Code & Variation Line */}
            <div className="p-3.5 rounded-xl bg-[#121A16] border border-[#26362E] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#A69F91]">
                  {isMiddlegamePhase
                    ? 'Middlegame Strategic Transition'
                    : 'FIDE ECO Opening Classification'}
                </span>
                <span
                  data-testid="opening-coach-progress"
                  className={`text-xs font-mono font-semibold tabular-nums ${
                    openingAnalysis.isTransposition
                      ? 'text-[#38BDF8]'
                      : isMiddlegamePhase
                      ? 'text-[#34D399]'
                      : 'text-[#C6923A]'
                  }`}
                >
                  {openingAnalysis.moveProgressLabel}
                </span>
              </div>

              <h3
                data-testid="opening-coach-title"
                className="text-base sm:text-lg font-bold text-[#F4EFE6] leading-snug"
              >
                {openingAnalysis.fullTitle}
              </h3>

              <div
                data-testid="opening-coach-variation"
                className="text-xs sm:text-sm font-mono text-[#C6BFA8] leading-relaxed pt-1 border-t border-[#223028]"
              >
                {openingAnalysis.variation}
              </div>
            </div>

            {/* Card 2: Structural Strengths & Key Themes */}
            <div className="p-3.5 rounded-xl bg-[#121A16] border border-[#26362E] space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#C6923A] font-semibold">
                {isMiddlegamePhase
                  ? 'Active Structural Priorities'
                  : 'Key Opening Strengths & Themes'}
              </span>
              <p
                data-testid="opening-coach-strengths"
                className="text-xs sm:text-sm leading-relaxed text-[#F4EFE6] font-medium"
              >
                {openingAnalysis.strengths}
              </p>
            </div>

            {/* Card 3: Grandmaster Study Commentary */}
            <div className="p-3.5 rounded-xl bg-[#121A16] border border-[#26362E] space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#A69F91] font-semibold">
                Grandmaster Strategic Commentary
              </span>
              <p
                data-testid="opening-coach-commentary"
                className="text-xs sm:text-sm leading-relaxed text-[#D6CFC2]"
              >
                {openingAnalysis.commentary}
              </p>
            </div>

            {/* Card 4: Classical Opening & Middlegame Principles Guide */}
            <div className="p-3.5 rounded-xl bg-[#121A16] border border-[#26362E] space-y-1.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#857F72] font-semibold">
                Classical Study Principles
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-[#17211C] border border-[#24332B]">
                  <div className="text-[#C6923A] font-bold">01. Center</div>
                  <div className="text-[11px] text-[#A69F91] mt-0.5 leading-snug">
                    Contest d4, e4, d5, e5 with pawns & knights
                  </div>
                </div>
                <div className="p-2 rounded bg-[#17211C] border border-[#24332B]">
                  <div className="text-[#C6923A] font-bold">02. Tempo</div>
                  <div className="text-[11px] text-[#A69F91] mt-0.5 leading-snug">
                    Develop Knights & Bishops before Queen
                  </div>
                </div>
                <div className="p-2 rounded bg-[#17211C] border border-[#24332B]">
                  <div className="text-[#C6923A] font-bold">03. Safety</div>
                  <div className="text-[11px] text-[#A69F91] mt-0.5 leading-snug">
                    Castle early & connect Rooks on open files
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer: Quick Switch Back to Live Tactics */}
          <div className="p-3 rounded-xl bg-[#121A16] border border-[#24332B] flex items-center justify-between gap-2 text-xs">
            <span className="text-[#A69F91]">
              Ready to calculate your next move?
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('tactics')}
              className="text-xs font-mono font-semibold text-[#C6923A] hover:underline cursor-pointer"
            >
              ← Back to Live Tactics
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
