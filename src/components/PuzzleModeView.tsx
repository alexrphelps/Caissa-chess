import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createInitialGameState,
  fenToGameState,
  generateLegalMoves,
  getPieceAt,
  isValidSquare,
  makeMove,
  oppositeColor,
  togglePlannedArrow,
} from '../chess/engine';
import {
  evaluateAlternativeMove,
  fetchAdaptivePuzzle,
  fetchBucketPuzzle,
  loadPuzzleBucket,
} from '../chess/puzzles/puzzleService';
import {
  DEFAULT_INITIAL_RATING,
  clearPlayedPuzzleRecords,
  getRatingBandForRating,
  loadPlayerPuzzleStats,
  loadPlayedPuzzleRecords,
  recordPlayedPuzzleRecord,
  savePlayerPuzzleStats,
  updatePlayerStats,
} from '../chess/puzzles/ratingEngine';
import { moveToUci, uciToMove } from '../chess/puzzles/puzzleExtractor';
import {
  ActivePuzzleSession,
  ChessPuzzle,
  HintTier,
  PlayedPuzzleEntry,
  PlayerPuzzleStats,
  PuzzleStepStatus,
  RatingBand,
  RATING_BANDS,
} from '../chess/puzzles/types';
import {
  BoardRotation,
  Color,
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
import { soundFX } from '../utils/sound';
import {
  computeBoardGridSize,
  DEFAULT_UI_LAYOUT_PREFERENCES,
  UILayoutPreferences,
} from '../utils/layoutMath';
import { ChessBoard } from './ChessBoard';
import { PastPuzzlesModal } from './PastPuzzlesModal';
import {
  Award,
  ChevronRight,
  Flame,
  HelpCircle,
  History,
  Lightbulb,
  Play,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';

interface PuzzleModeViewProps {
  onExit: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  uiPrefs?: UILayoutPreferences;
  onUpdateUiPrefs?: (patch: Partial<UILayoutPreferences>, persist?: boolean) => void;
  onOpenBoardCustomizer?: () => void;
}

const SETUP_MOVE_DELAY_MS = 400;
const OPPONENT_REPLY_DELAY_MS = 380;

export const PuzzleModeView: React.FC<PuzzleModeViewProps> = ({
  onExit,
  isMuted,
  onToggleMute,
  uiPrefs = DEFAULT_UI_LAYOUT_PREFERENCES,
  onUpdateUiPrefs,
  onOpenBoardCustomizer,
}) => {
  // Responsive arena measurement for Puzzle Mode board auto-fit
  const puzzleArenaRef = useRef<HTMLElement | null>(null);
  const [puzzleArenaSize, setPuzzleArenaSize] = useState<{
    width: number;
    height: number;
  }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height:
      typeof window !== 'undefined'
        ? Math.max(420, window.innerHeight - 60)
        : 840,
  }));
  const [puzzleViewport, setPuzzleViewport] = useState<{
    width: number;
    height: number;
  }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  useEffect(() => {
    const syncViewport = () => {
      setPuzzleViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    const node = puzzleArenaRef.current;
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
      setPuzzleArenaSize((prev) =>
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

  const isPuzzleDesktopSplit = puzzleViewport.width >= 1024;
  const lockPuzzleViewport = isPuzzleDesktopSplit && puzzleViewport.height >= 540;

  const puzzleBoardGeometry = useMemo(() => {
    const rightSidebarWidth = isPuzzleDesktopSplit ? 420 : 0;
    const gapWidth = isPuzzleDesktopSplit ? 24 : 0;
    const availW = Math.max(320, puzzleArenaSize.width - rightSidebarWidth - gapWidth);
    return computeBoardGridSize({
      availableWidth: availW,
      availableHeight: puzzleArenaSize.height,
      boardScale: uiPrefs.boardScale,
      coordinateStyle: uiPrefs.coordinateStyle,
      showHelperBox: false,
      underBoardStripHeight: 36,
      isStackedLayout: !isPuzzleDesktopSplit || !lockPuzzleViewport,
    });
  }, [
    isPuzzleDesktopSplit,
    lockPuzzleViewport,
    puzzleArenaSize.width,
    puzzleArenaSize.height,
    uiPrefs.boardScale,
    uiPrefs.coordinateStyle,
  ]);
  // Persistent Player Puzzle Stats
  const [playerStats, setPlayerStats] = useState<PlayerPuzzleStats>(() => {
    return loadPlayerPuzzleStats();
  });
  const playerStatsRef = useRef(playerStats);
  useEffect(() => {
    playerStatsRef.current = playerStats;
  }, [playerStats]);

  // Selected manual difficulty band override ('adaptive' or explicit band)
  const [tierOverride, setTierOverride] = useState<RatingBand | 'adaptive'>('adaptive');
  const tierOverrideRef = useRef(tierOverride);
  useEffect(() => {
    tierOverrideRef.current = tierOverride;
  }, [tierOverride]);

  // Active puzzle & puzzle flow session state
  const [currentPuzzle, setCurrentPuzzle] = useState<ChessPuzzle | null>(null);
  // Dynamically tracked move sequence (adapts on alternative moves)
  const [activeMoves, setActiveMoves] = useState<string[]>([]);
  const activeMovesRef = useRef<string[]>([]);
  useEffect(() => {
    activeMovesRef.current = activeMoves;
  }, [activeMoves]);

  const [puzzleState, setPuzzleState] = useState<GameState | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(0);
  const [stepStatus, setStepStatus] = useState<PuzzleStepStatus>('idle');
  const [hintTier, setHintTier] = useState<HintTier>(0);
  const [isAssisted, setIsAssisted] = useState<boolean>(false);
  const [hasFailedCurrent, setHasFailedCurrent] = useState<boolean>(false);
  const [lastDelta, setLastDelta] = useState<number | null>(null);

  // Past Puzzles & Replay drawer state
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [pastRecords, setPastRecords] = useState<PlayedPuzzleEntry[]>(() =>
    loadPlayedPuzzleRecords()
  );
  const [isReplayingPast, setIsReplayingPast] = useState<boolean>(false);

  // Board interaction states
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const [boardRotation, setBoardRotation] = useState<BoardRotation>(0);
  const isFlipped = boardRotation === 180;

  // Feedback animations
  const [shakeBoard, setShakeBoard] = useState<boolean>(false);
  const [incorrectSquare, setIncorrectSquare] = useState<Square | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Refs for timers & memory hygiene (strictly user-triggered manual progression)
  const setupMoveTimerRef = useRef<number | null>(null);
  const oppReplyTimerRef = useRef<number | null>(null);
  const shakeTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const clearAllTimers = useCallback(() => {
    if (setupMoveTimerRef.current !== null) {
      window.clearTimeout(setupMoveTimerRef.current);
      setupMoveTimerRef.current = null;
    }
    if (oppReplyTimerRef.current !== null) {
      window.clearTimeout(oppReplyTimerRef.current);
      oppReplyTimerRef.current = null;
    }
    if (shakeTimerRef.current !== null) {
      window.clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = null;
    }
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  const showToast = useCallback((msg: string, durationMs = 2400) => {
    setFeedbackToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setFeedbackToast((prev) => (prev === msg ? null : prev));
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  // Determine user perspective color (side to move after setup move)
  const playerColor: Color = useMemo(() => {
    if (!currentPuzzle) return 'w';
    const rootState = fenToGameState(currentPuzzle.fen);
    if (!rootState) return 'w';
    // Opponent makes setup move (moves[0]), so player's turn is opposite
    return oppositeColor(rootState.turn);
  }, [currentPuzzle]);

  // Load a new adaptive or bucket puzzle
  const loadNextPuzzle = useCallback(
    async (excludeId?: string, explicitTier?: RatingBand | 'adaptive') => {
      clearAllTimers();
      setSelectedSquare(null);
      setPendingPromotion(null);
      setShakeBoard(false);
      setIncorrectSquare(null);
      setHintTier(0);
      setIsAssisted(false);
      setHasFailedCurrent(false);
      setLastDelta(null);
      setStepStatus('idle');
      setPlannedArrows([]);
      setIsReplayingPast(false);

      const tier = explicitTier ?? tierOverrideRef.current;
      const rating = playerStatsRef.current.rating;

      let puzzle: ChessPuzzle;
      if (tier === 'adaptive') {
        puzzle = await fetchAdaptivePuzzle(rating, excludeId);
      } else {
        puzzle = await fetchBucketPuzzle(tier, excludeId);
      }

      setCurrentPuzzle(puzzle);
      setActiveMoves(puzzle.moves);
      activeMovesRef.current = puzzle.moves;

      const root = fenToGameState(puzzle.fen);
      if (!root) {
        showToast('Error loading puzzle position');
        return;
      }

      setPuzzleState(root);
      setCurrentMoveIndex(0);

      // Auto perspective: orient board to player's side
      const playerSide = oppositeColor(root.turn);
      setBoardRotation(playerSide === 'b' ? 180 : 0);

      // Animate opponent setup blunder moves[0] after brief delay
      setStepStatus('playing_setup');
      setupMoveTimerRef.current = window.setTimeout(() => {
        setupMoveTimerRef.current = null;
        const setupUci = puzzle.moves[0];
        const setupMove = uciToMove(root, setupUci);
        if (setupMove) {
          const afterSetup = makeMove(root, setupMove);
          setPuzzleState(afterSetup);
          setCurrentMoveIndex(1);
          setStepStatus('player_turn');
          soundFX.playMove();
        } else {
          setStepStatus('player_turn');
        }
      }, SETUP_MOVE_DELAY_MS);
    },
    [clearAllTimers, showToast]
  );

  // Directly load and replay a specific past puzzle
  const handleReplayPastPuzzle = useCallback(
    (puzzle: ChessPuzzle) => {
      clearAllTimers();
      setSelectedSquare(null);
      setPendingPromotion(null);
      setShakeBoard(false);
      setIncorrectSquare(null);
      setHintTier(0);
      setIsAssisted(false);
      setHasFailedCurrent(false);
      setLastDelta(null);
      setStepStatus('idle');
      setPlannedArrows([]);
      setIsReplayingPast(true);

      setCurrentPuzzle(puzzle);
      setActiveMoves(puzzle.moves);
      activeMovesRef.current = puzzle.moves;

      const root = fenToGameState(puzzle.fen);
      if (!root) {
        showToast('Error loading past puzzle position');
        return;
      }

      setPuzzleState(root);
      setCurrentMoveIndex(0);

      const playerSide = oppositeColor(root.turn);
      setBoardRotation(playerSide === 'b' ? 180 : 0);

      setStepStatus('playing_setup');
      setupMoveTimerRef.current = window.setTimeout(() => {
        setupMoveTimerRef.current = null;
        const setupUci = puzzle.moves[0];
        const setupMove = uciToMove(root, setupUci);
        if (setupMove) {
          const afterSetup = makeMove(root, setupMove);
          setPuzzleState(afterSetup);
          setCurrentMoveIndex(1);
          setStepStatus('player_turn');
          soundFX.playMove();
        } else {
          setStepStatus('player_turn');
        }
      }, SETUP_MOVE_DELAY_MS);
      showToast(`Replaying Puzzle #${puzzle.id}`);
    },
    [clearAllTimers, showToast]
  );

  const handleClearHistory = useCallback(() => {
    clearPlayedPuzzleRecords();
    setPastRecords([]);
    showToast('Puzzle history cleared.');
  }, [showToast]);

  // Initial load strictly once on component mount
  useEffect(() => {
    loadNextPuzzle();
  }, [loadNextPuzzle]);

  // Available legal moves in the active board state
  const legalMoves = useMemo(() => {
    if (!puzzleState || stepStatus !== 'player_turn') return [];
    return generateLegalMoves(puzzleState);
  }, [puzzleState, stepStatus]);

  // User-planned right-click arrows & drawing state
  const [plannedArrows, setPlannedArrows] = useState<PlannedArrow[]>([]);

  const handleTogglePlannedArrow = useCallback(
    (from: Square, to: Square) => {
      if (!puzzleState) return;
      setPlannedArrows((prev) =>
        togglePlannedArrow(prev, puzzleState, legalMoves, from, to)
      );
    },
    [puzzleState, legalMoves]
  );

  const handleClearPlannedArrows = useCallback(() => {
    setPlannedArrows((prev) => (prev.length === 0 ? prev : []));
  }, []);

  // Compute hint visuals based on hintTier and active adapted moves line
  const nextTargetUci = useMemo(() => {
    if (!currentPuzzle || currentMoveIndex >= activeMoves.length) return null;
    return activeMoves[currentMoveIndex];
  }, [currentPuzzle, activeMoves, currentMoveIndex]);

  const hintPieceSquare = useMemo(() => {
    if (hintTier < 1 || !nextTargetUci) return null;
    return nextTargetUci.slice(0, 2) as Square;
  }, [hintTier, nextTargetUci]);

  const hintDestSquare = useMemo(() => {
    if (hintTier < 2 || !nextTargetUci) return null;
    return nextTargetUci.slice(2, 4) as Square;
  }, [hintTier, nextTargetUci]);

  const hintArrow = useMemo(() => {
    if (hintTier < 3 || !nextTargetUci) return null;
    return {
      from: nextTargetUci.slice(0, 2) as Square,
      to: nextTargetUci.slice(2, 4) as Square,
    };
  }, [hintTier, nextTargetUci]);

  // Handle progressive hint request
  const handleRequestHint = useCallback(() => {
    if (stepStatus !== 'player_turn' && stepStatus !== 'failed') return;
    setIsAssisted(true);
    setHintTier((prev) => {
      const next = (Math.min(3, prev + 1) as HintTier);
      if (next === 1) {
        showToast('Hint: The highlighted piece needs to move.');
      } else if (next === 2) {
        showToast('Hint: Target destination revealed.');
      } else if (next === 3) {
        showToast('Solution line displayed (assisted solve).');
      }
      return next;
    });
  }, [stepStatus, showToast]);

  // Track solved puzzle IDs in this session to prevent rating duplication on replay
  const awardedPuzzleIdsRef = useRef<Set<string>>(new Set());

  // Final solve completion handler: strictly manual progression (no auto-advancing)
  const handleSolveCompleted = useCallback(
    (assisted: boolean) => {
      setStepStatus('solved');
      soundFX.playGameOver(true);

      if (currentPuzzle && awardedPuzzleIdsRef.current.has(currentPuzzle.id)) {
        setLastDelta(0);
        showToast('Puzzle solved again! (Replay completed)');
        recordPlayedPuzzleRecord({
          puzzleId: currentPuzzle.id,
          puzzle: currentPuzzle,
          outcome: 'solved',
          delta: 0,
          timestamp: Date.now(),
        });
        setPastRecords(loadPlayedPuzzleRecords());
        return;
      }

      if (currentPuzzle) {
        awardedPuzzleIdsRef.current.add(currentPuzzle.id);
      }

      const outcome = assisted || hasFailedCurrent ? 'assisted' : 'solved';
      const { updatedStats, delta } = updatePlayerStats(
        playerStatsRef.current,
        currentPuzzle?.rating ?? 1200,
        outcome
      );

      const calculatedDelta = hasFailedCurrent ? 0 : delta;
      setLastDelta(calculatedDelta);
      setPlayerStats(updatedStats);
      savePlayerPuzzleStats(updatedStats);

      if (currentPuzzle) {
        recordPlayedPuzzleRecord({
          puzzleId: currentPuzzle.id,
          puzzle: currentPuzzle,
          outcome,
          delta: calculatedDelta,
          timestamp: Date.now(),
        });
        setPastRecords(loadPlayedPuzzleRecords());
      }
    },
    [currentPuzzle, hasFailedCurrent, showToast]
  );

  // Play opponent reply after player's correct move
  const playOpponentReply = useCallback(
    (stateAfterPlayer: GameState, replyIndex: number, movesList?: string[]) => {
      const movesToUse = movesList ?? activeMovesRef.current;
      if (!currentPuzzle || replyIndex >= movesToUse.length) return;
      setStepStatus('opponent_turn');

      oppReplyTimerRef.current = window.setTimeout(() => {
        oppReplyTimerRef.current = null;
        const replyUci = movesToUse[replyIndex];
        const replyMove = uciToMove(stateAfterPlayer, replyUci);

        if (replyMove) {
          const stateAfterReply = makeMove(stateAfterPlayer, replyMove);
          setPuzzleState(stateAfterReply);
          const nextIndex = replyIndex + 1;
          setCurrentMoveIndex(nextIndex);

          if (replyMove.captured) {
            soundFX.playCapture();
          } else if (stateAfterReply.inCheck) {
            soundFX.playCheck();
          } else {
            soundFX.playMove();
          }

          if (nextIndex >= movesToUse.length) {
            // Sequence completed
            handleSolveCompleted(isAssisted);
          } else {
            setStepStatus('player_turn');
          }
        } else {
          // If opponent has no legal reply or sequence concluded, mark completed
          handleSolveCompleted(isAssisted);
        }
      }, OPPONENT_REPLY_DELAY_MS);
    },
    [currentPuzzle, isAssisted, handleSolveCompleted]
  );

  // Handle player move attempt
  const handleCommitPlayerMove = useCallback(
    (move: Move) => {
      if (!puzzleState || !currentPuzzle || stepStatus !== 'player_turn') return;

      const movesToUse = activeMovesRef.current;
      const expectedUci = movesToUse[currentMoveIndex];
      const isExactCatalogMove =
        expectedUci &&
        move.from === expectedUci.slice(0, 2) &&
        move.to === expectedUci.slice(2, 4) &&
        (!move.promotion || move.promotion.toLowerCase() === expectedUci[4]?.toLowerCase());

      if (isExactCatalogMove) {
        // Correct Move!
        const nextState = makeMove(puzzleState, move);
        setPuzzleState(nextState);
        setSelectedSquare(null);
        setPendingPromotion(null);
        setIncorrectSquare(null);
        setShakeBoard(false);
        setPlannedArrows([]);

        if (move.captured) {
          soundFX.playCapture();
        } else if (nextState.inCheck) {
          soundFX.playCheck();
        } else {
          soundFX.playMove();
        }

        const nextIndex = currentMoveIndex + 1;
        setCurrentMoveIndex(nextIndex);

        if (nextIndex >= movesToUse.length) {
          // Solved!
          handleSolveCompleted(isAssisted);
        } else {
          // Opponent replies
          playOpponentReply(nextState, nextIndex, movesToUse);
        }
      } else {
        // Check local engine for alternative valid solution
        setStepStatus('evaluating_alt');
        const altResult = evaluateAlternativeMove(
          puzzleState,
          move,
          expectedUci || '',
          playerColor
        );

        if (altResult.isEquivalent) {
          // Alternative move is tactically sound / forces mate!
          const playerMoveUci = moveToUci(move);
          const updatedMoves = [
            ...movesToUse.slice(0, currentMoveIndex),
            playerMoveUci,
            ...altResult.continuationMoves,
          ];
          setActiveMoves(updatedMoves);
          activeMovesRef.current = updatedMoves;

          showToast(`Alternative solution accepted: ${altResult.reason}!`);
          const nextState = makeMove(puzzleState, move);
          setPuzzleState(nextState);
          setSelectedSquare(null);
          setPendingPromotion(null);
          setIncorrectSquare(null);
          setShakeBoard(false);
          setPlannedArrows([]);
          soundFX.playMove();

          const nextIndex = currentMoveIndex + 1;
          setCurrentMoveIndex(nextIndex);

          if (nextIndex >= updatedMoves.length) {
            handleSolveCompleted(isAssisted);
          } else {
            playOpponentReply(nextState, nextIndex, updatedMoves);
          }
        } else {
          // Suboptimal / Incorrect Move!
          soundFX.playCheck(); // Audible buzzer
          setShakeBoard(true);
          setIncorrectSquare(move.from);
          setSelectedSquare(null);
          setPendingPromotion(null);
          showToast('Not the best move. Try again!');

          // Deduct rating once on first failure
          if (!hasFailedCurrent && !isAssisted) {
            setHasFailedCurrent(true);
            const { updatedStats, delta } = updatePlayerStats(
              playerStatsRef.current,
              currentPuzzle.rating,
              'failed'
            );
            setLastDelta(delta);
            setPlayerStats(updatedStats);
            savePlayerPuzzleStats(updatedStats);

            recordPlayedPuzzleRecord({
              puzzleId: currentPuzzle.id,
              puzzle: currentPuzzle,
              outcome: 'failed',
              delta,
              timestamp: Date.now(),
            });
            setPastRecords(loadPlayedPuzzleRecords());
          }

          // Clear board shake after 380ms animation
          if (shakeTimerRef.current !== null) {
            window.clearTimeout(shakeTimerRef.current);
          }
          shakeTimerRef.current = window.setTimeout(() => {
            setShakeBoard(false);
            shakeTimerRef.current = null;
          }, 380);

          // Keep player on the current puzzle in player_turn state to allow immediate retry
          setStepStatus('player_turn');
        }
      }
    },
    [
      puzzleState,
      currentPuzzle,
      currentMoveIndex,
      stepStatus,
      playerColor,
      isAssisted,
      hasFailedCurrent,
      handleSolveCompleted,
      playOpponentReply,
      showToast,
    ]
  );

  // Square click handling
  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!isValidSquare(square) || !puzzleState || stepStatus !== 'player_turn') {
        return;
      }

      setIncorrectSquare(null);

      if (selectedSquare && selectedSquare !== square) {
        const matches = legalMoves.filter(
          (m) => m.from === selectedSquare && m.to === square
        );
        if (matches.length > 0) {
          if (matches.some((m) => Boolean(m.promotion))) {
            setSelectedSquare(null);
            setPendingPromotion({ from: selectedSquare, to: square });
            return;
          }
          handleCommitPlayerMove(matches[0]);
          return;
        }
      }

      const piece = getPieceAt(puzzleState.board, square);
      if (piece && piece.color === puzzleState.turn) {
        setSelectedSquare((prev) => (prev === square ? null : square));
      } else {
        setSelectedSquare(null);
      }
    },
    [puzzleState, stepStatus, selectedSquare, legalMoves, handleCommitPlayerMove]
  );

  const handleAttemptDragMove = useCallback(
    (from: Square, to: Square) => {
      if (!isValidSquare(from) || !isValidSquare(to) || stepStatus !== 'player_turn') {
        return false;
      }
      setIncorrectSquare(null);

      const matches = legalMoves.filter((m) => m.from === from && m.to === to);
      if (matches.length === 0) return false;

      if (matches.some((m) => Boolean(m.promotion))) {
        setSelectedSquare(null);
        setPendingPromotion({ from, to });
        return true;
      }

      handleCommitPlayerMove(matches[0]);
      return true;
    },
    [legalMoves, stepStatus, handleCommitPlayerMove]
  );

  const handleSelectPromotion = useCallback(
    (promoPiece: PromotionPieceType) => {
      if (!pendingPromotion) return;
      const matched = legalMoves.find(
        (m) =>
          m.from === pendingPromotion.from &&
          m.to === pendingPromotion.to &&
          m.promotion === promoPiece
      );
      if (matched) {
        handleCommitPlayerMove(matched);
      }
    },
    [pendingPromotion, legalMoves, handleCommitPlayerMove]
  );

  // Reveal full solution line (forfeits rating)
  const handleRevealSolution = useCallback(() => {
    if (!currentPuzzle || !puzzleState) return;
    setIsAssisted(true);
    setHintTier(3);
    setStepStatus('revealed');
    showToast('Solution revealed.');

    recordPlayedPuzzleRecord({
      puzzleId: currentPuzzle.id,
      puzzle: currentPuzzle,
      outcome: 'assisted',
      delta: 0,
      timestamp: Date.now(),
    });
    setPastRecords(loadPlayedPuzzleRecords());
  }, [currentPuzzle, puzzleState, showToast]);

  // Reset current puzzle to initial state so player can replay from the beginning
  const handleResetPuzzle = useCallback(() => {
    if (!currentPuzzle) return;
    clearAllTimers();
    setSelectedSquare(null);
    setPendingPromotion(null);
    setShakeBoard(false);
    setIncorrectSquare(null);
    setHintTier(0);
    setHasFailedCurrent(false);

    const root = fenToGameState(currentPuzzle.fen);
    if (!root) {
      showToast('Error resetting puzzle');
      return;
    }

    setActiveMoves(currentPuzzle.moves);
    activeMovesRef.current = currentPuzzle.moves;
    setPuzzleState(root);
    setCurrentMoveIndex(0);
    setStepStatus('playing_setup');
    showToast('Replaying puzzle from start...');

    setupMoveTimerRef.current = window.setTimeout(() => {
      setupMoveTimerRef.current = null;
      const setupUci = currentPuzzle.moves[0];
      const setupMove = uciToMove(root, setupUci);
      if (setupMove) {
        const afterSetup = makeMove(root, setupMove);
        setPuzzleState(afterSetup);
        setCurrentMoveIndex(1);
        setStepStatus('player_turn');
        soundFX.playMove();
      } else {
        setStepStatus('player_turn');
      }
    }, SETUP_MOVE_DELAY_MS);
  }, [currentPuzzle, clearAllTimers, showToast]);

  const handleRetryCurrent = handleResetPuzzle;

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        if (stepStatus === 'solved' || stepStatus === 'revealed') {
          e.preventDefault();
          loadNextPuzzle(currentPuzzle?.id);
        }
      } else if (e.key === 'h' || e.key === 'H') {
        handleRequestHint();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleResetPuzzle();
      } else if (e.key === 'f' || e.key === 'F') {
        setBoardRotation((prev) => flipBoardRotation(prev));
      } else if (e.key === 't' || e.key === 'T') {
        setBoardRotation((prev) =>
          e.shiftKey ? rotateBoardCCW(prev) : rotateBoardCW(prev)
        );
      } else if (e.key === 'm' || e.key === 'M') {
        onToggleMute();
      } else if (e.key === 'Escape') {
        onExit();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    stepStatus,
    currentPuzzle?.id,
    loadNextPuzzle,
    handleRequestHint,
    handleResetPuzzle,
    onToggleMute,
    onExit,
  ]);

  const activeRatingBand = getRatingBandForRating(playerStats.rating);

  return (
    <div
      data-testid="puzzle-mode-view"
      className={`w-full bg-[#111815] text-[#F4EFE6] flex flex-col relative overflow-x-hidden ${
        lockPuzzleViewport
          ? 'h-dvh overflow-hidden'
          : 'min-h-dvh overflow-y-auto'
      }`}
    >
      {/* Top Header Bar for Adaptive Puzzle Mode */}
      <header className="w-full bg-[#16201C] border-b border-[#2A3B32] px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onExit}
            aria-label="Exit Puzzle Mode to Match"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer"
          >
            <span>← Match</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C6923A] animate-pulse" />
            <h1 className="text-sm sm:text-base font-bold font-serif tracking-wide text-[#F4EFE6]">
              Infinite Tactical Puzzles
            </h1>
          </div>
        </div>

        {/* Live Rating, Streak, & Delta Badge */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* User Live Rating */}
          <div
            data-testid="puzzle-live-rating-badge"
            className="flex items-center gap-1.5 bg-[#212E27] border border-[#34463C] px-3 py-1 rounded-lg shadow-sm"
          >
            <Trophy className="w-4 h-4 text-[#C6923A]" />
            <span className="text-xs font-mono font-bold text-[#F4EFE6]">
              {playerStats.rating} Elo
            </span>
            {lastDelta !== null && (
              <span
                data-testid="rating-delta-indicator"
                className={`text-xs font-mono font-bold px-1 rounded ${
                  lastDelta > 0
                    ? 'text-emerald-400 bg-emerald-950/60'
                    : lastDelta < 0
                    ? 'text-rose-400 bg-rose-950/60'
                    : 'text-amber-400 bg-amber-950/60'
                }`}
              >
                {lastDelta > 0 ? `+${lastDelta}` : lastDelta === 0 ? '±0' : lastDelta}
              </span>
            )}
          </div>

          {/* Win Streak Indicator */}
          <div
            data-testid="puzzle-streak-indicator"
            className="flex items-center gap-1 bg-[#212E27] border border-[#34463C] px-2.5 py-1 rounded-lg text-xs font-mono font-semibold text-amber-300"
          >
            <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>Streak: {playerStats.currentStreak}</span>
          </div>

          {/* Peak Rating */}
          <div className="hidden md:flex items-center gap-1 text-[11px] font-mono text-[#A69F91]">
            <span>Peak: {playerStats.peakRating}</span>
            <span>· Solved: {playerStats.totalSolved}</span>
          </div>

          {/* Difficulty Tier Selector */}
          <select
            data-testid="puzzle-tier-select"
            aria-label="Select Puzzle Difficulty Tier"
            value={tierOverride}
            onChange={(e) => {
              const nextTier = e.target.value as RatingBand | 'adaptive';
              setTierOverride(nextTier);
              tierOverrideRef.current = nextTier;
              loadNextPuzzle(undefined, nextTier);
            }}
            className="bg-[#212E27] border border-[#34463C] text-xs font-mono rounded-lg px-2.5 py-1 text-[#F4EFE6] hover:border-[#C6923A] focus:outline-none focus:ring-1 focus:ring-[#C6923A] cursor-pointer"
          >
            <option value="adaptive">Auto-Adaptive (Rating)</option>
            <option value="0400_0800">Novice (400-800)</option>
            <option value="0800_1200">Casual (800-1200)</option>
            <option value="1200_1600">Intermediate (1200-1600)</option>
            <option value="1600_2000">Advanced (1600-2000)</option>
            <option value="2000_2400">Expert (2000-2400)</option>
            <option value="2400_plus">Master (2400+)</option>
          </select>

          {/* Board & Layout Customizer */}
          {onOpenBoardCustomizer && (
            <button
              type="button"
              data-testid="puzzle-board-customizer-btn"
              onClick={onOpenBoardCustomizer}
              aria-label="Customize board theme and size"
              title="Board Theme & Layout"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] hover:border-[#C6923A] text-[#D6CFC2] hover:text-[#F4EFE6] text-xs font-semibold transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#C6923A]" />
              <span className="hidden md:inline">Board</span>
            </button>
          )}

          {/* Sound & Next Actions */}
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            className="p-1.5 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Reset / Replay Current Puzzle */}
          <button
            type="button"
            data-testid="puzzle-header-reset-button"
            onClick={handleResetPuzzle}
            aria-label="Reset and replay current puzzle"
            title="Reset and replay current puzzle [R]"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-[#D6CFC2] hover:text-[#F4EFE6] font-semibold text-xs transition-colors cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#C6923A]" />
            <span className="hidden sm:inline">Reset Puzzle</span>
            <span className="sm:hidden">Reset</span>
          </button>

          {/* Past Puzzles History Button */}
          <button
            type="button"
            data-testid="puzzle-history-header-button"
            onClick={() => setIsHistoryOpen(true)}
            aria-label="View Past Puzzles and Replay"
            title="View past puzzles to review and replay them"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] hover:border-[#C6923A] text-[#D6CFC2] hover:text-[#F4EFE6] font-semibold text-xs transition-colors cursor-pointer shadow-sm"
          >
            <History className="w-3.5 h-3.5 text-[#C6923A]" />
            <span className="hidden sm:inline">Past Puzzles</span>
            <span className="sm:hidden">History</span>
            {pastRecords.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#34463C] text-[#F4EFE6]">
                {pastRecords.length}
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="next-puzzle-header-button"
            onClick={() => loadNextPuzzle(currentPuzzle?.id)}
            aria-label="Skip to Next Puzzle"
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] font-bold text-xs transition-colors cursor-pointer shadow"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Practice Replay Banner when replaying past puzzle */}
      {isReplayingPast && (
        <div
          data-testid="past-puzzle-practice-banner"
          className="w-full bg-[#18261F] border-b border-[#C6923A]/50 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shadow-inner z-20"
        >
          <div className="flex items-center gap-2 text-[#F4EFE6]">
            <RotateCcw className="w-3.5 h-3.5 text-[#C6923A]" />
            <span className="font-semibold text-amber-300">
              Replaying Past Puzzle #{currentPuzzle?.id} ({currentPuzzle?.rating} Elo)
            </span>
            <span className="text-[#A69F91] hidden sm:inline">· Practice Mode (no rating changes)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetPuzzle}
              className="px-2.5 py-1 rounded bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-[#D6CFC2] text-xs font-semibold cursor-pointer"
            >
              Reset [R]
            </button>
            <button
              type="button"
              data-testid="resume-adaptive-queue-btn"
              onClick={() => {
                setIsReplayingPast(false);
                loadNextPuzzle();
              }}
              className="px-3 py-1 rounded bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] font-bold text-xs cursor-pointer shadow"
            >
              Resume Adaptive Queue →
            </button>
          </div>
        </div>
      )}

      {/* Main Tactical Arena: 2 Columns (Board Left · Context & Feedback Right) */}
      <main
        ref={puzzleArenaRef}
        className="flex-1 min-h-0 w-full max-w-[1920px] mx-auto px-3 sm:px-6 py-3 flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-4 lg:gap-6"
      >
        {/* Left Column: Chess Board Area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 min-w-0 min-h-0">
          {puzzleState && (
            <ChessBoard
              gameState={puzzleState}
              legalMoves={legalMoves}
              selectedSquare={selectedSquare}
              pendingPromotion={pendingPromotion}
              isFlipped={isFlipped}
              boardRotation={boardRotation}
              isInteractionDisabled={stepStatus !== 'player_turn'}
              helperMode={false}
              showBoardSuggestions={false}
              helperAnalysis={null}
              highlightedHelperRank={null}
              plannedArrows={plannedArrows}
              shakeBoard={shakeBoard}
              incorrectSquare={incorrectSquare}
              hintPieceSquare={hintPieceSquare}
              hintDestSquare={hintDestSquare}
              hintArrow={hintArrow}
              onSquareClick={(sq) => {
                handleClearPlannedArrows();
                handleSquareClick(sq);
              }}
              onMovePiece={(from, to) => {
                handleClearPlannedArrows();
                handleAttemptDragMove(from, to);
              }}
              onTogglePlannedArrow={handleTogglePlannedArrow}
              onClearPlannedArrows={handleClearPlannedArrows}
              onSelectPromotion={handleSelectPromotion}
              onCancelPromotion={() => setPendingPromotion(null)}
              hideHelperBox={true}
              boardSizePx={puzzleBoardGeometry.boardSizePx}
              maxFitSizePx={puzzleBoardGeometry.maxFitSizePx}
              boardTheme={uiPrefs.boardTheme}
              coordinateStyle={uiPrefs.coordinateStyle}
              boardScale={uiPrefs.boardScale}
              isResizable={Boolean(onUpdateUiPrefs)}
              onBoardScaleChange={
                onUpdateUiPrefs
                  ? (nextScale) => onUpdateUiPrefs({ boardScale: nextScale }, true)
                  : undefined
              }
              onResetBoardScale={
                onUpdateUiPrefs
                  ? () => onUpdateUiPrefs({ boardScale: 1.0 }, true)
                  : undefined
              }
            />
          )}

          {/* Under-Board Action Ribbon: Quick controls & status info */}
          <div
            style={{ width: `${puzzleBoardGeometry.frameWidthPx}px` }}
            className="max-w-full flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#A69F91] px-1 py-0.5 tabular-nums"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#F4EFE6]">
                {playerColor === 'w' ? 'White' : 'Black'} to move
              </span>
              <span>·</span>
              <span>Rating: {currentPuzzle?.rating ?? 1000}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="puzzle-underboard-rotate-button"
                onClick={() => setBoardRotation((prev) => rotateBoardCW(prev))}
                className="hover:text-[#F4EFE6] underline underline-offset-2 cursor-pointer"
              >
                Rotate 90° ({boardRotation}°) [T]
              </button>
              <button
                type="button"
                onClick={() =>
                  setBoardRotation((prev) => flipBoardRotation(prev))
                }
                className="hover:text-[#F4EFE6] underline underline-offset-2 cursor-pointer"
              >
                Flip [F]
              </button>
              <button
                type="button"
                data-testid="puzzle-underboard-reset-button"
                onClick={handleResetPuzzle}
                className="hover:text-[#F4EFE6] underline underline-offset-2 cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3 text-[#C6923A]" />
                <span>Reset Puzzle [R]</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Progressive Hint System, Live Context & Post-Solve Feedback Card */}
        <div className="w-full lg:w-[420px] lg:shrink-0 flex flex-col gap-3 min-h-0 lg:overflow-y-auto">
          {/* Active Goal / Turn Card */}
          <section
            aria-label="Tactical Goal and Status"
            className="bg-[#18231E] border border-[#2B3B32] rounded-xl p-4 shadow-sm flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    playerColor === 'w'
                      ? 'bg-amber-100 border border-amber-300'
                      : 'bg-stone-900 border border-stone-600'
                  }`}
                />
                <h2 className="text-sm font-bold text-[#F4EFE6]">
                  {stepStatus === 'solved'
                    ? 'Tactical Solution Found!'
                    : hasFailedCurrent
                    ? `Not the best move. Try again for ${playerColor === 'w' ? 'White' : 'Black'}!`
                    : `Find the best move for ${playerColor === 'w' ? 'White' : 'Black'}`}
                </h2>
              </div>

              {stepStatus === 'player_turn' && !hasFailedCurrent && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-800 text-emerald-300 font-semibold animate-pulse">
                  Your Turn
                </span>
              )}
              {stepStatus === 'player_turn' && hasFailedCurrent && (
                <span
                  data-testid="puzzle-try-again-badge"
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-950/80 border border-rose-700 text-rose-300 font-semibold animate-pulse"
                >
                  Try Again
                </span>
              )}
              {stepStatus === 'playing_setup' && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950/70 border border-amber-800 text-amber-300 font-semibold">
                  Opponent Move...
                </span>
              )}
              {stepStatus === 'opponent_turn' && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950/70 border border-amber-800 text-amber-300 font-semibold animate-pulse">
                  Opponent Replying...
                </span>
              )}
            </div>

            {/* Sequence progress indicator */}
            {currentPuzzle && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#A69F91]">
                <span>Sequence Step:</span>
                <span className="text-[#F4EFE6] font-bold">
                  {Math.min(
                    activeMoves.length,
                    Math.max(1, currentMoveIndex)
                  )}{' '}
                  / {activeMoves.length}
                </span>
                <div className="flex-1 bg-[#212E27] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#C6923A] h-full transition-all duration-300"
                    style={{
                      width: `${
                        activeMoves.length > 0
                          ? (Math.min(activeMoves.length, currentMoveIndex) /
                              activeMoves.length) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Retry hint card if player made an incorrect move */}
          {hasFailedCurrent && stepStatus === 'player_turn' && (
            <aside
              data-testid="puzzle-failed-retry-card"
              className="bg-rose-950/20 border border-rose-800/60 rounded-xl p-3 shadow-sm flex items-center justify-between gap-2 animate-fadeIn"
            >
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-rose-300">
                    Incorrect move. Try again!
                  </span>
                  <span className="text-[11px] text-[#A69F91]">
                    You stay on this puzzle until you solve it or choose to skip.
                  </span>
                </div>
              </div>
              <button
                type="button"
                data-testid="puzzle-retry-card-button"
                onClick={handleResetPuzzle}
                className="px-2.5 py-1 rounded bg-rose-900/50 hover:bg-rose-800/60 border border-rose-700 text-xs font-semibold text-rose-200 hover:text-white transition-colors shrink-0 cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3 text-rose-300" />
                <span>Reset Puzzle [R]</span>
              </button>
            </aside>
          )}

          {/* Progressive Hint System (Click 1: Piece, Click 2: Target, Click 3: Full Line) */}
          <section
            aria-label="Progressive Hint Controls"
            className="bg-[#18231E] border border-[#2B3B32] rounded-xl p-4 shadow-sm flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#D6CFC2]">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span>Tactical Hints (Tier {hintTier}/3)</span>
              </div>
              {isAssisted && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800">
                  Assisted (0 Elo)
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="hint-tier-1-button"
                onClick={handleRequestHint}
                disabled={hintTier >= 1 || stepStatus === 'solved'}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-xs font-mono transition-all ${
                  hintTier >= 1
                    ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300'
                    : 'bg-[#212E27] border-[#34463C] text-[#F4EFE6] hover:bg-[#2B3B32] cursor-pointer'
                }`}
              >
                <span className="font-bold">1. Piece</span>
                <span className="text-[10px] text-[#A69F91]">
                  {hintTier >= 1 ? 'Glows' : 'Highlight'}
                </span>
              </button>

              <button
                type="button"
                data-testid="hint-tier-2-button"
                onClick={handleRequestHint}
                disabled={hintTier < 1 || hintTier >= 2 || stepStatus === 'solved'}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-xs font-mono transition-all ${
                  hintTier >= 2
                    ? 'bg-cyan-950/40 border-cyan-700 text-cyan-300'
                    : hintTier < 1
                    ? 'opacity-40 border-[#34463C] cursor-not-allowed text-[#777]'
                    : 'bg-[#212E27] border-[#34463C] text-[#F4EFE6] hover:bg-[#2B3B32] cursor-pointer'
                }`}
              >
                <span className="font-bold">2. Square</span>
                <span className="text-[10px] text-[#A69F91]">
                  {hintTier >= 2 ? 'Targeted' : 'Target'}
                </span>
              </button>

              <button
                type="button"
                data-testid="hint-tier-3-button"
                onClick={handleRequestHint}
                disabled={hintTier < 2 || hintTier >= 3 || stepStatus === 'solved'}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-xs font-mono transition-all ${
                  hintTier >= 3
                    ? 'bg-amber-950/40 border-amber-700 text-amber-300'
                    : hintTier < 2
                    ? 'opacity-40 border-[#34463C] cursor-not-allowed text-[#777]'
                    : 'bg-[#212E27] border-[#34463C] text-[#F4EFE6] hover:bg-[#2B3B32] cursor-pointer'
                }`}
              >
                <span className="font-bold">3. Line</span>
                <span className="text-[10px] text-[#A69F91]">
                  {hintTier >= 3 ? 'Shown' : 'Arrow'}
                </span>
              </button>
            </div>

            {/* Quick action buttons: Reset Puzzle / Reveal Solution / Skip */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                data-testid="puzzle-action-reset-button"
                onClick={handleResetPuzzle}
                aria-label="Reset Puzzle to replay"
                title="Reset and replay current puzzle [R]"
                className="py-1.5 px-2 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#C6923A]" />
                <span>Reset [R]</span>
              </button>
              <button
                type="button"
                data-testid="puzzle-reveal-button"
                onClick={handleRevealSolution}
                disabled={stepStatus === 'solved'}
                className="py-1.5 px-2 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                Reveal
              </button>
              <button
                type="button"
                data-testid="puzzle-skip-button"
                onClick={() => loadNextPuzzle(currentPuzzle?.id)}
                className="py-1.5 px-2 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer shadow-sm"
              >
                Skip →
              </button>
            </div>
          </section>

          {/* Post-Solve Context Card & Tactical Motifs */}
          {stepStatus === 'solved' && currentPuzzle && (
            <aside
              data-testid="puzzle-solved-card"
              aria-label="Puzzle Solved Context"
              className="bg-emerald-950/30 border-2 border-emerald-500/80 rounded-xl p-4 shadow-[0_10px_30px_rgba(16,185,129,0.15)] flex flex-col gap-3 animate-fadeIn"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">
                    Puzzle Solved!
                  </span>
                </div>
                {lastDelta !== null && lastDelta > 0 && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500 text-emerald-950">
                    +{lastDelta} Rating
                  </span>
                )}
              </div>

              {/* Description / Motif explanation */}
              {currentPuzzle.description && (
                <p className="text-xs text-[#E6E0D5] leading-relaxed">
                  {currentPuzzle.description}
                </p>
              )}

              {/* Tactical Theme Tags */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {currentPuzzle.themes.map((theme) => (
                  <span
                    key={theme}
                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#162B21] border border-emerald-700/60 text-emerald-200"
                  >
                    #{theme}
                  </span>
                ))}
              </div>

              {/* Action Buttons: Replay Current Puzzle or Go to Next */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  data-testid="puzzle-replay-solved-button"
                  onClick={handleResetPuzzle}
                  className="py-2.5 px-3.5 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <RotateCcw className="w-4 h-4 text-[#C6923A]" />
                  <span>Replay Puzzle [R]</span>
                </button>
                <button
                  type="button"
                  data-testid="puzzle-next-button"
                  onClick={() => loadNextPuzzle(currentPuzzle.id)}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-[0.98]"
                >
                  <span>Next Puzzle</span>
                  <span className="text-xs font-mono opacity-80 bg-emerald-600/30 px-1.5 py-0.5 rounded border border-emerald-600/50">
                    Space / Enter ↵
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </aside>
          )}

          {/* Reveal State Context Card */}
          {stepStatus === 'revealed' && currentPuzzle && (
            <aside
              data-testid="puzzle-revealed-card"
              className="bg-amber-950/30 border border-amber-600/70 rounded-xl p-4 shadow-sm flex flex-col gap-2.5"
            >
              <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                <HelpCircle className="w-4 h-4" />
                <span>Full Solution Sequence:</span>
              </div>
              <div className="flex flex-wrap gap-1 text-xs font-mono text-[#F4EFE6]">
                {activeMoves.map((m, idx) => (
                  <span
                    key={`${m}-${idx}`}
                    className={`px-1.5 py-0.5 rounded ${
                      idx === 0
                        ? 'bg-[#2A3B32] text-[#A69F91]'
                        : 'bg-[#C6923A]/30 text-amber-200 font-bold'
                    }`}
                  >
                    {idx === 0 ? `Setup: ${m}` : `${idx}: ${m}`}
                  </span>
                ))}
              </div>
              <p className="text-xs text-[#D6CFC2]">{currentPuzzle.description}</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  data-testid="puzzle-replay-revealed-button"
                  onClick={handleResetPuzzle}
                  className="flex-1 py-2.5 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-[#F4EFE6] font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#C6923A]" />
                  <span>Replay Puzzle [R]</span>
                </button>
                <button
                  type="button"
                  data-testid="puzzle-revealed-next-button"
                  onClick={() => loadNextPuzzle(currentPuzzle.id)}
                  className="flex-1 py-2.5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-[#111815] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-colors"
                >
                  <span>Next Puzzle</span>
                  <span className="font-mono opacity-80">[Space / Enter]</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* Floating Action Toast Notification */}
      {feedbackToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#C6923A] text-[#111815] px-4 py-1.5 rounded-full text-xs font-mono font-bold shadow-xl flex items-center gap-1.5 pointer-events-none"
        >
          <span>✓</span>
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Past Puzzles Review & Replay Modal */}
      <PastPuzzlesModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        records={pastRecords}
        onReplayPuzzle={handleReplayPastPuzzle}
        onClearHistory={handleClearHistory}
        activePuzzleId={currentPuzzle?.id}
      />
    </div>
  );
};
