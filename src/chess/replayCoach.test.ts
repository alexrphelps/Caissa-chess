import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeReplayPly,
  computeEvalBarMetrics,
  sortCapturedPieces,
} from './replayCoach';
import { parseSinglePgnGame } from './pgnParser';

test('sortCapturedPieces orders captures cleanly from Queen to Pawn', () => {
  const sorted = sortCapturedPieces(['p', 'n', 'q', 'p', 'r', 'b', 'q']);
  assert.deepEqual(sorted, ['q', 'q', 'r', 'b', 'n', 'p', 'p']);
});

test('computeEvalBarMetrics maps equal, positive, negative, and mate evaluations smoothly', () => {
  const equal = computeEvalBarMetrics(0);
  assert.equal(equal.whitePct, 50);
  assert.equal(equal.label, '0.0');
  assert.equal(equal.isMate, false);

  const whiteUp = computeEvalBarMetrics(250);
  assert.ok(whiteUp.whitePct > 65 && whiteUp.whitePct < 95);
  assert.equal(whiteUp.label, '+2.5');
  assert.equal(whiteUp.whiteLeading, true);

  const blackUp = computeEvalBarMetrics(-300);
  assert.ok(blackUp.whitePct < 35 && blackUp.whitePct > 5);
  assert.equal(blackUp.label, '-3.0');
  assert.equal(blackUp.whiteLeading, false);

  const whiteMate = computeEvalBarMetrics(99994);
  assert.equal(whiteMate.whitePct, 100);
  assert.equal(whiteMate.isMate, true);
  assert.ok(whiteMate.label.startsWith('M'));

  const blackMate = computeEvalBarMetrics(-99992);
  assert.equal(blackMate.whitePct, 0);
  assert.equal(blackMate.isMate, true);
  assert.ok(blackMate.label.startsWith('M'));
});

test('analyzeReplayPly produces opening book insight and alternatives at ply 0 and opening moves', () => {
  const parsed = parseSinglePgnGame(`
[Event "Opening Check"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *
`);

  const startInsight = analyzeReplayPly(
    null,
    parsed.timeline[0],
    parsed.timeline[0].gameState,
    { maxDepth: 3, maxTimeMs: 120 }
  );
  assert.equal(startInsight.ply, 0);
  assert.equal(startInsight.verdict, 'start');
  assert.ok(startInsight.alternatives.length >= 1);
  assert.ok(startInsight.planSummary.length > 10);

  const e4Insight = analyzeReplayPly(
    parsed.timeline[0].gameState,
    parsed.timeline[1],
    parsed.timeline[1].gameState,
    { maxDepth: 3, maxTimeMs: 150 }
  );
  assert.equal(e4Insight.ply, 1);
  assert.ok(
    ['book', 'best', 'excellent', 'good'].includes(e4Insight.verdict),
    `Expected strong/book verdict for 1. e4, got ${e4Insight.verdict}`
  );
  assert.ok(e4Insight.alternatives.length >= 1);
  assert.ok(e4Insight.planSummary.length > 10);
});

test('analyzeReplayPly flags an egregious blunder with better engine alternatives', () => {
  const parsed = parseSinglePgnGame(`
[Event "Blunder Check"]
[White "Novice"]
[Black "Club"]
[Result "*"]

1. f3 e5 2. g4 *
`);
  const insight = analyzeReplayPly(
    parsed.timeline[2].gameState,
    parsed.timeline[3],
    parsed.timeline[3].gameState,
    { maxDepth: 4, maxTimeMs: 250 }
  );

  assert.ok(
    insight.verdict === 'blunder' || insight.verdict === 'mistake',
    `Expected blunder/mistake for 2. g4 allowing mate-in-1, got ${insight.verdict} (cpl=${insight.centipawnLoss})`
  );
  assert.ok(insight.centipawnLoss >= 200);
  assert.ok(insight.alternatives.length >= 1);
});
