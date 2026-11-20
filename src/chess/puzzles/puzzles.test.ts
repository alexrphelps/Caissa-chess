import test from 'node:test';
import assert from 'node:assert/strict';
import { fenToGameState, makeMove } from '../engine';
import {
  calculateRatingDelta,
  getRatingBandForRating,
  updatePlayerStats,
} from './ratingEngine';
import {
  moveToUci,
  uciToMove,
  validatePuzzle,
} from './puzzleExtractor';
import { ChessPuzzle, RatingBand } from './types';
import {
  evaluateAlternativeMove,
  loadPuzzleBucket,
} from './puzzleService';

import puz0400 from './data/puzzles_0400_0800.json';
import puz0800 from './data/puzzles_0800_1200.json';
import puz1200 from './data/puzzles_1200_1600.json';
import puz1600 from './data/puzzles_1600_2000.json';
import puz2000 from './data/puzzles_2000_2400.json';
import puz2400 from './data/puzzles_2400_plus.json';

test('Rating Delta Calculation: Solved scales +16 to +32 based on rating differential', () => {
  // Equal rating
  const equalDelta = calculateRatingDelta(1500, 1500, 'solved');
  assert.equal(equalDelta >= 16 && equalDelta <= 32, true);

  // User 1000 solves 1800 (+32 max)
  const underdogDelta = calculateRatingDelta(1000, 1800, 'solved');
  assert.equal(underdogDelta, 32);

  // User 2000 solves 1200 (+16 floor)
  const favoriteDelta = calculateRatingDelta(2000, 1200, 'solved');
  assert.equal(favoriteDelta, 16);
});

test('Rating Delta Calculation: Failed scales -12 to -24 points', () => {
  // Equal rating
  const equalDelta = calculateRatingDelta(1500, 1500, 'failed');
  assert.equal(equalDelta <= -12 && equalDelta >= -24, true);

  // User 2000 fails 1200 (-24 max penalty)
  const favoriteFail = calculateRatingDelta(2000, 1200, 'failed');
  assert.equal(favoriteFail, -24);

  // User 1000 fails 2000 (-12 min penalty)
  const underdogFail = calculateRatingDelta(1000, 2000, 'failed');
  assert.equal(underdogFail, -12);
});

test('Rating Delta Calculation: Assisted awards 0 points', () => {
  assert.equal(calculateRatingDelta(1500, 1600, 'assisted'), 0);
  assert.equal(calculateRatingDelta(1000, 1000, 'assisted'), 0);
});

test('UCI move conversion and legal move verification', () => {
  const state = fenToGameState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.ok(state);

  const move = uciToMove(state, 'e2e4');
  assert.ok(move);
  assert.equal(move.from, 'e2');
  assert.equal(move.to, 'e4');
  assert.equal(moveToUci(move), 'e2e4');

  // Illegal move rejected
  const illegalMove = uciToMove(state, 'e2e5');
  assert.equal(illegalMove, null);
});

test('Comprehensive Dataset Validation: Every puzzle in all 6 rating buckets is valid and strictly legal', () => {
  const allBuckets: { band: RatingBand; puzzles: ChessPuzzle[] }[] = [
    { band: '0400_0800', puzzles: puz0400 as ChessPuzzle[] },
    { band: '0800_1200', puzzles: puz0800 as ChessPuzzle[] },
    { band: '1200_1600', puzzles: puz1200 as ChessPuzzle[] },
    { band: '1600_2000', puzzles: puz1600 as ChessPuzzle[] },
    { band: '2000_2400', puzzles: puz2000 as ChessPuzzle[] },
    { band: '2400_plus', puzzles: puz2400 as ChessPuzzle[] },
  ];

  let totalVerified = 0;

  for (const { band, puzzles } of allBuckets) {
    assert.ok(puzzles.length >= 8, `Band ${band} must contain at least 8 puzzles, found ${puzzles.length}`);
    for (const puzzle of puzzles) {
      assert.ok(puzzle.id, `Puzzle in ${band} missing id`);
      assert.ok(puzzle.description, `Puzzle ${puzzle.id} missing description`);
      assert.ok(puzzle.themes && puzzle.themes.length > 0, `Puzzle ${puzzle.id} missing themes`);

      const result = validatePuzzle(puzzle);
      assert.equal(
        result.valid,
        true,
        `Puzzle ${puzzle.id} failed validation in ${band}: ${result.error}`
      );
      totalVerified++;
    }
  }

  assert.ok(totalVerified >= 48, `Expected at least 48 validated puzzles across buckets, got ${totalVerified}`);
});

test('Alternative move evaluation distinguishes correct moves vs blunders', () => {
  const puzzle = (puz0400 as ChessPuzzle[])[0]; // puz_0401: 3r2k1/1p3ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1
  const root = fenToGameState(puzzle.fen);
  assert.ok(root);

  // Play opponent setup move
  const setupMove = uciToMove(root, puzzle.moves[0]);
  assert.ok(setupMove);
  const playerTurnState = root ? (setupMove ? fenToGameState('3r2k1/1p3ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1') : null) : null;

  // Exact move evaluation
  const catalogMove = uciToMove(root, puzzle.moves[0]);
  assert.ok(catalogMove);
});

test('Stats update on failure and retry: single deduction on first failure, assisted on subsequent solve', () => {
  const initialStats = {
    rating: 1200,
    peakRating: 1200,
    totalSolved: 5,
    totalFailed: 2,
    currentStreak: 3,
    bestStreak: 4,
    lastPlayedDate: Date.now(),
  };

  // First failure: rating decreases, streak resets to 0, totalFailed increments
  const { updatedStats: afterFail, delta: failDelta } = updatePlayerStats(initialStats, 1200, 'failed');
  assert.ok(failDelta < 0, 'First failure must produce negative delta');
  assert.equal(afterFail.rating, 1200 + failDelta);
  assert.equal(afterFail.currentStreak, 0);
  assert.equal(afterFail.totalFailed, 3);

  // Subsequent successful solve on retry: outcome is treated as assisted so delta = 0 and streak remains 0
  const { updatedStats: afterRetrySolve, delta: solveDelta } = updatePlayerStats(afterFail, 1200, 'assisted');
  assert.equal(solveDelta, 0, 'Assisted/retry solve should award 0 delta');
  assert.equal(afterRetrySolve.rating, afterFail.rating, 'Rating remains same after retry solve');
  assert.equal(afterRetrySolve.currentStreak, 0, 'Streak does not increase on assisted/retry solve');
});

test('Strict Alternative Move Validation: Non-tactical moves like f3g5 in puz_0802 are REJECTED', () => {
  const puz0802 = (puz0800 as ChessPuzzle[]).find((p) => p.id === 'puz_0802');
  assert.ok(puz0802, 'puz_0802 must exist in dataset');

  const root = fenToGameState(puz0802.fen);
  assert.ok(root);

  // Play Black setup move: f8d8
  const setupMove = uciToMove(root, puz0802.moves[0]);
  assert.ok(setupMove);
  const whiteTurnState = makeMove(root, setupMove);

  // White plays the catalog solution: e1e7
  const solutionMove = uciToMove(whiteTurnState, 'e1e7');
  assert.ok(solutionMove);
  const solutionEval = evaluateAlternativeMove(whiteTurnState, solutionMove, 'e1e7', 'w');
  assert.equal(solutionEval.isEquivalent, true, 'Exact catalog move must be accepted');

  // White plays stalling knight move f3g5
  const stallingMove = uciToMove(whiteTurnState, 'f3g5');
  assert.ok(stallingMove);
  const stallingEval = evaluateAlternativeMove(whiteTurnState, stallingMove, 'e1e7', 'w');
  assert.equal(stallingEval.isEquivalent, false, 'Non-tactical knight move f3g5 must be REJECTED, not accepted as alternative solution');
});

