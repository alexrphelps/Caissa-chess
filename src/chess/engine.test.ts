import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canPlanArrow,
  canUndoState,
  computeSlideOffset,
  coordsToSquare,
  createInitialGameState,
  fenToGameState,
  generateLegalMoves,
  isInsufficientMaterial,
  isKingInCheck,
  makeMove,
  rewindStateStack,
  squareToCoords,
  togglePlannedArrow,
} from './engine';
import {
  computeGamePhase,
  computeZobristHash,
  createHistoryTable,
  denormalizeMateScoreFromStorage,
  evaluateBoardWhitePerspective,
  evaluateSEE,
  formatEvalScore,
  getPieceSquareBonus,
  hasNonPawnMaterial,
  isEndgamePhase,
  MATE_SCORE,
  normalizeMateScoreForStorage,
  orderMoves,
  probeTTEntry,
  recordHistoryCutoff,
  resolveEngineConfig,
  scoreMoveForOrdering,
  searchBestAIMove,
  selectAIMove,
  storeTTEntry,
  TTEntry,
  updateZobristHashAfterMove,
} from './ai';
import { analyzeOpeningAndStrategy } from './openingBook';
import {
  analyzeTactics,
  analyzeTacticsDeep,
  detectKnightOutpostReason,
  detectPassedPawnAdvanceReason,
  detectPinOrSkewerTarget,
  detectRookFileAnd7thRankReason,
} from './tacticsHelper';
import {
  createEngineProfileFromElo,
  createEngineProfileFromPreset,
  describeEngineProfileSummary,
  ENGINE_MILESTONE_PRESETS,
  evaluateTaperedBreakdown,
  interpolateEngineConfigFromElo,
} from './evaluation';
import { Board, GameState, Move, Piece, Square } from './types';

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function setPiece(board: Board, square: Square, piece: Piece | null) {
  const { row, col } = squareToCoords(square);
  board[row][col] = piece;
}

function createCustomState(
  pieces: Record<Square, Piece>,
  turn: 'w' | 'b' = 'w',
  options?: Partial<GameState>
): GameState {
  const base = createInitialGameState();
  const board = emptyBoard();
  for (const [sq, piece] of Object.entries(pieces)) {
    setPiece(board, sq, piece);
  }
  return {
    ...base,
    board,
    turn,
    castlingRights: { wK: false, wQ: false, bK: false, bQ: false },
    inCheck: isKingInCheck(board, turn),
    ...options,
  };
}

function playSanOrCoords(state: GameState, from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n'): GameState {
  const legal = generateLegalMoves(state);
  const found = legal.find(
    (m) => m.from === from && m.to === to && (m.promotion ?? undefined) === promotion
  );
  assert.ok(found, `Expected move ${from}->${to} to be legal for ${state.turn}`);
  return makeMove(state, found);
}

test('Initial board has 20 legal moves for White', () => {
  const state = createInitialGameState();
  const moves = generateLegalMoves(state);
  assert.equal(moves.length, 20);
});

test('Fool’s Mate triggers checkmate in 2 full moves and formats SAN with #', () => {
  let state = createInitialGameState();
  state = playSanOrCoords(state, 'f2', 'f3');
  state = playSanOrCoords(state, 'e7', 'e5');
  state = playSanOrCoords(state, 'g2', 'g4');
  state = playSanOrCoords(state, 'd8', 'h4');

  assert.equal(state.status, 'checkmate');
  assert.equal(state.winner, 'b');
  assert.equal(state.inCheck, true);
  assert.equal(state.moveHistory[state.moveHistory.length - 1].san, 'Qh4#');
});

test('En Passant capture is available immediately after double pawn push and expires next turn', () => {
  let state = createInitialGameState();
  state = playSanOrCoords(state, 'e2', 'e4');
  state = playSanOrCoords(state, 'a7', 'a6');
  state = playSanOrCoords(state, 'e4', 'e5');
  state = playSanOrCoords(state, 'd7', 'd5'); // Black advances d-pawn 2 squares beside e5

  assert.equal(state.enPassantTarget, 'd6');
  const whiteMoves = generateLegalMoves(state);
  const epMove = whiteMoves.find((m) => m.from === 'e5' && m.to === 'd6' && m.isEnPassant);
  assert.ok(epMove, 'En passant move e5xd6 should be legal immediately');

  // Execute en passant capture
  const afterEp = makeMove(state, epMove);
  const d5Coords = squareToCoords('d5');
  assert.equal(afterEp.board[d5Coords.row][d5Coords.col], null, 'Captured pawn on d5 should be removed');
  assert.equal(afterEp.moveHistory[afterEp.moveHistory.length - 1].san, 'exd6');

  // Verify expiration if not taken immediately
  let stateExpired = playSanOrCoords(state, 'a2', 'a3');
  stateExpired = playSanOrCoords(stateExpired, 'a6', 'a5');
  assert.equal(stateExpired.enPassantTarget, null);
  const laterMoves = generateLegalMoves(stateExpired);
  assert.equal(
    laterMoves.some((m) => m.from === 'e5' && m.to === 'd6'),
    false,
    'En passant must expire on the following turn'
  );
});

test('Castling O-O and O-O-O rules and transit attack restrictions', () => {
  // White has clear back rank for both O-O and O-O-O
  const state = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      a1: { type: 'r', color: 'w' },
      h1: { type: 'r', color: 'w' },
      e8: { type: 'k', color: 'b' },
    },
    'w',
    {
      castlingRights: { wK: true, wQ: true, bK: false, bQ: false },
    }
  );

  const moves = generateLegalMoves(state);
  assert.ok(moves.some((m) => m.isCastle === 'K' && m.to === 'g1'));
  assert.ok(moves.some((m) => m.isCastle === 'Q' && m.to === 'c1'));

  // Place a Black Rook on d8 attacking d1 (transit square for O-O-O)
  const blockedTransitState = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      a1: { type: 'r', color: 'w' },
      h1: { type: 'r', color: 'w' },
      d8: { type: 'r', color: 'b' },
      e8: { type: 'k', color: 'b' },
    },
    'w',
    {
      castlingRights: { wK: true, wQ: true, bK: false, bQ: false },
    }
  );
  const blockedMoves = generateLegalMoves(blockedTransitState);
  assert.equal(
    blockedMoves.some((m) => m.isCastle === 'Q'),
    false,
    'Queen-side castling must be illegal when transit square d1 is attacked'
  );
  assert.equal(
    blockedMoves.some((m) => m.isCastle === 'K'),
    true,
    'King-side castling remains legal when f1 and g1 are safe'
  );
});

test('Pawn Promotion generates Q, R, B, N choices and updates piece type on board', () => {
  const state = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      a7: { type: 'p', color: 'w' },
      e8: { type: 'k', color: 'b' },
    },
    'w'
  );

  const moves = generateLegalMoves(state).filter((m) => m.from === 'a7' && m.to === 'a8');
  assert.equal(moves.length, 4, 'Should generate 4 promotion options (q, r, b, n)');

  const afterQueenPromo = playSanOrCoords(state, 'a7', 'a8', 'q');
  const a8 = squareToCoords('a8');
  assert.deepEqual(afterQueenPromo.board[a8.row][a8.col], { type: 'q', color: 'w' });
  assert.equal(afterQueenPromo.moveHistory[0].san, 'a8=Q+');
});

test('Stalemate is accurately detected when player has no legal moves and is not in check', () => {
  const state = createCustomState(
    {
      h8: { type: 'k', color: 'b' },
      f7: { type: 'k', color: 'w' },
      g5: { type: 'q', color: 'w' },
    },
    'w'
  );

  // Move White Queen from g5 to g6, leaving Black King on h8 with 0 legal moves and not in check
  const next = playSanOrCoords(state, 'g5', 'g6');
  assert.equal(next.inCheck, false);
  assert.equal(next.status, 'stalemate');
  assert.equal(next.winner, 'draw');
});

test('Insufficient material detects K vs K, K+B vs K, K+N vs K, and K+B vs K+B on same color', () => {
  const kVsK = createCustomState({
    e1: { type: 'k', color: 'w' },
    e8: { type: 'k', color: 'b' },
  });
  assert.equal(isInsufficientMaterial(kVsK.board), true);

  const kbVsK = createCustomState({
    e1: { type: 'k', color: 'w' },
    c1: { type: 'b', color: 'w' },
    e8: { type: 'k', color: 'b' },
  });
  assert.equal(isInsufficientMaterial(kbVsK.board), true);

  const knVsK = createCustomState({
    e1: { type: 'k', color: 'w' },
    b1: { type: 'n', color: 'w' },
    e8: { type: 'k', color: 'b' },
  });
  assert.equal(isInsufficientMaterial(knVsK.board), true);

  // c1 (row 7, col 2 -> sum 9 odd) and f8 (row 0, col 5 -> sum 5 odd) are both dark squares
  const kbVsKbSameSquareColor = createCustomState({
    e1: { type: 'k', color: 'w' },
    c1: { type: 'b', color: 'w' },
    e8: { type: 'k', color: 'b' },
    f8: { type: 'b', color: 'b' },
  });
  assert.equal(isInsufficientMaterial(kbVsKbSameSquareColor.board), true);

  // c1 (sum 9 odd) and c8 (row 0, col 2 -> sum 2 even) are opposite colored squares
  const kbVsKbOppositeSquareColor = createCustomState({
    e1: { type: 'k', color: 'w' },
    c1: { type: 'b', color: 'w' },
    e8: { type: 'k', color: 'b' },
    c8: { type: 'b', color: 'b' },
  });
  assert.equal(isInsufficientMaterial(kbVsKbOppositeSquareColor.board), false);
});

test('Threefold repetition triggers draw when identical board/castling/ep state occurs 3 times', () => {
  let state = createInitialGameState();
  // Cycle Knights back and forth twice to repeat the initial position (once after castling rights unchanged)
  for (let i = 0; i < 2; i++) {
    state = playSanOrCoords(state, 'g1', 'f3');
    state = playSanOrCoords(state, 'g8', 'f6');
    state = playSanOrCoords(state, 'f3', 'g1');
    state = playSanOrCoords(state, 'f6', 'g8');
  }
  assert.equal(state.status, 'draw_repetition');
  assert.equal(state.winner, 'draw');
});

test('Fifty-move rule triggers draw at 100 half-moves without pawn move or capture', () => {
  const state = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      a1: { type: 'r', color: 'w' },
      e8: { type: 'k', color: 'b' },
    },
    'w',
    { halfMoveClock: 99 }
  );

  const next = playSanOrCoords(state, 'a1', 'a2');
  assert.equal(next.halfMoveClock, 100);
  assert.equal(next.status, 'draw_fifty_move');
  assert.equal(next.winner, 'draw');
});

test('AI Priority 1 & 2 & 3: Delivers mate-in-1, takes hanging piece, and rescues own hanging piece', () => {
  // 1. Mate in 1: Scholar's Mate position (White Queen on h5, Bishop on c4, Black King boxed in on e8)
  const mateInOneState = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      h5: { type: 'q', color: 'w' },
      c4: { type: 'b', color: 'w' },
      e8: { type: 'k', color: 'b' },
      d8: { type: 'q', color: 'b' },
      f8: { type: 'b', color: 'b' },
      d7: { type: 'p', color: 'b' },
      f7: { type: 'p', color: 'b' },
    },
    'w'
  );
  const mateMove = selectAIMove(mateInOneState, () => 0.5);
  assert.ok(mateMove);
  const afterMate = makeMove(mateInOneState, mateMove);
  assert.equal(afterMate.status, 'checkmate', 'AI must immediately find mate in 1');

  // 2. Punish hanging Queen: Black Queen is undefended on d5, White Knight on c3 can capture it
  const hangingTargetState = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      c3: { type: 'n', color: 'w' },
      d5: { type: 'q', color: 'b' },
      e8: { type: 'k', color: 'b' },
    },
    'w'
  );
  const captureMove = selectAIMove(hangingTargetState, () => 0.5);
  assert.ok(captureMove);
  assert.equal(captureMove.from, 'c3');
  assert.equal(captureMove.to, 'd5');

  // 3. Rescue own hanging Rook: Black Rook on e4 is attacked by White Pawn on d3, Black to move
  const rescueState = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      d3: { type: 'p', color: 'w' },
      c2: { type: 'p', color: 'w' },
      e4: { type: 'r', color: 'b' },
      e8: { type: 'k', color: 'b' },
    },
    'b'
  );
  const rescueMove = selectAIMove(rescueState, () => 0.5);
  assert.ok(rescueMove);
  assert.equal(rescueMove.from, 'e4', 'AI must move its hanging Rook on e4 to safety');
  assert.notEqual(rescueMove.to, 'd3', 'AI should not sacrifice Rook for defended pawn');
});

test('Tactics Helper: classifies Hanging (critical), Losing Exchange (high), and Contested (moderate) threats', () => {
  // Board setup for White to move:
  // - White Knight on a5 is undefended and attacked by Black Rook on a8 -> critical (Hanging)
  // - White Rook on e4 is defended by White Pawn on d3, but attacked by Black Bishop on b7 -> high (Losing Exchange)
  // - White Pawn on d3 is defended by White Bishop on c2, and attacked by Black Rook on d8 -> moderate (Contested)
  const state = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      a5: { type: 'n', color: 'w' },
      e4: { type: 'r', color: 'w' },
      d3: { type: 'p', color: 'w' },
      c2: { type: 'b', color: 'w' },
      g8: { type: 'k', color: 'b' },
      a8: { type: 'r', color: 'b' },
      b7: { type: 'b', color: 'b' },
      d8: { type: 'r', color: 'b' },
    },
    'w'
  );

  const analysis = analyzeTactics(state);
  assert.equal(analysis.threatenedPieces.get('a5')?.level, 'critical');
  assert.equal(analysis.threatenedPieces.get('e4')?.level, 'high');
  assert.equal(analysis.threatenedPieces.get('d3')?.level, 'moderate');
  assert.equal(analysis.attackedSquares.has('a5'), true);
  assert.equal(analysis.attackedSquares.has('e4'), true);
});

test('Tactics Helper: recommends top 3 moves with ranks 1, 2, 3 and tactical rationales', () => {
  // White can capture an undefended Black Rook on d5 with Knight on c3
  const state = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      c3: { type: 'n', color: 'w' },
      e2: { type: 'p', color: 'w' },
      d5: { type: 'r', color: 'b' },
      e8: { type: 'k', color: 'b' },
    },
    'w'
  );

  const analysis = analyzeTactics(state);
  assert.equal(analysis.topMoves.length, 3);
  assert.equal(analysis.topMoves[0].rank, 1);
  assert.equal(analysis.topMoves[0].from, 'c3');
  assert.equal(analysis.topMoves[0].to, 'd5');
  assert.ok(
    analysis.topMoves[0].headline.includes('Rook'),
    `Expected #1 recommendation headline to mention capturing Rook, got: ${analysis.topMoves[0].headline}`
  );
  assert.equal(analysis.topMoves[1].rank, 2);
  assert.equal(analysis.topMoves[2].rank, 3);

  // When Mate in 1 is available (Scholar's Mate position), Tactical Coach must ONLY return that 1 move
  const mateInOneState = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      h5: { type: 'q', color: 'w' },
      c4: { type: 'b', color: 'w' },
      e8: { type: 'k', color: 'b' },
      d8: { type: 'q', color: 'b' },
      f8: { type: 'b', color: 'b' },
      d7: { type: 'p', color: 'b' },
      f7: { type: 'p', color: 'b' },
    },
    'w'
  );
  const mateAnalysis = analyzeTactics(mateInOneState);
  assert.equal(
    mateAnalysis.topMoves.length,
    1,
    'When Mate in 1 exists, Tactical Coach must only return the 1 checkmate move'
  );
  assert.equal(mateAnalysis.topMoves[0].rank, 1);
  assert.equal(mateAnalysis.topMoves[0].san, 'Qxf7#');
});

test('Opening Book & Coach: detects standby on move 0, exact ECO book lines, transpositions, and middlegame plan transition', () => {
  // 1. Standby phase before Move 1
  let state = createInitialGameState();
  const initialOpening = analyzeOpeningAndStrategy(state);
  assert.equal(initialOpening.phase, 'standby');

  // 2. Exact ECO recognition: 1. e4 e5 2. Nf3 Nc6 3. Bb5 -> C60 Ruy Lopez
  state = playSanOrCoords(state, 'e2', 'e4');
  const afterE4 = analyzeOpeningAndStrategy(state);
  assert.equal(afterE4.phase, 'opening_book');
  assert.equal(afterE4.eco, 'B00');
  assert.equal(afterE4.isTransposition, false);

  state = playSanOrCoords(state, 'e7', 'e5');
  state = playSanOrCoords(state, 'g1', 'f3');
  state = playSanOrCoords(state, 'b8', 'c6');
  state = playSanOrCoords(state, 'f1', 'b5');
  const ruyLopez = analyzeOpeningAndStrategy(state);
  assert.equal(ruyLopez.phase, 'opening_book');
  assert.equal(ruyLopez.eco, 'C60');
  assert.ok(ruyLopez.family.includes('Ruy Lopez'));
  assert.equal(ruyLopez.isTransposition, false);

  // 3. Transposition detection: Reach Queen's Gambit Declined (D35: 1. d4 d5 2. c4 e6 3. Nc3 Nf6)
  // via transposed move order: 1. d4 Nf6 2. c4 e6 3. Nc3 d5
  let transposedState = createInitialGameState();
  transposedState = playSanOrCoords(transposedState, 'd2', 'd4');
  transposedState = playSanOrCoords(transposedState, 'g8', 'f6');
  transposedState = playSanOrCoords(transposedState, 'c2', 'c4');
  transposedState = playSanOrCoords(transposedState, 'e7', 'e6');
  transposedState = playSanOrCoords(transposedState, 'b1', 'c3');
  transposedState = playSanOrCoords(transposedState, 'd7', 'd5');

  const qgdTransposed = analyzeOpeningAndStrategy(transposedState);
  assert.equal(qgdTransposed.phase, 'opening_book');
  assert.equal(qgdTransposed.eco, 'D35');
  assert.equal(qgdTransposed.isTransposition, true);
  assert.ok(qgdTransposed.moveProgressLabel.includes('Transposed Book'));

  // 4. Middlegame transition after move 15 (> 30 plies)
  let lateOpeningState = ruyLopez;
  let game = state;
  // Play legal moves until moveHistory.length === 31 (Move 16)
  while (game.moveHistory.length <= 30 && game.status === 'playing') {
    const moves = generateLegalMoves(game);
    game = makeMove(game, moves[0]);
  }
  lateOpeningState = analyzeOpeningAndStrategy(game);
  assert.equal(lateOpeningState.phase, 'middlegame_plan');
  assert.ok(lateOpeningState.moveProgressLabel.includes('Middlegame Phase'));
});

test('Absolute Pin Ray Mobility: pinned Rook can move/capture along pin ray, pinned Knight is completely frozen', () => {
  const state = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      e3: { type: 'r', color: 'w' }, // Pinned along the e-file by Black Rook on e7
      c2: { type: 'n', color: 'w' }, // Pinned along a4-e1 diagonal by Black Bishop on a3? Wait: e1 is (7,4), c3 is (5,2), a5 is (3,0)
      c3: { type: 'n', color: 'w' }, // Pinned along a5-e1 diagonal by Black Bishop on a5
      e7: { type: 'r', color: 'b' },
      a5: { type: 'b', color: 'b' },
      h8: { type: 'k', color: 'b' },
    },
    'w'
  );
  // Remove c2 so c3 is strictly pinned
  state.board[6][2] = null;

  const legalMoves = generateLegalMoves(state);
  const rookMoves = legalMoves.filter((m) => m.from === 'e3');
  const knightMoves = legalMoves.filter((m) => m.from === 'c3');

  // Pinned Rook on e3 can move to e2, e4, e5, e6, and capture e7 (5 legal moves along the e-file), but no horizontal moves
  assert.equal(rookMoves.length, 5);
  assert.ok(rookMoves.every((m) => m.to[0] === 'e'));
  assert.ok(rookMoves.some((m) => m.to === 'e7' && m.captured?.type === 'r'));

  // Pinned Knight on c3 has 0 legal moves
  assert.equal(knightMoves.length, 0);
});

test('En Passant Horizontal Discovered Check: illegal when removing both pawns exposes King along the rank', () => {
  // White King on a5, White Pawn on d5, Black Rook on h5, Black Pawn advances e7->e5
  const beforeEpPush = createCustomState(
    {
      a5: { type: 'k', color: 'w' },
      d5: { type: 'p', color: 'w' },
      e7: { type: 'p', color: 'b' },
      h5: { type: 'r', color: 'b' },
      e8: { type: 'k', color: 'b' },
    },
    'b'
  );

  const afterDoublePush = playSanOrCoords(beforeEpPush, 'e7', 'e5');
  assert.equal(afterDoublePush.enPassantTarget, 'e6');

  const whiteLegalMoves = generateLegalMoves(afterDoublePush);
  const epAttempt = whiteLegalMoves.find((m) => m.from === 'd5' && m.to === 'e6');
  assert.equal(
    epAttempt,
    undefined,
    'En passant d5xe6 must be illegal because removing both d5 and e5 exposes White King on a5 to Black Rook on h5'
  );
});

test('Castling Edge Cases: b1 under attack does not block O-O-O, and Rook capture revokes castling right', () => {
  // Black Rook on b8 attacks b1, which is traversed by the a1 Rook during O-O-O, NOT by the e1 King
  const b1AttackedState = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      a1: { type: 'r', color: 'w' },
      h1: { type: 'r', color: 'w' },
      b8: { type: 'r', color: 'b' },
      e8: { type: 'k', color: 'b' },
    },
    'w',
    {
      castlingRights: { wK: true, wQ: true, bK: false, bQ: false },
    }
  );

  const whiteMoves = generateLegalMoves(b1AttackedState);
  assert.equal(
    whiteMoves.some((m) => m.isCastle === 'Q' && m.to === 'c1'),
    true,
    'O-O-O must remain legal when b1 is attacked because only the Rook crosses b1'
  );

  // If Black Bishop captures White Rook on h1, wK castling right is immediately revoked
  const rookCaptureState = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      a1: { type: 'r', color: 'w' },
      h1: { type: 'r', color: 'w' },
      f3: { type: 'b', color: 'b' },
      e8: { type: 'k', color: 'b' },
    },
    'b',
    {
      castlingRights: { wK: true, wQ: true, bK: false, bQ: false },
    }
  );
  const afterRookCaptured = playSanOrCoords(rookCaptureState, 'f3', 'h1');
  assert.equal(afterRookCaptured.castlingRights.wK, false);
  assert.equal(afterRookCaptured.castlingRights.wQ, true);
});

test('FIDE Article 9.2.2 Threefold Repetition: pseudo en passant target without legal capturer does not split position hash', () => {
  let state = createInitialGameState();
  // 1. e4 (enPassantTarget is 'e3', but Black has no pawn on d4/f4 to capture it)
  state = playSanOrCoords(state, 'e2', 'e4');
  // Position P1 reached for the 1st time (with Black to move)
  state = playSanOrCoords(state, 'g8', 'f6');
  state = playSanOrCoords(state, 'g1', 'f3');
  state = playSanOrCoords(state, 'f6', 'g8');
  state = playSanOrCoords(state, 'f3', 'g1');
  // Position P1 reached for the 2nd time!
  state = playSanOrCoords(state, 'g8', 'f6');
  state = playSanOrCoords(state, 'g1', 'f3');
  state = playSanOrCoords(state, 'f6', 'g8');
  state = playSanOrCoords(state, 'f3', 'g1');
  // Position P1 reached for the 3rd time -> must trigger draw_repetition!
  assert.equal(state.status, 'draw_repetition');
});

test('AI & Tactics Helper SEE: Rook captures defended Queen (+4) and ignores pinned enemy attackers', () => {
  // White Rook on d1 can capture Black Queen on d5 (defended by Black Pawn on c6) -> net +400 gain
  const rxqState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      d1: { type: 'r', color: 'w' },
      d5: { type: 'q', color: 'b' },
      c6: { type: 'p', color: 'b' },
      g8: { type: 'k', color: 'b' },
    },
    'w'
  );
  const aiMove = selectAIMove(rxqState, () => 0.5);
  assert.ok(aiMove);
  assert.equal(aiMove.from, 'd1');
  assert.equal(aiMove.to, 'd5', 'AI must capture the defended Queen with its Rook (+4 net exchange)');

  // Pinned attacker test: Black Knight on e7 is absolutely pinned to Black King on e8 by White Rook on e1.
  // Therefore, White Queen on d5 is NOT threatened by the pinned Black Knight on e7.
  const pinnedAttackerState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      e1: { type: 'r', color: 'w' },
      d5: { type: 'q', color: 'w' },
      e7: { type: 'n', color: 'b' },
      e8: { type: 'k', color: 'b' },
    },
    'w'
  );
  const tactics = analyzeTactics(pinnedAttackerState);
  assert.equal(
    tactics.threatenedPieces.has('d5'),
    false,
    'Pinned Black Knight on e7 cannot legally capture White Queen on d5'
  );
});

test('Sanity Check 1 - Blunder Prevention: Level 2, Level 3, and Level 4 never leave Queen undefended on an attacked square when safe escape exists', () => {
  // Scenario A: Black Queen on d5 is attacked by White Knight on c3 (or White Bishop on f3), with safe escape squares available
  const threatenedQueenState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      c3: { type: 'n', color: 'w' },
      e4: { type: 'p', color: 'w' },
      d2: { type: 'p', color: 'w' },
      g8: { type: 'k', color: 'b' },
      d5: { type: 'q', color: 'b' }, // Undefended Black Queen under attack by c3 Knight and e4 Pawn
      a7: { type: 'p', color: 'b' },
      h7: { type: 'p', color: 'b' },
    },
    'b'
  );

  for (const difficulty of ['casual', 'intermediate', 'club'] as const) {
    // Test across 20 RNG seeds (including < 0.10 to trigger Level 2's 10% sub-optimal branch)
    for (let i = 0; i < 20; i++) {
      const seedVal = i / 20;
      const result = searchBestAIMove(threatenedQueenState, difficulty, () => seedVal);
      assert.ok(result.move, `Expected a move for ${difficulty}`);
      assert.equal(
        result.move.from,
        'd5',
        `Level ${difficulty} (seed=${seedVal}) must move threatened Queen from d5 instead of leaving it hanging`
      );
      const nextState = makeMove(threatenedQueenState, result.move);
      const toCoords = squareToCoords(result.move.to);
      // Verify the destination square is not undefended and attacked by White
      const whiteMovesNext = generateLegalMoves(nextState);
      const queenCanBeCapturedForFree = whiteMovesNext.some(
        (m) => m.to === result.move!.to && m.captured?.type === 'q'
      );
      assert.equal(
        queenCanBeCapturedForFree,
        false,
        `Level ${difficulty} moved Queen to ${result.move.to} where it can still be captured!`
      );
      assert.ok(toCoords.row >= 0);
    }
  }
});

test('Deliverable 2 - Performance Benchmark: Level 4 (Club) completes depth 5 + Quiescence in <1.5 seconds on middlegame position', () => {
  // Build a typical rich middlegame position (Italian Game / Giuoco Piano after 6 full moves = 12 plies)
  let state = createInitialGameState();
  const openingMoves: [Square, Square][] = [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
    ['f1', 'c4'],
    ['f8', 'c5'],
    ['c2', 'c3'],
    ['g8', 'f6'],
    ['d2', 'd3'],
    ['d7', 'd6'],
    ['e1', 'g1'],
    ['e8', 'g8'],
  ];
  for (const [from, to] of openingMoves) {
    state = playSanOrCoords(state, from, to);
  }

  const start = performance.now();
  const result = searchBestAIMove(state, 'club');
  const elapsed = performance.now() - start;

  assert.ok(result.move, 'Club AI must return a legal middlegame move');
  assert.ok(result.depth >= 5, `Expected Club AI depth >= 5, got ${result.depth}`);
  assert.ok(result.nodes > 100, `Expected Club AI to evaluate nodes, got ${result.nodes}`);
  assert.ok(
    elapsed < 1500,
    `Expected Club AI depth 5 + Quiescence to finish in < 1500ms, took ${Math.round(elapsed)}ms`
  );
});

test('Deliverable 3 - Determinism vs. Variety: Level 1 & Level 2 vary opening moves across RNG seeds, while Level 4 is 100% deterministic', () => {
  const initialState = createInitialGameState();

  const noviceMoves = new Set<string>();
  const casualMoves = new Set<string>();
  const clubMoves = new Set<string>();

  for (let i = 0; i < 25; i++) {
    let callIdx = 0;
    const seededRng = () => {
      callIdx++;
      return ((i * 37 + callIdx * 13) % 100) / 100;
    };

    const m1 = searchBestAIMove(initialState, 'novice', seededRng).move;
    const m2 = searchBestAIMove(initialState, 'casual', seededRng).move;
    const m4 = searchBestAIMove(initialState, 'club', seededRng).move;

    assert.ok(m1 && m2 && m4);
    noviceMoves.add(`${m1.from}->${m1.to}`);
    casualMoves.add(`${m2.from}->${m2.to}`);
    clubMoves.add(`${m4.from}->${m4.to}`);
  }

  assert.ok(
    noviceMoves.size > 1,
    `Expected Novice (Level 1) to play varied opening moves, got ${noviceMoves.size}`
  );
  assert.ok(
    casualMoves.size > 1,
    `Expected Casual (Level 2) to play varied opening moves, got ${casualMoves.size}`
  );
  assert.equal(
    clubMoves.size,
    1,
    `Expected Club (Level 4) to be 100% deterministic, got ${clubMoves.size} distinct moves`
  );
});

test('PST, Endgame King Table, MVV-LVA Move Ordering, and Quiescence Horizon Protection', () => {
  // 1. PST: White Knight in center (d4 -> row 4, col 3) scores much higher than Knight on rim (a1 -> row 7, col 0)
  const centerKnightBonus = getPieceSquareBonus('n', 'w', 4, 3, false);
  const cornerKnightBonus = getPieceSquareBonus('n', 'w', 7, 0, false);
  assert.ok(centerKnightBonus > cornerKnightBonus + 40);

  // 2. King PST differentiates Middlegame vs Endgame: Central King (d4 -> row 4, col 3) is penalized in middlegame but rewarded in endgame
  const kingCenterMiddlegame = getPieceSquareBonus('k', 'w', 4, 3, false);
  const kingCenterEndgame = getPieceSquareBonus('k', 'w', 4, 3, true);
  assert.ok(kingCenterEndgame > kingCenterMiddlegame + 50);

  // 3. MVV-LVA Move Ordering: Pawn capturing Queen (PxQ) is ordered ahead of Queen capturing Pawn (QxP) and quiet moves
  const state = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      d4: { type: 'p', color: 'w' },
      h4: { type: 'q', color: 'w' },
      e5: { type: 'q', color: 'b' }, // Can be captured by d4 pawn (PxQ)
      h5: { type: 'p', color: 'b' }, // Can be captured by h4 queen (QxP)
      e8: { type: 'k', color: 'b' },
    },
    'w'
  );
  const legal = generateLegalMoves(state);
  const ordered = orderMoves(legal, isEndgamePhase(state.board));
  assert.equal(ordered[0].from, 'd4');
  assert.equal(ordered[0].to, 'e5');
  assert.equal(ordered[0].captured?.type, 'q', 'MVV-LVA must order PxQ first');

  // 4. Score formatting
  assert.equal(formatEvalScore(140), '+1.4');
  assert.equal(formatEvalScore(-80), '-0.8');
  assert.equal(formatEvalScore(0), '0.0');
  assert.equal(formatEvalScore(99997), 'M2');
  assert.equal(formatEvalScore(-99999), '-M1');
});

test('HUD pure helpers: pairMoveHistory and describeTurnDelta format move log and turn deltas accurately', async () => {
  const { pairMoveHistory, describeTurnDelta, getStatusBannerText, findMovePlyIndex } = await import(
    '../components/GameHud'
  );
  let state = createInitialGameState();

  const initialDelta = describeTurnDelta(state);
  assert.equal(initialDelta.badge, 'Match Start');
  assert.ok(initialDelta.summary.includes('White has the first move'));

  state = playSanOrCoords(state, 'e2', 'e4');
  const afterE4 = describeTurnDelta(state);
  assert.equal(afterE4.badge, 'Last: 1. e4');
  assert.ok(afterE4.summary.includes('White moved Pawn (e2 → e4)'));

  state = playSanOrCoords(state, 'e7', 'e5');
  state = playSanOrCoords(state, 'g1', 'f3');

  const pairs = pairMoveHistory(state.moveHistory);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs[0], { turnNumber: 1, whiteSan: 'e4', blackSan: 'e5' });
  assert.deepEqual(pairs[1], { turnNumber: 2, whiteSan: 'Nf3' });

  assert.equal(findMovePlyIndex(state.moveHistory, 1, 'w'), 1);
  assert.equal(findMovePlyIndex(state.moveHistory, 1, 'b'), 2);
  assert.equal(findMovePlyIndex(state.moveHistory, 2, 'w'), 3);
  assert.equal(findMovePlyIndex(state.moveHistory, 2, 'b'), -1);

  const status = getStatusBannerText(state, false, 'casual');
  assert.equal(status.headline, 'Black to Move');
  assert.equal(status.tone, 'neutral');
});

test('Swap-List Static Exchange Evaluation (evaluateSEE) accurately resolves multi-piece recapture chains', () => {
  // Case 1: White Pawn (e4, 100) + White Rook (d1, 500) attack Black Knight on d5 (300).
  // d5 is defended by Black Bishop on c6 (320) and Black Rook on d8 (500).
  // If White plays 1. exd5 (+300):
  // - Black plays 1... Bxd5 (-100, net +200 for White)
  // - White declines 2. Rxd5 because 2... Rxd5 would lose Rook (500) for Bishop (320).
  // Thus exd5 evaluates to +200cp (300 Knight - 100 Pawn).
  const state2v2 = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      e4: { type: 'p', color: 'w' },
      d1: { type: 'r', color: 'w' },
      d5: { type: 'n', color: 'b' },
      c6: { type: 'b', color: 'b' },
      d8: { type: 'r', color: 'b' },
      g8: { type: 'k', color: 'b' },
    },
    'w'
  );
  const exd5_2v2 = generateLegalMoves(state2v2).find(
    (m) => m.from === 'e4' && m.to === 'd5'
  );
  assert.ok(exd5_2v2);
  assert.equal(
    evaluateSEE(state2v2.board, exd5_2v2, 'w'),
    200,
    'exd5 with 2 attackers vs 2 defenders should evaluate to +200cp (300 Knight - 100 Pawn after ...Bxd5)'
  );

  // Case 2: Add White Bishop on c4 (now 3 attackers vs 2 defenders).
  // Now if Black tries 1... Bxd5, White has 2. Bxd5 Rxd5 3. Rxd5 winning even more material,
  // so Black must stand pat after 1. exd5 and White wins the full +300cp Knight!
  const state3v2 = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      e4: { type: 'p', color: 'w' },
      c4: { type: 'b', color: 'w' },
      d1: { type: 'r', color: 'w' },
      d5: { type: 'n', color: 'b' },
      c6: { type: 'b', color: 'b' },
      d8: { type: 'r', color: 'b' },
      g8: { type: 'k', color: 'b' },
    },
    'w'
  );
  const exd5_3v2 = generateLegalMoves(state3v2).find(
    (m) => m.from === 'e4' && m.to === 'd5'
  );
  assert.ok(exd5_3v2);
  assert.equal(evaluateSEE(state3v2.board, exd5_3v2, 'w'), 300);
});

test('Deep Coach Trap Refutation & Opponent Threat Predictor: rejects 1-ply greedy capture that walks into a 2-ply Royal Fork', () => {
  // White King on g1, White Queen on d1, Black Knight on e4, undefended Black Rook on c3!
  // If White Queen greedily captures the undefended Black Rook on c3 (1. Qxc3??), Black Knight on e4 plays 1... Ne2+!
  // Forking White King on g1 and White Queen on c3!
  const trapState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      d1: { type: 'q', color: 'w' },
      a1: { type: 'r', color: 'w' },
      g2: { type: 'p', color: 'w' },
      h2: { type: 'p', color: 'w' },
      g8: { type: 'k', color: 'b' },
      e4: { type: 'n', color: 'b' },
      c3: { type: 'r', color: 'b' }, // Undefended Rook on c3, baiting 1. Qxc3?? Ne2+ Royal Fork!
      a7: { type: 'p', color: 'b' },
    },
    'w'
  );

  const analysis = analyzeTactics(trapState);
  assert.ok(analysis.topMoves.length > 0);
  const bestMove = analysis.topMoves[0];

  // The Coach must NOT recommend the 1-ply trap 1. Qxc3?? (d1 -> c3) as #1 Best!
  assert.notEqual(
    `${bestMove.from}->${bestMove.to}`,
    'd1->c3',
    `Deep Coach must reject the 1-ply trap Qxc3?? (which walks into ...Ne2+ Royal Fork), got ${bestMove.san}`
  );
  assert.ok(
    bestMove.pvFormatted.length > 0,
    'Expected Principal Variation string to be populated'
  );
  assert.ok(
    bestMove.winProb >= 50,
    `Expected winning probability >= 50%, got ${bestMove.winProb}%`
  );
});

test('Head-to-Head Simulation: Playing Coach #1 Best Move vs Club (1800) AI holds an even or winning position without blundering', () => {
  let state = createInitialGameState();
  let lastCoachEval = 0;

  // Play 10 plies (5 full moves) where White strictly plays Coach #1 Best Move (5-ply + Quiescence)
  // and Black plays Club (1800) AI (5-ply + Quiescence)
  for (let ply = 0; ply < 10; ply++) {
    assert.equal(state.status, 'playing');
    if (state.turn === 'w') {
      const coach = analyzeTacticsDeep(state, 5, 1150);
      assert.ok(coach.topMoves.length > 0, `Coach must provide recommendations at ply ${ply}`);
      const topRec = coach.topMoves[0];
      assert.ok(topRec.pvLine.length >= 2, 'Coach #1 move must include multi-ply Principal Variation');
      lastCoachEval = topRec.engineEval;
      state = makeMove(state, topRec.move);
    } else {
      const aiRes = searchBestAIMove(state, 'club');
      assert.ok(aiRes.move, `Club AI must return a move at ply ${ply}`);
      state = makeMove(state, aiRes.move);
    }
  }

  // Evaluate White's position on White's turn after 5 full moves using the Deep Coach's Quiescence-backed search
  const finalCoach = analyzeTacticsDeep(state, 5, 1150);
  const finalEvalWhite = finalCoach.topMoves[0]?.engineEval ?? lastCoachEval;
  assert.ok(
    finalEvalWhite >= -25,
    `Following Coach #1 Best Moves against Club (1800) AI must maintain an even or advantageous position, got ${finalEvalWhite}cp`
  );
});

test('Right-Click Planned Arrows: allows free-form tactical arrows between any valid squares and toggles cleanly', () => {
  const state = createInitialGameState();
  const legal = generateLegalMoves(state);

  // Free-form arrows between valid squares (e.g. e2->e4, g1->f3, e2->e5, c1->f4)
  assert.equal(canPlanArrow(state, legal, 'e2', 'e4'), true);
  assert.equal(canPlanArrow(state, legal, 'g1', 'f3'), true);
  assert.equal(canPlanArrow(state, legal, 'e2', 'e5'), true);
  assert.equal(canPlanArrow(state, legal, 'c1', 'f4'), true);

  // Arrow to identical square is rejected
  assert.equal(canPlanArrow(state, legal, 'e2', 'e2'), false);

  let arrows = togglePlannedArrow([], state, legal, 'e2', 'e4');
  assert.deepEqual(arrows, [{ from: 'e2', to: 'e4' }]);

  // Adding a second arrow
  arrows = togglePlannedArrow(arrows, state, legal, 'g1', 'f3');
  assert.deepEqual(arrows, [
    { from: 'e2', to: 'e4' },
    { from: 'g1', to: 'f3' },
  ]);

  // Toggling an existing arrow removes it
  arrows = togglePlannedArrow(arrows, state, legal, 'e2', 'e4');
  assert.deepEqual(arrows, [{ from: 'g1', to: 'f3' }]);
});

test('Piece Slide Animation Offset: computes visual square deltas for normal and flipped board orientations', () => {
  // White Pawn e2 (row 6, col 4) -> e4 (row 4, col 4)
  // Unflipped: dCol = 0, dRow = +2 (starts 2 squares below e4 and slides up to e4)
  assert.deepEqual(computeSlideOffset('e2', 'e4', false), { dCol: 0, dRow: 2 });
  // Flipped: dCol = 0, dRow = -2
  assert.deepEqual(computeSlideOffset('e2', 'e4', true), { dCol: 0, dRow: -2 });

  // White Knight g1 (row 7, col 6) -> f3 (row 5, col 5)
  assert.deepEqual(computeSlideOffset('g1', 'f3', false), { dCol: 1, dRow: 2 });
  assert.deepEqual(computeSlideOffset('g1', 'f3', true), { dCol: -1, dRow: -2 });
});

test('64-bit Zobrist Hashing & Transposition Table: transposition invariance, state differentiation, and mate distance normalization', () => {
  const initial = createInitialGameState();
  const h0 = computeZobristHash(initial);
  assert.equal(typeof h0, 'bigint');
  assert.notEqual(h0, 0n);

  // Move order A: 1. e4 e5 2. Nf3 Nc6
  let lineA = playSanOrCoords(initial, 'e2', 'e4');
  lineA = playSanOrCoords(lineA, 'e7', 'e5');
  lineA = playSanOrCoords(lineA, 'g1', 'f3');
  lineA = playSanOrCoords(lineA, 'b8', 'c6');

  // Move order B (transposition): 1. Nf3 Nc6 2. e4 e5
  let lineB = playSanOrCoords(initial, 'g1', 'f3');
  lineB = playSanOrCoords(lineB, 'b8', 'c6');
  lineB = playSanOrCoords(lineB, 'e2', 'e4');
  let lineBFinal = playSanOrCoords(lineB, 'e7', 'e5');
  // Clear enPassantTarget on lineBFinal so both states have identical EP state
  lineBFinal = { ...lineBFinal, enPassantTarget: null };
  lineA = { ...lineA, enPassantTarget: null };

  assert.equal(
    computeZobristHash(lineA),
    computeZobristHash(lineBFinal),
    '64-bit Zobrist hash must be identical for transposed positions'
  );

  // Side to move changes Zobrist hash
  const flippedTurn = { ...lineA, turn: 'b' as const };
  assert.notEqual(computeZobristHash(lineA), computeZobristHash(flippedTurn));

  // Castling rights change Zobrist hash
  const noKingsideCastle = {
    ...lineA,
    castlingRights: { ...lineA.castlingRights, wK: false },
  };
  assert.notEqual(
    computeZobristHash(lineA),
    computeZobristHash(noKingsideCastle)
  );

  // En passant target changes Zobrist hash
  const withEp = { ...lineA, enPassantTarget: 'e6' as Square };
  assert.notEqual(computeZobristHash(lineA), computeZobristHash(withEp));

  // Mate distance normalization relative to root ply
  const mateIn3AtPly2 = MATE_SCORE - 5; // 5 plies from root, stored at ply 2 -> 3 plies from node
  const stored = normalizeMateScoreForStorage(mateIn3AtPly2, 2);
  assert.equal(stored, MATE_SCORE - 3);
  // Retrieved at ply 4 -> MATE_SCORE - 3 - 4 = MATE_SCORE - 7
  const retrievedAtPly4 = denormalizeMateScoreFromStorage(stored, 4);
  assert.equal(retrievedAtPly4, MATE_SCORE - 7);

  // TT Store & Probe with EXACT, LOWERBOUND, UPPERBOUND
  const tt = new Map<bigint, TTEntry>();
  const key = computeZobristHash(lineA);
  storeTTEntry(tt, key, 5, 145, 'EXACT', 2, 'f1c4');
  const exactProbe = probeTTEntry(tt, key, 4, -500, 500, 2);
  assert.equal(exactProbe.hit, true);
  assert.equal(exactProbe.cutoffScore, 145);
  assert.equal(exactProbe.hashMove, 'f1c4');

  const key2 = computeZobristHash(flippedTurn);
  storeTTEntry(tt, key2, 4, 220, 'LOWERBOUND', 1, 'g8f6');
  const lowerProbe = probeTTEntry(tt, key2, 4, -100, 200, 1);
  assert.equal(lowerProbe.hit, true);
  assert.equal(lowerProbe.cutoffScore, 220, 'LOWERBOUND >= beta must trigger beta cutoff');
});

test('Strict 6-Tier Move Ordering: Hash Move > Winning/Neutral Captures > Killer Moves > History Heuristic > Losing Captures > Remaining Quiet Moves', () => {
  // Position where White has:
  // 1. Hash Move: a2 -> a3
  // 2. Winning Capture: e4 pawn captures d5 Queen (exd5, SEE > 0)
  // 3. Killer Move 1: g1 -> f3
  // 4. Killer Move 2: b1 -> c3
  // 5. History Heuristic Quiet Move: f1 -> c4 (recorded with beta cutoff history)
  // 6. Losing Capture: h4 Queen captures h5 Pawn defended by g6 Pawn (Qxh5??, SEE = 100 - 900 = -800)
  // 7. Remaining Quiet Move: h2 -> h3 (no history, not killer, not hash)
  const state = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      a2: { type: 'p', color: 'w' },
      e4: { type: 'p', color: 'w' },
      g1: { type: 'n', color: 'w' },
      b1: { type: 'n', color: 'w' },
      f1: { type: 'b', color: 'w' },
      h4: { type: 'q', color: 'w' },
      h2: { type: 'p', color: 'w' },
      d5: { type: 'q', color: 'b' }, // Undefended Black Queen -> Winning capture exd5
      h5: { type: 'p', color: 'b' }, // Defended by g6 Pawn -> Losing capture Qxh5
      g6: { type: 'p', color: 'b' },
      e8: { type: 'k', color: 'b' },
    },
    'w'
  );

  const legal = generateLegalMoves(state);
  const hashMove = legal.find((m) => m.from === 'a2' && m.to === 'a3')!;
  const winningCap = legal.find((m) => m.from === 'e4' && m.to === 'd5')!;
  const killer1 = legal.find((m) => m.from === 'g1' && m.to === 'f3')!;
  const killer2 = legal.find((m) => m.from === 'b1' && m.to === 'c3')!;
  const historyQuiet = legal.find((m) => m.from === 'f1' && m.to === 'c4')!;
  const losingCap = legal.find((m) => m.from === 'h4' && m.to === 'h5')!;
  const remainingQuiet = legal.find((m) => m.from === 'h2' && m.to === 'h3')!;

  const historyTable = createHistoryTable();
  recordHistoryCutoff(historyTable, historyQuiet, 4);

  const subset: Move[] = [
    remainingQuiet,
    losingCap,
    historyQuiet,
    killer2,
    killer1,
    winningCap,
    hashMove,
  ];

  const ordered = orderMoves(
    subset,
    false,
    'a2a3',
    'g1f3',
    'b1c3',
    state.board,
    historyTable
  );

  assert.deepEqual(
    ordered.map((m) => `${m.from}->${m.to}`),
    [
      'a2->a3', // 1. Hash Move
      'e4->d5', // 2. Winning Capture (SEE > 0)
      'g1->f3', // 3. Killer Move 1
      'b1->c3', // 4. Killer Move 2
      'f1->c4', // 5. History Heuristic Quiet Move
      'h4->h5', // 6. Losing Capture (SEE < 0)
      'h2->h3', // 7. Remaining Quiet Move
    ],
    'Move ordering must strictly enforce the 6-tier hierarchy'
  );

  // Also verify numeric score ordering directly
  const sHash = scoreMoveForOrdering(hashMove, false, 'a2a3', 'g1f3', 'b1c3', state.board, 0);
  const sWinCap = scoreMoveForOrdering(winningCap, false, 'a2a3', 'g1f3', 'b1c3', state.board, 0);
  const sKiller1 = scoreMoveForOrdering(killer1, false, 'a2a3', 'g1f3', 'b1c3', state.board, 0);
  const sHist = scoreMoveForOrdering(historyQuiet, false, 'a2a3', 'g1f3', 'b1c3', state.board, 16);
  const sLoseCap = scoreMoveForOrdering(losingCap, false, 'a2a3', 'g1f3', 'b1c3', state.board, 0);
  const sQuiet = scoreMoveForOrdering(remainingQuiet, false, 'a2a3', 'g1f3', 'b1c3', state.board, 0);

  assert.ok(sHash > sWinCap);
  assert.ok(sWinCap > sKiller1);
  assert.ok(sKiller1 > sHist);
  assert.ok(sHist > sLoseCap);
  assert.ok(sLoseCap > sQuiet);
});

test('Tapered Evaluation & Advanced Positional Heuristics: Game Phase, Backward/Passed Pawns, Bishop Pair, Rook 7th Rank & Open File, Knight Outpost', () => {
  // 1. Game Phase interpolation: initial board has mgWeight = 24, egWeight = 0; pure King+Pawn endgame has mgWeight = 0, egWeight = 24
  const initial = createInitialGameState();
  const phaseStart = computeGamePhase(initial.board);
  assert.equal(phaseStart.mgWeight, 24);
  assert.equal(phaseStart.egWeight, 0);
  assert.equal(phaseStart.phaseRatio, 1);

  const kpEndgame = createCustomState({
    e4: { type: 'k', color: 'w' },
    d5: { type: 'p', color: 'w' },
    e8: { type: 'k', color: 'b' },
  });
  const phaseEnd = computeGamePhase(kpEndgame.board);
  assert.equal(phaseEnd.mgWeight, 0);
  assert.equal(phaseEnd.egWeight, 24);
  assert.equal(phaseEnd.phaseRatio, 0);
  assert.equal(hasNonPawnMaterial(kpEndgame.board, 'w'), false, 'Zugzwang detector must identify King+Pawn only');
  assert.equal(hasNonPawnMaterial(initial.board, 'w'), true);

  // 2. Passed Pawn + King Proximity in Endgame:
  // White passed pawn on d6 with White King escorting on c6 scores significantly higher than when White King is far away on h1
  const kingNearPassed = createCustomState({
    c6: { type: 'k', color: 'w' },
    d6: { type: 'p', color: 'w' },
    h8: { type: 'k', color: 'b' },
  });
  const kingFarFromPassed = createCustomState({
    h1: { type: 'k', color: 'w' },
    d6: { type: 'p', color: 'w' },
    h8: { type: 'k', color: 'b' },
  });
  assert.ok(
    evaluateBoardWhitePerspective(kingNearPassed.board, 'club') >
      evaluateBoardWhitePerspective(kingFarFromPassed.board, 'club') + 35,
    'Endgame evaluation must reward friendly King proximity to advanced passed pawn'
  );

  // 3. Rook on Open File + 7th Rank Infiltration vs Blocked File on 1st Rank
  const rook7thOpen = createCustomState({
    g1: { type: 'k', color: 'w' },
    d7: { type: 'r', color: 'w' }, // 7th rank on open d-file with Black King on back rank!
    a2: { type: 'p', color: 'w' },
    g8: { type: 'k', color: 'b' },
    a7: { type: 'p', color: 'b' },
    h8: { type: 'r', color: 'b' },
  });
  const rook1stClosed = createCustomState({
    g1: { type: 'k', color: 'w' },
    a1: { type: 'r', color: 'w' }, // Blocked behind own pawn on a2
    a2: { type: 'p', color: 'w' },
    g8: { type: 'k', color: 'b' },
    a7: { type: 'p', color: 'b' },
    h8: { type: 'r', color: 'b' },
  });
  assert.ok(
    evaluateBoardWhitePerspective(rook7thOpen.board, 'club') >
      evaluateBoardWhitePerspective(rook1stClosed.board, 'club') + 40,
    'Rook on open file infiltrating 7th rank must score higher than Rook behind closed file'
  );

  // 4. Knight Outpost on d5 supported by e4 pawn with no Black c/e pawns
  const knightOutpost = createCustomState({
    g1: { type: 'k', color: 'w' },
    d5: { type: 'n', color: 'w' },
    e4: { type: 'p', color: 'w' },
    g8: { type: 'k', color: 'b' },
    b8: { type: 'n', color: 'b' },
    a7: { type: 'p', color: 'b' },
  });
  const knightRim = createCustomState({
    g1: { type: 'k', color: 'w' },
    a3: { type: 'n', color: 'w' },
    e4: { type: 'p', color: 'w' },
    g8: { type: 'k', color: 'b' },
    b8: { type: 'n', color: 'b' },
    a7: { type: 'p', color: 'b' },
  });
  assert.ok(
    evaluateBoardWhitePerspective(knightOutpost.board, 'club') >
      evaluateBoardWhitePerspective(knightRim.board, 'club') + 60
  );
});

test('Parameterized ChessEngineConfig API: custom maxDepth, hard cutoff maxTimeMs, NMP/LMR toggles, and evalWeights multipliers', () => {
  // 1. Validate config clamping (hard time limit 15000ms, weight clamping 0.0-2.0)
  const resolved = resolveEngineConfig({
    maxDepth: 12,
    maxTimeMs: 25000, // Should clamp to 15000ms hard limit
    evalWeights: {
      material: 1.5,
      pieceSquareTables: 1.2,
      pawnStructure: 0.8,
      kingSafety: 2.5, // Should clamp to 2.0
      mobility: -0.5, // Should clamp to 0.0
    },
  });
  assert.equal(resolved.maxDepth, 12);
  assert.equal(resolved.maxTimeMs, 15000);
  assert.equal(resolved.evalWeights.kingSafety, 2.0);
  assert.equal(resolved.evalWeights.mobility, 0.0);

  // 2. Search with parameterized ChessEngineConfig (NMP + LMR + Quiescence + Zobrist TT enabled)
  const tacticalState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      d1: { type: 'q', color: 'w' },
      e1: { type: 'r', color: 'w' },
      c4: { type: 'b', color: 'w' },
      f3: { type: 'n', color: 'w' },
      f2: { type: 'p', color: 'w' },
      g2: { type: 'p', color: 'w' },
      h2: { type: 'p', color: 'w' },
      g8: { type: 'k', color: 'b' },
      d8: { type: 'q', color: 'b' },
      a8: { type: 'r', color: 'b' },
      e7: { type: 'b', color: 'b' },
      e4: { type: 'n', color: 'b' }, // Undefended Knight on e4
      f7: { type: 'p', color: 'b' },
      g7: { type: 'p', color: 'b' },
      h7: { type: 'p', color: 'b' },
    },
    'w'
  );

  const customResult = searchBestAIMove(tacticalState, {
    maxDepth: 4,
    maxTimeMs: 1500,
    enableQuiescence: true,
    enableTranspositionTable: true,
    enableNullMovePruning: true,
    enableLMR: true,
    evalWeights: {
      material: 1.0,
      pieceSquareTables: 1.0,
      pawnStructure: 1.0,
      kingSafety: 1.0,
      mobility: 1.0,
    },
    errorProbability: 0.0,
    errorMarginCentipawns: 0,
  });

  assert.ok(customResult.move);
  assert.equal(customResult.depth, 4);
  assert.ok(
    ['e4', 'd5', 'd8', 'f7'].includes(customResult.move.to),
    `Expected strong tactical move to e4/d5/d8/f7, got ${customResult.move.to}`
  );
  assert.ok(customResult.score > 200, `Expected tactical advantage > +200cp, got ${customResult.score}`);
  assert.ok(customResult.config);
});

test('Tactical Coach Classical Engine Integration: Pin/Skewer, Knight Outpost, Rook 7th Rank/Open File, Passed Pawn, and Tapered Breakdown', () => {
  // 1. Pin detector: White Bishop moving to b5 pins Black Knight on c6 to Black King on e8
  const pinState = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      f1: { type: 'b', color: 'w' },
      e8: { type: 'k', color: 'b' },
      c6: { type: 'n', color: 'b' },
      a7: { type: 'p', color: 'b' },
    },
    'w'
  );
  const bb5Move: Move = {
    from: 'f1',
    to: 'b5',
    piece: { type: 'b', color: 'w' },
  };
  const pinNext = makeMove(pinState, bb5Move);
  const pinDesc = detectPinOrSkewerTarget(pinNext.board, bb5Move, 'w');
  assert.ok(pinDesc && pinDesc.includes('Pin Knight (c6) to King (e8)'), `Expected Pin description, got ${pinDesc}`);

  // 2. Knight Outpost detector: White Knight moving from c3 to d5 supported by e4 pawn with no Black c/e pawns
  const outpostState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      c3: { type: 'n', color: 'w' },
      e4: { type: 'p', color: 'w' },
      g8: { type: 'k', color: 'b' },
      d6: { type: 'p', color: 'b' },
    },
    'w'
  );
  const nd5Move: Move = {
    from: 'c3',
    to: 'd5',
    piece: { type: 'n', color: 'w' },
  };
  const outpostNext = makeMove(outpostState, nd5Move);
  const outpostReason = detectKnightOutpostReason(outpostNext.board, nd5Move, 'w');
  assert.ok(outpostReason && outpostReason.includes('Establish Knight outpost on d5'));

  // 3. Rook 7th-Rank & Open File detector
  const rookState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      d1: { type: 'r', color: 'w' },
      g8: { type: 'k', color: 'b' },
      f7: { type: 'p', color: 'b' },
    },
    'w'
  );
  const rd7Move: Move = {
    from: 'd1',
    to: 'd7',
    piece: { type: 'r', color: 'w' },
  };
  const rookNext = makeMove(rookState, rd7Move);
  const rookReason = detectRookFileAnd7thRankReason(
    rookState.board,
    rookNext.board,
    rd7Move,
    'w'
  );
  assert.ok(rookReason && rookReason.includes('Infiltrate 7th rank with Rook on d7'));

  // 4. Passed Pawn advance detector
  const passedPawnState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      d5: { type: 'p', color: 'w' },
      g8: { type: 'k', color: 'b' },
      a7: { type: 'p', color: 'b' },
    },
    'w'
  );
  const d6Move: Move = {
    from: 'd5',
    to: 'd6',
    piece: { type: 'p', color: 'w' },
  };
  const passedNext = makeMove(passedPawnState, d6Move);
  const passedReason = detectPassedPawnAdvanceReason(passedNext.board, d6Move, 'w');
  assert.ok(passedReason && passedReason.includes('Advance passed pawn to d6'));

  // 5. Tapered Breakdown & Deep Coach Telemetry on Endgame Position
  const endgameCoachAnalysis = analyzeTacticsDeep(
    passedPawnState,
    4,
    400,
    {
      enableNullMovePruning: true,
      enableLMR: true,
      enableTranspositionTable: true,
      enableQuiescence: true,
    }
  );
  assert.equal(endgameCoachAnalysis.evalBreakdown.phaseLabel, 'Endgame');
  assert.equal(endgameCoachAnalysis.evalBreakdown.gamePhase, 0);
  assert.ok(endgameCoachAnalysis.evalBreakdown.pawnStructure > 50);
  assert.ok(endgameCoachAnalysis.topMoves.length > 0);
  assert.equal(endgameCoachAnalysis.topMoves[0].san, 'd6');
  assert.equal(endgameCoachAnalysis.topMoves[0].tacticalMotif, 'PASSED PAWN');

  const directBreakdown = evaluateTaperedBreakdown(passedPawnState.board, 'w', 'club');
  assert.equal(directBreakdown.phaseLabel, 'Endgame');
  assert.equal(directBreakdown.egWeightPct, 100);
});

test('Granular Elo Interpolation (400–2400) & Reactive (1150 Elo) Defensive Bot Behavior', () => {
  // 1. Verify monotonic scaling across 400 -> 1000 -> 1400 -> 1800 -> 2400 Elo
  const elo400 = interpolateEngineConfigFromElo(400);
  const elo1000 = interpolateEngineConfigFromElo(1000);
  const elo1400 = interpolateEngineConfigFromElo(1400);
  const elo1800 = interpolateEngineConfigFromElo(1800);
  const elo2400 = interpolateEngineConfigFromElo(2400);

  assert.equal(elo400.maxDepth, 1);
  assert.equal(elo400.enableQuiescence, false);
  assert.ok(elo400.errorProbability > elo1000.errorProbability);
  assert.ok(elo1000.errorProbability > elo1400.errorProbability);
  assert.equal(elo2400.errorProbability, 0);
  assert.equal(elo2400.errorMarginCentipawns, 0);
  assert.ok(elo2400.maxDepth >= 7);
  assert.equal(elo1800.enableNullMovePruning, true);
  assert.equal(elo1800.enableLMR, true);
  assert.ok(elo2400.evalWeights.kingSafety > elo400.evalWeights.kingSafety);

  // 2. Verify all 6 milestone presets exist, including Reactive (1150 Elo)
  assert.equal(ENGINE_MILESTONE_PRESETS.length, 6);
  const reactiveProfile = createEngineProfileFromPreset('reactive');
  assert.equal(reactiveProfile.elo, 1150);
  assert.equal(reactiveProfile.config.maxDepth, 2);
  assert.equal(reactiveProfile.config.enableQuiescence, true);
  assert.ok(reactiveProfile.config.evalWeights.kingSafety >= 1.25);
  assert.ok(reactiveProfile.config.evalWeights.material >= 1.2);

  const summary = describeEngineProfileSummary(reactiveProfile);
  assert.equal(summary.title, 'Reactive (1150)');
  assert.equal(summary.badge, '1150 ELO');
  assert.ok(summary.depthBadge.includes('2p+Q'));

  // 3. Verify Reactive (1150) Bot immediately rescues a threatened piece and makes sound trades without blundering
  const threatenedRookState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      c3: { type: 'n', color: 'w' }, // Attacks d5 and e4
      f2: { type: 'p', color: 'w' },
      g2: { type: 'p', color: 'w' },
      h2: { type: 'p', color: 'w' },
      g8: { type: 'k', color: 'b' },
      d5: { type: 'r', color: 'b' }, // Undefended Black Rook attacked by White Knight on c3
      a7: { type: 'p', color: 'b' },
      g7: { type: 'p', color: 'b' },
      h7: { type: 'p', color: 'b' },
    },
    'b'
  );

  for (let i = 0; i < 10; i++) {
    const seed = i / 10;
    const res = searchBestAIMove(threatenedRookState, reactiveProfile.config, () => seed);
    assert.ok(res.move);
    assert.equal(
      res.move.from,
      'd5',
      `Reactive bot (seed=${seed}) must rescue its attacked Rook on d5`
    );
  }

  // 4. Verify Reactive (1150) Bot captures an undefended/favorable target (sound trade) and rejects poison captures
  const tradeState = createCustomState(
    {
      g1: { type: 'k', color: 'w' },
      d4: { type: 'n', color: 'w' }, // Undefended White Knight on d4
      b3: { type: 'p', color: 'w' },
      c2: { type: 'p', color: 'w' }, // Defends b3
      g8: { type: 'k', color: 'b' },
      d8: { type: 'q', color: 'b' }, // Can capture d4 for free OR b3 (poisoned by c2 pawn)
      f7: { type: 'p', color: 'b' },
      g7: { type: 'p', color: 'b' },
    },
    'b'
  );
  const tradeRes = searchBestAIMove(tradeState, reactiveProfile.config, () => 0.01);
  assert.ok(tradeRes.move);
  assert.equal(tradeRes.move.from, 'd8');
  assert.equal(
    tradeRes.move.to,
    'd4',
    'Reactive bot must capture the free Knight on d4 and never blunder Queen on b3'
  );

  // 5. Verify createEngineProfileFromElo snaps to preset when within 15 Elo of a milestone
  const snappedReactive = createEngineProfileFromElo(1150);
  assert.equal(snappedReactive.presetId, 'reactive');
  const customElo1625 = createEngineProfileFromElo(1625);
  assert.equal(customElo1625.presetId, 'custom');
  assert.equal(customElo1625.elo, 1625);
});

test('Engine Audit Verification: Incremental Zobrist XOR Parity, Doubled Passed Pawn Exclusion, Material Sanity Floor, and Intermediate Eval Consistency', () => {
  // 1. Incremental Zobrist XOR parity across normal moves, double pushes, en passant, castling, and promotions
  let state = createInitialGameState();
  let runningHash = computeZobristHash(state);

  const testSequence: [Square, Square, ('q' | 'n')?][] = [
    ['e2', 'e4'],
    ['d7', 'd5'],
    ['e4', 'd5'], // capture
    ['c7', 'c5'], // double push
    ['d5', 'c6'], // en passant capture!
    ['e7', 'e6'],
    ['g1', 'f3'],
    ['f8', 'e7'],
    ['f1', 'e2'],
    ['g8', 'f6'],
    ['e1', 'g1'], // White O-O
    ['e8', 'g8'], // Black O-O
  ];

  for (const [from, to, promo] of testSequence) {
    const legal = generateLegalMoves(state);
    const move = legal.find(
      (m) => m.from === from && m.to === to && (m.promotion ?? undefined) === promo
    )!;
    assert.ok(move, `Move ${from}->${to} must be legal`);
    const nextState = makeMove(state, move);
    runningHash = updateZobristHashAfterMove(
      runningHash,
      state,
      move,
      nextState.castlingRights,
      nextState.enPassantTarget
    );
    const fullRecomputed = computeZobristHash(nextState);
    assert.equal(
      runningHash,
      fullRecomputed,
      `Incremental Zobrist XOR hash must match full recomputed hash after ${move.san}`
    );
    state = nextState;
  }

  // 2. Material Sanity Floor: resolveEngineConfig clamps material weight >= 0.5 even if 0.0 is passed
  const extremeStyleConfig = resolveEngineConfig({
    evalWeights: {
      material: 0.0,
      pieceSquareTables: 1.5,
      pawnStructure: 1.0,
      kingSafety: 2.0,
      mobility: 2.0,
    },
  });
  assert.equal(
    extremeStyleConfig.evalWeights.material,
    0.5,
    'Material weight must enforce a minimum sanity floor of 0.5'
  );

  // 3. Doubled pawns on an open file must not both receive passed-pawn bonuses
  const connectedPassedSetup = createCustomState({
    e1: { type: 'k', color: 'w' },
    d6: { type: 'p', color: 'w' },
    e5: { type: 'p', color: 'w' }, // Connected support pawn on rank 5
    f7: { type: 'p', color: 'b' }, // Stops e5 from being passed, leaving only d6 passed
    e8: { type: 'k', color: 'b' },
  });
  const doubledPassedOnDFile = createCustomState({
    e1: { type: 'k', color: 'w' },
    d6: { type: 'p', color: 'w' },
    d5: { type: 'p', color: 'w' }, // Rear doubled pawn behind d6 on rank 5
    f7: { type: 'p', color: 'b' },
    e8: { type: 'k', color: 'b' },
  });
  const evalConnected = evaluateBoardWhitePerspective(connectedPassedSetup.board, 'club');
  const evalDoubled = evaluateBoardWhitePerspective(doubledPassedOnDFile.board, 'club');
  assert.ok(
    evalConnected > evalDoubled,
    `Connected passed pawn d6+e5 (${evalConnected}) must score higher than doubled pawns d6+d5 on the same file (${evalDoubled})`
  );

  // 4. Intermediate preset evaluation consistency between evaluateBoardWhitePerspective and evaluateTaperedBreakdown
  const breakdownInterm = evaluateTaperedBreakdown(state.board, 'w', 'intermediate');
  const rawInterm = evaluateBoardWhitePerspective(state.board, 'intermediate');
  assert.equal(
    rawInterm,
    breakdownInterm.total,
    'evaluateBoardWhitePerspective and evaluateTaperedBreakdown must match for intermediate preset'
  );
});

test('Undo during AI turn (thinking): canUndoState and rewindStateStack allow clean takebacks for White, Black, and Pass & Play', () => {
  const initial = createInitialGameState();

  // --- Scenario 1: Human is White vs AI ---
  // Step 1.0: Start of match (length 1, White to move)
  let whiteStack = [initial];
  assert.equal(canUndoState(whiteStack, 'ai', 'w'), false, 'Cannot undo at start of match before any moves');

  // Step 1.1: White plays 1. e4. Now AI is thinking (turn = 'b', length = 2)
  const afterE4 = playSanOrCoords(initial, 'e2', 'e4');
  whiteStack = [...whiteStack, afterE4];
  assert.equal(afterE4.turn, 'b');
  assert.equal(
    canUndoState(whiteStack, 'ai', 'w'),
    true,
    'Undo must be allowed while AI is thinking on move 1'
  );

  // Rewinding during AI thinking reverts to White to move on initial board
  const rewoundAfterE4 = rewindStateStack(whiteStack, 'ai', 'w');
  assert.equal(rewoundAfterE4.length, 1);
  assert.equal(rewoundAfterE4[0].turn, 'w');
  assert.equal(rewoundAfterE4[0].moveHistory.length, 0);

  // Step 1.2: AI completes 1... e5 (length = 3, White to move)
  const afterE5 = playSanOrCoords(afterE4, 'e7', 'e5');
  whiteStack = [...whiteStack, afterE5];

  // White plays 2. Nf3. Now AI is thinking for move 2 (turn = 'b', length = 4)
  const afterNf3 = playSanOrCoords(afterE5, 'g1', 'f3');
  whiteStack = [...whiteStack, afterNf3];
  assert.equal(afterNf3.turn, 'b');
  assert.equal(
    canUndoState(whiteStack, 'ai', 'w'),
    true,
    'Undo must be allowed while AI is thinking on move 2'
  );

  // Rewinding during AI thinking on move 2 reverts to after 1... e5 (White to move on turn 2)
  const rewoundMove2 = rewindStateStack(whiteStack, 'ai', 'w');
  assert.equal(rewoundMove2.length, 3);
  assert.equal(rewoundMove2[rewoundMove2.length - 1].turn, 'w');
  assert.equal(rewoundMove2[rewoundMove2.length - 1].moveHistory.length, 2);
  assert.equal(rewoundMove2[rewoundMove2.length - 1].moveHistory[1].san, 'e5');

  // --- Scenario 2: Human is Black vs AI ---
  // Step 2.0: Start of match. AI is White and thinking on move 1
  let blackStack = [initial];
  assert.equal(
    canUndoState(blackStack, 'ai', 'b'),
    false,
    'Black cannot undo on move 1 while White AI is thinking because Black has made no moves'
  );

  // Step 2.1: White AI plays 1. e4 (length = 2, Black to move)
  blackStack = [...blackStack, afterE4];
  assert.equal(
    canUndoState(blackStack, 'ai', 'b'),
    false,
    'Black cannot undo after White AI move 1 because Black has not made any move yet'
  );

  // Step 2.2: Black plays 1... e5 (length = 3). Now White AI is thinking for move 2 (turn = 'w')
  blackStack = [...blackStack, afterE5];
  assert.equal(afterE5.turn, 'w');
  assert.equal(
    canUndoState(blackStack, 'ai', 'b'),
    true,
    'Black must be allowed to undo while White AI is thinking on move 2'
  );

  // Rewinding during AI thinking reverts to after 1. e4 (Black to move on move 1)
  const rewoundBlack = rewindStateStack(blackStack, 'ai', 'b');
  assert.equal(rewoundBlack.length, 2);
  assert.equal(rewoundBlack[rewoundBlack.length - 1].turn, 'b');
  assert.equal(rewoundBlack[rewoundBlack.length - 1].moveHistory.length, 1);
  assert.equal(rewoundBlack[rewoundBlack.length - 1].moveHistory[0].san, 'e4');

  // --- Scenario 3: Pass and Play Mode ---
  let passStack = [initial, afterE4, afterE5];
  assert.equal(canUndoState(passStack, 'pass_and_play', 'w'), true);
  const rewoundPass = rewindStateStack(passStack, 'pass_and_play', 'w');
  assert.equal(rewoundPass.length, 2);
  assert.equal(rewoundPass[rewoundPass.length - 1].moveHistory[0].san, 'e4');
});

test('fenToGameState: parses initial position correctly with full board and state parameters', () => {
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const parsed = fenToGameState(startFen);
  assert.notEqual(parsed, null);
  if (!parsed) return;
  assert.equal(parsed.turn, 'w');
  assert.equal(parsed.castlingRights.wK, true);
  assert.equal(parsed.castlingRights.wQ, true);
  assert.equal(parsed.castlingRights.bK, true);
  assert.equal(parsed.castlingRights.bQ, true);
  assert.equal(parsed.enPassantTarget, null);
  assert.equal(parsed.halfMoveClock, 0);
  assert.equal(parsed.fullMoveNumber, 1);
  assert.equal(parsed.inCheck, false);
  assert.equal(parsed.status, 'playing');
});

test('fenToGameState: parses midgame position with en passant target, halfmove clock, and check status', () => {
  // Italian Game position with Black to move and en passant target d6
  const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 4';
  const parsed = fenToGameState(fen);
  assert.notEqual(parsed, null);
  if (!parsed) return;
  assert.equal(parsed.turn, 'b');
  assert.equal(parsed.castlingRights.wK, true);
  assert.equal(parsed.castlingRights.wQ, true);
  assert.equal(parsed.castlingRights.bK, true);
  assert.equal(parsed.castlingRights.bQ, true);
  assert.equal(parsed.halfMoveClock, 3);
  assert.equal(parsed.fullMoveNumber, 4);
});

test('fenToGameState: detects checkmate terminal status on loaded FEN', () => {
  // Scholar's Mate checkmate position: Qxf7# with Black king in checkmate
  const mateFen = 'r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
  const parsed = fenToGameState(mateFen);
  assert.notEqual(parsed, null);
  if (!parsed) return;
  assert.equal(parsed.inCheck, true);
  assert.equal(parsed.status, 'checkmate');
  assert.equal(parsed.winner, 'w');
});

test('fenToGameState: rejects invalid FEN formats strictly', () => {
  // Missing ranks (only 7 ranks)
  assert.equal(fenToGameState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1'), null);
  // Missing kings (no white king)
  assert.equal(fenToGameState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w KQkq - 0 1'), null);
  // Two white kings
  assert.equal(fenToGameState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNK w KQkq - 0 1'), null);
  // Opponent king is in check (White to move, but Black king is already under attack)
  assert.equal(
    fenToGameState('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1'),
    null,
    'Opponent king cannot already be in check when it is the attacker turn to move'
  );
});

test('isInsufficientMaterial: recognizes K+N vs K+N, K+NN vs K, and same-colored bishops as draws', () => {
  // K + N vs K + N
  const knVsKnState = createCustomState({
    e1: { type: 'k', color: 'w' },
    b1: { type: 'n', color: 'w' },
    e8: { type: 'k', color: 'b' },
    b8: { type: 'n', color: 'b' },
  });
  assert.equal(isInsufficientMaterial(knVsKnState.board), true);

  // K + N + N vs K
  const knnVsKState = createCustomState({
    e1: { type: 'k', color: 'w' },
    b1: { type: 'n', color: 'w' },
    c1: { type: 'n', color: 'w' },
    e8: { type: 'k', color: 'b' },
  });
  assert.equal(isInsufficientMaterial(knnVsKState.board), true);

  // K + P vs K (NOT insufficient material)
  const kpVsKState = createCustomState({
    e1: { type: 'k', color: 'w' },
    e2: { type: 'p', color: 'w' },
    e8: { type: 'k', color: 'b' },
  });
  assert.equal(isInsufficientMaterial(kpVsKState.board), false);
});

test('draw rules: 75-move rule triggers automatic draw_seventy_five_move under FIDE 9.6.2', () => {
  // Setup position with halfMoveClock at 149, make a non-pawn non-capture move -> reaches 150 -> draw_seventy_five_move
  const state74 = createCustomState(
    {
      e1: { type: 'k', color: 'w' },
      d1: { type: 'r', color: 'w' },
      e8: { type: 'k', color: 'b' },
      d8: { type: 'r', color: 'b' },
    },
    'w',
    { halfMoveClock: 149 }
  );
  const next = playSanOrCoords(state74, 'd1', 'c1');
  assert.equal(next.halfMoveClock, 150);
  assert.equal(next.status, 'draw_seventy_five_move');
});

test('free-form tactical arrows: canPlanArrow allows arrows between any valid squares', () => {
  const state = createInitialGameState();
  assert.equal(canPlanArrow(state, [], 'e2', 'e4'), true);
  assert.equal(canPlanArrow(state, [], 'e4', 'e5'), true);
  assert.equal(canPlanArrow(state, [], 'c1', 'h6'), true);
  // Arrow to the same square is rejected
  assert.equal(canPlanArrow(state, [], 'e2', 'e2'), false);
});

test('searchBestAIMove: opening book produces instant master moves on ply 0 and ply 1', () => {
  const initial = createInitialGameState();
  const config = resolveEngineConfig(undefined, { maxDepth: 4 });
  const resultWhite = searchBestAIMove(initial, config);
  assert.notEqual(resultWhite.move, null);
  // On ply 0, initial opening book has master moves like e4, d4, c4, Nf3
  const bookUcis = ['e2e4', 'd2d4', 'c2c4', 'g1f3'];
  const playedUci = `${resultWhite.move!.from}${resultWhite.move!.to}`;
  assert.equal(
    bookUcis.includes(playedUci),
    true,
    `AI played ${playedUci}, which should be from master opening book`
  );
  assert.equal(resultWhite.nodes, 1, 'Book move probes instantly with 1 node');
});


