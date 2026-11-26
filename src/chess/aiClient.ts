import { getTargetAIDelayMs, searchBestAIMove } from './ai';
import { AIWorkerRequest, AIWorkerResponse } from './aiWorker';
import {
  GameReviewProgressEvent,
  GameReviewReport,
  generateGameReview,
} from './gameReview';
import { ReplayPlyCoachInsight, TimelineNode } from './pgnTypes';
import { analyzeReplayPly } from './replayCoach';
import { analyzeTacticsDeep, TacticsAnalysis } from './tacticsHelper';
import {
  AIDifficulty,
  AISearchResult,
  ChessEngineConfig,
  CoachPlaystyleProfile,
  GameState,
} from './types';

let workerInstance: Worker | null = null;
let workerFailed = false;
let nextRequestId = 1;

const pendingMoveResolvers = new Map<
  number,
  {
    resolve: (res: AISearchResult) => void;
    reject: (err: unknown) => void;
  }
>();

const pendingCoachResolvers = new Map<
  number,
  {
    resolve: (res: TacticsAnalysis) => void;
    reject: (err: unknown) => void;
  }
>();

const pendingReplayPlyResolvers = new Map<
  number,
  {
    resolve: (res: ReplayPlyCoachInsight) => void;
    reject: (err: unknown) => void;
  }
>();

const pendingFullReviewResolvers = new Map<
  number,
  {
    resolve: (res: GameReviewReport) => void;
    reject: (err: unknown) => void;
    onProgress?: (progress: GameReviewProgressEvent) => void;
  }
>();

function getOrCreateWorker(): Worker | null {
  if (workerFailed || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('./aiWorker.ts', import.meta.url), {
        type: 'module',
      });
      workerInstance.onmessage = (event: MessageEvent<AIWorkerResponse>) => {
        const msg = event.data;
        if (msg.type === 'info' || msg.type === 'bestmove') {
          return;
        }
        if (msg.type === 'coach_analysis') {
          const pending = pendingCoachResolvers.get(msg.requestId);
          if (pending) {
            pendingCoachResolvers.delete(msg.requestId);
            pending.resolve(msg.analysis);
          }
          return;
        }
        if (msg.type === 'replay_ply_analysis') {
          const pending = pendingReplayPlyResolvers.get(msg.requestId);
          if (pending) {
            pendingReplayPlyResolvers.delete(msg.requestId);
            pending.resolve(msg.insight);
          }
          return;
        }
        if (msg.type === 'full_game_review_progress') {
          const pending = pendingFullReviewResolvers.get(msg.requestId);
          if (pending?.onProgress) {
            pending.onProgress(msg.progress);
          }
          return;
        }
        if (msg.type === 'full_game_review') {
          const pending = pendingFullReviewResolvers.get(msg.requestId);
          if (pending) {
            pendingFullReviewResolvers.delete(msg.requestId);
            pending.resolve(msg.report);
          }
          return;
        }

        const pending = pendingMoveResolvers.get(msg.requestId);
        if (pending) {
          pendingMoveResolvers.delete(msg.requestId);
          pending.resolve(msg.result);
        }
      };
      workerInstance.onerror = (err) => {
        workerFailed = true;
        for (const [, pending] of pendingMoveResolvers) {
          pending.reject(err);
        }
        for (const [, pending] of pendingCoachResolvers) {
          pending.reject(err);
        }
        for (const [, pending] of pendingReplayPlyResolvers) {
          pending.reject(err);
        }
        for (const [, pending] of pendingFullReviewResolvers) {
          pending.reject(err);
        }
        pendingMoveResolvers.clear();
        pendingCoachResolvers.clear();
        pendingReplayPlyResolvers.clear();
        pendingFullReviewResolvers.clear();
        workerInstance?.terminate();
        workerInstance = null;
      };
    } catch {
      workerFailed = true;
      workerInstance = null;
    }
  }
  return workerInstance;
}

/**
 * Executes the AI move search asynchronously inside a Web Worker (with graceful main-thread
 * fallback if Worker is unavailable) and applies the human-like cadence delay.
 */
export async function computeAIMoveWithCadence(
  state: GameState,
  difficulty: AIDifficulty,
  signal?: AbortSignal,
  engineConfig?: Partial<ChessEngineConfig>
): Promise<AISearchResult> {
  const blankAbortedResult: AISearchResult = {
    move: null,
    difficulty,
    score: 0,
    depth: 0,
    nodes: 0,
    elapsedMs: 0,
    formattedScore: '0.0',
  };

  if (signal?.aborted) {
    return blankAbortedResult;
  }

  const startWallMs = performance.now();

  const computePromise = new Promise<AISearchResult>((resolve) => {
    if (signal?.aborted) {
      resolve(blankAbortedResult);
      return;
    }

    const worker = getOrCreateWorker();
    if (!worker) {
      const timer = window.setTimeout(() => {
        if (signal?.aborted) {
          resolve(blankAbortedResult);
          return;
        }
        resolve(
          searchBestAIMove(state, difficulty, Math.random, engineConfig)
        );
      }, 16);
      signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer);
          resolve(blankAbortedResult);
        },
        { once: true }
      );
      return;
    }

    const requestId = nextRequestId++;
    const abortHandler = () => {
      pendingMoveResolvers.delete(requestId);
      // Terminate running worker to immediately halt background minimax search
      if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
      }
      resolve(blankAbortedResult);
    };

    signal?.addEventListener('abort', abortHandler, { once: true });

    pendingMoveResolvers.set(requestId, {
      resolve: (res) => {
        signal?.removeEventListener('abort', abortHandler);
        resolve(res);
      },
      reject: () => {
        signal?.removeEventListener('abort', abortHandler);
        if (signal?.aborted) {
          resolve(blankAbortedResult);
        } else {
          resolve(
            searchBestAIMove(state, difficulty, Math.random, engineConfig)
          );
        }
      },
    });

    const payload: AIWorkerRequest = {
      type: 'ai_move',
      requestId,
      state,
      difficulty,
      engineConfig,
    };
    worker.postMessage(payload);
  });

  const result = await computePromise;
  if (signal?.aborted) {
    return result;
  }

  const totalElapsedSoFar = performance.now() - startWallMs;
  const remainingDelayMs = getTargetAIDelayMs(difficulty, totalElapsedSoFar);

  if (remainingDelayMs > 0) {
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, remainingDelayMs);
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      }
    });
  }

  return result;
}

/**
 * Executes the Deep 3000+ GM Multi-PV Tactical Coach analysis inside the Web Worker
 * so the UI stays 60fps responsive while applying the user's playstyle tuning knobs.
 */
export async function computeDeepCoachAnalysis(
  state: GameState,
  signal?: AbortSignal,
  engineConfig?: Partial<ChessEngineConfig>,
  coachPlaystyle?: CoachPlaystyleProfile
): Promise<TacticsAnalysis | null> {
  if (signal?.aborted || state.status !== 'playing') return null;

  return new Promise<TacticsAnalysis | null>((resolve) => {
    const worker = getOrCreateWorker();
    if (!worker) {
      const timer = window.setTimeout(() => {
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        resolve(
          analyzeTacticsDeep(
            state,
            undefined,
            engineConfig?.maxTimeMs ?? 1050,
            engineConfig,
            coachPlaystyle
          )
        );
      }, 16);
      signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer);
          resolve(null);
        },
        { once: true }
      );
      return;
    }

    const requestId = nextRequestId++;
    pendingCoachResolvers.set(requestId, {
      resolve: (analysis) => {
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        resolve(analysis);
      },
      reject: () => {
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        resolve(
          analyzeTacticsDeep(
            state,
            undefined,
            engineConfig?.maxTimeMs ?? 1050,
            engineConfig,
            coachPlaystyle
          )
        );
      },
    });

    signal?.addEventListener(
      'abort',
      () => {
        pendingCoachResolvers.delete(requestId);
        if (
          workerInstance &&
          pendingMoveResolvers.size === 0 &&
          pendingFullReviewResolvers.size === 0
        ) {
          workerInstance.terminate();
          workerInstance = null;
        }
        resolve(null);
      },
      { once: true }
    );

    const payload: AIWorkerRequest = {
      type: 'coach_analysis',
      requestId,
      state,
      maxDepth: engineConfig?.maxDepth,
      maxTimeMs: engineConfig?.maxTimeMs ?? 1050,
      engineConfig,
      coachPlaystyle,
    };
    worker.postMessage(payload);
  });
}

/**
 * Executes Replay Studio per-ply coach analysis inside the Web Worker so stepping
 * through master games or sidelines remains instant and non-blocking.
 */
export async function computeReplayPlyCoachAnalysis(
  stateBefore: GameState | null,
  playedNode: TimelineNode,
  stateAfter: GameState,
  options?: {
    cacheKey?: string;
    maxDepth?: number;
    maxTimeMs?: number;
    signal?: AbortSignal;
  }
): Promise<ReplayPlyCoachInsight | null> {
  const signal = options?.signal;
  if (signal?.aborted) return null;

  const analysisOpts = {
    cacheKey: options?.cacheKey,
    maxDepth: options?.maxDepth,
    maxTimeMs: options?.maxTimeMs,
  };

  return new Promise<ReplayPlyCoachInsight | null>((resolve) => {
    const worker = getOrCreateWorker();
    if (!worker) {
      const timer = window.setTimeout(() => {
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        resolve(analyzeReplayPly(stateBefore, playedNode, stateAfter, analysisOpts));
      }, 16);
      signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer);
          resolve(null);
        },
        { once: true }
      );
      return;
    }

    const requestId = nextRequestId++;
    const abortHandler = () => {
      pendingReplayPlyResolvers.delete(requestId);
      resolve(null);
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    pendingReplayPlyResolvers.set(requestId, {
      resolve: (insight) => {
        signal?.removeEventListener('abort', abortHandler);
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        resolve(insight);
      },
      reject: () => {
        signal?.removeEventListener('abort', abortHandler);
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        resolve(analyzeReplayPly(stateBefore, playedNode, stateAfter, analysisOpts));
      },
    });

    const payload: AIWorkerRequest = {
      type: 'replay_ply_analysis',
      requestId,
      stateBefore,
      playedNode,
      stateAfter,
      cacheKey: options?.cacheKey,
      maxDepth: options?.maxDepth,
      maxTimeMs: options?.maxTimeMs,
    };
    worker.postMessage(payload);
  });
}

/**
 * Runs a full-game accuracy, advantage graph, and turning-point review asynchronously
 * inside the Web Worker with live progress updates.
 */
export async function computeFullGameReviewAsync(
  stateStack: GameState[],
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: GameReviewProgressEvent) => void;
  }
): Promise<GameReviewReport | null> {
  const signal = options?.signal;
  const onProgress = options?.onProgress;
  if (signal?.aborted) return null;

  return new Promise<GameReviewReport | null>((resolve) => {
    const worker = getOrCreateWorker();
    if (!worker) {
      const timer = window.setTimeout(() => {
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        resolve(generateGameReview(stateStack, onProgress));
      }, 24);
      signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer);
          resolve(null);
        },
        { once: true }
      );
      return;
    }

    const requestId = nextRequestId++;
    const abortHandler = () => {
      pendingFullReviewResolvers.delete(requestId);
      if (
        workerInstance &&
        pendingMoveResolvers.size === 0 &&
        pendingCoachResolvers.size === 0
      ) {
        workerInstance.terminate();
        workerInstance = null;
      }
      resolve(null);
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    pendingFullReviewResolvers.set(requestId, {
      onProgress,
      resolve: (report) => {
        signal?.removeEventListener('abort', abortHandler);
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        resolve(report);
      },
      reject: () => {
        signal?.removeEventListener('abort', abortHandler);
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        resolve(generateGameReview(stateStack, onProgress));
      },
    });

    const payload: AIWorkerRequest = {
      type: 'full_game_review',
      requestId,
      stateStack,
    };
    worker.postMessage(payload);
  });
}

