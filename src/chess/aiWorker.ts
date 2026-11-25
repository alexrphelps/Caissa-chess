import {
  getSharedFastBoard,
  getSharedFastEngine,
  resolveEngineConfig,
  searchBestAIMove,
} from './ai';
import { FastBoard, START_FEN } from './engineCore/board';
import { SearchInfoEvent, fastMoveToUci } from './engineCore/types';
import { analyzeTacticsDeep, TacticsAnalysis } from './tacticsHelper';
import {
  AIDifficulty,
  AISearchResult,
  ChessEngineConfig,
  CoachPlaystyleProfile,
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
      coachPlaystyle?: CoachPlaystyleProfile;
    }
  | {
      type: 'position';
      fen?: string;
      moves?: string[];
      state?: GameState;
    }
  | {
      type: 'go';
      requestId: number;
      movetime?: number;
      depth?: number;
      nodes?: number;
      engineConfig?: Partial<ChessEngineConfig>;
    }
  | {
      type: 'stop';
    }
  | {
      type: 'clear_hash';
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
    }
  | {
      type: 'info';
      requestId: number;
      info: SearchInfoEvent;
    }
  | {
      type: 'bestmove';
      requestId: number;
      bestmove: string;
      score: number;
      depth: number;
      nodes: number;
      nps: number;
      elapsedMs: number;
      pv: string[];
    };

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<AIWorkerRequest>) => void) | null;
  postMessage: (message: AIWorkerResponse) => void;
};

// Persistent worker-resident FastBoard & FastSearchEngine (retains 64 MB Flat TT & aged history!)
const workerBoard: FastBoard = getSharedFastBoard();
const workerEngine = getSharedFastEngine();

function applyUciMoveToWorkerBoard(uci: string): boolean {
  const buf = new Int32Array(256);
  const end = workerBoard.generateMoves(buf, 0, false);
  const target = uci.trim().toLowerCase();
  for (let i = 0; i < end; i++) {
    const m = buf[i];
    if (fastMoveToUci(m) === target) {
      return workerBoard.makeMove(m);
    }
  }
  return false;
}

ctx.onmessage = (event: MessageEvent<AIWorkerRequest>) => {
  const data = event.data;

  if (data.type === 'stop') {
    workerEngine.requestStop();
    return;
  }

  if (data.type === 'clear_hash') {
    workerEngine.clearState();
    return;
  }

  if (data.type === 'position') {
    if (data.state) {
      workerBoard.loadGameState(data.state);
    } else {
      workerBoard.loadFen(data.fen && data.fen !== 'startpos' ? data.fen : START_FEN);
      if (data.moves && data.moves.length > 0) {
        for (const uci of data.moves) {
          applyUciMoveToWorkerBoard(uci);
        }
      }
    }
    return;
  }

  if (data.type === 'go') {
    const cfg = resolveEngineConfig('club', data.engineConfig);
    const maxTimeMs = data.movetime ?? cfg.maxTimeMs;
    const maxDepth = data.depth ?? cfg.maxDepth;
    const outcome = workerEngine.search(workerBoard, {
      maxDepth,
      maxTimeMs,
      softTimeMs: Math.max(20, Math.floor(maxTimeMs * 0.45)),
      maxNodes: data.nodes,
      config: cfg,
      onInfo: (info) => {
        ctx.postMessage({
          type: 'info',
          requestId: data.requestId,
          info,
        });
      },
    });

    ctx.postMessage({
      type: 'bestmove',
      requestId: data.requestId,
      bestmove: outcome.bestUci,
      score: outcome.score,
      depth: outcome.depth,
      nodes: outcome.nodes,
      nps: outcome.nps,
      elapsedMs: outcome.elapsedMs,
      pv: outcome.pv.map(fastMoveToUci),
    });
    return;
  }

  if (data.type === 'coach_analysis') {
    const analysis = analyzeTacticsDeep(
      data.state,
      data.maxDepth,
      data.maxTimeMs,
      data.engineConfig,
      data.coachPlaystyle
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
