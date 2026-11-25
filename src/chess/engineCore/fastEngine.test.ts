import test from 'node:test';
import assert from 'node:assert/strict';
import { FastBoard, START_FEN } from './board';
import { FastSearchEngine } from './search';
import { TranspositionTable, TT_BETA, TT_EXACT } from './tt';
import {
  fastMoveToUci,
  INTERNAL_MATE,
  packTTMove,
} from './types';
import { ChessEngineConfig, EvalWeights } from '../types';

const DEFAULT_WEIGHTS: EvalWeights = {
  material: 1.0,
  pieceSquareTables: 1.0,
  pawnStructure: 1.0,
  kingSafety: 1.0,
  mobility: 1.0,
};

const GM_3000_CONFIG: ChessEngineConfig = {
  maxDepth: 24,
  maxTimeMs: 1200,
  enableQuiescence: true,
  enableTranspositionTable: true,
  enableNullMovePruning: true,
  enableLMR: true,
  errorProbability: 0,
  errorMarginCentipawns: 0,
  evalWeights: DEFAULT_WEIGHTS,
};

const KIWIPETE_FEN =
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

const PERFT_POS3_FEN = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const PERFT_POS5_FEN =
  'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';

test('Perft(1..5) on Starting Position matches exact known node counts', () => {
  const board = new FastBoard();
  board.loadFen(START_FEN);

  const expected = [20, 400, 8902, 197281, 4865609];
  const t0 = performance.now();
  for (let d = 1; d <= 5; d++) {
    const count = board.perft(d);
    assert.equal(
      count,
      expected[d - 1],
      `Startpos perft(${d}) mismatch: got ${count}, expected ${expected[d - 1]}`
    );
  }
  const elapsed = performance.now() - t0;
  console.log(
    `[Perft Startpos 1..5] 4,865,609 nodes in ${elapsed.toFixed(1)} ms (${Math.round(
      (4865609 / Math.max(1, elapsed)) * 1000
    ).toLocaleString()} nodes/s)`
  );
});

test('Perft(1..4) on Kiwipete matches exact known node counts', () => {
  const board = new FastBoard();
  board.loadFen(KIWIPETE_FEN);

  const expected = [48, 2039, 97862, 4085603];
  const t0 = performance.now();
  for (let d = 1; d <= 4; d++) {
    const count = board.perft(d);
    assert.equal(
      count,
      expected[d - 1],
      `Kiwipete perft(${d}) mismatch: got ${count}, expected ${expected[d - 1]}`
    );
  }
  const elapsed = performance.now() - t0;
  console.log(
    `[Perft Kiwipete 1..4] 4,085,603 nodes in ${elapsed.toFixed(1)} ms (${Math.round(
      (4085603 / Math.max(1, elapsed)) * 1000
    ).toLocaleString()} nodes/s)`
  );
});

test('Perft on Position 3 (En Passant pins) & Position 5 (Promotions/Castling)', () => {
  const b3 = new FastBoard();
  b3.loadFen(PERFT_POS3_FEN);
  assert.equal(b3.perft(1), 14);
  assert.equal(b3.perft(2), 191);
  assert.equal(b3.perft(3), 2812);
  assert.equal(b3.perft(4), 43238);

  const b5 = new FastBoard();
  b5.loadFen(PERFT_POS5_FEN);
  assert.equal(b5.perft(1), 44);
  assert.equal(b5.perft(2), 1486);
  assert.equal(b5.perft(3), 62379);
});

test('Incremental Zobrist hash & PeSTO accumulators match fresh FEN after make/unmake', () => {
  const board = new FastBoard();
  board.loadFen(KIWIPETE_FEN);

  const origHi = board.hashHi;
  const origLo = board.hashLo;
  const origMatMg = board.matMg;
  const origMatEg = board.matEg;
  const origPstMg = board.pstMg;
  const origPstEg = board.pstEg;
  const origPhase = board.phase;

  const buf = new Int32Array(256);
  const end = board.generateMoves(buf, 0, false);

  for (let i = 0; i < end; i++) {
    const m = buf[i];
    if (!board.makeMove(m)) continue;

    // Nested ply 2
    const end2 = board.generateMoves(buf, 64, false);
    for (let j = 64; j < Math.min(end2, 80); j++) {
      const m2 = buf[j];
      if (!board.makeMove(m2)) continue;
      board.unmakeMove();
    }

    board.unmakeMove();

    assert.equal(board.hashHi, origHi, 'hashHi drifted after make/unmake');
    assert.equal(board.hashLo, origLo, 'hashLo drifted after make/unmake');
    assert.equal(board.matMg, origMatMg, 'matMg drifted after make/unmake');
    assert.equal(board.matEg, origMatEg, 'matEg drifted after make/unmake');
    assert.equal(board.pstMg, origPstMg, 'pstMg drifted after make/unmake');
    assert.equal(board.pstEg, origPstEg, 'pstEg drifted after make/unmake');
    assert.equal(board.phase, origPhase, 'phase drifted after make/unmake');
  }
});

test('Flat 64 MB TypedArray Transposition Table stores/probes with mate ply normalization', () => {
  const tt = new TranspositionTable(64);
  assert.equal(tt.byteLength, 64 * 1024 * 1024);

  const hi = 0xdeadbeef >>> 0;
  const lo = 0x12345678 >>> 0;

  // Store mate-in-5 from ply 4 => score at ply 4 is INTERNAL_MATE - 5
  const scoreAtPly4 = INTERNAL_MATE - 5;
  tt.store(hi, lo, 8, scoreAtPly4, TT_EXACT, 0x1234, 4);

  // Probe at ply 4 => should return INTERNAL_MATE - 5
  assert.equal(tt.probe(hi, lo, 4), true);
  assert.equal(tt.probedScore, scoreAtPly4);
  assert.equal(tt.probedMove, 0x1234);
  assert.equal(tt.probedDepth, 8);
  assert.equal(tt.probedFlag, TT_EXACT);

  // Probe same position at ply 2 => mate distance from root shifts by 2 plies
  assert.equal(tt.probe(hi, lo, 2), true);
  assert.equal(tt.probedScore, INTERNAL_MATE - 3);

  // Collision check: different hi key must miss
  assert.equal(tt.probe((hi ^ 1) >>> 0, lo, 4), false);

  // Depth-preferred replacement in same generation
  tt.store(hi, lo, 4, 150, TT_BETA, 0x5678, 4);
  assert.equal(tt.probe(hi, lo, 4), true);
  assert.equal(tt.probedDepth, 8, 'Lower-depth same-gen entry should not overwrite deeper entry');
});

test('Repetition detection flags repeated positions cleanly', () => {
  const board = new FastBoard();
  board.loadFen(START_FEN);

  const playUci = (uci: string) => {
    const buf = new Int32Array(256);
    const end = board.generateMoves(buf, 0, false);
    for (let i = 0; i < end; i++) {
      if (fastMoveToUci(buf[i]) === uci) {
        assert.equal(board.makeMove(buf[i]), true);
        return;
      }
    }
    throw new Error(`Move ${uci} not found`);
  };

  assert.equal(board.isRepetition(), false);
  playUci('g1f3');
  playUci('g8f6');
  playUci('f3g1');
  playUci('f6g8');
  assert.equal(board.isRepetition(), true, 'Return to startpos should detect repetition');
});

interface TacticalPuzzle {
  id: string;
  fen: string;
  acceptedUci: string[];
  theme: string;
}

// 10 classic tactical benchmark positions (WAC / Bratko-Kopec suite)
const TACTICAL_SUITE: TacticalPuzzle[] = [
  {
    id: 'WAC.001',
    fen: '2rr3k/pp3pp1/1nnqbN1p/3pN3/2pP4/2P3Q1/PPB4P/R4RK1 w - - 0 1',
    acceptedUci: ['g3g6'],
    theme: 'Queen sacrifice / smothered-mate threat (Qg6!)',
  },
  {
    id: 'WAC.002',
    fen: '8/7p/5k2/5p2/p1p2P2/Pr1pPK2/1P1R3P/8 b - - 0 1',
    acceptedUci: ['b3b2'],
    theme: 'Rook deflection sacrifice (Rxb2!)',
  },
  {
    id: 'WAC.003',
    fen: '5rk1/1ppb3p/p1pb4/6q1/3P1p1r/2P1R2P/PP1BQ1P1/5RKN w - - 0 1',
    acceptedUci: ['e3g3'],
    theme: 'Pin / Queen trap (Rg3!)',
  },
  {
    id: 'WAC.004',
    fen: 'r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PP3PPR/2KR4 w - - 0 1',
    acceptedUci: ['h6h7'],
    theme: 'Greek gift / h-file mate (Qxh7+!)',
  },
  {
    id: 'WAC.005',
    fen: '5k2/6pp/p1qN4/1p1p4/3P4/2PKP2Q/PP3r2/3R4 b - - 0 1',
    acceptedUci: ['c6c4'],
    theme: 'Forced Queen checkmate sequence (Qc4+!)',
  },
  {
    id: 'WAC.006',
    fen: '7k/p7/1R5K/6r1/6p1/6P1/8/8 w - - 0 1',
    acceptedUci: ['b6b7'],
    theme: 'Back-rank mating net (Rb7!)',
  },
  {
    id: 'WAC.008',
    fen: 'r4q1k/p2bR1rp/2p2Q1N/5p2/5p2/2P5/PP3PPP/R5K1 w - - 0 1',
    acceptedUci: ['e7f7'],
    theme: 'Deflection / Mate threat (Rf7!)',
  },
  {
    id: 'WAC.010',
    fen: '2br2k1/2q3rn/p2NppQ1/2p1P3/Pp5R/4P3/1P3PPP/3R2K1 w - - 0 1',
    acceptedUci: ['h4h7'],
    theme: 'Rook sacrifice on h7 (Rxh7!)',
  },
  {
    id: 'WAC.014',
    fen: 'r2rb1k1/pp1q1p1p/2n1p1p1/2bp4/5P2/PP1BPR1Q/1BPN2PP/R5K1 w - - 0 1',
    acceptedUci: ['h3h7'],
    theme: 'Classic h7 Queen sacrifice (Qxh7+!)',
  },
  {
    id: 'BK.01',
    fen: '1k1r4/pp1b1R2/3q2pp/4p3/2B5/4Q3/PPP2B2/2K5 b - - 0 1',
    acceptedUci: ['d6d1'],
    theme: 'Bratko-Kopec #1 Queen sacrifice (Qd1+!)',
  },
];

test('Tactical Benchmark Suite (WAC / Bratko-Kopec): accuracy, depth, and NPS', () => {
  const tt = new TranspositionTable(64);
  const engine = new FastSearchEngine(tt);
  const board = new FastBoard();

  // Warm up V8 TurboFan JIT on startpos before timing benchmark
  board.loadFen(START_FEN);
  engine.search(board, {
    maxDepth: 7,
    maxTimeMs: 120,
    softTimeMs: 60,
    config: GM_3000_CONFIG,
  });

  let solved = 0;
  let totalNodes = 0;
  let totalMs = 0;
  let maxDepthObserved = 0;

  console.log('\n=== Tactical Benchmark (1000ms hard / 550ms soft per position) ===');
  for (const puzzle of TACTICAL_SUITE) {
    engine.clearState();
    board.loadFen(puzzle.fen);

    const res = engine.search(board, {
      maxDepth: 24,
      maxTimeMs: 1000,
      softTimeMs: 550,
      config: GM_3000_CONFIG,
    });

    const hit = puzzle.acceptedUci.includes(res.bestUci);
    if (hit) solved++;
    totalNodes += res.nodes;
    totalMs += res.elapsedMs;
    if (res.depth > maxDepthObserved) maxDepthObserved = res.depth;

    console.log(
      `  [${hit ? 'PASS' : 'MISS'}] ${puzzle.id.padEnd(7)} -> ${res.bestUci} (expected ${puzzle.acceptedUci.join('/')}) | d=${res.depth}/${res.seldepth} | score=${res.score} | ${res.nodes.toLocaleString()} nodes | ${res.nps.toLocaleString()} nps | ${res.elapsedMs}ms`
    );
  }

  const avgNps = Math.round((totalNodes / Math.max(1, totalMs)) * 1000);
  console.log(
    `=== Summary: ${solved}/${TACTICAL_SUITE.length} solved | Max Depth: ${maxDepthObserved} | Avg NPS: ${avgNps.toLocaleString()} ===\n`
  );

  assert.ok(
    solved >= 9,
    `Expected at least 9/${TACTICAL_SUITE.length} tactical puzzles solved, got ${solved}`
  );
  assert.ok(
    avgNps >= 250_000,
    `Expected high search throughput (>250k NPS in sandboxed Node tsx), got ${avgNps.toLocaleString()} NPS`
  );
});
