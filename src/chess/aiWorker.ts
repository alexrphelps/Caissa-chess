import { searchBestAIMove } from './ai';
import { analyzeTacticsDeep, TacticsAnalysis } from './tacticsHelper';
import {
  AIDifficulty,
  AISearchResult,
  ChessEngineConfig,
  GameState,
} from './types';

export type AIWorkerRequest =
  | {
      type?: 'ai_move';
      requestId: number;
      state: GameState;
      difficulty: AIDifficulty;
      engineConfig?: Partial<ChessEngineConfig>;
    }
  | {
      type: 'coach_analysis';
      requestId: number;
      state: GameState;
      maxDepth?: number;
      maxTimeMs?: number;
      engineConfig?: Partial<ChessEngineConfig>;
    };

export type AIWorkerResponse =
  | {
      type: 'ai_move';
      requestId: number;
      result: AISearchResult;
    }
  | {
      type: 'coach_analysis';
      requestId: number;
      analysis: TacticsAnalysis;
    };

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<AIWorkerRequest>) => void) | null;
  postMessage: (message: AIWorkerResponse) => void;
};

ctx.onmessage = (event: MessageEvent<AIWorkerRequest>) => {
  const data = event.data;
  if (data.type === 'coach_analysis') {
    const analysis = analyzeTacticsDeep(
      data.state,
      data.maxDepth,
      data.maxTimeMs,
      data.engineConfig
    );
    const response: AIWorkerResponse = {
      type: 'coach_analysis',
      requestId: data.requestId,
      analysis,
    };
    ctx.postMessage(response);
    return;
  }

  const { requestId, state, difficulty, engineConfig } = data;
  const result = searchBestAIMove(
    state,
    difficulty,
    Math.random,
    engineConfig
  );
  const response: AIWorkerResponse = {
    type: 'ai_move',
    requestId,
    result,
  };
  ctx.postMessage(response);
};

