import { getTargetAIDelayMs, searchBestAIMove } from './ai';
import { AIWorkerRequest, AIWorkerResponse } from './aiWorker';
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
        pendingMoveResolvers.clear();
        pendingCoachResolvers.clear();
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
        if (workerInstance && pendingMoveResolvers.size === 0) {
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

