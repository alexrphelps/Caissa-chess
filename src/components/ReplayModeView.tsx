import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FlipVertical2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Swords,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { calculateMaterialBalance } from '../chess/engine';
import { describeEngineProfileSummary } from '../chess/evaluation';
import { ParsedPgnGame, TimelineNode } from '../chess/pgnTypes';
import { Color, EngineProfileState, Square } from '../chess/types';
import {
  computeBoardGridSize,
  DEFAULT_UI_LAYOUT_PREFERENCES,
  UILayoutPreferences,
} from '../utils/layoutMath';
import { soundFX } from '../utils/sound';
import { ChessBoard } from './ChessBoard';
import { ChessPieceSvg } from './ChessPieceSvg';

interface ReplayModeViewProps {
  game: ParsedPgnGame;
  initialPly?: number;
  engineProfile: EngineProfileState;
  isMuted: boolean;
  uiPrefs?: UILayoutPreferences;
  isAnyModalOpen?: boolean;
  onToggleMute: () => void;
  onUpdateUiPrefs?: (
    patch: Partial<UILayoutPreferences>,
    persist?: boolean
  ) => void;
  onOpenLibrary: () => void;
  onOpenBoardCustomizer: () => void;
  onOpenEngineCustomizer: () => void;
  onContinuePlayFromHere: (
    ply: number,
    chosenPlayerColor: Color,
    shouldFlip: boolean
  ) => void;
  onExit: () => void;
}

interface PairedReplayRow {
  turnNumber: number;
  whiteNode?: TimelineNode;
  blackNode?: TimelineNode;
}

const SPEED_PRESETS: { label: string; ms: number }[] = [
  { label: '1x', ms: 1200 },
  { label: '2x', ms: 600 },
];

export const ReplayModeView: React.FC<ReplayModeViewProps> = ({
  game,
  initialPly = 0,
  engineProfile,
  isMuted,
  uiPrefs = DEFAULT_UI_LAYOUT_PREFERENCES,
  isAnyModalOpen = false,
  onToggleMute,
  onUpdateUiPrefs,
  onOpenLibrary,
  onOpenBoardCustomizer,
  onOpenEngineCustomizer,
  onContinuePlayFromHere,
  onExit,
}) => {
  const maxPly = Math.max(0, game.timeline.length - 1);

  const [currentPly, setCurrentPly] = useState<number>(() =>
    Math.max(0, Math.min(initialPly, maxPly))
  );
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [speedMs, setSpeedMs] = useState<number>(1200);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [colorChoiceForPly, setColorChoiceForPly] = useState<{
    ply: number;
    color: Color;
  } | null>(null);
  const [replayHintToast, setReplayHintToast] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const activeMoveBtnRef = useRef<HTMLButtonElement | null>(null);
  const arenaRef = useRef<HTMLElement | null>(null);

  // Reset ply & auto-play cleanly whenever a different game is loaded
  useEffect(() => {
    const clamped = Math.max(0, Math.min(initialPly, game.timeline.length - 1));
    setCurrentPly(clamped);
    setIsAutoPlaying(false);
    setColorChoiceForPly(null);
  }, [game.id, initialPly, game.timeline.length]);

  const showHintToast = useCallback((msg: string) => {
    setReplayHintToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setReplayHintToast(null);
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Responsive arena measurement for zero-clipping ChessBoard fit
  const [viewportSize, setViewportSize] = useState<{
    width: number;
    height: number;
  }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));
  const [arenaSize, setArenaSize] = useState<{ width: number; height: number }>(
    () => ({
      width: typeof window !== 'undefined' ? window.innerWidth : 1440,
      height:
        typeof window !== 'undefined'
          ? Math.max(420, window.innerHeight - 60)
          : 840,
    })
  );

  useEffect(() => {
    const syncViewport = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    const node = arenaRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const padX =
        (parseFloat(style.paddingLeft) || 0) +
        (parseFloat(style.paddingRight) || 0);
      const padY =
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0);
      const nextWidth = Math.max(300, Math.floor(rect.width - padX));
      const remainingViewportH = Math.max(
        340,
        Math.floor(window.innerHeight - rect.top - padY)
      );
      const boxInnerH = Math.max(340, Math.floor(rect.height - padY));
      const nextHeight =
        window.innerWidth >= 1024 && window.innerHeight >= 540
          ? Math.min(boxInnerH, remainingViewportH)
          : remainingViewportH;

      setArenaSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      );
    };
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const isDesktopSplit = viewportSize.width >= 1024;
  const lockViewportHeight = isDesktopSplit && viewportSize.height >= 540;

  const boardGeometry = useMemo(() => {
    const sidebarWidth = isDesktopSplit ? 430 : 0;
    const gapWidth = isDesktopSplit ? 24 : 0;
    const availW = Math.max(300, arenaSize.width - sidebarWidth - gapWidth);
    return computeBoardGridSize({
      availableWidth: availW,
      availableHeight: arenaSize.height,
      boardScale: uiPrefs.boardScale,
      coordinateStyle: uiPrefs.coordinateStyle,
      showHelperBox: false,
      underBoardStripHeight: 112,
      isStackedLayout: !isDesktopSplit || !lockViewportHeight,
    });
  }, [
    isDesktopSplit,
    lockViewportHeight,
    arenaSize.width,
    arenaSize.height,
    uiPrefs.boardScale,
    uiPrefs.coordinateStyle,
  ]);

  const currentNode = game.timeline[currentPly] ?? game.timeline[0];
  const currentState = currentNode.gameState;
  const activeTurn = currentState.turn;
  const chosenPlayColor: Color =
    colorChoiceForPly && colorChoiceForPly.ply === currentPly
      ? colorChoiceForPly.color
      : activeTurn;
  const isTerminalPosition = currentState.status !== 'playing';
  const engineSummary = describeEngineProfileSummary(engineProfile);

  const playSoundForNode = useCallback((node: TimelineNode | undefined) => {
    if (!node || node.ply === 0) return;
    if (node.flags.checkmate) {
      soundFX.playGameOver(true);
    } else if (node.flags.check) {
      soundFX.playCheck();
    } else if (node.flags.castle) {
      soundFX.playCastle();
    } else if (node.flags.capture) {
      soundFX.playCapture();
    } else {
      soundFX.playMove();
    }
  }, []);

  const jumpToPly = useCallback(
    (nextPly: number, options?: { keepAutoPlay?: boolean; playAudio?: boolean }) => {
      const clamped = Math.max(0, Math.min(nextPly, maxPly));
      if (!options?.keepAutoPlay) {
        setIsAutoPlaying(false);
      }
      setCurrentPly(clamped);
      if (options?.playAudio && clamped > 0) {
        playSoundForNode(game.timeline[clamped]);
      }
    },
    [maxPly, game.timeline, playSoundForNode]
  );

  const stepForward = useCallback(
    (fromAutoPlay = false) => {
      setCurrentPly((prev) => {
        if (prev >= maxPly) {
          if (fromAutoPlay) setIsAutoPlaying(false);
          return prev;
        }
        const next = prev + 1;
        playSoundForNode(game.timeline[next]);
        if (next >= maxPly && fromAutoPlay) {
          setIsAutoPlaying(false);
        }
        return next;
      });
    },
    [maxPly, game.timeline, playSoundForNode]
  );

  const stepBackward = useCallback(() => {
    setIsAutoPlaying(false);
    setCurrentPly((prev) => {
      if (prev <= 0) return 0;
      soundFX.playUndo();
      return prev - 1;
    });
  }, []);

  const toggleAutoPlay = useCallback(() => {
    if (maxPly === 0) return;
    setIsAutoPlaying((prev) => {
      if (!prev && currentPly >= maxPly) {
        // Restart from ply 0 if Play is clicked at the end of the game
        setCurrentPly(0);
      }
      return !prev;
    });
  }, [currentPly, maxPly]);

  // Auto-replay interval timer with clean teardown
  useEffect(() => {
    if (!isAutoPlaying) return;
    if (currentPly >= maxPly) {
      setIsAutoPlaying(false);
      return;
    }

    const intervalId = window.setInterval(() => {
      stepForward(true);
    }, speedMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAutoPlaying, speedMs, currentPly, maxPly, stepForward]);

  // Auto-scroll active move cell into view smoothly
  useEffect(() => {
    if (activeMoveBtnRef.current) {
      activeMoveBtnRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [currentPly]);

  // Keyboard shortcuts: Left/Right step, Up/Home start, Down/End end, Space play/pause, F flip
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isAnyModalOpen) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsAutoPlaying(false);
        stepForward(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBackward();
      } else if (e.key === 'ArrowUp' || e.key === 'Home') {
        e.preventDefault();
        jumpToPly(0);
      } else if (e.key === 'ArrowDown' || e.key === 'End') {
        e.preventDefault();
        jumpToPly(maxPly);
      } else if (e.key === ' ') {
        e.preventDefault();
        toggleAutoPlay();
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFlipped((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isAnyModalOpen,
    stepForward,
    stepBackward,
    jumpToPly,
    maxPly,
    toggleAutoPlay,
  ]);

  // Build two-column move list rows
  const pairedRows = useMemo<PairedReplayRow[]>(() => {
    const rows: PairedReplayRow[] = [];
    for (let i = 1; i < game.timeline.length; i++) {
      const node = game.timeline[i];
      if (node.color === 'w') {
        rows.push({
          turnNumber: node.turnNumber,
          whiteNode: node,
        });
      } else {
        const last = rows[rows.length - 1];
        if (last && last.turnNumber === node.turnNumber && !last.blackNode) {
          last.blackNode = node;
        } else {
          rows.push({
            turnNumber: node.turnNumber,
            blackNode: node,
          });
        }
      }
    }
    return rows;
  }, [game.timeline]);

  const material = useMemo(
    () => calculateMaterialBalance(currentState.board),
    [currentState.board]
  );

  const topColor: Color = isFlipped ? 'w' : 'b';
  const bottomColor: Color = isFlipped ? 'b' : 'w';

  const getPlayerMeta = (color: Color) => ({
    name: color === 'w' ? game.headers.White : game.headers.Black,
    elo: color === 'w' ? game.headers.WhiteElo : game.headers.BlackElo,
    captured:
      color === 'w'
        ? currentState.capturedByWhite
        : currentState.capturedByBlack,
    advantage:
      color === 'w'
        ? material.diff > 0
          ? material.diff
          : 0
        : material.diff < 0
        ? -material.diff
        : 0,
    isTurn: currentState.status === 'playing' && activeTurn === color,
  });

  const topPlayer = getPlayerMeta(topColor);
  const bottomPlayer = getPlayerMeta(bottomColor);

  const terminalReasonLabel = useMemo(() => {
    if (!isTerminalPosition) return null;
    if (currentState.status === 'checkmate') {
      return `Checkmate (${currentState.winner === 'w' ? '1-0' : '0-1'})`;
    }
    if (currentState.status === 'stalemate') {
      return 'Stalemate (1/2-1/2)';
    }
    return 'Game Drawn';
  }, [isTerminalPosition, currentState.status, currentState.winner]);

  const progressPct = maxPly > 0 ? Math.round((currentPly / maxPly) * 100) : 0;

  return (
    <div
      data-testid="replay-mode-view"
      className={`w-full bg-[#111815] text-[#F4EFE6] flex flex-col relative overflow-x-hidden ${
        lockViewportHeight
          ? 'h-dvh overflow-hidden'
          : 'min-h-dvh overflow-y-auto'
      }`}
    >
      {/* Top Bar */}
      <header className="w-full shrink-0 bg-[#151E19] border-b border-[#293830] px-3 sm:px-5 py-2.5 z-30">
        <div className="w-full max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Left: Back & Active Match Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              data-testid="replay-exit-btn"
              onClick={() => {
                setIsAutoPlaying(false);
                onExit();
              }}
              className="h-9 px-3 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#C6923A]" />
              <span>Exit Replay</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1
                  className="text-sm sm:text-base font-bold text-[#F4EFE6] truncate"
                  style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  {game.headers.White} vs. {game.headers.Black}
                </h1>
                <span className="text-xs font-mono font-bold text-[#C6923A] tabular-nums shrink-0">
                  {game.result}
                </span>
              </div>
              <p className="text-[11px] text-[#A69F91] truncate">
                {[
                  game.headers.Event !== '?' ? game.headers.Event : null,
                  game.headers.Date && !game.headers.Date.startsWith('????')
                    ? game.headers.Date.slice(0, 4)
                    : null,
                  game.headers.ECO ? `ECO ${game.headers.ECO}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Master Replay Studio'}
              </p>
            </div>
          </div>

          {/* Right: Library, Board Customizer, Mute */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="replay-open-library-btn"
              onClick={() => {
                setIsAutoPlaying(false);
                onOpenLibrary();
              }}
              className="h-9 px-3.5 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#C6923A]/60 text-xs font-semibold text-[#F4EFE6] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#C6923A]" />
              <span>Library / Import PGN</span>
            </button>

            <button
              type="button"
              aria-label="Customize Board Appearance"
              title="Board Theme & Layout"
              onClick={onOpenBoardCustomizer}
              className="w-9 h-9 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-[#EADBC8] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#C6923A]" />
            </button>

            <button
              type="button"
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              title={isMuted ? 'Unmute audio' : 'Mute audio'}
              onClick={onToggleMute}
              className="w-9 h-9 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-[#EADBC8] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-[#857F72]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#C6923A]" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Split-Pane Replay Arena */}
      <main
        ref={arenaRef}
        className={`flex-1 min-h-0 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-3 flex ${
          isDesktopSplit
            ? 'flex-row items-stretch justify-center gap-6'
            : 'flex-col items-center justify-start gap-4 pb-8'
        }`}
      >
        {/* Left Column: Board + Player Nameplates */}
        <section
          aria-label="Replay chessboard"
          className={`flex flex-col items-center justify-center gap-2 min-w-0 min-h-0 ${
            isDesktopSplit ? 'flex-1' : 'w-full shrink-0'
          }`}
        >
          {/* Top Player Strip */}
          <div
            style={{ width: `${boardGeometry.frameWidthPx}px` }}
            className="max-w-full px-3 py-1.5 rounded-lg bg-[#151E19] border border-[#26342C] flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-3 h-3 rounded-full shrink-0 border ${
                  topColor === 'w'
                    ? 'bg-[#FCF9F2] border-[#52493F]'
                    : 'bg-[#22262A] border-[#A69F91]'
                }`}
              />
              <span className="text-xs sm:text-sm font-bold text-[#F4EFE6] truncate">
                {topPlayer.name}
              </span>
              {topPlayer.elo && (
                <span className="text-[11px] font-mono text-[#A69F91] tabular-nums shrink-0">
                  ({topPlayer.elo})
                </span>
              )}
              {topPlayer.isTurn && (
                <span className="text-[11px] font-mono text-[#C6923A] shrink-0">
                  · to move
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center -space-x-1">
                {topPlayer.captured.slice(0, 8).map((pt, i) => (
                  <span key={`${pt}-${i}`} className="w-4 h-4 inline-block">
                    <ChessPieceSvg
                      type={pt}
                      color={topColor === 'w' ? 'b' : 'w'}
                    />
                  </span>
                ))}
              </div>
              {topPlayer.advantage > 0 && (
                <span className="text-[11px] font-mono font-bold text-[#EADBC8] tabular-nums pl-1">
                  +{topPlayer.advantage}
                </span>
              )}
            </div>
          </div>

          {/* Interactive-Locked ChessBoard (highlights current move from/to) */}
          <ChessBoard
            gameState={currentState}
            legalMoves={[]}
            selectedSquare={null}
            pendingPromotion={null}
            isFlipped={isFlipped}
            isInteractionDisabled={true}
            helperMode={false}
            showBoardSuggestions={false}
            isPreviewingHistory={false}
            helperAnalysis={null}
            highlightedHelperRank={null}
            plannedArrows={[]}
            onSquareClick={() => {}}
            onMovePiece={() => {}}
            onTogglePlannedArrow={() => {}}
            onClearPlannedArrows={() => {}}
            onSelectPromotion={() => {}}
            onCancelPromotion={() => {}}
            onDisabledInteractionAttempt={() => {
              showHintToast(
                isTerminalPosition
                  ? 'Game has ended at this ply — step back to an earlier move to play.'
                  : 'Replay Mode is read-only. Click "Continue Play From Here" to play from this position.'
              );
            }}
            hideHelperBox={true}
            boardSizePx={boardGeometry.boardSizePx}
            maxFitSizePx={boardGeometry.maxFitSizePx}
            boardTheme={uiPrefs.boardTheme}
            coordinateStyle={uiPrefs.coordinateStyle}
            boardScale={uiPrefs.boardScale}
            isResizable={Boolean(onUpdateUiPrefs)}
            onBoardScaleChange={(nextScale) =>
              onUpdateUiPrefs?.({ boardScale: nextScale }, true)
            }
            onResetBoardScale={() =>
              onUpdateUiPrefs?.({ boardScale: 1.0 }, true)
            }
          />

          {/* Bottom Player Strip */}
          <div
            style={{ width: `${boardGeometry.frameWidthPx}px` }}
            className="max-w-full px-3 py-1.5 rounded-lg bg-[#151E19] border border-[#26342C] flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-3 h-3 rounded-full shrink-0 border ${
                  bottomColor === 'w'
                    ? 'bg-[#FCF9F2] border-[#52493F]'
                    : 'bg-[#22262A] border-[#A69F91]'
                }`}
              />
              <span className="text-xs sm:text-sm font-bold text-[#F4EFE6] truncate">
                {bottomPlayer.name}
              </span>
              {bottomPlayer.elo && (
                <span className="text-[11px] font-mono text-[#A69F91] tabular-nums shrink-0">
                  ({bottomPlayer.elo})
                </span>
              )}
              {bottomPlayer.isTurn && (
                <span className="text-[11px] font-mono text-[#C6923A] shrink-0">
                  · to move
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center -space-x-1">
                {bottomPlayer.captured.slice(0, 8).map((pt, i) => (
                  <span key={`${pt}-${i}`} className="w-4 h-4 inline-block">
                    <ChessPieceSvg
                      type={pt}
                      color={bottomColor === 'w' ? 'b' : 'w'}
                    />
                  </span>
                ))}
              </div>
              {bottomPlayer.advantage > 0 && (
                <span className="text-[11px] font-mono font-bold text-[#EADBC8] tabular-nums pl-1">
                  +{bottomPlayer.advantage}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Replay Studio Sidebar */}
        <aside
          aria-label="Replay controls and move notation"
          className={`${
            isDesktopSplit
              ? 'w-[430px] shrink-0 h-full min-h-0'
              : 'w-full max-w-[560px]'
          } bg-[#151E19] border border-[#26342C] rounded-2xl flex flex-col overflow-hidden`}
        >
          {/* 1. Metadata & Description Block */}
          <div className="p-4 bg-[#121A16] border-b border-[#26342C] space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-[#C6923A] font-semibold tabular-nums">
                Ply {currentPly} / {maxPly}
                {currentNode.san
                  ? ` · ${currentNode.turnNumber}${
                      currentNode.color === 'w' ? '.' : '...'
                    } ${currentNode.san}${currentNode.nag ?? ''}`
                  : ' · Starting Position'}
              </span>
              <span className="text-xs font-mono text-[#A69F91] tabular-nums">
                {game.result}
              </span>
            </div>

            {/* Thin progress track */}
            <div className="w-full h-1 rounded-full bg-[#223028] overflow-hidden">
              <div
                className="h-full bg-[#C6923A] transition-all duration-150"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {game.description && (
              <p className="text-xs text-[#C6BFA8] leading-relaxed">
                {game.description}
              </p>
            )}

            {game.isCustomStart && (
              <p className="text-[11px] font-mono text-[#C6923A]">
                Custom starting FEN loaded
              </p>
            )}
          </div>

          {/* 2. Playback Control Bar */}
          <div
            data-testid="replay-control-bar"
            className="px-3 sm:px-4 py-3 bg-[#17211C] border-b border-[#26342C] space-y-2.5 shrink-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="replay-btn-start"
                  aria-label="Jump to start"
                  title="Jump to start (Up / Home)"
                  disabled={currentPly === 0}
                  onClick={() => jumpToPly(0)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] disabled:opacity-40 disabled:pointer-events-none border border-[#34463C] text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="replay-btn-prev"
                  aria-label="Step backward one move"
                  title="Previous move (Left Arrow)"
                  disabled={currentPly === 0}
                  onClick={stepBackward}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] disabled:opacity-40 disabled:pointer-events-none border border-[#34463C] text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  data-testid="replay-btn-play-pause"
                  aria-label={
                    isAutoPlaying ? 'Pause auto-replay' : 'Play auto-replay'
                  }
                  title="Play / Pause auto-replay (Space)"
                  disabled={maxPly === 0}
                  onClick={toggleAutoPlay}
                  className={`h-9 sm:h-10 px-3 sm:px-4 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isAutoPlaying
                      ? 'bg-[#C6923A] border-[#C6923A] text-[#111815]'
                      : 'bg-[#24342B] hover:bg-[#2E4237] border-[#C6923A]/60 text-[#F4EFE6]'
                  }`}
                >
                  {isAutoPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  data-testid="replay-btn-next"
                  aria-label="Step forward one move"
                  title="Next move (Right Arrow)"
                  disabled={currentPly >= maxPly}
                  onClick={() => {
                    setIsAutoPlaying(false);
                    stepForward(false);
                  }}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] disabled:opacity-40 disabled:pointer-events-none border border-[#34463C] text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="replay-btn-end"
                  aria-label="Jump to end"
                  title="Jump to end (Down / End)"
                  disabled={currentPly >= maxPly}
                  onClick={() => jumpToPly(maxPly)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] disabled:opacity-40 disabled:pointer-events-none border border-[#34463C] text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Speed & Flip Controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div
                  role="group"
                  aria-label="Auto-replay speed"
                  className="inline-flex items-center p-0.5 rounded-lg bg-[#111815] border border-[#26342C]"
                >
                  {SPEED_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      data-testid={`replay-speed-${preset.label}`}
                      onClick={() => setSpeedMs(preset.ms)}
                      className={`px-2 py-1 sm:py-1.5 rounded-md text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                        speedMs === preset.ms
                          ? 'bg-[#25352C] text-[#C6923A]'
                          : 'text-[#857F72] hover:text-[#F4EFE6]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  data-testid="replay-btn-flip"
                  aria-label="Flip board perspective"
                  title="Flip Board (F)"
                  onClick={() => setIsFlipped((prev) => !prev)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-[#EADBC8] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <FlipVertical2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-[11px] font-mono text-[#7A7467] flex items-center justify-between">
              <span>←/→ Step · ↑/↓ Start/End · Space Play</span>
              <span>F Flip</span>
            </div>
          </div>

          {/* 3. Active Move Comment (if present in PGN) */}
          {currentNode.comment && (
            <div
              data-testid="replay-active-comment"
              className="px-4 py-2.5 bg-[#1B2520] border-b border-[#2A3A31] text-xs text-[#EADBC8] leading-relaxed shrink-0"
            >
              <span className="font-mono font-bold text-[#C6923A] mr-1.5">
                {currentNode.san ? `${currentNode.turnNumber}${currentNode.color === 'w' ? '.' : '...'} ${currentNode.san}${currentNode.nag ?? ''}:` : 'Note:'}
              </span>
              <span>{currentNode.comment}</span>
            </div>
          )}

          {/* 4. Interactive Two-Column SAN Move List */}
          <div
            data-testid="replay-move-list"
            className="flex-1 min-h-[180px] overflow-y-auto px-3 py-2.5 font-mono text-xs tabular-nums space-y-0.5"
          >
            {pairedRows.length === 0 ? (
              <div className="py-10 text-center text-[#7A7467] text-xs">
                No moves recorded in this PGN. You can still play from this position below.
              </div>
            ) : (
              pairedRows.map((row) => {
                const isWhiteActive =
                  row.whiteNode && currentPly === row.whiteNode.ply;
                const isBlackActive =
                  row.blackNode && currentPly === row.blackNode.ply;

                return (
                  <div
                    key={row.turnNumber}
                    className="grid grid-cols-12 items-center gap-1 py-0.5 px-1.5 rounded odd:bg-[#19241E]"
                  >
                    <span className="col-span-2 text-[#7A7467] select-none">
                      {row.turnNumber}.
                    </span>

                    {row.whiteNode ? (
                      <button
                        type="button"
                        ref={isWhiteActive ? activeMoveBtnRef : undefined}
                        data-testid={`replay-move-ply-${row.whiteNode.ply}`}
                        aria-current={isWhiteActive ? 'step' : undefined}
                        onClick={() =>
                          jumpToPly(row.whiteNode!.ply, { playAudio: true })
                        }
                        className={`col-span-5 py-1.5 px-2.5 rounded-md text-left transition-colors cursor-pointer flex items-center justify-between gap-1 ${
                          isWhiteActive
                            ? 'bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] hover:text-[#111815] font-bold'
                            : 'text-[#F4EFE6] hover:bg-[#25352C]'
                        }`}
                      >
                        <span className="truncate">
                          {row.whiteNode.san}
                          {row.whiteNode.nag ? (
                            <span
                              className={
                                isWhiteActive
                                  ? 'text-[#111815] ml-0.5'
                                  : 'text-[#C6923A] ml-0.5'
                              }
                            >
                              {row.whiteNode.nag}
                            </span>
                          ) : null}
                        </span>
                        {row.whiteNode.comment && (
                          <span
                            className={`text-[10px] shrink-0 ${
                              isWhiteActive ? 'text-[#111815]/80' : 'text-[#A69F91]'
                            }`}
                            title="Has annotation comment"
                          >
                            ¶
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="col-span-5 px-2.5 text-[#666055]">
                        ...
                      </span>
                    )}

                    {row.blackNode ? (
                      <button
                        type="button"
                        ref={isBlackActive ? activeMoveBtnRef : undefined}
                        data-testid={`replay-move-ply-${row.blackNode.ply}`}
                        aria-current={isBlackActive ? 'step' : undefined}
                        onClick={() =>
                          jumpToPly(row.blackNode!.ply, { playAudio: true })
                        }
                        className={`col-span-5 py-1.5 px-2.5 rounded-md text-left transition-colors cursor-pointer flex items-center justify-between gap-1 ${
                          isBlackActive
                            ? 'bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] hover:text-[#111815] font-bold'
                            : 'text-[#D6CFC2] hover:bg-[#25352C] hover:text-[#F4EFE6]'
                        }`}
                      >
                        <span className="truncate">
                          {row.blackNode.san}
                          {row.blackNode.nag ? (
                            <span
                              className={
                                isBlackActive
                                  ? 'text-[#111815] ml-0.5'
                                  : 'text-[#C6923A] ml-0.5'
                              }
                            >
                              {row.blackNode.nag}
                            </span>
                          ) : null}
                        </span>
                        {row.blackNode.comment && (
                          <span
                            className={`text-[10px] shrink-0 ${
                              isBlackActive ? 'text-[#111815]/80' : 'text-[#A69F91]'
                            }`}
                            title="Has annotation comment"
                          >
                            ¶
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="col-span-5" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 5. Prominent "Continue Play From Here" Section */}
          <div
            data-testid="continue-play-section"
            className="p-4 bg-[#121A16] border-t border-[#2B3B32] space-y-3 shrink-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#F4EFE6]">
                Branch Into Live AI Play
              </span>
              <button
                type="button"
                data-testid="replay-tune-ai-btn"
                onClick={onOpenEngineCustomizer}
                className="text-[11px] font-mono text-[#C6923A] hover:text-[#E2B055] transition-colors cursor-pointer tabular-nums"
              >
                AI: {engineSummary.title} · Tune
              </button>
            </div>

            {isTerminalPosition ? (
              <div
                data-testid="replay-terminal-notice"
                className="p-2.5 rounded-lg bg-[#1D2521] border border-[#34463C] text-xs text-[#C6BFA8]"
              >
                <strong className="text-[#C6923A]">{terminalReasonLabel}.</strong>{' '}
                Step back to an earlier move to branch into active play.
              </div>
            ) : (
              <>
                {/* Choose Side to Play */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#18221D] border border-[#26342C] rounded-lg">
                  <button
                    type="button"
                    data-testid="branch-as-white-btn"
                    onClick={() =>
                      setColorChoiceForPly({ ply: currentPly, color: 'w' })
                    }
                    className={`py-1.5 px-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      chosenPlayColor === 'w'
                        ? 'bg-[#EADBC8] text-[#1A1410] font-bold'
                        : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#223028]'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-[#FCF9F2] border border-[#332B24] shrink-0" />
                    <span>Play as White</span>
                  </button>
                  <button
                    type="button"
                    data-testid="branch-as-black-btn"
                    onClick={() =>
                      setColorChoiceForPly({ ply: currentPly, color: 'b' })
                    }
                    className={`py-1.5 px-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      chosenPlayColor === 'b'
                        ? 'bg-[#EADBC8] text-[#1A1410] font-bold'
                        : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#223028]'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-[#22262A] border border-[#C8B9A6] shrink-0" />
                    <span>Play as Black</span>
                  </button>
                </div>

                <p className="text-[11px] text-[#A69F91]">
                  {chosenPlayColor === activeTurn
                    ? `${activeTurn === 'w' ? 'White' : 'Black'} to move — you will make the first move.`
                    : `${activeTurn === 'w' ? 'White' : 'Black'} to move — AI will respond immediately as ${activeTurn === 'w' ? 'White' : 'Black'}.`}
                </p>
              </>
            )}

            <button
              type="button"
              data-testid="continue-play-from-here-btn"
              disabled={isTerminalPosition}
              onClick={() => {
                setIsAutoPlaying(false);
                onContinuePlayFromHere(
                  currentPly,
                  chosenPlayColor,
                  chosenPlayColor === 'b'
                );
              }}
              className="w-full py-3 px-4 rounded-xl bg-[#C6923A] hover:bg-[#D4A048] active:bg-[#B5822D] disabled:opacity-40 disabled:pointer-events-none text-[#111815] font-bold text-sm tracking-wide transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-[0_6px_18px_rgba(198,146,58,0.25)] whitespace-nowrap"
            >
              <Swords className="w-4 h-4 shrink-0" />
              <span>
                {isTerminalPosition
                  ? 'Game Ended at This Ply'
                  : 'Continue Play From Here'}
              </span>
            </button>
          </div>
        </aside>
      </main>

      {/* Non-intrusive Replay Read-Only Prompt Toast */}
      {replayHintToast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="replay-hint-toast"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-[#1B2620] border border-[#C6923A] text-[#F4EFE6] px-4 py-2 rounded-xl text-xs font-medium shadow-[0_12px_32px_rgba(0,0,0,0.7)] max-w-[90vw] text-center"
        >
          {replayHintToast}
        </div>
      )}
    </div>
  );
};
