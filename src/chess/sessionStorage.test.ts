import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialGameState,
  generateLegalMoves,
  makeMove,
} from './engine';
import { createEngineProfileFromPreset } from './evaluation';
import {
  createStoredSession,
  deserializeSession,
  exportSessionToJson,
  exportSessionToPgn,
  gameStateToFen,
  generateSessionTitle,
  importSessionFromJson,
  isValidSessionShape,
  serializeSession,
} from './sessionStorage';
import { GameState, Move, StoredGameSession } from './types';

function playMove(state: GameState, from: string, to: string): GameState {
  const legal = generateLegalMoves(state);
  const found = legal.find((m) => m.from === from && m.to === to);
  assert.ok(found, `Expected move ${from}->${to} to be legal`);
  return makeMove(state, found);
}

test('gameStateToFen returns standard starting FEN on initial board', () => {
  const state = createInitialGameState();
  const fen = gameStateToFen(state);
  assert.equal(fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

test('gameStateToFen properly updates after e2-e4 and handles en passant target', () => {
  const state0 = createInitialGameState();
  const state1 = playMove(state0, 'e2', 'e4');
  const fen = gameStateToFen(state1);
  assert.equal(fen, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
});

test('createStoredSession builds a valid StoredGameSession from move history', () => {
  const s0 = createInitialGameState();
  const s1 = playMove(s0, 'e2', 'e4');
  const s2 = playMove(s1, 'c7', 'c5'); // Sicilian Defense
  const profile = createEngineProfileFromPreset('casual');

  const session = createStoredSession({
    stateStack: [s0, s1, s2],
    gameMode: 'ai',
    playerColor: 'w',
    isFlipped: false,
    engineProfile: profile,
  });

  assert.equal(session.gameMode, 'ai');
  assert.equal(session.playerColor, 'w');
  assert.equal(session.turn, 'w');
  assert.equal(session.fullMoveNumber, 2);
  assert.equal(session.plyCount, 2);
  assert.equal(session.lastMoveSan, 'c5');
  assert.ok(session.title.includes('Sicilian Defense'));
  assert.equal(session.stateStack.length, 3);
});

test('serializeSession and deserializeSession preserve all session details and handle BigInt', () => {
  const s0 = createInitialGameState();
  // attach a test BigInt hash to verify safe serialization
  const s0WithBigInt = { ...s0, zobristHash: BigInt('1234567890123456789') };
  const s1 = playMove(s0WithBigInt, 'g1', 'f3');
  const profile = createEngineProfileFromPreset('reactive');

  const session = createStoredSession({
    stateStack: [s0WithBigInt, s1],
    gameMode: 'ai',
    playerColor: 'w',
    isFlipped: false,
    engineProfile: profile,
    customTitle: 'Custom Italian Prep',
  });

  const serialized = serializeSession(session);
  assert.ok(typeof serialized === 'string');

  const restored = deserializeSession(serialized);
  assert.ok(restored !== null);
  assert.equal(restored?.title, 'Custom Italian Prep');
  assert.equal(restored?.stateStack.length, 2);
  assert.equal(restored?.lastMoveSan, 'Nf3');
  assert.equal(restored?.engineProfile.presetId, 'reactive');
});

test('isValidSessionShape rejects malformed data', () => {
  assert.equal(isValidSessionShape(null), false);
  assert.equal(isValidSessionShape({}), false);
  assert.equal(isValidSessionShape({ id: 'abc', title: 'test', stateStack: [] }), false);
  assert.equal(isValidSessionShape({ id: 'abc', title: 'test', stateStack: [{ board: [] }] }), false);
});

test('exportSessionToPgn generates standard PGN headers and moves', () => {
  const s0 = createInitialGameState();
  const s1 = playMove(s0, 'e2', 'e4');
  const s2 = playMove(s1, 'e7', 'e5');
  const s3 = playMove(s2, 'g1', 'f3');
  const profile = createEngineProfileFromPreset('club');

  const session = createStoredSession({
    stateStack: [s0, s1, s2, s3],
    gameMode: 'ai',
    playerColor: 'w',
    isFlipped: false,
    engineProfile: profile,
    customTitle: 'King Pawn Game',
  });

  const pgn = exportSessionToPgn(session);
  assert.ok(pgn.includes('[Event "King Pawn Game"]'));
  assert.ok(pgn.includes('[White "Human"]'));
  assert.ok(pgn.includes('[Black "Caïssa AI (3000 Elo)"]'));
  assert.ok(pgn.includes('1. e4 e5 2. Nf3'));
});

test('JSON export and import roundtrip', () => {
  const s0 = createInitialGameState();
  const s1 = playMove(s0, 'd2', 'd4');
  const profile = createEngineProfileFromPreset('novice');

  const session = createStoredSession({
    stateStack: [s0, s1],
    gameMode: 'pass_and_play',
    playerColor: 'w',
    isFlipped: false,
    engineProfile: profile,
  });

  const json = exportSessionToJson(session);
  const imported = importSessionFromJson(json);
  assert.ok(imported !== null);
  assert.equal(imported?.gameMode, 'pass_and_play');
  assert.equal(imported?.turn, 'b');
  assert.equal(imported?.lastMoveSan, 'd4');
});
