import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialGameState,
  makeMove,
} from './engine';
import {
  calculatePlayerAccuracy,
  classifyMoveQuality,
  generateGameReview,
} from './gameReview';
import { Move } from './types';

test('Game Review: Accuracy calculation handles 0 loss and high loss cleanly', () => {
  assert.equal(calculatePlayerAccuracy([]), 100);
  assert.equal(calculatePlayerAccuracy([0, 0, 0]), 100);

  const lowLossAccuracy = calculatePlayerAccuracy([10, 15, 20]);
  assert.ok(lowLossAccuracy >= 90);

  const highLossAccuracy = calculatePlayerAccuracy([300, 400, 500]);
  assert.ok(highLossAccuracy < 50);
});

test('Game Review: Move classification distinguishes Best, Inaccuracy, and Blunder', () => {
  assert.equal(classifyMoveQuality(0, 0, true), 'best');
  assert.equal(classifyMoveQuality(10, 0.01, false), 'best');
  assert.equal(classifyMoveQuality(30, 0.03, false), 'excellent');
  assert.equal(classifyMoveQuality(65, 0.08, false), 'good');
  assert.equal(classifyMoveQuality(120, 0.15, false), 'inaccuracy');
  assert.equal(classifyMoveQuality(250, 0.28, false), 'mistake');
  assert.equal(classifyMoveQuality(450, 0.45, false), 'blunder');
});

test('Game Review: Generates full report on mini game stack', () => {
  const initial = createInitialGameState();
  // 1. e4 e5 2. Nf3 Nc6
  const m1: Move = { from: 'e2', to: 'e4', piece: { type: 'p', color: 'w' } };
  const s1 = makeMove(initial, m1);
  const m2: Move = { from: 'e7', to: 'e5', piece: { type: 'p', color: 'b' } };
  const s2 = makeMove(s1, m2);
  const m3: Move = { from: 'g1', to: 'f3', piece: { type: 'n', color: 'w' } };
  const s3 = makeMove(s2, m3);
  const m4: Move = { from: 'b8', to: 'c6', piece: { type: 'n', color: 'b' } };
  const s4 = makeMove(s3, m4);

  const stack = [initial, s1, s2, s3, s4];
  const report = generateGameReview(stack);

  assert.equal(report.totalPlies, 4);
  assert.equal(report.plies.length, 4);
  assert.equal(report.evalCurve.length, 5);
  assert.ok(report.whiteAccuracy >= 80);
  assert.ok(report.blackAccuracy >= 80);
  assert.ok(report.classificationCounts.w.best + report.classificationCounts.w.excellent >= 1);
});
