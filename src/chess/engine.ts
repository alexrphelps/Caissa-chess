import {
  Board,
  CastlingRights,
  Color,
  Coords,
  GameMode,
  GameState,
  GameStatus,
  Move,
  Piece,
  PieceType,
  PlannedArrow,
  PromotionPieceType,
  Square,
} from './types';

export const BOARD_SIZE = 8;
export const FIFTY_MOVE_HALF_MOVE_LIMIT = 100;
export const SEVENTY_FIVE_MOVE_LIMIT = 150;
export const THREEFOLD_REPETITION_LIMIT = 3;
export const FIVEFOLD_REPETITION_LIMIT = 5;

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

export const PROMOTION_TYPES: readonly PromotionPieceType[] = [
  'q',
  'r',
  'b',
  'n',
];

const KNIGHT_OFFSETS: readonly [number, number][] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const ORTHO_DIRS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const DIAG_DIRS: readonly [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const QUEEN_DIRS: readonly [number, number][] = [...DIAG_DIRS, ...ORTHO_DIRS];

export const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 300,
  b: 300,
  r: 500,
  q: 900,
  k: 20000,
};

export const MATERIAL_DISPLAY_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function oppositeColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

export function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function isValidSquare(square: unknown): square is Square {
  if (typeof square !== 'string' || square.length !== 2) return false;
  const col = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const row = RANKS.indexOf(square[1] as (typeof RANKS)[number]);
  return isInsideBoard(row, col);
}

export function coordsToSquare(row: number, col: number): Square {
  if (!isInsideBoard(row, col)) {
    throw new RangeError(`Coordinates out of bounds: (${row}, ${col})`);
  }
  return `${FILES[col]}${RANKS[row]}`;
}

export function squareToCoords(square: Square): Coords {
  if (typeof square !== 'string' || square.length !== 2) {
    return { row: -1, col: -1 };
  }
  const col = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const row = RANKS.indexOf(square[1] as (typeof RANKS)[number]);
  return { row, col };
}

export function getPieceAt(board: Board, square: Square): Piece | null {
  const { row, col } = squareToCoords(square);
  if (!isInsideBoard(row, col)) return null;
  return board[row][col];
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(null)
  );
  const backRank: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

  for (let col = 0; col < BOARD_SIZE; col++) {
    board[0][col] = { type: backRank[col], color: 'b' };
    board[1][col] = { type: 'p', color: 'b' };
    board[6][col] = { type: 'p', color: 'w' };
    board[7][col] = { type: backRank[col], color: 'w' };
  }

  return board;
}

/**
 * Checks whether the active side (`turn`) has at least one strictly legal
 * en passant capture available toward `enPassantTarget` on `board`.
 * Under FIDE Article 9.2.2, an en passant target square only differentiates
 * a position for Threefold Repetition if an opposing pawn can legally capture it
 * (including verifying that the capture does not expose the capturing player's King
 * to a horizontal or diagonal discovered check).
 */
export function hasLegalEnPassantCapture(
  board: Board,
  turn: Color,
  enPassantTarget: Square | null
): boolean {
  if (!enPassantTarget || !isValidSquare(enPassantTarget)) return false;
  const { row: epRow, col: epCol } = squareToCoords(enPassantTarget);
  const pawnRow = turn === 'w' ? epRow + 1 : epRow - 1;
  const enemy = oppositeColor(turn);

  const capturedPawn = isInsideBoard(pawnRow, epCol)
    ? board[pawnRow][epCol]
    : null;
  if (!capturedPawn || capturedPawn.color !== enemy || capturedPawn.type !== 'p') {
    return false;
  }

  for (const dc of [-1, 1]) {
    const srcCol = epCol + dc;
    if (!isInsideBoard(pawnRow, srcCol)) continue;
    const attacker = board[pawnRow][srcCol];
    if (attacker && attacker.color === turn && attacker.type === 'p') {
      const candidateEpMove: Move = {
        from: coordsToSquare(pawnRow, srcCol),
        to: enPassantTarget,
        piece: attacker,
        captured: capturedPawn,
        isEnPassant: true,
      };
      const nextBoard = applyMoveToBoard(board, candidateEpMove);
      if (!isKingInCheck(nextBoard, turn)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Computes a deterministic FIDE position hash representing:
 * 1. Exact piece placement on all 64 squares
 * 2. Active player turn
 * 3. Castling rights (wK, wQ, bK, bQ)
 * 4. En passant target square ONLY when a legal en passant capture exists (FIDE Art. 9.2.2)
 * Used for Threefold Repetition detection.
 */
export function computePositionHash(
  board: Board,
  turn: Color,
  castlingRights: CastlingRights,
  enPassantTarget: Square | null
): string {
  const rows: string[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let empty = 0;
    let rowStr = '';
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          rowStr += empty.toString();
          empty = 0;
        }
        const char = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
        rowStr += char;
      }
    }
    if (empty > 0) {
      rowStr += empty.toString();
    }
    rows.push(rowStr);
  }

  let castlingStr = '';
  if (castlingRights.wK) castlingStr += 'K';
  if (castlingRights.wQ) castlingStr += 'Q';
  if (castlingRights.bK) castlingStr += 'k';
  if (castlingRights.bQ) castlingStr += 'q';
  if (!castlingStr) castlingStr = '-';

  const effectiveEp = hasLegalEnPassantCapture(board, turn, enPassantTarget)
    ? enPassantTarget
    : null;
  const epStr = effectiveEp ?? '-';
  return `${rows.join('/')} ${turn} ${castlingStr} ${epStr}`;
}

export function createInitialGameState(): GameState {
  const board = createInitialBoard();
  const castlingRights: CastlingRights = {
    wK: true,
    wQ: true,
    bK: true,
    bQ: true,
  };
  const hash = computePositionHash(board, 'w', castlingRights, null);

  return {
    board,
    turn: 'w',
    castlingRights,
    enPassantTarget: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    positionCounts: { [hash]: 1 },
    moveHistory: [],
    capturedByWhite: [],
    capturedByBlack: [],
    status: 'playing',
    winner: null,
    inCheck: false,
    lastMove: null,
  };
}

export function findKingSquare(board: Board, color: Color): Square | null {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.color === color && piece.type === 'k') {
        return coordsToSquare(r, c);
      }
    }
  }
  return null;
}

/**
 * Checks whether a target square (row, col) on `board` is attacked by any piece of `byColor`.
 */
export function isSquareAttacked(
  board: Board,
  targetRow: number,
  targetCol: number,
  byColor: Color
): boolean {
  // 1. Pawn attacks
  // If byColor is White ('w'), white pawns attack upward (from targetRow + 1 to targetRow)
  // If byColor is Black ('b'), black pawns attack downward (from targetRow - 1 to targetRow)
  const pawnSourceRow = byColor === 'w' ? targetRow + 1 : targetRow - 1;
  if (isInsideBoard(pawnSourceRow, targetCol - 1)) {
    const p = board[pawnSourceRow][targetCol - 1];
    if (p && p.color === byColor && p.type === 'p') return true;
  }
  if (isInsideBoard(pawnSourceRow, targetCol + 1)) {
    const p = board[pawnSourceRow][targetCol + 1];
    if (p && p.color === byColor && p.type === 'p') return true;
  }

  // 2. Knight attacks
  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const r = targetRow + dr;
    const c = targetCol + dc;
    if (isInsideBoard(r, c)) {
      const p = board[r][c];
      if (p && p.color === byColor && p.type === 'n') return true;
    }
  }

  // 3. King attacks (adjacent 8 squares)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = targetRow + dr;
      const c = targetCol + dc;
      if (isInsideBoard(r, c)) {
        const p = board[r][c];
        if (p && p.color === byColor && p.type === 'k') return true;
      }
    }
  }

  // 4. Orthogonal sliding attacks (Rook / Queen)
  for (const [dr, dc] of ORTHO_DIRS) {
    let r = targetRow + dr;
    let c = targetCol + dc;
    while (isInsideBoard(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q')) {
          return true;
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // 5. Diagonal sliding attacks (Bishop / Queen)
  for (const [dr, dc] of DIAG_DIRS) {
    let r = targetRow + dr;
    let c = targetCol + dc;
    while (isInsideBoard(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q')) {
          return true;
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

/**
 * Returns all pieces of `byColor` that directly attack `(targetRow, targetCol)`.
 */
export function getSquareAttackers(
  board: Board,
  targetRow: number,
  targetCol: number,
  byColor: Color
): { square: Square; piece: Piece }[] {
  const attackers: { square: Square; piece: Piece }[] = [];

  // Pawn attackers
  const pawnSourceRow = byColor === 'w' ? targetRow + 1 : targetRow - 1;
  for (const dc of [-1, 1]) {
    const c = targetCol + dc;
    if (isInsideBoard(pawnSourceRow, c)) {
      const p = board[pawnSourceRow][c];
      if (p && p.color === byColor && p.type === 'p') {
        attackers.push({ square: coordsToSquare(pawnSourceRow, c), piece: p });
      }
    }
  }

  // Knight attackers
  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const r = targetRow + dr;
    const c = targetCol + dc;
    if (isInsideBoard(r, c)) {
      const p = board[r][c];
      if (p && p.color === byColor && p.type === 'n') {
        attackers.push({ square: coordsToSquare(r, c), piece: p });
      }
    }
  }

  // King attackers
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = targetRow + dr;
      const c = targetCol + dc;
      if (isInsideBoard(r, c)) {
        const p = board[r][c];
        if (p && p.color === byColor && p.type === 'k') {
          attackers.push({ square: coordsToSquare(r, c), piece: p });
        }
      }
    }
  }

  // Orthogonal attackers
  for (const [dr, dc] of ORTHO_DIRS) {
    let r = targetRow + dr;
    let c = targetCol + dc;
    while (isInsideBoard(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q')) {
          attackers.push({ square: coordsToSquare(r, c), piece: p });
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // Diagonal attackers
  for (const [dr, dc] of DIAG_DIRS) {
    let r = targetRow + dr;
    let c = targetCol + dc;
    while (isInsideBoard(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q')) {
          attackers.push({ square: coordsToSquare(r, c), piece: p });
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return attackers;
}

export function isKingInCheck(board: Board, color: Color): boolean {
  const kingSq = findKingSquare(board, color);
  if (!kingSq) return false;
  const { row, col } = squareToCoords(kingSq);
  return isSquareAttacked(board, row, col, oppositeColor(color));
}

/**
 * Generates all pseudo-legal moves for the active player in `state`.
 */
export function generatePseudoLegalMoves(state: GameState): Move[] {
  const { board, turn, castlingRights, enPassantTarget } = state;
  const moves: Move[] = [];
  const enemy = oppositeColor(turn);

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== turn) continue;
      const from = coordsToSquare(r, c);

      if (piece.type === 'p') {
        const dir = turn === 'w' ? -1 : 1;
        const startRow = turn === 'w' ? 6 : 1;
        const promoRow = turn === 'w' ? 0 : 7;

        // 1. Single square forward push
        const nextRow = r + dir;
        if (isInsideBoard(nextRow, c) && !board[nextRow][c]) {
          const to = coordsToSquare(nextRow, c);
          if (nextRow === promoRow) {
            for (const promo of PROMOTION_TYPES) {
              moves.push({ from, to, piece, promotion: promo });
            }
          } else {
            moves.push({ from, to, piece });

            // 2. Two-square advance from starting rank
            const doubleRow = r + dir * 2;
            if (r === startRow && isInsideBoard(doubleRow, c) && !board[doubleRow][c]) {
              moves.push({
                from,
                to: coordsToSquare(doubleRow, c),
                piece,
              });
            }
          }
        }

        // 3. Diagonal captures & En Passant
        for (const dc of [-1, 1]) {
          const capCol = c + dc;
          if (!isInsideBoard(nextRow, capCol)) continue;
          const to = coordsToSquare(nextRow, capCol);
          const targetPiece = board[nextRow][capCol];

          if (targetPiece && targetPiece.color === enemy) {
            if (nextRow === promoRow) {
              for (const promo of PROMOTION_TYPES) {
                moves.push({
                  from,
                  to,
                  piece,
                  captured: targetPiece,
                  promotion: promo,
                });
              }
            } else {
              moves.push({
                from,
                to,
                piece,
                captured: targetPiece,
              });
            }
          } else if (enPassantTarget && to === enPassantTarget) {
            // En passant capture: the captured enemy pawn sits on (r, capCol)
            const epCapturedPawn = board[r][capCol];
            if (epCapturedPawn && epCapturedPawn.color === enemy && epCapturedPawn.type === 'p') {
              moves.push({
                from,
                to,
                piece,
                captured: epCapturedPawn,
                isEnPassant: true,
              });
            }
          }
        }
      } else if (piece.type === 'n') {
        for (const [dr, dc] of KNIGHT_OFFSETS) {
          const nr = r + dr;
          const nc = c + dc;
          if (!isInsideBoard(nr, nc)) continue;
          const target = board[nr][nc];
          if (!target) {
            moves.push({ from, to: coordsToSquare(nr, nc), piece });
          } else if (target.color === enemy) {
            moves.push({
              from,
              to: coordsToSquare(nr, nc),
              piece,
              captured: target,
            });
          }
        }
      } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
        const dirs =
          piece.type === 'b'
            ? DIAG_DIRS
            : piece.type === 'r'
            ? ORTHO_DIRS
            : QUEEN_DIRS;
        for (const [dr, dc] of dirs) {
          let nr = r + dr;
          let nc = c + dc;
          while (isInsideBoard(nr, nc)) {
            const target = board[nr][nc];
            if (!target) {
              moves.push({ from, to: coordsToSquare(nr, nc), piece });
            } else {
              if (target.color === enemy) {
                moves.push({
                  from,
                  to: coordsToSquare(nr, nc),
                  piece,
                  captured: target,
                });
              }
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
      } else if (piece.type === 'k') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (!isInsideBoard(nr, nc)) continue;
            const target = board[nr][nc];
            if (!target) {
              moves.push({ from, to: coordsToSquare(nr, nc), piece });
            } else if (target.color === enemy) {
              moves.push({
                from,
                to: coordsToSquare(nr, nc),
                piece,
                captured: target,
              });
            }
          }
        }

        // Castling moves
        const homeRow = turn === 'w' ? 7 : 0;
        if (r === homeRow && c === 4) {
          const kingCurrentlyInCheck = isSquareAttacked(board, homeRow, 4, enemy);
          if (!kingCurrentlyInCheck) {
            // King-side (O-O): squares f (col 5) and g (col 6) must be empty and not attacked
            const canCastleK = turn === 'w' ? castlingRights.wK : castlingRights.bK;
            const kingsideRook = board[homeRow][7];
            if (
              canCastleK &&
              kingsideRook &&
              kingsideRook.color === turn &&
              kingsideRook.type === 'r' &&
              !board[homeRow][5] &&
              !board[homeRow][6] &&
              !isSquareAttacked(board, homeRow, 5, enemy) &&
              !isSquareAttacked(board, homeRow, 6, enemy)
            ) {
              moves.push({
                from,
                to: coordsToSquare(homeRow, 6),
                piece,
                isCastle: 'K',
              });
            }

            // Queen-side (O-O-O): squares b (col 1), c (col 2), d (col 3) must be empty;
            // squares d (col 3) and c (col 2) must not be under attack
            const canCastleQ = turn === 'w' ? castlingRights.wQ : castlingRights.bQ;
            const queensideRook = board[homeRow][0];
            if (
              canCastleQ &&
              queensideRook &&
              queensideRook.color === turn &&
              queensideRook.type === 'r' &&
              !board[homeRow][1] &&
              !board[homeRow][2] &&
              !board[homeRow][3] &&
              !isSquareAttacked(board, homeRow, 3, enemy) &&
              !isSquareAttacked(board, homeRow, 2, enemy)
            ) {
              moves.push({
                from,
                to: coordsToSquare(homeRow, 2),
                piece,
                isCastle: 'Q',
              });
            }
          }
        }
      }
    }
  }

  return moves;
}

/**
 * Applies a move onto a cloned board (without modifying `board`) and returns the resulting board.
 */
export function applyMoveToBoard(board: Board, move: Move): Board {
  const next = cloneBoard(board);
  const fromCoords = squareToCoords(move.from);
  const toCoords = squareToCoords(move.to);

  if (
    !isInsideBoard(fromCoords.row, fromCoords.col) ||
    !isInsideBoard(toCoords.row, toCoords.col)
  ) {
    return next;
  }

  next[fromCoords.row][fromCoords.col] = null;

  if (move.isEnPassant) {
    // Remove captured pawn on the starting row of the capturing pawn and column of target
    next[fromCoords.row][toCoords.col] = null;
  }

  if (move.isCastle === 'K') {
    const row = fromCoords.row;
    const rook = next[row][7];
    next[row][7] = null;
    next[row][5] = rook;
  } else if (move.isCastle === 'Q') {
    const row = fromCoords.row;
    const rook = next[row][0];
    next[row][0] = null;
    next[row][3] = rook;
  }

  if (move.promotion) {
    next[toCoords.row][toCoords.col] = {
      type: move.promotion,
      color: move.piece.color,
    };
  } else {
    next[toCoords.row][toCoords.col] = { ...move.piece };
  }

  return next;
}

/**
 * Returns all pieces of `byColor` that can legally capture or recapture on `(targetRow, targetCol)`
 * without leaving `byColor`'s own King in check (filtering out absolutely pinned pieces whose
 * pin ray does not align with the capture, as well as King captures onto defended squares).
 */
export function getLegalSquareAttackers(
  board: Board,
  targetRow: number,
  targetCol: number,
  byColor: Color
): { square: Square; piece: Piece }[] {
  const pseudoAttackers = getSquareAttackers(board, targetRow, targetCol, byColor);
  if (pseudoAttackers.length === 0) return [];

  const targetSquare = coordsToSquare(targetRow, targetCol);
  return pseudoAttackers.filter((attacker) => {
    const simMove: Move = {
      from: attacker.square,
      to: targetSquare,
      piece: attacker.piece,
    };
    const nextBoard = applyMoveToBoard(board, simMove);
    return !isKingInCheck(nextBoard, byColor);
  });
}

/**
 * Generates all strictly legal FIDE moves for the active player in `state`.
 * Filters out any pseudo-legal move that leaves the current player's King in check.
 */
export function generateLegalMoves(state: GameState): Move[] {
  const pseudoMoves = generatePseudoLegalMoves(state);
  const legalMoves: Move[] = [];

  for (const move of pseudoMoves) {
    const nextBoard = applyMoveToBoard(state.board, move);
    if (!isKingInCheck(nextBoard, state.turn)) {
      legalMoves.push(move);
    }
  }

  return legalMoves;
}

/**
 * Evaluates whether the board has insufficient material to force checkmate:
 * - King vs. King
 * - King + Bishop vs. King
 * - King + Knight vs. King
 * - King + Bishop(s) vs. King + Bishop(s) when all Bishops reside on the same square color
 */
export function isInsufficientMaterial(board: Board): boolean {
  const pieces: { piece: Piece; row: number; col: number }[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (p) {
        if (p.type === 'p' || p.type === 'r' || p.type === 'q') {
          return false;
        }
        if (p.type !== 'k') {
          pieces.push({ piece: p, row: r, col: c });
        }
      }
    }
  }

  // King vs. King
  if (pieces.length === 0) return true;

  // King + Single Minor Piece (Bishop or Knight) vs. King
  if (pieces.length === 1) {
    const t = pieces[0].piece.type;
    if (t === 'b' || t === 'n') return true;
  }

  // Two minor pieces on board:
  // 1. King + Knight vs. King + Knight (neither side can force checkmate)
  // 2. King + 2 Knights vs. bare King (forced checkmate is impossible)
  if (pieces.length === 2) {
    if (pieces[0].piece.type === 'n' && pieces[1].piece.type === 'n') {
      return true;
    }
  }

  // Any number of Bishops (and no Knights) where every Bishop is on the same square color
  if (pieces.every((p) => p.piece.type === 'b')) {
    const firstSquareColor = (pieces[0].row + pieces[0].col) % 2;
    if (pieces.every((p) => (p.row + p.col) % 2 === firstSquareColor)) {
      return true;
    }
  }

  return false;
}

/**
 * Formats a legal move in Standard Algebraic Notation (SAN), including disambiguation
 * and check (+) / checkmate (#) suffixes.
 */
export function formatMoveSan(
  state: GameState,
  move: Move,
  allLegalMoves: Move[],
  nextBoard: Board,
  opponentHasLegalMoves: boolean,
  opponentInCheck: boolean
): string {
  let san = '';

  if (move.isCastle === 'K') {
    san = 'O-O';
  } else if (move.isCastle === 'Q') {
    san = 'O-O-O';
  } else if (move.piece.type === 'p') {
    if (move.captured) {
      san = `${move.from[0]}x${move.to}`;
    } else {
      san = move.to;
    }
    if (move.promotion) {
      san += `=${move.promotion.toUpperCase()}`;
    }
  } else {
    const pieceLetter = move.piece.type.toUpperCase();
    // Check if another piece of the same type & color can also legally move to `move.to`
    const ambiguous = allLegalMoves.filter(
      (m) =>
        m !== move &&
        m.from !== move.from &&
        m.to === move.to &&
        m.piece.type === move.piece.type &&
        m.piece.color === move.piece.color
    );

    let disambig = '';
    if (ambiguous.length > 0) {
      const sameFile = ambiguous.some((m) => m.from[0] === move.from[0]);
      const sameRank = ambiguous.some((m) => m.from[1] === move.from[1]);
      if (!sameFile) {
        disambig = move.from[0];
      } else if (!sameRank) {
        disambig = move.from[1];
      } else {
        disambig = move.from;
      }
    }

    const captureStr = move.captured ? 'x' : '';
    san = `${pieceLetter}${disambig}${captureStr}${move.to}`;
  }

  if (opponentInCheck) {
    san += opponentHasLegalMoves ? '+' : '#';
  }

  return san;
}

/**
 * Executes a legal move and returns the next immutable `GameState`.
 * Throws an error if the move is not legal.
 */
export function makeMove(state: GameState, candidateMove: Move): GameState {
  if (!isValidSquare(candidateMove.from) || !isValidSquare(candidateMove.to)) {
    throw new Error(
      `Invalid square coordinates: ${String(candidateMove.from)} -> ${String(candidateMove.to)}`
    );
  }

  const legalMoves = generateLegalMoves(state);
  const matchedMove = legalMoves.find(
    (m) =>
      m.from === candidateMove.from &&
      m.to === candidateMove.to &&
      (m.promotion ?? undefined) === (candidateMove.promotion ?? undefined)
  );

  if (!matchedMove) {
    throw new Error(
      `Illegal move attempted: ${candidateMove.from} -> ${candidateMove.to}`
    );
  }

  const nextBoard = applyMoveToBoard(state.board, matchedMove);
  const nextTurn = oppositeColor(state.turn);

  // Update castling rights
  const nextCastling: CastlingRights = { ...state.castlingRights };
  if (matchedMove.piece.type === 'k') {
    if (state.turn === 'w') {
      nextCastling.wK = false;
      nextCastling.wQ = false;
    } else {
      nextCastling.bK = false;
      nextCastling.bQ = false;
    }
  }
  // If a rook moves from or is captured on its original corner square, revoke that right
  if (matchedMove.from === 'h1' || matchedMove.to === 'h1') nextCastling.wK = false;
  if (matchedMove.from === 'a1' || matchedMove.to === 'a1') nextCastling.wQ = false;
  if (matchedMove.from === 'h8' || matchedMove.to === 'h8') nextCastling.bK = false;
  if (matchedMove.from === 'a8' || matchedMove.to === 'a8') nextCastling.bQ = false;

  // Update En Passant target square
  let nextEnPassant: Square | null = null;
  if (matchedMove.piece.type === 'p') {
    const fromCoords = squareToCoords(matchedMove.from);
    const toCoords = squareToCoords(matchedMove.to);
    if (Math.abs(toCoords.row - fromCoords.row) === 2) {
      const epRow = (fromCoords.row + toCoords.row) / 2;
      nextEnPassant = coordsToSquare(epRow, fromCoords.col);
    }
  }

  // Update half-move clock (resets on pawn move or capture)
  const nextHalfMoveClock =
    matchedMove.piece.type === 'p' || matchedMove.captured
      ? 0
      : state.halfMoveClock + 1;

  const nextFullMoveNumber =
    state.turn === 'b' ? state.fullMoveNumber + 1 : state.fullMoveNumber;

  // Update captured pieces
  const capturedByWhite = [...state.capturedByWhite];
  const capturedByBlack = [...state.capturedByBlack];
  if (matchedMove.captured) {
    if (state.turn === 'w') {
      capturedByWhite.push(matchedMove.captured.type);
    } else {
      capturedByBlack.push(matchedMove.captured.type);
    }
  }

  // Sort captured pieces by descending value for clean display
  const sortCaptured = (arr: PieceType[]) =>
    arr.sort((a, b) => PIECE_VALUES[b] - PIECE_VALUES[a]);
  sortCaptured(capturedByWhite);
  sortCaptured(capturedByBlack);

  // Compute position hash for repetition tracking
  const nextHash = computePositionHash(
    nextBoard,
    nextTurn,
    nextCastling,
    nextEnPassant
  );
  const nextPositionCounts = {
    ...state.positionCounts,
    [nextHash]: (state.positionCounts[nextHash] ?? 0) + 1,
  };

  // Construct temporary next state to evaluate opponent's legal moves and check status
  const tempNextState: GameState = {
    board: nextBoard,
    turn: nextTurn,
    castlingRights: nextCastling,
    enPassantTarget: nextEnPassant,
    halfMoveClock: nextHalfMoveClock,
    fullMoveNumber: nextFullMoveNumber,
    positionCounts: nextPositionCounts,
    moveHistory: state.moveHistory,
    capturedByWhite,
    capturedByBlack,
    status: 'playing',
    winner: null,
    inCheck: false,
    lastMove: { from: matchedMove.from, to: matchedMove.to },
  };

  const opponentInCheck = isKingInCheck(nextBoard, nextTurn);
  const opponentLegalMoves = generateLegalMoves(tempNextState);
  const opponentHasLegalMoves = opponentLegalMoves.length > 0;

  // Determine game status & draw conditions
  let nextStatus: GameStatus = 'playing';
  let winner: Color | 'draw' | null = null;

  if (!opponentHasLegalMoves) {
    if (opponentInCheck) {
      nextStatus = 'checkmate';
      winner = state.turn;
    } else {
      nextStatus = 'stalemate';
      winner = 'draw';
    }
  } else if (isInsufficientMaterial(nextBoard)) {
    nextStatus = 'draw_insufficient';
    winner = 'draw';
  } else if (nextPositionCounts[nextHash] >= FIVEFOLD_REPETITION_LIMIT) {
    nextStatus = 'draw_fivefold_repetition';
    winner = 'draw';
  } else if (nextPositionCounts[nextHash] >= THREEFOLD_REPETITION_LIMIT) {
    nextStatus = 'draw_repetition';
    winner = 'draw';
  } else if (nextHalfMoveClock >= SEVENTY_FIVE_MOVE_LIMIT) {
    nextStatus = 'draw_seventy_five_move';
    winner = 'draw';
  } else if (nextHalfMoveClock >= FIFTY_MOVE_HALF_MOVE_LIMIT) {
    nextStatus = 'draw_fifty_move';
    winner = 'draw';
  }

  const san = formatMoveSan(
    state,
    matchedMove,
    legalMoves,
    nextBoard,
    opponentHasLegalMoves,
    opponentInCheck
  );

  const moveWithSan: Move = { ...matchedMove, san };

  return {
    ...tempNextState,
    inCheck: opponentInCheck,
    status: nextStatus,
    winner,
    moveHistory: [
      ...state.moveHistory,
      {
        move: moveWithSan,
        san,
        fenHash: nextHash,
        turnNumber: state.fullMoveNumber,
        color: state.turn,
      },
    ],
  };
}

/**
 * Computes material score for White and Black and net balance.
 */
export function calculateMaterialBalance(board: Board): {
  whitePoints: number;
  blackPoints: number;
  diff: number; // whitePoints - blackPoints
} {
  let whitePoints = 0;
  let blackPoints = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = MATERIAL_DISPLAY_VALUES[p.type];
      if (p.color === 'w') whitePoints += val;
      else blackPoints += val;
    }
  }
  return {
    whitePoints,
    blackPoints,
    diff: whitePoints - blackPoints,
  };
}

/**
 * Checks whether a user-planned right-click arrow from `from` to `to` is valid.
 * Supports free-form tactical annotations and candidate lines between any two valid squares.
 */
export function canPlanArrow(
  state: GameState,
  legalMoves: Move[],
  from: Square,
  to: Square
): boolean {
  if (!isValidSquare(from) || !isValidSquare(to) || from === to) {
    return false;
  }
  return true;
}

/**
 * Toggles or adds a user-planned arrow if and only if the move is legal.
 * Returns the updated array of planned arrows.
 */
export function togglePlannedArrow(
  arrows: PlannedArrow[],
  state: GameState,
  legalMoves: Move[],
  from: Square,
  to: Square
): PlannedArrow[] {
  if (!canPlanArrow(state, legalMoves, from, to)) {
    return arrows;
  }
  const exists = arrows.some((a) => a.from === from && a.to === to);
  if (exists) {
    return arrows.filter((a) => !(a.from === from && a.to === to));
  }
  return [...arrows, { from, to }];
}

/**
 * Computes the visual square offset (dCol, dRow) from `from` to `to`
 * so a piece on `to` can animate smoothly from its origin square.
 */
export function computeSlideOffset(
  from: Square,
  to: Square,
  isFlipped: boolean
): { dCol: number; dRow: number } {
  if (!isValidSquare(from) || !isValidSquare(to)) {
    return { dCol: 0, dRow: 0 };
  }
  const fromCoords = squareToCoords(from);
  const toCoords = squareToCoords(to);
  const sign = isFlipped ? -1 : 1;
  const rawCol = (fromCoords.col - toCoords.col) * sign;
  const rawRow = (fromCoords.row - toCoords.row) * sign;
  return {
    dCol: rawCol === 0 ? 0 : rawCol,
    dRow: rawRow === 0 ? 0 : rawRow,
  };
}

/**
 * Determines whether an Undo action is legal given the current stateStack.
 * In vs. AI mode, allows undoing whenever there is a preceding state where it was
 * the human player's turn (including during the AI's turn while thinking).
 */
export function canUndoState(
  stateStack: GameState[],
  gameMode: GameMode,
  playerColor: Color
): boolean {
  if (stateStack.length <= 1) return false;
  if (gameMode === 'ai') {
    for (let i = stateStack.length - 2; i >= 0; i--) {
      if (stateStack[i].turn === playerColor) return true;
    }
    return false;
  }
  return true;
}

/**
 * Rewinds the state stack back to the human player's turn (in vs AI mode)
 * or the previous ply (in pass-and-play mode).
 * Works seamlessly whether called on the player's turn or during the AI's turn (thinking).
 */
export function rewindStateStack(
  stateStack: GameState[],
  gameMode: GameMode,
  playerColor: Color
): GameState[] {
  if (stateStack.length <= 1) return stateStack;
  if (gameMode === 'ai') {
    for (let i = stateStack.length - 2; i >= 0; i--) {
      if (stateStack[i].turn === playerColor) {
        return stateStack.slice(0, i + 1);
      }
    }
    return stateStack;
  }
  return stateStack.slice(0, stateStack.length - 1);
}

/**
 * Parses a standard Forsyth-Edwards Notation (FEN) string into a verified GameState.
 * Validates piece counts (exactly 1 White King and 1 Black King), turn, castling rights,
 * en passant square, checks, and terminal game status. Returns null if invalid.
 */
export function fenToGameState(fen: string): GameState | null {
  try {
    const trimmed = fen.trim();
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 4) {
      return null;
    }

    const [
      placement,
      activeColorStr,
      castlingStr,
      epStr,
      halfMoveStr = '0',
      fullMoveStr = '1',
    ] = tokens;

    // 1. Validate active color
    if (activeColorStr !== 'w' && activeColorStr !== 'b') {
      return null;
    }
    const turn: Color = activeColorStr;

    // 2. Validate placement
    const rankStrs = placement.split('/');
    if (rankStrs.length !== BOARD_SIZE) {
      return null;
    }

    const board: Board = Array.from({ length: BOARD_SIZE }, () =>
      Array(BOARD_SIZE).fill(null)
    );
    let whiteKingCount = 0;
    let blackKingCount = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
      const rankStr = rankStrs[r];
      let col = 0;
      for (let i = 0; i < rankStr.length; i++) {
        const ch = rankStr[i];
        if (ch >= '1' && ch <= '8') {
          col += Number(ch);
        } else {
          const lower = ch.toLowerCase();
          if (!['p', 'n', 'b', 'r', 'q', 'k'].includes(lower)) {
            return null;
          }
          if (col >= BOARD_SIZE) {
            return null;
          }
          const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
          const type = lower as PieceType;
          if (type === 'k') {
            if (color === 'w') whiteKingCount++;
            else blackKingCount++;
          }
          board[r][col] = { type, color };
          col++;
        }
      }
      if (col !== BOARD_SIZE) {
        return null;
      }
    }

    if (whiteKingCount !== 1 || blackKingCount !== 1) {
      return null;
    }

    // The opponent cannot already be in check
    const opponent = oppositeColor(turn);
    if (isKingInCheck(board, opponent)) {
      return null;
    }

  // 3. Castling rights
  const castlingRights: CastlingRights = {
    wK: castlingStr.includes('K'),
    wQ: castlingStr.includes('Q'),
    bK: castlingStr.includes('k'),
    bQ: castlingStr.includes('q'),
  };

  // 4. En Passant target
  let enPassantTarget: Square | null = null;
  if (epStr !== '-' && epStr.length === 2 && isValidSquare(epStr)) {
    enPassantTarget = epStr;
  }

  // 5. Halfmove clock and fullmove number
  const halfMoveClock = Math.max(0, parseInt(halfMoveStr, 10) || 0);
  const fullMoveNumber = Math.max(1, parseInt(fullMoveStr, 10) || 1);

  const hash = computePositionHash(board, turn, castlingRights, enPassantTarget);
  const inCheck = isKingInCheck(board, turn);

  const tempState: GameState = {
    board,
    turn,
    castlingRights,
    enPassantTarget,
    halfMoveClock,
    fullMoveNumber,
    positionCounts: { [hash]: 1 },
    moveHistory: [],
    capturedByWhite: [],
    capturedByBlack: [],
    status: 'playing',
    winner: null,
    inCheck,
    lastMove: null,
  };

  const legalMoves = generateLegalMoves(tempState);
  let status: GameStatus = 'playing';
  let winner: Color | 'draw' | null = null;

  if (legalMoves.length === 0) {
    if (inCheck) {
      status = 'checkmate';
      winner = opponent;
    } else {
      status = 'stalemate';
      winner = 'draw';
    }
  } else if (isInsufficientMaterial(board)) {
    status = 'draw_insufficient';
    winner = 'draw';
  } else if (halfMoveClock >= SEVENTY_FIVE_MOVE_LIMIT) {
    status = 'draw_seventy_five_move';
    winner = 'draw';
  } else if (halfMoveClock >= FIFTY_MOVE_HALF_MOVE_LIMIT) {
    status = 'draw_fifty_move';
    winner = 'draw';
  }

  return {
    ...tempState,
    status,
    winner,
  };
  } catch {
    return null;
  }
}


