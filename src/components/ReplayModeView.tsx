import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  FlipVertical2,
  GitBranch,
  List,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Swords,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  computeFullGameReviewAsync,
  computeReplayPlyCoachAnalysis,
} from '../chess/aiClient';
import {
  calculateMaterialBalance,
  generateLegalMoves,
  getPieceAt,
  makeMove,
} from '../chess/engine';
import {
  describeEngineProfileSummary,
  evaluateBoardWhitePerspective,
  formatEvalScore,
} from '../chess/evaluation';
import {
  CLASSIFICATION_COLORS,
  GameReviewProgressEvent,
  GameReviewReport,
  MoveClassification,
} from '../chess/gameReview';
import { buildStateStackUpToPly } from '../chess/pgnParser';
import {
  BranchPlayChoice,
  ParsedPgnGame,
  PgnVariationLine,
  ReplayPlyCoachInsight,
  SidelineState,
  TimelineNode,
} from '../chess/pgnTypes';
import { sortCapturedPieces } from '../chess/replayCoach';
import { gameStateToFen } from '../chess/sessionStorage';
import { RecommendedMove } from '../chess/tacticsHelper';
import {
  BoardRotation,
  Color,
  EngineProfileState,
  GameState,
  Move,
  PlannedArrow,
  PromotionPieceType,
  Square,
} from '../chess/types';
import {
  flipBoardRotation,
  rotateBoardCCW,
  rotateBoardCW,
} from '../utils/boardOrientation';
import {
  computeBoardGridSize,
  DEFAULT_UI_LAYOUT_PREFERENCES,
  EVAL_BAR_RESERVE_PX,
  UILayoutPreferences,
} from '../utils/layoutMath';
import { soundFX } from '../utils/sound';
import { ChessBoard } from './ChessBoard';
import { ChessPieceSvg } from './ChessPieceSvg';
import { EvalBar } from './EvalBar';
import { ReplayAdvantageGraph } from './ReplayAdvantageGraph';
import { ReplayCoachCard } from './ReplayCoachCard';

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
    choice: BranchPlayChoice,
    shouldFlip: boolean,
    customStateStack?: GameState[]
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

const CLASSIFICATION_GLYPHS: Record<MoveClassification, string> = {
  best: '★',
  excellent: '✓',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

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
  const [boardRotation, setBoardRotation] = useState<BoardRotation>(0);
  const isFlipped = boardRotation === 180;
  const [branchChoiceForPly, setBranchChoiceForPly] = useState<{
    ply: number;
    choice: BranchPlayChoice;
  } | null>(null);
  const [replayHintToast, setReplayHintToast] = useState<string | null>(null);

  // User Req #1: Persistent right-click tactical arrows
  const [plannedArrows, setPlannedArrows] = useState<PlannedArrow[]>([]);

  // Inline "What-If" Sideline Sandbox state
  const [sideline, setSideline] = useState<SidelineState | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  // User Req #2: Per-ply Engine Tactical Coach state + cache
  const [coachInsight, setCoachInsight] =
    useState<ReplayPlyCoachInsight | null>(null);
  const [isAnalyzingPly, setIsAnalyzingPly] = useState<boolean>(false);
  const [hoveredAltIndex, setHoveredAltIndex] = useState<number | null>(null);
  const coachCacheRef = useRef<Map<string, ReplayPlyCoachInsight>>(new Map());

  // Local fallback toggles if onUpdateUiPrefs isn't supplied
  const [localCoachExpanded, setLocalCoachExpanded] = useState<boolean>(
    uiPrefs.isReplayCoachExpanded
  );
  const [localMoveListExpanded, setLocalMoveListExpanded] = useState<boolean>(
    uiPrefs.isReplayMoveListExpanded
  );
  const isCoachExpanded = onUpdateUiPrefs
    ? uiPrefs.isReplayCoachExpanded
    : localCoachExpanded;
  const isMoveListExpanded = onUpdateUiPrefs
    ? uiPrefs.isReplayMoveListExpanded
    : localMoveListExpanded;

  // Additional Point #1: Async Full-Game Review (Advantage Graph + Turning Points + Move Glyphs)
  const [fullReviewReport, setFullReviewReport] =
    useState<GameReviewReport | null>(null);
  const [isRunningFullReview, setIsRunningFullReview] =
    useState<boolean>(false);
  const [fullReviewProgress, setFullReviewProgress] =
    useState<GameReviewProgressEvent | null>(null);
  const fullReviewAbortRef = useRef<AbortController | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const moveListContainerRef = useRef<HTMLDivElement | null>(null);
  const activeMoveBtnRef = useRef<HTMLButtonElement | null>(null);
  const arenaRef = useRef<HTMLElement | null>(null);

  const showHintToast = useCallback((msg: string) => {
    setReplayHintToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setReplayHintToast(null);
    }, 2400);
  }, []);

  // Reset ply, flip orientation, arrows, sidelines, and analysis whenever a different game loads
  useEffect(() => {
    const clamped = Math.max(0, Math.min(initialPly, game.timeline.length - 1));
    setCurrentPly(clamped);
    setIsAutoPlaying(false);
    setBoardRotation(0);
    setBranchChoiceForPly(null);
    setPlannedArrows([]);
    setSideline(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setCoachInsight(null);
    setHoveredAltIndex(null);
    setFullReviewReport(null);
    setIsRunningFullReview(false);
    setFullReviewProgress(null);
    fullReviewAbortRef.current?.abort();
    fullReviewAbortRef.current = null;
  }, [game.id, initialPly, game.timeline.length]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      fullReviewAbortRef.current?.abort();
    };
  }, []);

  // Clear right-click arrows, selection, and hovered preview when displayed ply/sideline changes
  const sidelineKey = sideline
    ? `${sideline.anchorPly}:${sideline.activeIndex}:${sideline.nodes.length}`
    : 'main';
  useEffect(() => {
    setPlannedArrows([]);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setHoveredAltIndex(null);
  }, [currentPly, sidelineKey, game.id]);

  // Responsive arena measurement for zero-clipping ChessBoard + EvalBar fit
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
  const showEvalBar = uiPrefs.showEvalBar;

  const boardGeometry = useMemo(() => {
    const sidebarWidth = isDesktopSplit ? 440 : 0;
    const gapWidth = isDesktopSplit ? 24 : 0;
    const availW = Math.max(300, arenaSize.width - sidebarWidth - gapWidth);
    const sidelineBannerReserve = sideline ? 46 : 0;
    return computeBoardGridSize({
      availableWidth: availW,
      availableHeight: arenaSize.height,
      boardScale: uiPrefs.boardScale,
      coordinateStyle: uiPrefs.coordinateStyle,
      showHelperBox: false,
      showEvalBar,
      underBoardStripHeight: 114 + sidelineBannerReserve,
      isStackedLayout: !isDesktopSplit || !lockViewportHeight,
    });
  }, [
    isDesktopSplit,
    lockViewportHeight,
    arenaSize.width,
    arenaSize.height,
    uiPrefs.boardScale,
    uiPrefs.coordinateStyle,
    showEvalBar,
    sideline,
  ]);

  const currentNode = game.timeline[currentPly] ?? game.timeline[0];
  const activeSidelineNode: TimelineNode | null =
    sideline && sideline.nodes[sideline.activeIndex]
      ? sideline.nodes[sideline.activeIndex]
      : null;
  const activeNode: TimelineNode = activeSidelineNode ?? currentNode;
  const activeBoardState: GameState = activeNode.gameState;
  const activeTurn = activeBoardState.turn;
  const isTerminalPosition = activeBoardState.status !== 'playing';
  const activeLegalMoves = useMemo(
    () => (isTerminalPosition ? [] : generateLegalMoves(activeBoardState)),
    [activeBoardState, isTerminalPosition]
  );

  const chosenBranchChoice: BranchPlayChoice =
    branchChoiceForPly?.choice === 'both'
      ? 'both'
      : branchChoiceForPly && branchChoiceForPly.ply === currentPly
      ? branchChoiceForPly.choice
      : activeTurn;
  const engineSummary = describeEngineProfileSummary(engineProfile);

  // Per-ply async Web Worker Coach analysis (debounced, cached, paused during auto-play)
  const activeFen = useMemo(
    () => activeNode.fen || gameStateToFen(activeBoardState),
    [activeNode.fen, activeBoardState]
  );

  useEffect(() => {
    if (isAutoPlaying) {
      setIsAnalyzingPly(false);
      return;
    }

    const cacheKey = sideline
      ? `sideline:${activeFen}`
      : `${game.id}:${currentPly}`;
    const cached = coachCacheRef.current.get(cacheKey);
    if (cached) {
      setCoachInsight(cached);
      setIsAnalyzingPly(false);
      return;
    }

    let stateBefore: GameState | null = null;
    let playedNode: TimelineNode = currentNode;

    if (sideline && activeSidelineNode) {
      playedNode = activeSidelineNode;
      stateBefore =
        sideline.activeIndex > 0
          ? sideline.nodes[sideline.activeIndex - 1].gameState
          : game.timeline[sideline.anchorPly]?.gameState ?? null;
    } else if (!sideline && currentPly > 0) {
      stateBefore = game.timeline[currentPly - 1]?.gameState ?? null;
      playedNode = currentNode;
    }

    const abortController = new AbortController();
    setIsAnalyzingPly(true);

    const debounceId = window.setTimeout(() => {
      computeReplayPlyCoachAnalysis(stateBefore, playedNode, activeBoardState, {
        cacheKey,
        maxDepth: 5,
        maxTimeMs: 240,
        signal: abortController.signal,
      }).then((insight) => {
        if (abortController.signal.aborted) return;
        if (insight) {
          coachCacheRef.current.set(cacheKey, insight);
          setCoachInsight(insight);
        }
        setIsAnalyzingPly(false);
      });
    }, 110);

    return () => {
      window.clearTimeout(debounceId);
      abortController.abort();
    };
  }, [
    isAutoPlaying,
    game.id,
    game.timeline,
    currentPly,
    currentNode,
    sideline,
    activeSidelineNode,
    activeBoardState,
    activeFen,
  ]);

  // Compute live evaluation for the vertical EvalBar
  const liveEval = useMemo(() => {
    if (coachInsight) {
      return {
        cp: coachInsight.evalWhiteCp,
        formatted: coachInsight.formattedEval,
      };
    }
    if (
      !sideline &&
      fullReviewReport &&
      fullReviewReport.evalCurve[currentPly] !== undefined
    ) {
      const cp = fullReviewReport.evalCurve[currentPly];
      return { cp, formatted: formatEvalScore(cp) };
    }
    if (!sideline && typeof currentNode.pgnEval === 'number') {
      return {
        cp: currentNode.pgnEval,
        formatted:
          currentNode.pgnEvalFormatted ?? formatEvalScore(currentNode.pgnEval),
      };
    }
    const staticCp = evaluateBoardWhitePerspective(
      activeBoardState.board,
      'club'
    );
    return { cp: staticCp, formatted: formatEvalScore(staticCp) };
  }, [
    coachInsight,
    sideline,
    fullReviewReport,
    currentPly,
    currentNode,
    activeBoardState.board,
  ]);

  // Map full-game review classifications by 1-based ply for move-list badges
  const reviewByPly = useMemo(() => {
    const map = new Map<number, MoveClassification>();
    if (!fullReviewReport) return map;
    for (const p of fullReviewReport.plies) {
      map.set(p.plyIndex + 1, p.classification);
    }
    return map;
  }, [fullReviewReport]);

  const handleStartFullAnalysis = useCallback(() => {
    if (isRunningFullReview || maxPly === 0) return;
    setIsAutoPlaying(false);
    fullReviewAbortRef.current?.abort();
    const controller = new AbortController();
    fullReviewAbortRef.current = controller;
    setIsRunningFullReview(true);
    setFullReviewProgress({
      completedPlies: 0,
      totalPlies: maxPly,
      evalCurve: [0],
    });

    const fullStack = game.timeline.map((n) => n.gameState);
    computeFullGameReviewAsync(fullStack, {
      signal: controller.signal,
      onProgress: (prog) => {
        if (!controller.signal.aborted) {
          setFullReviewProgress(prog);
        }
      },
    }).then((report) => {
      if (controller.signal.aborted) return;
      if (report) {
        setFullReviewReport(report);
      }
      setIsRunningFullReview(false);
    });
  }, [isRunningFullReview, maxPly, game.timeline]);

  const handleCancelFullAnalysis = useCallback(() => {
    fullReviewAbortRef.current?.abort();
    fullReviewAbortRef.current = null;
    setIsRunningFullReview(false);
    setFullReviewProgress(null);
  }, []);

  const playSoundForState = useCallback((state: GameState) => {
    const last = state.moveHistory[state.moveHistory.length - 1];
    if (!last) return;
    if (state.status === 'checkmate') {
      soundFX.playGameOver(true);
    } else if (state.inCheck) {
      soundFX.playCheck();
    } else if (last.move.isCastle) {
      soundFX.playCastle();
    } else if (last.move.captured) {
      soundFX.playCapture();
    } else {
      soundFX.playMove();
    }
  }, []);

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

  const buildSidelineNode = useCallback(
    (baseState: GameState, move: Move, ply: number): TimelineNode => {
      const nextState = makeMove(baseState, move);
      const latestRecord =
        nextState.moveHistory[nextState.moveHistory.length - 1];
      return {
        ply,
        fen: gameStateToFen(nextState),
        san: latestRecord?.san ?? `${move.from}${move.to}`,
        from: move.from,
        to: move.to,
        captured: move.captured?.type ?? null,
        flags: {
          check: nextState.inCheck,
          checkmate: nextState.status === 'checkmate',
          stalemate: nextState.status === 'stalemate',
          castle: move.isCastle ?? null,
          promotion: move.promotion ?? null,
          enPassant: Boolean(move.isEnPassant),
          capture: Boolean(move.captured),
        },
        comment: null,
        nag: null,
        clock: null,
        pgnEval: null,
        pgnEvalFormatted: null,
        turnNumber: latestRecord?.turnNumber ?? baseState.fullMoveNumber,
        color: baseState.turn,
        gameState: nextState,
      };
    },
    []
  );

  const exitSideline = useCallback(() => {
    setSideline(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
  }, []);

  const stepSidelineBack = useCallback(() => {
    setSideline((prev) => {
      if (!prev) return null;
      soundFX.playUndo();
      if (prev.activeIndex <= 0) {
        return null;
      }
      return {
        ...prev,
        nodes: prev.nodes.slice(0, prev.activeIndex),
        activeIndex: prev.activeIndex - 1,
      };
    });
  }, []);

  const commitSidelineMove = useCallback(
    (move: Move) => {
      setIsAutoPlaying(false);
      setSelectedSquare(null);
      setPendingPromotion(null);

      setSideline((prev) => {
        if (prev) {
          const truncated = prev.nodes.slice(0, prev.activeIndex + 1);
          const nextPly = prev.anchorPly + truncated.length + 1;
          const node = buildSidelineNode(activeBoardState, move, nextPly);
          playSoundForState(node.gameState);
          return {
            ...prev,
            nodes: [...truncated, node],
            activeIndex: truncated.length,
          };
        }
        const node = buildSidelineNode(activeBoardState, move, currentPly + 1);
        playSoundForState(node.gameState);
        return {
          anchorPly: currentPly,
          label: 'What-If Line',
          nodes: [node],
          activeIndex: 0,
        };
      });
    },
    [activeBoardState, currentPly, buildSidelineNode, playSoundForState]
  );

  // Interactive What-If piece click/drag handlers on Replay board
  const handleReplayAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (isTerminalPosition) return;
      const matching = activeLegalMoves.filter(
        (m) => m.from === from && m.to === to
      );
      if (matching.length === 0) return;

      if (matching.some((m) => m.promotion)) {
        setPendingPromotion({ from, to });
        return;
      }
      commitSidelineMove(matching[0]);
    },
    [isTerminalPosition, activeLegalMoves, commitSidelineMove]
  );

  const handleReplaySquareClick = useCallback(
    (sq: Square) => {
      if (isTerminalPosition) return;
      if (pendingPromotion) {
        setPendingPromotion(null);
      }

      if (selectedSquare === sq) {
        setSelectedSquare(null);
        return;
      }

      if (selectedSquare) {
        const matching = activeLegalMoves.filter(
          (m) => m.from === selectedSquare && m.to === sq
        );
        if (matching.length > 0) {
          handleReplayAttemptMove(selectedSquare, sq);
          return;
        }
      }

      const piece = getPieceAt(activeBoardState.board, sq);
      if (piece && piece.color === activeBoardState.turn) {
        setSelectedSquare(sq);
      } else {
        setSelectedSquare(null);
      }
    },
    [
      isTerminalPosition,
      pendingPromotion,
      selectedSquare,
      activeLegalMoves,
      activeBoardState.board,
      activeBoardState.turn,
      handleReplayAttemptMove,
    ]
  );

  const handleReplaySelectPromotion = useCallback(
    (piece: PromotionPieceType) => {
      if (!pendingPromotion) return;
      const matching = activeLegalMoves.find(
        (m) =>
          m.from === pendingPromotion.from &&
          m.to === pendingPromotion.to &&
          m.promotion === piece
      );
      setPendingPromotion(null);
      if (matching) {
        commitSidelineMove(matching);
      }
    },
    [pendingPromotion, activeLegalMoves, commitSidelineMove]
  );

  // Load Coach alternative move into What-If sideline
  const handleTryAlternative = useCallback(
    (alt: RecommendedMove) => {
      setIsAutoPlaying(false);
      setHoveredAltIndex(null);

      let baseState: GameState;
      let anchorPly = currentPly;
      let prefixNodes: TimelineNode[] = [];

      if (sideline) {
        anchorPly = sideline.anchorPly;
        prefixNodes = sideline.nodes.slice(0, sideline.activeIndex);
        baseState =
          prefixNodes.length > 0
            ? prefixNodes[prefixNodes.length - 1].gameState
            : game.timeline[anchorPly].gameState;
      } else if (currentPly > 0) {
        anchorPly = currentPly - 1;
        baseState = game.timeline[anchorPly].gameState;
      } else {
        anchorPly = 0;
        baseState = game.timeline[0].gameState;
      }

      const legalAtBase = generateLegalMoves(baseState);
      const resolvedMove = legalAtBase.find(
        (m) =>
          m.from === alt.move.from &&
          m.to === alt.move.to &&
          m.promotion === alt.move.promotion
      );
      if (!resolvedMove) return;

      const node = buildSidelineNode(
        baseState,
        resolvedMove,
        anchorPly + prefixNodes.length + 1
      );
      playSoundForState(node.gameState);

      setSideline({
        anchorPly,
        label: 'Coach Option',
        nodes: [...prefixNodes, node],
        activeIndex: prefixNodes.length,
      });
    },
    [currentPly, sideline, game.timeline, buildSidelineNode, playSoundForState]
  );

  // Load parsed PGN Recursive Annotation Variation (...) into inline sideline
  const handleLoadPgnVariation = useCallback(
    (variation: PgnVariationLine) => {
      if (variation.nodes.length === 0) return;
      setIsAutoPlaying(false);
      const anchorPly = Math.max(0, currentPly - 1);
      const targetIdx = variation.nodes.length - 1;
      playSoundForState(variation.nodes[targetIdx].gameState);
      setSideline({
        anchorPly,
        label: 'PGN Variation',
        nodes: variation.nodes,
        activeIndex: targetIdx,
      });
    },
    [currentPly, playSoundForState]
  );

  const jumpToPly = useCallback(
    (nextPly: number, options?: { keepAutoPlay?: boolean; playAudio?: boolean }) => {
      const clamped = Math.max(0, Math.min(nextPly, maxPly));
      if (!options?.keepAutoPlay) {
        setIsAutoPlaying(false);
      }
      setSideline(null);
      setCurrentPly(clamped);
      if (options?.playAudio && clamped > 0) {
        playSoundForNode(game.timeline[clamped]);
      }
    },
    [maxPly, game.timeline, playSoundForNode]
  );

  const stepForward = useCallback(
    (fromAutoPlay = false) => {
      setSideline(null);
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
    if (sideline) {
      stepSidelineBack();
      return;
    }
    setCurrentPly((prev) => {
      if (prev <= 0) return 0;
      soundFX.playUndo();
      return prev - 1;
    });
  }, [sideline, stepSidelineBack]);

  const toggleAutoPlay = useCallback(() => {
    if (maxPly === 0) return;
    setSideline(null);
    setIsAutoPlaying((prev) => {
      if (!prev && currentPly >= maxPly) {
        setCurrentPly(0);
      }
      return !prev;
    });
  }, [currentPly, maxPly]);

  // Point 5 Fix: Clean single-step setTimeout auto-replay scheduler (no interval teardown churn)
  useEffect(() => {
    if (!isAutoPlaying) return;
    if (currentPly >= maxPly) {
      setIsAutoPlaying(false);
      return;
    }

    const timerId = window.setTimeout(() => {
      stepForward(true);
    }, speedMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isAutoPlaying, speedMs, currentPly, maxPly, stepForward]);

  // Auto-scroll active move cell ONLY within the move-list container (never scroll the outer page/viewport)
  useEffect(() => {
    const container = moveListContainerRef.current;
    const activeBtn = activeMoveBtnRef.current;
    if (!isMoveListExpanded || !container || !activeBtn) return;

    const cRect = container.getBoundingClientRect();
    const bRect = activeBtn.getBoundingClientRect();
    const pad = 6;

    if (bRect.top < cRect.top + pad) {
      container.scrollTop += bRect.top - cRect.top - pad;
    } else if (bRect.bottom > cRect.bottom - pad) {
      container.scrollTop += bRect.bottom - cRect.bottom + pad;
    }
  }, [currentPly, isMoveListExpanded]);

  // Keyboard shortcuts: Left/Right step, Up/Home start, Down/End end, Space play/pause, F flip, Esc exit sideline
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

      if (e.key === 'Escape' && sideline) {
        e.preventDefault();
        exitSideline();
      } else if (e.key === 'ArrowRight') {
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
        setBoardRotation((prev) => flipBoardRotation(prev));
      } else if (e.key === 't' || e.key === 'T') {
        setBoardRotation((prev) =>
          e.shiftKey ? rotateBoardCCW(prev) : rotateBoardCW(prev)
        );
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isAnyModalOpen,
    sideline,
    exitSideline,
    stepForward,
    stepBackward,
    jumpToPly,
    maxPly,
    toggleAutoPlay,
  ]);

  // Right-click arrow handlers (User Req #1): free tactical arrows between any two squares
  const handleTogglePlannedArrow = useCallback((from: Square, to: Square) => {
    if (from === to) return;
    setPlannedArrows((prev) => {
      const exists = prev.some((a) => a.from === from && a.to === to);
      return exists
        ? prev.filter((a) => !(a.from === from && a.to === to))
        : [...prev, { from, to }];
    });
  }, []);

  const handleClearPlannedArrows = useCallback(() => {
    setPlannedArrows((prev) => (prev.length === 0 ? prev : []));
  }, []);

  // Copy FEN & Copy PGN header actions (Additional Point #4)
  const handleCopyFen = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeFen);
        showHintToast('FEN copied to clipboard');
      } else {
        showHintToast('Clipboard unavailable');
      }
    } catch {
      showHintToast('Could not copy FEN');
    }
  }, [activeFen, showHintToast]);

  const handleCopyPgn = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(game.rawPgn);
        showHintToast('PGN copied to clipboard');
      } else {
        showHintToast('Clipboard unavailable');
      }
    } catch {
      showHintToast('Could not copy PGN');
    }
  }, [game.rawPgn, showHintToast]);

  const handleToggleCoachExpanded = useCallback(() => {
    const next = !isCoachExpanded;
    if (onUpdateUiPrefs) {
      onUpdateUiPrefs({ isReplayCoachExpanded: next }, true);
    } else {
      setLocalCoachExpanded(next);
    }
  }, [isCoachExpanded, onUpdateUiPrefs]);

  const handleToggleMoveListExpanded = useCallback(() => {
    const next = !isMoveListExpanded;
    if (onUpdateUiPrefs) {
      onUpdateUiPrefs({ isReplayMoveListExpanded: next }, true);
    } else {
      setLocalMoveListExpanded(next);
    }
  }, [isMoveListExpanded, onUpdateUiPrefs]);

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

  // Resolve most recent [%clk] for White and Black up to currentPly
  const latestClocks = useMemo(() => {
    let whiteClock: string | undefined;
    let blackClock: string | undefined;
    for (let i = 1; i <= currentPly && i < game.timeline.length; i++) {
      const node = game.timeline[i];
      if (node.clock) {
        if (node.color === 'w') whiteClock = node.clock;
        else if (node.color === 'b') blackClock = node.clock;
      }
    }
    return { w: whiteClock, b: blackClock };
  }, [game.timeline, currentPly]);

  const material = useMemo(
    () => calculateMaterialBalance(activeBoardState.board),
    [activeBoardState.board]
  );

  const topColor: Color = boardRotation === 180 ? 'w' : 'b';
  const bottomColor: Color = boardRotation === 180 ? 'b' : 'w';

  const getPlayerMeta = (color: Color) => {
    const rawCaptured =
      color === 'w'
        ? activeBoardState.capturedByWhite
        : activeBoardState.capturedByBlack;
    const sideLabel =
      boardRotation === 90
        ? color === 'w'
          ? ' (Left)'
          : ' (Right)'
        : boardRotation === 270
        ? color === 'w'
          ? ' (Right)'
          : ' (Left)'
        : '';
    return {
      name: `${color === 'w' ? game.headers.White : game.headers.Black}${sideLabel}`,
      elo: color === 'w' ? game.headers.WhiteElo : game.headers.BlackElo,
      clock: latestClocks[color],
      captured: sortCapturedPieces(rawCaptured),
      advantage:
        color === 'w'
          ? material.diff > 0
            ? material.diff
            : 0
          : material.diff < 0
          ? -material.diff
          : 0,
      isTurn: activeBoardState.status === 'playing' && activeTurn === color,
    };
  };

  const topPlayer = getPlayerMeta(topColor);
  const bottomPlayer = getPlayerMeta(bottomColor);

  const terminalReasonLabel = useMemo(() => {
    if (!isTerminalPosition) return null;
    if (activeBoardState.status === 'checkmate') {
      return `Checkmate (${activeBoardState.winner === 'w' ? '1-0' : '0-1'})`;
    }
    if (activeBoardState.status === 'stalemate') {
      return 'Stalemate (1/2-1/2)';
    }
    return 'Game Drawn';
  }, [isTerminalPosition, activeBoardState.status, activeBoardState.winner]);

  const progressPct = maxPly > 0 ? Math.round((currentPly / maxPly) * 100) : 0;

  // Hover preview arrow on board when hovering a Coach alternative
  const hoveredAltArrow =
    hoveredAltIndex !== null && coachInsight?.alternatives[hoveredAltIndex]
      ? {
          from: coachInsight.alternatives[hoveredAltIndex].move.from,
          to: coachInsight.alternatives[hoveredAltIndex].move.to,
        }
      : null;

  const stripWidthPx =
    boardGeometry.frameWidthPx + (showEvalBar ? EVAL_BAR_RESERVE_PX : 0);

  const activeCoachSan = activeNode.san;
  const activeCoachTurnNumber = activeNode.turnNumber;
  const activeCoachColor = activeNode.color;

  const renderCapturedStrip = (
    captured: ReturnType<typeof sortCapturedPieces>,
    ownerColor: Color
  ) => {
    const maxVisible = 12;
    const visible = captured.slice(0, maxVisible);
    const overflow = captured.length - visible.length;
    return (
      <div className="flex items-center -space-x-1.5">
        {visible.map((pt, i) => (
          <span key={`${pt}-${i}`} className="w-4 h-4 inline-block shrink-0">
            <ChessPieceSvg type={pt} color={ownerColor === 'w' ? 'b' : 'w'} />
          </span>
        ))}
        {overflow > 0 && (
          <span className="pl-2 text-[10px] font-mono font-bold text-[#A69F91] tabular-nums">
            +{overflow}
          </span>
        )}
      </div>
    );
  };

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
        <div className="w-full max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-2.5">
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

          {/* Right: Copy FEN/PGN, Library, Board Customizer, Mute */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              data-testid="replay-copy-fen-btn"
              onClick={handleCopyFen}
              title="Copy current position FEN"
              className="h-9 px-2.5 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-[11px] font-mono font-semibold text-[#EADBC8] hover:text-[#F4EFE6] hidden sm:flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Copy className="w-3 h-3 text-[#C6923A]" />
              <span>FEN</span>
            </button>

            <button
              type="button"
              data-testid="replay-copy-pgn-btn"
              onClick={handleCopyPgn}
              title="Copy full game PGN"
              className="h-9 px-2.5 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-[11px] font-mono font-semibold text-[#EADBC8] hover:text-[#F4EFE6] hidden sm:flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Copy className="w-3 h-3 text-[#C6923A]" />
              <span>PGN</span>
            </button>

            <button
              type="button"
              data-testid="replay-open-library-btn"
              onClick={() => {
                setIsAutoPlaying(false);
                onOpenLibrary();
              }}
              className="h-9 px-3 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#C6923A]/60 text-xs font-semibold text-[#F4EFE6] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
        className={`flex-1 min-h-0 w-full max-w-[1640px] mx-auto px-3 sm:px-5 py-3 flex ${
          isDesktopSplit
            ? 'flex-row items-stretch justify-center gap-6'
            : 'flex-col items-center justify-start gap-4 pb-8'
        }`}
      >
        {/* Left Column: Board + Vertical EvalBar + Player Nameplates + Contextual Sideline Banner */}
        <section
          aria-label="Replay chessboard"
          className={`flex flex-col items-center justify-center gap-2 min-w-0 min-h-0 ${
            isDesktopSplit ? 'flex-1' : 'w-full shrink-0'
          }`}
        >
          {/* Contextual Inline "What-If" Sideline Banner (appears ONLY when exploring) */}
          {sideline && (
            <div
              data-testid="replay-sideline-banner"
              style={{ width: `${stripWidthPx}px` }}
              className="max-w-full px-3 py-1.5 rounded-lg bg-[#16272B] border border-[#38BDF8]/55 flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                <span className="font-semibold text-[#E0F2FE] whitespace-nowrap shrink-0">
                  {sideline.label}
                </span>
                <span className="font-mono text-[11px] text-[#93C5FD] truncate tabular-nums">
                  {sideline.nodes
                    .slice(0, sideline.activeIndex + 1)
                    .map((n) => n.san)
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  data-testid="sideline-step-back-btn"
                  onClick={stepSidelineBack}
                  className="px-2 py-0.5 rounded bg-[#1D3238] hover:bg-[#26424A] border border-[#38BDF8]/40 text-[11px] font-semibold text-[#E0F2FE] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>Step Back</span>
                </button>
                <button
                  type="button"
                  data-testid="sideline-exit-btn"
                  onClick={exitSideline}
                  className="px-2 py-0.5 rounded bg-[#C6923A] hover:bg-[#D4A048] text-[11px] font-bold text-[#111815] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Mainline</span>
                </button>
              </div>
            </div>
          )}

          {/* Top Player Strip */}
          <div
            data-testid="replay-top-player-strip"
            style={{ width: `${stripWidthPx}px` }}
            className="max-w-full h-[36px] shrink-0 px-3 rounded-lg bg-[#151E19] border border-[#26342C] flex items-center justify-between gap-2"
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

            <div className="flex items-center gap-2 shrink-0">
              {renderCapturedStrip(topPlayer.captured, topColor)}
              {topPlayer.advantage > 0 && (
                <span className="text-[11px] font-mono font-bold text-[#EADBC8] tabular-nums">
                  +{topPlayer.advantage}
                </span>
              )}
              {topPlayer.clock && (
                <span
                  data-testid="replay-top-clock"
                  className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#C6923A] tabular-nums pl-1 border-l border-[#293830]"
                >
                  <Clock className="w-3 h-3" />
                  <span>{topPlayer.clock}</span>
                </span>
              )}
            </div>
          </div>

          {/* Board + Vertical Evaluation Bar Row */}
          <div className="flex items-center justify-center gap-2 max-w-full">
            {showEvalBar && (
              <EvalBar
                evalWhiteCp={liveEval.cp}
                formattedScore={liveEval.formatted}
                heightPx={boardGeometry.frameHeightPx}
                isFlipped={isFlipped}
                boardRotation={boardRotation}
                isLoading={isAnalyzingPly}
              />
            )}

            <ChessBoard
              gameState={activeBoardState}
              legalMoves={activeLegalMoves}
              selectedSquare={selectedSquare}
              pendingPromotion={pendingPromotion}
              isFlipped={isFlipped}
              boardRotation={boardRotation}
              isInteractionDisabled={isTerminalPosition}
              helperMode={false}
              showBoardSuggestions={false}
              isPreviewingHistory={false}
              helperAnalysis={null}
              highlightedHelperRank={null}
              plannedArrows={plannedArrows}
              hintArrow={hoveredAltArrow}
              onSquareClick={handleReplaySquareClick}
              onMovePiece={handleReplayAttemptMove}
              onTogglePlannedArrow={handleTogglePlannedArrow}
              onClearPlannedArrows={handleClearPlannedArrows}
              onSelectPromotion={handleReplaySelectPromotion}
              onCancelPromotion={() => setPendingPromotion(null)}
              onDisabledInteractionAttempt={() => {
                showHintToast(
                  'Game has ended at this ply — step back to an earlier move to explore or play.'
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
          </div>

          {/* Bottom Player Strip */}
          <div
            data-testid="replay-bottom-player-strip"
            style={{ width: `${stripWidthPx}px` }}
            className="max-w-full h-[36px] shrink-0 px-3 rounded-lg bg-[#151E19] border border-[#26342C] flex items-center justify-between gap-2"
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

            <div className="flex items-center gap-2 shrink-0">
              {renderCapturedStrip(bottomPlayer.captured, bottomColor)}
              {bottomPlayer.advantage > 0 && (
                <span className="text-[11px] font-mono font-bold text-[#EADBC8] tabular-nums">
                  +{bottomPlayer.advantage}
                </span>
              )}
              {bottomPlayer.clock && (
                <span
                  data-testid="replay-bottom-clock"
                  className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#C6923A] tabular-nums pl-1 border-l border-[#293830]"
                >
                  <Clock className="w-3 h-3" />
                  <span>{bottomPlayer.clock}</span>
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Replay Studio Sidebar */}
        <aside
          aria-label="Replay controls, tactical coach, and move notation"
          className={`${
            isDesktopSplit
              ? 'w-[440px] shrink-0 h-full min-h-0'
              : 'w-full max-w-[560px]'
          } bg-[#151E19] border border-[#26342C] rounded-2xl flex flex-col overflow-hidden`}
        >
          {/* 1. Compact Match Metadata & Progress Track */}
          <div className="px-3.5 py-2.5 bg-[#121A16] border-b border-[#26342C] space-y-1.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-[#C6923A] font-semibold tabular-nums truncate">
                Ply {currentPly} / {maxPly}
                {currentNode.san
                  ? ` · ${currentNode.turnNumber}${
                      currentNode.color === 'w' ? '.' : '...'
                    } ${currentNode.san}${currentNode.nag ?? ''}`
                  : ' · Starting Position'}
              </span>
              <span className="text-xs font-mono text-[#A69F91] tabular-nums shrink-0">
                {game.result}
              </span>
            </div>

            <div className="w-full h-1 rounded-full bg-[#223028] overflow-hidden">
              <div
                className="h-full bg-[#C6923A] transition-all duration-150"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {game.description && (
              <p className="text-[11px] text-[#B8B1A2] leading-snug line-clamp-1">
                {game.description}
              </p>
            )}
          </div>

          {/* 2. Async Full-Game Advantage Graph & Turning Points */}
          <ReplayAdvantageGraph
            report={fullReviewReport}
            isAnalyzing={isRunningFullReview}
            progress={fullReviewProgress}
            currentPly={currentPly}
            totalPlies={maxPly}
            onStartFullAnalysis={handleStartFullAnalysis}
            onCancelFullAnalysis={handleCancelFullAnalysis}
            onJumpToPly={(ply) => jumpToPly(ply, { playAudio: false })}
          />

          {/* 3. Pinned Collapsible Tactical Coach Card (directly above Move List) */}
          <ReplayCoachCard
            insight={coachInsight}
            isAnalyzing={isAnalyzingPly}
            isAutoPlaying={isAutoPlaying}
            isSideline={Boolean(sideline)}
            ply={activeNode.ply}
            playedSan={activeCoachSan}
            turnNumber={activeCoachTurnNumber}
            moveColor={activeCoachColor}
            pgnComment={sideline ? activeNode.comment : currentNode.comment}
            pgnVariations={sideline ? undefined : currentNode.variations}
            isExpanded={isCoachExpanded}
            expandToFill={!isMoveListExpanded && isDesktopSplit}
            onToggleExpanded={handleToggleCoachExpanded}
            hoveredAltIndex={hoveredAltIndex}
            onHoverAlternative={setHoveredAltIndex}
            onTryAlternative={handleTryAlternative}
            onLoadPgnVariation={handleLoadPgnVariation}
          />

          {/* 4. Playback Controls + Collapsible Move List */}
          <div
            data-testid="replay-control-bar"
            className="px-3 py-2.5 bg-[#17211C] border-b border-[#26342C] space-y-2 shrink-0"
          >
            <div className="flex items-center justify-between gap-1.5">
              {/* Play + Arrow Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="replay-btn-start"
                  aria-label="Jump to start"
                  title="Jump to start (Up / Home)"
                  disabled={currentPly === 0 && !sideline}
                  onClick={() => jumpToPly(0)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] disabled:opacity-40 disabled:pointer-events-none border border-[#34463C] text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-testid="replay-btn-prev"
                  aria-label="Step backward one move"
                  title="Previous move (Left Arrow)"
                  disabled={currentPly === 0 && !sideline}
                  onClick={stepBackward}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] disabled:opacity-40 disabled:pointer-events-none border border-[#34463C] text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
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
                  className={`h-8 sm:h-9 w-[76px] sm:w-[80px] rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
                  disabled={currentPly >= maxPly && !sideline}
                  onClick={() => {
                    setIsAutoPlaying(false);
                    stepForward(false);
                  }}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] disabled:opacity-40 disabled:pointer-events-none border border-[#34463C] text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="replay-btn-end"
                  aria-label="Jump to end"
                  title="Jump to end (Down / End)"
                  disabled={currentPly >= maxPly && !sideline}
                  onClick={() => jumpToPly(maxPly)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] disabled:opacity-40 disabled:pointer-events-none border border-[#34463C] text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Speed, Flip & Move List Compact Toggle */}
              <div className="flex items-center gap-1 shrink-0">
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
                      className={`px-1.5 py-1 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
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
                  data-testid="replay-btn-rotate"
                  aria-label="Rotate board 90 degrees clockwise"
                  title={`Rotate Board +90° (T) · Currently ${boardRotation}°`}
                  onClick={() => setBoardRotation((prev) => rotateBoardCW(prev))}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    boardRotation === 90 || boardRotation === 270
                      ? 'bg-[#252014] hover:bg-[#332C1A] border-[#C6923A] text-[#C6923A]'
                      : 'bg-[#212E27] hover:bg-[#2C3D34] border-[#34463C] text-[#EADBC8]'
                  }`}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  data-testid="replay-btn-flip"
                  aria-label="Flip board perspective"
                  title="Flip Board 180° (F)"
                  onClick={() =>
                    setBoardRotation((prev) => flipBoardRotation(prev))
                  }
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-[#EADBC8] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <FlipVertical2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  data-testid="replay-movelist-toggle"
                  aria-expanded={isMoveListExpanded}
                  aria-label={
                    isMoveListExpanded
                      ? 'Compact move list to playback controls only'
                      : 'Expand move list'
                  }
                  title={
                    isMoveListExpanded
                      ? 'Compact Move List'
                      : 'Expand Move List'
                  }
                  onClick={handleToggleMoveListExpanded}
                  className={`h-8 sm:h-9 px-2 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isMoveListExpanded
                      ? 'bg-[#212E27] hover:bg-[#2C3D34] border-[#34463C] text-[#EADBC8]'
                      : 'bg-[#1D2B24] hover:bg-[#26382F] border-[#C6923A]/60 text-[#C6923A]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  {isMoveListExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            <div className="text-[10px] font-mono text-[#7A7467] flex items-center justify-between">
              <span>Drag piece for What-If · Right-click arrows</span>
              <span>←/→ · Space · F</span>
            </div>
          </div>

          {/* Interactive Two-Column SAN Move List (collapsible down to just the playback buttons above) */}
          {isMoveListExpanded ? (
            <div
              ref={moveListContainerRef}
              data-testid="replay-move-list"
              className="flex-1 min-h-[68px] overflow-y-auto px-3 py-2 font-mono text-xs tabular-nums space-y-0.5"
            >
              {pairedRows.length === 0 ? (
                <div className="py-8 text-center text-[#7A7467] text-xs">
                  No moves recorded in this PGN. Drag any piece to explore or branch below.
                </div>
              ) : (
                pairedRows.map((row) => {
                  const isWhiteActive =
                    !sideline &&
                    row.whiteNode &&
                    currentPly === row.whiteNode.ply;
                  const isBlackActive =
                    !sideline &&
                    row.blackNode &&
                    currentPly === row.blackNode.ply;

                  const whiteQuality = row.whiteNode
                    ? reviewByPly.get(row.whiteNode.ply)
                    : undefined;
                  const blackQuality = row.blackNode
                    ? reviewByPly.get(row.blackNode.ply)
                    : undefined;

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
                          className={`col-span-5 py-1 px-2 rounded-md text-left transition-colors cursor-pointer flex items-center justify-between gap-1 ${
                            isWhiteActive
                              ? 'bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] font-bold'
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
                          <span className="flex items-center gap-1 shrink-0">
                            {whiteQuality &&
                              CLASSIFICATION_GLYPHS[whiteQuality] && (
                                <span
                                  data-testid={`move-quality-${row.whiteNode.ply}`}
                                  title={
                                    CLASSIFICATION_COLORS[whiteQuality].label
                                  }
                                  className="text-[10px] font-bold"
                                  style={{
                                    color: isWhiteActive
                                      ? '#111815'
                                      : CLASSIFICATION_COLORS[whiteQuality]
                                          .text,
                                  }}
                                >
                                  {CLASSIFICATION_GLYPHS[whiteQuality]}
                                </span>
                              )}
                            {row.whiteNode.variations &&
                              row.whiteNode.variations.length > 0 && (
                                <span
                                  className={`text-[10px] ${
                                    isWhiteActive
                                      ? 'text-[#111815]/80'
                                      : 'text-[#38BDF8]'
                                  }`}
                                  title="Has PGN sideline variation"
                                >
                                  ⎇
                                </span>
                              )}
                            {row.whiteNode.comment && (
                              <span
                                className={`text-[10px] ${
                                  isWhiteActive
                                    ? 'text-[#111815]/80'
                                    : 'text-[#A69F91]'
                                }`}
                                title="Has author note"
                              >
                                ¶
                              </span>
                            )}
                          </span>
                        </button>
                      ) : (
                        <span className="col-span-5 px-2 text-[#666055]">
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
                          className={`col-span-5 py-1 px-2 rounded-md text-left transition-colors cursor-pointer flex items-center justify-between gap-1 ${
                            isBlackActive
                              ? 'bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] font-bold'
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
                          <span className="flex items-center gap-1 shrink-0">
                            {blackQuality &&
                              CLASSIFICATION_GLYPHS[blackQuality] && (
                                <span
                                  data-testid={`move-quality-${row.blackNode.ply}`}
                                  title={
                                    CLASSIFICATION_COLORS[blackQuality].label
                                  }
                                  className="text-[10px] font-bold"
                                  style={{
                                    color: isBlackActive
                                      ? '#111815'
                                      : CLASSIFICATION_COLORS[blackQuality]
                                          .text,
                                  }}
                                >
                                  {CLASSIFICATION_GLYPHS[blackQuality]}
                                </span>
                              )}
                            {row.blackNode.variations &&
                              row.blackNode.variations.length > 0 && (
                                <span
                                  className={`text-[10px] ${
                                    isBlackActive
                                      ? 'text-[#111815]/80'
                                      : 'text-[#38BDF8]'
                                  }`}
                                  title="Has PGN sideline variation"
                                >
                                  ⎇
                                </span>
                              )}
                            {row.blackNode.comment && (
                              <span
                                className={`text-[10px] ${
                                  isBlackActive
                                    ? 'text-[#111815]/80'
                                    : 'text-[#A69F91]'
                                }`}
                                title="Has author note"
                              >
                                ¶
                              </span>
                            )}
                          </span>
                        </button>
                      ) : (
                        <span className="col-span-5" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : !isCoachExpanded && isDesktopSplit ? (
            <div className="flex-1 min-h-0" />
          ) : null}

          {/* 5. Prominent "Continue Play From Here" Section */}
          <div
            data-testid="continue-play-section"
            className="px-3.5 py-2.5 bg-[#121A16] border-t border-[#2B3B32] space-y-2 shrink-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#F4EFE6]">
                {sideline
                  ? 'Branch From What-If Line'
                  : 'Branch Into Live Play'}
              </span>
              {chosenBranchChoice === 'both' ? (
                <span
                  data-testid="replay-branch-mode-label"
                  className="text-[11px] font-mono text-[#C6923A] tabular-nums"
                >
                  Pass &amp; Play · Both Sides
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="replay-tune-ai-btn"
                  onClick={onOpenEngineCustomizer}
                  className="text-[11px] font-mono text-[#C6923A] hover:text-[#E2B055] transition-colors cursor-pointer tabular-nums"
                >
                  AI: {engineSummary.title} · Tune
                </button>
              )}
            </div>

            <div className="h-[62px] flex flex-col justify-center gap-1.5">
              {isTerminalPosition ? (
                <div
                  data-testid="replay-terminal-notice"
                  className="p-2 rounded-lg bg-[#1D2521] border border-[#34463C] text-xs text-[#C6BFA8] leading-snug"
                >
                  <strong className="text-[#C6923A]">
                    {terminalReasonLabel}.
                  </strong>{' '}
                  Step back to an earlier move to branch into active play.
                </div>
              ) : (
                <>
                  <div
                    role="radiogroup"
                    aria-label="Choose side to play when branching"
                    className="grid grid-cols-3 gap-1.5 p-1 bg-[#18221D] border border-[#26342C] rounded-lg"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={chosenBranchChoice === 'w'}
                      data-testid="branch-as-white-btn"
                      onClick={() =>
                        setBranchChoiceForPly({ ply: currentPly, choice: 'w' })
                      }
                      className={`py-1.5 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        chosenBranchChoice === 'w'
                          ? 'bg-[#EADBC8] text-[#1A1410] font-bold'
                          : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#223028]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FCF9F2] border border-[#332B24] shrink-0" />
                      <span>White</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={chosenBranchChoice === 'b'}
                      data-testid="branch-as-black-btn"
                      onClick={() =>
                        setBranchChoiceForPly({ ply: currentPly, choice: 'b' })
                      }
                      className={`py-1.5 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        chosenBranchChoice === 'b'
                          ? 'bg-[#EADBC8] text-[#1A1410] font-bold'
                          : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#223028]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-[#22262A] border border-[#C8B9A6] shrink-0" />
                      <span>Black</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={chosenBranchChoice === 'both'}
                      data-testid="branch-as-both-btn"
                      onClick={() =>
                        setBranchChoiceForPly({ ply: currentPly, choice: 'both' })
                      }
                      className={`py-1.5 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        chosenBranchChoice === 'both'
                          ? 'bg-[#EADBC8] text-[#1A1410] font-bold'
                          : 'text-[#C6BFA8] hover:text-[#F4EFE6] hover:bg-[#223028]'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-[#C6923A] shrink-0"
                        style={{
                          background:
                            'linear-gradient(90deg, #FCF9F2 50%, #22262A 50%)',
                        }}
                      />
                      <span>Both</span>
                    </button>
                  </div>

                  <p
                    data-testid="replay-branch-helper-text"
                    className="text-[11px] text-[#A69F91] truncate"
                  >
                    {chosenBranchChoice === 'both'
                      ? `${activeTurn === 'w' ? 'White' : 'Black'} to move — you will control both sides.`
                      : chosenBranchChoice === activeTurn
                      ? `${activeTurn === 'w' ? 'White' : 'Black'} to move — you make the first move.`
                      : `${activeTurn === 'w' ? 'White' : 'Black'} to move — AI responds immediately.`}
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              data-testid="continue-play-from-here-btn"
              disabled={isTerminalPosition}
              onClick={() => {
                setIsAutoPlaying(false);
                const shouldFlipBoard =
                  chosenBranchChoice === 'both'
                    ? isFlipped
                    : chosenBranchChoice === 'b';
                if (sideline) {
                  const baseStack = buildStateStackUpToPly(
                    game,
                    sideline.anchorPly
                  );
                  const customStack = [
                    ...baseStack,
                    ...sideline.nodes
                      .slice(0, sideline.activeIndex + 1)
                      .map((n) => n.gameState),
                  ];
                  onContinuePlayFromHere(
                    sideline.anchorPly,
                    chosenBranchChoice,
                    shouldFlipBoard,
                    customStack
                  );
                } else {
                  onContinuePlayFromHere(
                    currentPly,
                    chosenBranchChoice,
                    shouldFlipBoard
                  );
                }
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-[#C6923A] hover:bg-[#D4A048] active:bg-[#B5822D] disabled:opacity-40 disabled:pointer-events-none text-[#111815] font-bold text-sm tracking-wide transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-[0_6px_18px_rgba(198,146,58,0.25)] whitespace-nowrap"
            >
              <Swords className="w-4 h-4 shrink-0" />
              <span>
                {isTerminalPosition
                  ? 'Game Ended at This Ply'
                  : sideline
                  ? 'Continue Play From Sideline'
                  : 'Continue Play From Here'}
              </span>
            </button>
          </div>
        </aside>
      </main>

      {/* Non-intrusive Replay Notification Toast */}
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
