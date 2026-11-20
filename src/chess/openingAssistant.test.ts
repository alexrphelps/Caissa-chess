import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialGameState,
  makeMove,
  fenToGameState,
} from './engine';
import { analyzeOpeningPrinciples } from './openingAssistant';
import { Move } from './types';

test('Opening Principles: Initial board reports developing status and 4 milestones', () => {
  const initial = createInitialGameState();
  const report = analyzeOpeningPrinciples(initial, 'w');

  assert.equal(report.moveNumber, 1);
  assert.equal(report.phaseActive, true);
  assert.equal(report.milestones.length, 4);

  const center = report.milestones.find((m) => m.id === 'center_control');
  assert.ok(center);
  assert.equal(center.status, 'pending');

  const minors = report.milestones.find((m) => m.id === 'minor_development');
  assert.ok(minors);
  assert.equal(minors.progressPercent, 0);

  const queen = report.milestones.find((m) => m.id === 'queen_restraint');
  assert.ok(queen);
  assert.equal(queen.status, 'achieved');
});

test('Opening Principles: 1. e4 achieves center pawn milestone progress', () => {
  const initial = createInitialGameState();
  const e4Move: Move = {
    from: 'e2',
    to: 'e4',
    piece: { type: 'p', color: 'w' },
  };
  const afterE4 = makeMove(initial, e4Move);
  const report = analyzeOpeningPrinciples(afterE4, 'w');

  const center = report.milestones.find((m) => m.id === 'center_control');
  assert.ok(center);
  assert.equal(center.progressPercent >= 75, true);
});

test('Opening Principles: Castling awards 100% king safety milestone', () => {
  // Setup FEN where White is already castled
  // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O
  const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4';
  const state = fenToGameState(fen);
  assert.ok(state);

  // Mark castled in move history
  state.moveHistory = [
    {
      turnNumber: 4,
      color: 'w',
      san: 'O-O',
      fenHash: 'test-hash',
      move: {
        from: 'e1',
        to: 'g1',
        piece: { type: 'k', color: 'w' },
        isCastle: 'K',
      },
    },
  ];

  const report = analyzeOpeningPrinciples(state, 'w');
  const kingSafety = report.milestones.find((m) => m.id === 'king_safety');
  assert.ok(kingSafety);
  assert.equal(kingSafety.status, 'achieved');
  assert.equal(kingSafety.progressPercent, 100);
});

test('Opening Principles: Premature Queen moves trigger Queen Restraint warning', () => {
  const initial = createInitialGameState();
  // 1. e4 e5 2. Qh5
  const m1: Move = { from: 'e2', to: 'e4', piece: { type: 'p', color: 'w' } };
  const s1 = makeMove(initial, m1);
  const m2: Move = { from: 'e7', to: 'e5', piece: { type: 'p', color: 'b' } };
  const s2 = makeMove(s1, m2);
  const m3: Move = { from: 'd1', to: 'h5', piece: { type: 'q', color: 'w' } };
  const s3 = makeMove(s2, m3);

  const report = analyzeOpeningPrinciples(s3, 'w');
  const queen = report.milestones.find((m) => m.id === 'queen_restraint');
  assert.ok(queen);
  assert.equal(queen.status, 'warning');
  assert.equal(queen.progressPercent < 100, true);
});
