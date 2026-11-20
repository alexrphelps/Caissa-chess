/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeAIMoveWithCadence,
  computeDeepCoachAnalysis,
} from './chess/aiClient';
import {
  canUndoState,
  createInitialGameState,
  generateLegalMoves,
  getPieceAt,
  isValidSquare,
  makeMove,
  rewindStateStack,
  togglePlannedArrow,
} from './chess/engine';
import {
  createEngineProfileFromElo,
  createEngineProfileFromPreset,
  mapEloToLegacyDifficulty,
  resolveEngineConfig,
} from './chess/evaluation';
import {
  analyzeOpeningAndStrategy,
  OpeningAnalysisResult,
} from './chess/openingBook';
import {
  analyzeTactics,
  RecommendedMove,
  TacticsAnalysis,
} from './chess/tacticsHelper';
import {
  clearActiveSession,
  createStoredSession,
  deleteSessionSlot,
  exportSessionToPgn,
  gameStateToFen,
  getSavedSessions,
  loadActiveSession,
  renameSessionSlot,
  saveActiveSession,
  saveSessionSlot,
} from './chess/sessionStorage';
import {
  analyzeOpeningPrinciples,
  OpeningPrinciplesReport,
} from './chess/openingAssistant';
import {
  GameReviewReport,
  generateGameReview,
  TurningPoint,
} from './chess/gameReview';
import {
  AIDifficulty,
  AIPresetId,
  AISearchResult,
  ChessEngineConfig,
  Color,
  EngineProfileState,
  GameMode,
  GameState,
  Move,
  PlannedArrow,
  PromotionPieceType,
  SavedEngineProfile,
  ShellState,
  Square,
  StoredGameSession,
} from './chess/types';
import { ChessBoard } from './components/ChessBoard';
import { EngineCustomizerModal } from './components/EngineCustomizerModal';
import { GameReviewModal } from './components/GameReviewModal';
import {
  TacticalCoachPanel,
  TopHeaderBar,
  UnderBoardPlayerStrip,
} from './components/GameHud';
import { PuzzleModeView } from './components/PuzzleModeView';
import { SavedGamesModal } from './components/SavedGamesModal';
import { StatusModal } from './components/StatusModal';
import { TitleScreen } from './components/TitleScreen';
import { soundFX } from './utils/sound';

const HELPER_STORAGE_KEY = 'caissa_helper_mode';
const BOARD_SUGGESTIONS_STORAGE_KEY = 'caissa_board_suggestions';
const DIFFICULTY_STORAGE_KEY = 'caissa_ai_difficulty';
const ENGINE_PROFILE_STORAGE_KEY = 'caissa_engine_profile_state';
const SAVED_PROFILES_STORAGE_KEY = 'caissa_saved_engine_profiles';
const ENGINE_STATS_STORAGE_KEY = 'caissa_engine_stats';
const GAME_OVER_MODAL_DELAY_MS = 420;

export default function App() {
  const initialPuzzle = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'puzzle' || params.get('puzzle') === '1';
  }, []);
  const initialAutostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  }, []);

  // Stored Game Sessions state (persisted in localStorage across app restarts)
  const [activeSession, setActiveSession] = useState<StoredGameSession | null>(() => {
    return loadActiveSession();
  });
  const [savedSessions, setSavedSessions] = useState<StoredGameSession[]>(() => {
    return getSavedSessions();
  });
  const [isSavedGamesOpen, setIsSavedGamesOpen] = useState<boolean>(false);

  const [shellState, setShellState] = useState<ShellState>(() => {
    if (initialPuzzle) return 'puzzles';
    return initialAutostart ? 'playing' : 'title';
  });
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    if (initialAutostart && activeSession) return activeSession.gameMode;
    return 'ai';
  });
  const [playerColor, setPlayerColor] = useState<Color>(() => {
    if (initialAutostart && activeSession) return activeSession.playerColor;
    return 'w';
  });

  // Granular Engine Profile State (persisted in localStorage, defaults to Casual 1000 or legacy saved difficulty)
  const [engineProfile, setEngineProfile] = useState<EngineProfileState>(() => {
    if (typeof window === 'undefined') {
      return createEngineProfileFromPreset('casual');
    }
    try {
      const rawProfile = window.localStorage.getItem(ENGINE_PROFILE_STORAGE_KEY);
      if (rawProfile) {
        const parsed = JSON.parse(rawProfile) as Partial<EngineProfileState>;
        if (parsed && typeof parsed.elo === 'number' && parsed.config) {
          return {
            elo: Math.max(400, Math.min(2400, Math.round(parsed.elo))),
            presetId: parsed.presetId ?? 'custom',
            isCustom: Boolean(parsed.isCustom),
            activeSavedProfileId: parsed.activeSavedProfileId ?? null,
            config: resolveEngineConfig(parsed.config),
          };
        }
      }
      const legacySaved = window.localStorage.getItem(DIFFICULTY_STORAGE_KEY);
      if (
        legacySaved === 'novice' ||
        legacySaved === 'casual' ||
        legacySaved === 'intermediate' ||
        legacySaved === 'club'
      ) {
        return createEngineProfileFromPreset(legacySaved);
      }
    } catch {}
    return createEngineProfileFromPreset('casual');
  });

  // Saved Custom Profiles (persisted in localStorage)
  const [savedProfiles, setSavedProfiles] = useState<SavedEngineProfile[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(SAVED_PROFILES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  const [isCustomizerOpen, setIsCustomizerOpen] = useState<boolean>(false);

  // Derived legacy AIDifficulty for backward-compatible badges/components
  const aiDifficulty: AIDifficulty = useMemo(() => {
    if (
      engineProfile.presetId === 'novice' ||
      engineProfile.presetId === 'casual' ||
      engineProfile.presetId === 'intermediate' ||
      engineProfile.presetId === 'club'
    ) {
      return engineProfile.presetId;
    }
    return mapEloToLegacyDifficulty(engineProfile.elo);
  }, [engineProfile.presetId, engineProfile.elo]);

  const persistEngineProfile = useCallback((nextProfile: EngineProfileState) => {
    setEngineProfile(nextProfile);
    try {
      window.localStorage.setItem(
        ENGINE_PROFILE_STORAGE_KEY,
        JSON.stringify(nextProfile)
      );
      const legacyTier = mapEloToLegacyDifficulty(nextProfile.elo);
      window.localStorage.setItem(DIFFICULTY_STORAGE_KEY, legacyTier);
    } catch {}
  }, []);

  const handleSelectDifficulty = useCallback(
    (nextDiff: AIDifficulty) => {
      persistEngineProfile(createEngineProfileFromPreset(nextDiff));
    },
    [persistEngineProfile]
  );

  const handleSelectPreset = useCallback(
    (presetId: Exclude<AIPresetId, 'custom'>) => {
      persistEngineProfile(createEngineProfileFromPreset(presetId));
    },
    [persistEngineProfile]
  );

  const handleChangeElo = useCallback(
    (nextElo: number) => {
      persistEngineProfile(createEngineProfileFromElo(nextElo));
    },
    [persistEngineProfile]
  );

  const handleUpdateCustomConfig = useCallback(
    (patch: Partial<ChessEngineConfig>) => {
      const mergedConfig = resolveEngineConfig(engineProfile.config, patch);
      persistEngineProfile({
        ...engineProfile,
        presetId: 'custom',
        isCustom: true,
        activeSavedProfileId: null,
        config: mergedConfig,
      });
    },
    [engineProfile, persistEngineProfile]
  );

  const handleResetToEloDefault = useCallback(() => {
    persistEngineProfile(createEngineProfileFromElo(engineProfile.elo));
  }, [engineProfile.elo, persistEngineProfile]);

  const handleSaveCustomProfile = useCallback(
    (name: string) => {
      const id = `custom_${Date.now()}`;
      const newSaved: SavedEngineProfile = {
        id,
        name,
        elo: engineProfile.elo,
        config: {
          ...engineProfile.config,
          evalWeights: { ...engineProfile.config.evalWeights },
        },
        createdAt: Date.now(),
      };
      setSavedProfiles((prev) => {
        const nextList = [newSaved, ...prev];
        try {
          window.localStorage.setItem(
            SAVED_PROFILES_STORAGE_KEY,
            JSON.stringify(nextList)
          );
        } catch {}
        return nextList;
      });
      persistEngineProfile({
        ...engineProfile,
        presetId: 'custom',
        isCustom: true,
        activeSavedProfileId: id,
      });
    },
    [engineProfile, persistEngineProfile]
  );

  const handleLoadCustomProfile = useCallback(
    (profileId: string) => {
      const found = savedProfiles.find((p) => p.id === profileId);
      if (!found) return;
      persistEngineProfile({
        elo: found.elo,
        presetId: 'custom',
        isCustom: true,
        activeSavedProfileId: found.id,
        config: resolveEngineConfig(found.config),
      });
    },
    [savedProfiles, persistEngineProfile]
  );

  const handleDeleteCustomProfile = useCallback(
    (id: string) => {
      setSavedProfiles((prev) => {
        const nextList = prev.filter((p) => p.id !== id);
        try {
          window.localStorage.setItem(
            SAVED_PROFILES_STORAGE_KEY,
            JSON.stringify(nextList)
          );
        } catch {}
        return nextList;
      });
      if (engineProfile.activeSavedProfileId === id) {
        persistEngineProfile({
          ...engineProfile,
          activeSavedProfileId: null,
        });
      }
    },
    [engineProfile, persistEngineProfile]
  );

  const [showEngineStats, setShowEngineStats] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem(ENGINE_STATS_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  });
  const [lastSearchStats, setLastSearchStats] = useState<AISearchResult | null>(
    null
  );
  const [isFlipped, setIsFlipped] = useState<boolean>(() => {
    if (initialAutostart && activeSession) return activeSession.isFlipped;
    return false;
  });
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Visual Helper Mode (persisted in localStorage, defaults to ON)
  const [helperMode, setHelperMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem(HELPER_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  });
  // On-board suggestions toggle (persisted in localStorage, defaults to ON)
  const [showBoardSuggestions, setShowBoardSuggestions] = useState<boolean>(
    () => {
      if (typeof window === 'undefined') return true;
      const saved = window.localStorage.getItem(BOARD_SUGGESTIONS_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    }
  );
  const [highlightedHelperRank, setHighlightedHelperRank] = useState<
    1 | 2 | 3 | null
  >(null);

  // User-planned right-click arrows (only legal moves allowed; cleared on left-clicking a piece or making a move)
  const [plannedArrows, setPlannedArrows] = useState<PlannedArrow[]>([]);

  // History of GameStates for clean Undo support
  const [stateStack, setStateStack] = useState<GameState[]>(() => {
    if (initialAutostart && activeSession && activeSession.stateStack.length > 0) {
      return activeSession.stateStack;
    }
    return [createInitialGameState()];
  });
  const gameState = stateStack[stateStack.length - 1];

  // Temporary history preview state (active when Move History dropdown is open and a move cell is clicked)
  const [previewPly, setPreviewPly] = useState<number | null>(null);

  const [isGameReviewOpen, setIsGameReviewOpen] = useState<boolean>(false);
  const [gameReviewReport, setGameReviewReport] =
    useState<GameReviewReport | null>(null);
  const [retryBlunderSession, setRetryBlunderSession] = useState<{
    turningPoint: TurningPoint;
    originalPly: number;
    stateBefore: GameState;
    solved: boolean;
    hintRevealed: boolean;
  } | null>(null);

  const isPreviewingHistory =
    retryBlunderSession === null &&
    previewPly !== null &&
    previewPly >= 0 &&
    previewPly < stateStack.length - 1;

  const displayedGameState =
    retryBlunderSession !== null
      ? retryBlunderSession.stateBefore
      : previewPly !== null && stateStack[previewPly] !== undefined
      ? stateStack[previewPly]
      : gameState;

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const [isAIThinking, setIsAIThinking] = useState<boolean>(false);
  const [inspectingGameOverBoard, setInspectingGameOverBoard] =
    useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2200);
  }, []);

  const handleCopyCurrentFen = useCallback(async () => {
    try {
      const fen = gameStateToFen(displayedGameState);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fen);
        showToast('FEN copied to clipboard');
      } else {
        showToast('Clipboard unavailable');
      }
    } catch {
      showToast('Failed to copy FEN');
    }
  }, [displayedGameState, showToast]);

  const handleCopyCurrentPgn = useCallback(async () => {
    try {
      const session = createStoredSession({
        stateStack,
        gameMode,
        playerColor,
        isFlipped,
        engineProfile,
      });
      const pgn = exportSessionToPgn(session);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pgn);
        showToast('PGN copied to clipboard');
      } else {
        showToast('Clipboard unavailable');
      }
    } catch {
      showToast('Failed to copy PGN');
    }
  }, [stateStack, gameMode, playerColor, isFlipped, engineProfile, showToast]);

  const handleOpenGameReview = useCallback(() => {
    if (
      !gameReviewReport ||
      gameReviewReport.totalPlies !== stateStack.length - 1
    ) {
      const report = generateGameReview(stateStack);
      setGameReviewReport(report);
    }
    setIsGameReviewOpen(true);
  }, [gameReviewReport, stateStack]);

  const handleStartRetryBlunder = useCallback(
    (turningPoint: TurningPoint) => {
      const stateBefore = stateStack[turningPoint.plyIndex];
      if (!stateBefore) return;
      setIsGameReviewOpen(false);
      setInspectingGameOverBoard(false);
      setPreviewPly(null);
      setSelectedSquare(null);
      setPendingPromotion(null);
      setPlannedArrows([]);
      setRetryBlunderSession({
        turningPoint,
        originalPly: turningPoint.plyIndex,
        stateBefore,
        solved: false,
        hintRevealed: false,
      });
      showToast(
        `Retry Move ${turningPoint.turnNumber}: Find the best move!`
      );
    },
    [stateStack, showToast]
  );

  const aiAbortRef = useRef<AbortController | null>(null);
  const gameOverTimeoutRef = useRef<number | null>(null);

  const clearPendingTimers = useCallback(() => {
    if (aiAbortRef.current !== null) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }
    if (gameOverTimeoutRef.current !== null) {
      window.clearTimeout(gameOverTimeoutRef.current);
      gameOverTimeoutRef.current = null;
    }
  }, []);

  // Cleanup any pending timers on unmount
  useEffect(() => {
    return () => {
      clearPendingTimers();
    };
  }, [clearPendingTimers]);

  // Sync document.body.dataset.state with shellState
  useEffect(() => {
    document.body.dataset.state = shellState;
  }, [shellState]);

  const handleToggleEngineStats = useCallback(() => {
    setShowEngineStats((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(ENGINE_STATS_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleToggleHelperMode = useCallback(() => {
    setHelperMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HELPER_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
    setHighlightedHelperRank(null);
  }, []);

  const handleToggleBoardSuggestions = useCallback(() => {
    setShowBoardSuggestions((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          BOARD_SUGGESTIONS_STORAGE_KEY,
          String(next)
        );
      } catch {}
      return next;
    });
  }, []);

  const legalMoves = useMemo(() => {
    if (retryBlunderSession) {
      return generateLegalMoves(retryBlunderSession.stateBefore);
    }
    if (gameState.status !== 'playing') return [];
    return generateLegalMoves(gameState);
  }, [retryBlunderSession, gameState]);

  const handleTogglePlannedArrow = useCallback(
    (from: Square, to: Square) => {
      setPlannedArrows((prev) =>
        togglePlannedArrow(prev, gameState, legalMoves, from, to)
      );
    },
    [gameState, legalMoves]
  );

  const handleClearPlannedArrows = useCallback(() => {
    setPlannedArrows((prev) => (prev.length === 0 ? prev : []));
  }, []);

  // Only compute and render Helper Mode overlays during the human player's active turn
  const isHumanTurn =
    shellState === 'playing' &&
    gameState.status === 'playing' &&
    !isAIThinking &&
    (gameMode === 'pass_and_play' || gameState.turn === playerColor);

  // Instant 3-ply + Quiescence tactical analysis so there is never an empty frame
  const fastHelperAnalysis: TacticsAnalysis | null = useMemo(() => {
    if (!helperMode || !isHumanTurn) return null;
    return analyzeTactics(gameState);
  }, [helperMode, isHumanTurn, gameState]);

  // Progressive 5–6 ply + Quiescence Deep Coach analysis computed in the background Web Worker
  const [deepCoachState, setDeepCoachState] = useState<{
    forState: GameState;
    analysis: TacticsAnalysis;
  } | null>(null);

  useEffect(() => {
    if (!helperMode || !isHumanTurn) {
      return;
    }

    const abortController = new AbortController();
    computeDeepCoachAnalysis(gameState, abortController.signal).then(
      (deepResult) => {
        if (!abortController.signal.aborted && deepResult) {
          setDeepCoachState({
            forState: gameState,
            analysis: deepResult,
          });
        }
      }
    );

    return () => {
      abortController.abort();
    };
  }, [helperMode, isHumanTurn, gameState]);

  const helperAnalysis: TacticsAnalysis | null = useMemo(() => {
    if (!helperMode || !isHumanTurn) return null;
    if (deepCoachState && deepCoachState.forState === gameState) {
      return deepCoachState.analysis;
    }
    return fastHelperAnalysis;
  }, [helperMode, isHumanTurn, gameState, deepCoachState, fastHelperAnalysis]);

  const openingAnalysis: OpeningAnalysisResult = useMemo(() => {
    return analyzeOpeningAndStrategy(gameState);
  }, [gameState]);

  const openingPrinciplesReport: OpeningPrinciplesReport = useMemo(() => {
    return analyzeOpeningPrinciples(gameState, playerColor);
  }, [gameState, playerColor]);

  const playMoveAudio = useCallback((nextState: GameState, move: Move) => {
    if (nextState.status !== 'playing') {
      const isWin = nextState.status === 'checkmate';
      soundFX.playGameOver(isWin);
    } else if (nextState.inCheck) {
      soundFX.playCheck();
    } else if (move.isCastle) {
      soundFX.playCastle();
    } else if (move.captured) {
      soundFX.playCapture();
    } else {
      soundFX.playMove();
    }
  }, []);

  const commitMove = useCallback(
    (move: Move) => {
      try {
        const nextState = makeMove(gameState, move);
        setStateStack((prev) => [...prev, nextState]);
        setSelectedSquare(null);
        setPendingPromotion(null);
        setHighlightedHelperRank(null);
        setPlannedArrows([]);
        setPreviewPly(null);
        playMoveAudio(nextState, move);

        if (nextState.status !== 'playing') {
          setInspectingGameOverBoard(false);
          if (gameOverTimeoutRef.current !== null) {
            window.clearTimeout(gameOverTimeoutRef.current);
          }
          gameOverTimeoutRef.current = window.setTimeout(() => {
            gameOverTimeoutRef.current = null;
            setShellState('gameover');
          }, GAME_OVER_MODAL_DELAY_MS);
        }
      } catch (err) {
        console.error('Failed to commit move:', err);
      }
    },
    [gameState, playMoveAudio]
  );

  // Start / Restart game helper
  const startNewMatch = useCallback(
    (overrideColor?: Color, overrideMode?: GameMode) => {
      clearPendingTimers();
      const nextColor = overrideColor ?? playerColor;
      const nextMode = overrideMode ?? gameMode;
      setIsAIThinking(false);
      setLastSearchStats(null);
      setSelectedSquare(null);
      setPendingPromotion(null);
      setHighlightedHelperRank(null);
      setPlannedArrows([]);
      setPreviewPly(null);
      setInspectingGameOverBoard(false);
      setIsGameReviewOpen(false);
      setGameReviewReport(null);
      setRetryBlunderSession(null);
      const initialStack = [createInitialGameState()];
      setStateStack(initialStack);
      const nextFlipped = nextMode === 'ai' ? nextColor === 'b' : isFlipped;
      setIsFlipped(nextFlipped);
      setShellState('playing');
      document.body.dataset.state = 'playing';

      const freshSession = createStoredSession({
        stateStack: initialStack,
        gameMode: nextMode,
        playerColor: nextColor,
        isFlipped: nextFlipped,
        engineProfile,
        isAutoSave: true,
      });
      saveActiveSession(freshSession);
      setActiveSession(freshSession);
    },
    [playerColor, gameMode, engineProfile, isFlipped, clearPendingTimers]
  );

  const handleOpenPuzzles = useCallback(() => {
    clearPendingTimers();
    setIsAIThinking(false);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setHighlightedHelperRank(null);
    setPlannedArrows([]);
    setPreviewPly(null);
    setShellState('puzzles');
    document.body.dataset.state = 'puzzles';
  }, [clearPendingTimers]);

  // Auto-save active game session whenever moves are played or game state updates
  useEffect(() => {
    if (stateStack.length > 1) {
      const session = createStoredSession({
        stateStack,
        gameMode,
        playerColor,
        isFlipped,
        engineProfile,
        isAutoSave: true,
      });
      saveActiveSession(session);
      setActiveSession(session);
    }
  }, [stateStack, gameMode, playerColor, isFlipped, engineProfile]);

  const handleSaveCurrentSession = useCallback(
    (customTitle?: string) => {
      const session = createStoredSession({
        stateStack,
        gameMode,
        playerColor,
        isFlipped,
        engineProfile,
        customTitle,
        isAutoSave: false,
      });
      const updated = saveSessionSlot(session);
      setSavedSessions(updated);
      saveActiveSession(session);
      setActiveSession(session);
    },
    [stateStack, gameMode, playerColor, isFlipped, engineProfile]
  );

  const handleLoadSession = useCallback(
    (session: StoredGameSession) => {
      clearPendingTimers();
      setIsAIThinking(false);
      setLastSearchStats(null);
      setSelectedSquare(null);
      setPendingPromotion(null);
      setHighlightedHelperRank(null);
      setPlannedArrows([]);
      setPreviewPly(null);
      setInspectingGameOverBoard(false);

      setStateStack(session.stateStack);
      setGameMode(session.gameMode);
      setPlayerColor(session.playerColor);
      setIsFlipped(session.isFlipped);
      if (session.engineProfile) {
        persistEngineProfile(session.engineProfile);
      }
      saveActiveSession(session);
      setActiveSession(session);
      setShellState('playing');
      document.body.dataset.state = 'playing';
      soundFX.playMove();
    },
    [clearPendingTimers, persistEngineProfile]
  );

  const handleDeleteSession = useCallback((id: string) => {
    const updated = deleteSessionSlot(id);
    setSavedSessions(updated);
  }, []);

  const handleRenameSession = useCallback((id: string, newTitle: string) => {
    const updated = renameSessionSlot(id, newTitle);
    setSavedSessions(updated);
  }, []);

  const handleClearActiveSession = useCallback(() => {
    clearActiveSession();
    setActiveSession(null);
  }, []);

  const handleImportSession = useCallback(
    (session: StoredGameSession) => {
      const updated = saveSessionSlot(session);
      setSavedSessions(updated);
      handleLoadSession(session);
    },
    [handleLoadSession]
  );

  // Trigger AI turn when in 'ai' mode and it's the AI's turn
  useEffect(() => {
    if (
      shellState !== 'playing' ||
      gameMode !== 'ai' ||
      gameState.status !== 'playing' ||
      gameState.turn === playerColor
    ) {
      setIsAIThinking(false);
      return;
    }

    setIsAIThinking(true);
    const abortController = new AbortController();
    aiAbortRef.current = abortController;

    computeAIMoveWithCadence(
      gameState,
      aiDifficulty,
      abortController.signal,
      engineProfile.config
    ).then((searchResult) => {
      if (abortController.signal.aborted) return;
      if (aiAbortRef.current === abortController) {
        aiAbortRef.current = null;
      }
      setIsAIThinking(false);
      setLastSearchStats(searchResult);
      if (searchResult.move) {
        commitMove(searchResult.move);
      }
    });

    return () => {
      abortController.abort();
      if (aiAbortRef.current === abortController) {
        aiAbortRef.current = null;
      }
    };
  }, [
    shellState,
    gameMode,
    gameState,
    playerColor,
    aiDifficulty,
    engineProfile.config,
    commitMove,
  ]);

  // Handle user attempting to move from `from` to `to`
  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (!isValidSquare(from) || !isValidSquare(to)) return false;

      if (retryBlunderSession) {
        const matchingMoves = legalMoves.filter(
          (m) => m.from === from && m.to === to
        );
        if (matchingMoves.length === 0) return false;

        const targetBest = retryBlunderSession.turningPoint.bestMove;
        const isMatch = from === targetBest.from && to === targetBest.to;

        setSelectedSquare(null);
        if (isMatch) {
          soundFX.playGameOver(true);
          setRetryBlunderSession((prev) =>
            prev ? { ...prev, solved: true } : null
          );
          showToast(
            `★ Brilliant! You found the best move: ${retryBlunderSession.turningPoint.bestSan}!`
          );
        } else {
          soundFX.playUndo();
          showToast(`Not quite! Look for a more decisive continuation.`);
        }
        return true;
      }

      const matchingMoves = legalMoves.filter(
        (m) => m.from === from && m.to === to
      );
      if (matchingMoves.length === 0) return false;

      // If move is a pawn promotion (multiple promotion choices), open Promotion UI picker
      if (matchingMoves.some((m) => Boolean(m.promotion))) {
        setSelectedSquare(null);
        setPendingPromotion({ from, to });
        return true;
      }

      commitMove(matchingMoves[0]);
      return true;
    },
    [legalMoves, commitMove, retryBlunderSession, showToast]
  );

  // Handle square click (select piece or move to legal destination)
  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!isValidSquare(square)) return;

      if (retryBlunderSession) {
        if (selectedSquare && selectedSquare !== square) {
          const moved = handleAttemptMove(selectedSquare, square);
          if (moved) return;
        }
        const activeBoard = retryBlunderSession.stateBefore.board;
        const piece = getPieceAt(activeBoard, square);
        if (piece && piece.color === retryBlunderSession.stateBefore.turn) {
          setSelectedSquare((prev) => (prev === square ? null : square));
        } else {
          setSelectedSquare(null);
        }
        return;
      }

      if (
        gameState.status !== 'playing' ||
        isAIThinking ||
        pendingPromotion !== null
      ) {
        return;
      }
      if (gameMode === 'ai' && gameState.turn !== playerColor) return;

      // If a square is already selected and user clicked a legal destination for it
      if (selectedSquare && selectedSquare !== square) {
        const moved = handleAttemptMove(selectedSquare, square);
        if (moved) return;
      }

      // Otherwise, if clicked square contains a friendly piece of the active turn, select it
      const piece = getPieceAt(gameState.board, square);
      if (piece && piece.color === gameState.turn) {
        setSelectedSquare((prev) => (prev === square ? null : square));
      } else {
        setSelectedSquare(null);
      }
    },
    [
      gameState,
      isAIThinking,
      pendingPromotion,
      gameMode,
      playerColor,
      selectedSquare,
      retryBlunderSession,
      handleAttemptMove,
    ]
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
        commitMove(matched);
      }
    },
    [pendingPromotion, legalMoves, commitMove]
  );

  const handleUndoMove = useCallback(() => {
    if (!canUndoState(stateStack, gameMode, playerColor)) return;
    clearPendingTimers();
    setIsAIThinking(false);
    setLastSearchStats(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setHighlightedHelperRank(null);
    setPlannedArrows([]);
    setPreviewPly(null);
    setInspectingGameOverBoard(false);
    soundFX.playUndo();

    setStateStack((prev) => rewindStateStack(prev, gameMode, playerColor));
    setShellState('playing');
  }, [stateStack, gameMode, playerColor, clearPendingTimers]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundFX.muted = next;
      return next;
    });
  }, []);

  const canUndo = useMemo(() => {
    return canUndoState(stateStack, gameMode, playerColor);
  }, [stateStack, gameMode, playerColor]);

  // Global keyboard shortcuts (Enter/Space on Title, P/Escape for Pause, R for New Game, F for Flip, M for Mute, H for Helper, B for Board Suggestions, U/Ctrl+Z for Undo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (isSavedGamesOpen) {
        if (e.key === 'Escape') {
          setIsSavedGamesOpen(false);
        }
        return;
      }

      if (isCustomizerOpen) {
        if (e.key === 'Escape') {
          setIsCustomizerOpen(false);
        }
        return;
      }

      if (shellState === 'title') {
        if (e.key === 's' || e.key === 'S') {
          setIsSavedGamesOpen((prev) => !prev);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startNewMatch();
        }
        return;
      }

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (previewPly !== null) {
          setPreviewPly(null);
          return;
        }
        if (pendingPromotion) {
          setPendingPromotion(null);
          return;
        }
        if (shellState === 'playing') {
          setShellState('paused');
        } else if (shellState === 'paused') {
          setShellState('playing');
        }
      } else if (e.key === 's' || e.key === 'S') {
        if (!e.metaKey && !e.ctrlKey) {
          setIsSavedGamesOpen((prev) => !prev);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFlipped((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R') {
        startNewMatch();
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
      } else if (e.key === 'h' || e.key === 'H') {
        handleToggleHelperMode();
      } else if (e.key === 'b' || e.key === 'B') {
        handleToggleBoardSuggestions();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPreviewPly((prev) => {
          const current = prev !== null ? prev : stateStack.length - 1;
          return Math.max(0, current - 1);
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPreviewPly((prev) => {
          if (prev === null) return null;
          const next = prev + 1;
          return next >= stateStack.length - 1 ? null : next;
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (stateStack.length > 1) {
          setPreviewPly(0);
        }
      } else if (e.key === 'End') {
        e.preventDefault();
        setPreviewPly(null);
      } else if (
        e.key === 'u' ||
        e.key === 'U' ||
        ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z'))
      ) {
        if (canUndo) {
          e.preventDefault();
          handleUndoMove();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    shellState,
    isSavedGamesOpen,
    isCustomizerOpen,
    previewPly,
    pendingPromotion,
    canUndo,
    stateStack.length,
    handleUndoMove,
    startNewMatch,
    handleToggleMute,
    handleToggleHelperMode,
    handleToggleBoardSuggestions,
  ]);

  if (shellState === 'puzzles') {
    return (
      <PuzzleModeView
        onExit={() => {
          clearPendingTimers();
          setIsAIThinking(false);
          setShellState('title');
        }}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
      />
    );
  }

  if (shellState === 'title') {
    return (
      <>
        <TitleScreen
          gameMode={gameMode}
          playerColor={playerColor}
          aiDifficulty={aiDifficulty}
          engineProfile={engineProfile}
          activeSession={activeSession}
          savedSessionsCount={savedSessions.length}
          onSelectMode={setGameMode}
          onSelectColor={(color) => {
            setPlayerColor(color);
            setIsFlipped(color === 'b');
          }}
          onSelectDifficulty={handleSelectDifficulty}
          onSelectPreset={handleSelectPreset}
          onChangeElo={handleChangeElo}
          onOpenCustomizer={() => setIsCustomizerOpen(true)}
          onOpenSavedGames={() => setIsSavedGamesOpen(true)}
          onResumeActiveGame={() => {
            if (activeSession) {
              handleLoadSession(activeSession);
            }
          }}
          onOpenPuzzles={handleOpenPuzzles}
          onStartGame={() => startNewMatch()}
        />
        <EngineCustomizerModal
          isOpen={isCustomizerOpen}
          engineProfile={engineProfile}
          savedProfiles={savedProfiles}
          onClose={() => setIsCustomizerOpen(false)}
          onChangeElo={handleChangeElo}
          onSelectPreset={handleSelectPreset}
          onUpdateCustomConfig={handleUpdateCustomConfig}
          onSaveProfile={handleSaveCustomProfile}
          onLoadProfile={handleLoadCustomProfile}
          onDeleteProfile={handleDeleteCustomProfile}
          onResetToEloDefault={handleResetToEloDefault}
        />
        <SavedGamesModal
          isOpen={isSavedGamesOpen}
          onClose={() => setIsSavedGamesOpen(false)}
          savedSessions={savedSessions}
          activeSession={activeSession}
          onSaveCurrentSession={handleSaveCurrentSession}
          onLoadSession={handleLoadSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          onClearActiveSession={handleClearActiveSession}
          onImportSession={handleImportSession}
        />
      </>
    );
  }

  const isBoardLocked =
    isPreviewingHistory ||
    (retryBlunderSession === null && gameState.status !== 'playing') ||
    isAIThinking ||
    pendingPromotion !== null ||
    (retryBlunderSession === null && gameMode === 'ai' && gameState.turn !== playerColor);

  return (
    <div className="min-h-dvh lg:h-dvh w-full bg-[#111815] text-[#F4EFE6] flex flex-col relative overflow-x-hidden lg:overflow-hidden">
      {/* Full-Width Top Header Bar: Status, AI Difficulty/Telemetry, Move History Popover, Undo & Options */}
      <TopHeaderBar
        gameState={gameState}
        gameMode={gameMode}
        playerColor={playerColor}
        aiDifficulty={aiDifficulty}
        engineProfile={engineProfile}
        lastSearchStats={lastSearchStats}
        showEngineStats={showEngineStats}
        isFlipped={isFlipped}
        isAIThinking={isAIThinking}
        canUndo={canUndo}
        isMuted={isMuted}
        helperMode={helperMode}
        showBoardSuggestions={showBoardSuggestions}
        previewPly={previewPly}
        onPreviewPly={setPreviewPly}
        helperAnalysis={helperAnalysis}
        openingAnalysis={openingAnalysis}
        openingPrinciplesReport={openingPrinciplesReport}
        highlightedHelperRank={highlightedHelperRank}
        onSelectDifficulty={handleSelectDifficulty}
        onSelectPreset={handleSelectPreset}
        onChangeElo={handleChangeElo}
        onOpenCustomizer={() => setIsCustomizerOpen(true)}
        onOpenSavedGames={() => setIsSavedGamesOpen(true)}
        onSaveCurrentSession={() => handleSaveCurrentSession()}
        savedSessionsCount={savedSessions.length}
        onToggleEngineStats={handleToggleEngineStats}
        onToggleHelperMode={handleToggleHelperMode}
        onToggleBoardSuggestions={handleToggleBoardSuggestions}
        onHoverHelperRank={setHighlightedHelperRank}
        onPlayRecommendedMove={(rec: RecommendedMove) => {
          if (!isBoardLocked) {
            commitMove(rec.move);
          }
        }}
        onNewGame={() => startNewMatch()}
        onFlipBoard={() => setIsFlipped((prev) => !prev)}
        onTogglePlayAsColor={(nextColor) => {
          setPlayerColor(nextColor);
          startNewMatch(nextColor, gameMode);
        }}
        onToggleGameMode={(nextMode) => {
          setGameMode(nextMode);
          startNewMatch(playerColor, nextMode);
        }}
        onUndoMove={handleUndoMove}
        onOpenPause={() => setShellState('paused')}
        onToggleMute={handleToggleMute}
        onOpenPuzzles={handleOpenPuzzles}
        onOpenGameReview={handleOpenGameReview}
        onCopyFen={handleCopyCurrentFen}
        onCopyPgn={handleCopyCurrentPgn}
      />

      {/* Full-Viewport 2-Column Arena: Left (Board + Under-Board Player Strip) · Right (Spacious Tabbed Tactical Coach) */}
      <main className="flex-1 min-h-0 w-full max-w-[1440px] mx-auto px-3 sm:px-5 py-2.5 flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-4 lg:gap-6">
        <div className="flex flex-col items-center justify-center gap-2 shrink-0 min-h-0">
          <ChessBoard
            gameState={displayedGameState}
            legalMoves={isPreviewingHistory ? [] : legalMoves}
            selectedSquare={isPreviewingHistory ? null : selectedSquare}
            pendingPromotion={pendingPromotion}
            isFlipped={isFlipped}
            isInteractionDisabled={isBoardLocked}
            helperMode={isPreviewingHistory ? false : helperMode}
            showBoardSuggestions={showBoardSuggestions}
            isPreviewingHistory={isPreviewingHistory}
            helperAnalysis={helperAnalysis}
            highlightedHelperRank={highlightedHelperRank}
            plannedArrows={plannedArrows}
            hintPieceSquare={
              retryBlunderSession?.hintRevealed
                ? retryBlunderSession.turningPoint.bestMove.from
                : null
            }
            hintDestSquare={
              retryBlunderSession?.solved
                ? retryBlunderSession.turningPoint.bestMove.to
                : null
            }
            hintArrow={
              retryBlunderSession?.solved
                ? {
                    from: retryBlunderSession.turningPoint.bestMove.from,
                    to: retryBlunderSession.turningPoint.bestMove.to,
                  }
                : null
            }
            onSquareClick={handleSquareClick}
            onMovePiece={(from, to) => {
              if (!isBoardLocked) {
                handleAttemptMove(from, to);
              }
            }}
            onTogglePlannedArrow={handleTogglePlannedArrow}
            onClearPlannedArrows={handleClearPlannedArrows}
            onSelectPromotion={handleSelectPromotion}
            onCancelPromotion={() => setPendingPromotion(null)}
          />

          <UnderBoardPlayerStrip
            gameState={displayedGameState}
            gameMode={gameMode}
            playerColor={playerColor}
            aiDifficulty={aiDifficulty}
            engineProfile={engineProfile}
            previewPly={previewPly}
            totalPlies={stateStack.length - 1}
            onPreviewPly={setPreviewPly}
            onCopyFen={handleCopyCurrentFen}
            onCopyPgn={handleCopyCurrentPgn}
            onOpenGameReview={handleOpenGameReview}
          />
        </div>

        <TacticalCoachPanel
          gameState={gameState}
          helperMode={helperMode}
          showBoardSuggestions={showBoardSuggestions}
          helperAnalysis={helperAnalysis}
          openingAnalysis={openingAnalysis}
          openingPrinciplesReport={openingPrinciplesReport}
          highlightedHelperRank={highlightedHelperRank}
          playerColor={playerColor}
          onToggleHelperMode={handleToggleHelperMode}
          onToggleBoardSuggestions={handleToggleBoardSuggestions}
          onHoverHelperRank={setHighlightedHelperRank}
          onPlayRecommendedMove={(rec: RecommendedMove) => {
            if (!isBoardLocked) {
              commitMove(rec.move);
            }
          }}
        />
      </main>

      {/* Granular AI Engine Customizer Modal */}
      <EngineCustomizerModal
        isOpen={isCustomizerOpen}
        engineProfile={engineProfile}
        savedProfiles={savedProfiles}
        onClose={() => setIsCustomizerOpen(false)}
        onChangeElo={handleChangeElo}
        onSelectPreset={handleSelectPreset}
        onUpdateCustomConfig={handleUpdateCustomConfig}
        onSaveProfile={handleSaveCustomProfile}
        onLoadProfile={handleLoadCustomProfile}
        onDeleteProfile={handleDeleteCustomProfile}
        onResetToEloDefault={handleResetToEloDefault}
      />

      {/* Comprehensive Post-Game Review Modal */}
      {gameReviewReport && (
        <GameReviewModal
          isOpen={isGameReviewOpen}
          onClose={() => setIsGameReviewOpen(false)}
          report={gameReviewReport}
          gameState={gameState}
          stateStack={stateStack}
          playerColor={playerColor}
          gameMode={gameMode}
          onSelectPreviewPly={(ply) => {
            setIsGameReviewOpen(false);
            setInspectingGameOverBoard(true);
            setPreviewPly(ply);
          }}
          onStartRetryBlunder={handleStartRetryBlunder}
          onPlayAgain={() => {
            setIsGameReviewOpen(false);
            startNewMatch();
          }}
        />
      )}

      {/* Interactive Turning Point / Blunder Retry Banner */}
      {retryBlunderSession && (
        <aside
          data-testid="retry-blunder-banner"
          aria-label="Turning Point Retry"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-35 bg-[#17211C] border-2 border-[#C6923A] rounded-xl px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.85)] max-w-xl w-[92vw] space-y-2 backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base text-[#C6923A]">↺</span>
              <span className="text-xs font-mono font-bold uppercase text-[#F4EFE6]">
                Turning Point Practice · Move{' '}
                {retryBlunderSession.turningPoint.turnNumber} (
                {retryBlunderSession.turningPoint.color === 'w'
                  ? 'White'
                  : 'Black'}
                )
              </span>
            </div>
            {retryBlunderSession.solved && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-stone-950 text-[10px] font-bold font-mono uppercase">
                ★ Solved!
              </span>
            )}
          </div>

          <p className="text-xs text-[#D6CFC2] leading-snug">
            {retryBlunderSession.solved ? (
              <span>
                <strong className="text-emerald-400">Excellent find!</strong>{' '}
                {retryBlunderSession.turningPoint.bestSan} was the winning
                continuation. {retryBlunderSession.turningPoint.description}
              </span>
            ) : (
              <span>
                In the match,{' '}
                <span className="font-mono font-bold text-rose-400">
                  {retryBlunderSession.turningPoint.playedSan}
                </span>{' '}
                was played ({retryBlunderSession.turningPoint.classification}).
                Can you find the engine's best move?
              </span>
            )}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#26342C]">
            <div className="flex items-center gap-1.5">
              {!retryBlunderSession.solved && (
                <>
                  <button
                    type="button"
                    data-testid="retry-hint-btn"
                    onClick={() => {
                      setRetryBlunderSession((prev) =>
                        prev ? { ...prev, hintRevealed: true } : null
                      );
                      showToast(
                        `Hint: Move the piece on ${retryBlunderSession.turningPoint.bestMove.from}`
                      );
                    }}
                    className="px-2.5 py-1 rounded bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-[11px] font-semibold text-[#EADBC8] transition-colors cursor-pointer"
                  >
                    💡 Hint
                  </button>
                  <button
                    type="button"
                    data-testid="retry-reveal-btn"
                    onClick={() => {
                      showToast(
                        `Best move was ${retryBlunderSession.turningPoint.bestSan}`
                      );
                      setRetryBlunderSession((prev) =>
                        prev ? { ...prev, solved: true } : null
                      );
                    }}
                    className="px-2.5 py-1 rounded bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-[11px] font-semibold text-[#EADBC8] transition-colors cursor-pointer"
                  >
                    Reveal
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRetryBlunderSession(null);
                  setIsGameReviewOpen(true);
                }}
                className="px-3 py-1 rounded bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-[11px] font-semibold text-[#F4EFE6] transition-colors cursor-pointer"
              >
                Review Report
              </button>
              <button
                type="button"
                onClick={() => setRetryBlunderSession(null)}
                className="px-3 py-1 rounded bg-[#C6923A] hover:bg-[#D4A048] text-[11px] font-bold text-[#111815] transition-colors cursor-pointer"
              >
                Exit Practice
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Pause & Game Over Modals */}
      {!inspectingGameOverBoard && (
        <StatusModal
          shellState={shellState}
          gameState={gameState}
          gameMode={gameMode}
          playerColor={playerColor}
          onResume={() => setShellState('playing')}
          onNewGame={() => startNewMatch()}
          onReturnToTitle={() => {
            clearPendingTimers();
            setIsAIThinking(false);
            setShellState('title');
          }}
          onInspectBoard={() => {
            setInspectingGameOverBoard(true);
            setShellState('playing');
          }}
          onOpenSavedGames={() => setIsSavedGamesOpen(true)}
          onOpenGameReview={handleOpenGameReview}
        />
      )}

      {/* Floating Action Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#C6923A] text-[#111815] px-4 py-1.5 rounded-full text-xs font-mono font-bold shadow-xl flex items-center gap-1.5 pointer-events-none"
        >
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Floating Game Over Inspection Bar */}
      {inspectingGameOverBoard && (
        <aside
          data-testid="inspect-board-banner"
          aria-label="Board Inspection Mode"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 bg-[#121A16]/95 border-2 border-[#C6923A] rounded-xl px-4 py-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.85)] flex flex-wrap items-center justify-center gap-3 backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C6923A] animate-pulse" />
            <span className="text-xs font-mono font-bold text-[#F4EFE6]">
              Board Inspection Mode
            </span>
            <span className="text-[11px] font-mono text-[#A69F91] hidden sm:inline">
              · Final Position (Move {gameState.fullMoveNumber})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setInspectingGameOverBoard(false);
                setShellState('gameover');
              }}
              className="px-3 py-1.5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-xs font-bold text-[#111815] transition-colors cursor-pointer"
            >
              Reopen Summary
            </button>
            <button
              type="button"
              onClick={() => startNewMatch()}
              className="px-3 py-1.5 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer"
            >
              New Game [R]
            </button>
            <button
              type="button"
              onClick={() => setIsSavedGamesOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[#212E27] hover:bg-[#2B3B32] border border-[#34463C] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] transition-colors cursor-pointer"
            >
              Save / Slots [S]
            </button>
          </div>
        </aside>
      )}

      {/* Saved Game Sessions Modal */}
      <SavedGamesModal
        isOpen={isSavedGamesOpen}
        onClose={() => setIsSavedGamesOpen(false)}
        currentState={gameState}
        currentGameMode={gameMode}
        currentPlayerColor={playerColor}
        currentEngineProfile={engineProfile}
        currentIsFlipped={isFlipped}
        savedSessions={savedSessions}
        activeSession={activeSession}
        onSaveCurrentSession={handleSaveCurrentSession}
        onLoadSession={handleLoadSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onClearActiveSession={handleClearActiveSession}
        onImportSession={handleImportSession}
      />
    </div>
  );
}
