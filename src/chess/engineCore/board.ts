import {
  BB,
  BISHOP,
  BK,
  BLACK,
  BN,
  BP,
  BQ,
  BR,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  COLOR_BIT,
  EMPTY,
  encodeMove,
  FastMove,
  KING,
  KNIGHT,
  MAX_GAME_PLY,
  MOVE_FLAG_CASTLE_K,
  MOVE_FLAG_CASTLE_Q,
  MOVE_FLAG_DOUBLE_PUSH,
  MOVE_FLAG_EP,
  PAWN,
  pieceCodeFromPiece,
  pieceTypeToChar,
  promoTypeToChar,
  QUEEN,
  ROOK,
  sq88ToAlgebraic,
  algebraicToSq88,
  WB,
  WHITE,
  WK,
  WN,
  WP,
  WQ,
  WR,
} from './types';
import {
  BISHOP_DIRS_88,
  CASTLING_MASK,
  KING_OFFSETS_88,
  KNIGHT_OFFSETS_88,
  MAT_EG_SIGNED,
  MAT_MG_SIGNED,
  PIECE_PHASE,
  PST_EG_SIGNED,
  PST_MG_SIGNED,
  QUEEN_DIRS_88,
  ROOK_DIRS_88,
  SEE_VALUE,
  ZOBRIST_CASTLE_HI,
  ZOBRIST_CASTLE_LO,
  ZOBRIST_EP_HI,
  ZOBRIST_EP_LO,
  ZOBRIST_PIECE_HI,
  ZOBRIST_PIECE_LO,
  ZOBRIST_SIDE_HI,
  ZOBRIST_SIDE_LO,
} from './tables';
import { GameState, Move } from '../types';

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PROMO_TYPES_ALL = new Int8Array([QUEEN, ROOK, BISHOP, KNIGHT]);

/**
 * High-performance, zero-allocation 0x88 chess board with:
 * - Compact piece-lists (O(1) add/remove/move; iterate only live pieces)
 * - Incremental 64-bit Zobrist hashing (split into two 32-bit uints, zero BigInt)
 * - Incremental PeSTO MG/EG material, PST, and game phase tracking
 * - Pre-allocated TypedArray undo & repetition history stacks
 * - Zero-allocation X-ray Static Exchange Evaluation (SEE)
 */
export class FastBoard {
  // 0x88 board: sq = (row << 4) | col, row 0 = rank 8, row 7 = rank 1
  public readonly squares = new Int8Array(128);

  // Piece lists: stride 16 per pieceCode (pieceCode in 1..14)
  public readonly pieceList = new Int8Array(16 * 16);
  public readonly pieceCount = new Int8Array(16);
  public readonly pieceIndex = new Int8Array(128);

  // King square per color (0 = White, 1 = Black)
  public readonly kingSq = new Int8Array(2);

  public side = WHITE;
  public castling = 0;
  public epSq = -1;
  public halfMoveClock = 0;
  public fullMoveNumber = 1;

  // Incremental 64-bit Zobrist hash (two unsigned 32-bit ints)
  public hashHi = 0;
  public hashLo = 0;

  // Incremental PeSTO evaluation accumulators (White perspective)
  public matMg = 0;
  public matEg = 0;
  public pstMg = 0;
  public pstEg = 0;
  public phase = 0;

  // Undo & repetition history stacks (pre-allocated)
  public ply = 0;
  public readonly undoMove = new Int32Array(MAX_GAME_PLY);
  public readonly undoCastling = new Uint8Array(MAX_GAME_PLY);
  public readonly undoEpSq = new Int16Array(MAX_GAME_PLY);
  public readonly undoHalfMove = new Int16Array(MAX_GAME_PLY);
  public readonly undoHashHi = new Uint32Array(MAX_GAME_PLY);
  public readonly undoHashLo = new Uint32Array(MAX_GAME_PLY);
  public readonly undoMatMg = new Int32Array(MAX_GAME_PLY);
  public readonly undoMatEg = new Int32Array(MAX_GAME_PLY);
  public readonly undoPstMg = new Int32Array(MAX_GAME_PLY);
  public readonly undoPstEg = new Int32Array(MAX_GAME_PLY);
  public readonly undoPhase = new Int16Array(MAX_GAME_PLY);

  // Pre-allocated SEE scratch buffers (zero heap allocation)
  private readonly seeGain = new Int32Array(32);
  private readonly seeRemoved = new Uint8Array(128);
  private seeStamp = 1;

  constructor() {
    this.loadFen(START_FEN);
  }

  public clear(): void {
    this.squares.fill(EMPTY);
    this.pieceList.fill(0);
    this.pieceCount.fill(0);
    this.pieceIndex.fill(-1);
    this.kingSq[WHITE] = -1;
    this.kingSq[BLACK] = -1;
    this.side = WHITE;
    this.castling = 0;
    this.epSq = -1;
    this.halfMoveClock = 0;
    this.fullMoveNumber = 1;
    this.hashHi = 0;
    this.hashLo = 0;
    this.matMg = 0;
    this.matEg = 0;
    this.pstMg = 0;
    this.pstEg = 0;
    this.phase = 0;
    this.ply = 0;
  }

  private addPiece(piece: number, sq: number): void {
    this.squares[sq] = piece;
    const count = this.pieceCount[piece];
    this.pieceList[(piece << 4) | count] = sq;
    this.pieceIndex[sq] = count;
    this.pieceCount[piece] = count + 1;

    if (piece === WK) this.kingSq[WHITE] = sq;
    else if (piece === BK) this.kingSq[BLACK] = sq;

    const zIdx = (piece << 7) | sq;
    this.hashHi = (this.hashHi ^ ZOBRIST_PIECE_HI[zIdx]) >>> 0;
    this.hashLo = (this.hashLo ^ ZOBRIST_PIECE_LO[zIdx]) >>> 0;

    this.matMg += MAT_MG_SIGNED[piece];
    this.matEg += MAT_EG_SIGNED[piece];
    this.pstMg += PST_MG_SIGNED[zIdx];
    this.pstEg += PST_EG_SIGNED[zIdx];
    this.phase += PIECE_PHASE[piece];
  }

  private removePiece(piece: number, sq: number): void {
    this.squares[sq] = EMPTY;
    const idx = this.pieceIndex[sq];
    const lastIdx = this.pieceCount[piece] - 1;
    this.pieceCount[piece] = lastIdx;
    if (idx !== lastIdx) {
      const movedSq = this.pieceList[(piece << 4) | lastIdx];
      this.pieceList[(piece << 4) | idx] = movedSq;
      this.pieceIndex[movedSq] = idx;
    }
    this.pieceIndex[sq] = -1;

    const zIdx = (piece << 7) | sq;
    this.hashHi = (this.hashHi ^ ZOBRIST_PIECE_HI[zIdx]) >>> 0;
    this.hashLo = (this.hashLo ^ ZOBRIST_PIECE_LO[zIdx]) >>> 0;

    this.matMg -= MAT_MG_SIGNED[piece];
    this.matEg -= MAT_EG_SIGNED[piece];
    this.pstMg -= PST_MG_SIGNED[zIdx];
    this.pstEg -= PST_EG_SIGNED[zIdx];
    this.phase -= PIECE_PHASE[piece];
  }

  private movePiece(piece: number, from: number, to: number): void {
    this.squares[from] = EMPTY;
    this.squares[to] = piece;
    const idx = this.pieceIndex[from];
    this.pieceList[(piece << 4) | idx] = to;
    this.pieceIndex[to] = idx;
    this.pieceIndex[from] = -1;

    if (piece === WK) this.kingSq[WHITE] = to;
    else if (piece === BK) this.kingSq[BLACK] = to;

    const fromIdx = (piece << 7) | from;
    const toIdx = (piece << 7) | to;
    this.hashHi =
      (this.hashHi ^ ZOBRIST_PIECE_HI[fromIdx] ^ ZOBRIST_PIECE_HI[toIdx]) >>> 0;
    this.hashLo =
      (this.hashLo ^ ZOBRIST_PIECE_LO[fromIdx] ^ ZOBRIST_PIECE_LO[toIdx]) >>> 0;

    this.pstMg += PST_MG_SIGNED[toIdx] - PST_MG_SIGNED[fromIdx];
    this.pstEg += PST_EG_SIGNED[toIdx] - PST_EG_SIGNED[fromIdx];
  }

  /**
   * Loads a standard FEN string into this FastBoard.
   */
  public loadFen(fen: string): boolean {
    this.clear();
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) return false;

    const [placement, active, castlingStr, epStr, halfStr = '0', fullStr = '1'] =
      parts;
    const ranks = placement.split('/');
    if (ranks.length !== 8) return false;

    for (let r = 0; r < 8; r++) {
      let c = 0;
      const rank = ranks[r];
      for (let i = 0; i < rank.length; i++) {
        const ch = rank[i];
        if (ch >= '1' && ch <= '8') {
          c += ch.charCodeAt(0) - 48;
        } else {
          if (c >= 8) return false;
          const sq = (r << 4) | c;
          let piece = EMPTY;
          switch (ch) {
            case 'P': piece = WP; break;
            case 'N': piece = WN; break;
            case 'B': piece = WB; break;
            case 'R': piece = WR; break;
            case 'Q': piece = WQ; break;
            case 'K': piece = WK; break;
            case 'p': piece = BP; break;
            case 'n': piece = BN; break;
            case 'b': piece = BB; break;
            case 'r': piece = BR; break;
            case 'q': piece = BQ; break;
            case 'k': piece = BK; break;
            default: return false;
          }
          this.addPiece(piece, sq);
          c++;
        }
      }
      if (c !== 8) return false;
    }

    this.side = active === 'b' ? BLACK : WHITE;
    if (this.side === BLACK) {
      this.hashHi = (this.hashHi ^ ZOBRIST_SIDE_HI) >>> 0;
      this.hashLo = (this.hashLo ^ ZOBRIST_SIDE_LO) >>> 0;
    }

    let cMask = 0;
    if (castlingStr.includes('K')) cMask |= CASTLE_WK;
    if (castlingStr.includes('Q')) cMask |= CASTLE_WQ;
    if (castlingStr.includes('k')) cMask |= CASTLE_BK;
    if (castlingStr.includes('q')) cMask |= CASTLE_BQ;
    this.castling = cMask;
    this.hashHi = (this.hashHi ^ ZOBRIST_CASTLE_HI[cMask]) >>> 0;
    this.hashLo = (this.hashLo ^ ZOBRIST_CASTLE_LO[cMask]) >>> 0;

    if (epStr && epStr !== '-') {
      const ep = algebraicToSq88(epStr);
      if (ep !== -1) {
        this.epSq = ep;
        this.hashHi = (this.hashHi ^ ZOBRIST_EP_HI[ep]) >>> 0;
        this.hashLo = (this.hashLo ^ ZOBRIST_EP_LO[ep]) >>> 0;
      }
    }

    this.halfMoveClock = Math.max(0, parseInt(halfStr, 10) || 0);
    this.fullMoveNumber = Math.max(1, parseInt(fullStr, 10) || 1);
    return true;
  }

  /**
   * Loads an app `GameState` directly into this FastBoard, optionally replaying
   * `moveHistory` from the starting position when standard so repetition history is exact.
   */
  public loadGameState(state: GameState): void {
    // Fast path: if game started from standard startpos and has moveHistory,
    // verify by replaying moves so hashHistory contains all prior game positions.
    if (state.moveHistory && state.moveHistory.length > 0 && state.moveHistory.length < MAX_GAME_PLY - 128) {
      this.loadFen(START_FEN);
      let replayOk = true;
      const tmpMoves = new Int32Array(256);
      for (let i = 0; i < state.moveHistory.length; i++) {
        const rec = state.moveHistory[i].move;
        const fromSq = algebraicToSq88(rec.from);
        const toSq = algebraicToSq88(rec.to);
        const promoType = rec.promotion
          ? rec.promotion === 'q'
            ? QUEEN
            : rec.promotion === 'r'
            ? ROOK
            : rec.promotion === 'b'
            ? BISHOP
            : KNIGHT
          : 0;
        const end = this.generateMoves(tmpMoves, 0, false);
        let matched = 0;
        for (let j = 0; j < end; j++) {
          const m = tmpMoves[j];
          if (
            (m & 0x7f) === fromSq &&
            ((m >> 7) & 0x7f) === toSq &&
            ((m >> 18) & 0x7) === promoType
          ) {
            matched = m;
            break;
          }
        }
        if (matched === 0) {
          replayOk = false;
          break;
        }
        this.makeMove(matched);
      }

      if (replayOk && this.matchesBoard(state)) {
        return;
      }
    }

    // Direct load from arbitrary custom GameState / FEN position
    this.clear();
    const { board, turn, castlingRights, enPassantTarget } = state;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) {
          this.addPiece(pieceCodeFromPiece(p.type, p.color), (r << 4) | c);
        }
      }
    }

    this.side = turn === 'b' ? BLACK : WHITE;
    if (this.side === BLACK) {
      this.hashHi = (this.hashHi ^ ZOBRIST_SIDE_HI) >>> 0;
      this.hashLo = (this.hashLo ^ ZOBRIST_SIDE_LO) >>> 0;
    }

    let cMask = 0;
    if (castlingRights.wK) cMask |= CASTLE_WK;
    if (castlingRights.wQ) cMask |= CASTLE_WQ;
    if (castlingRights.bK) cMask |= CASTLE_BK;
    if (castlingRights.bQ) cMask |= CASTLE_BQ;
    this.castling = cMask;
    this.hashHi = (this.hashHi ^ ZOBRIST_CASTLE_HI[cMask]) >>> 0;
    this.hashLo = (this.hashLo ^ ZOBRIST_CASTLE_LO[cMask]) >>> 0;

    if (enPassantTarget) {
      const ep = algebraicToSq88(enPassantTarget);
      if (ep !== -1) {
        this.epSq = ep;
        this.hashHi = (this.hashHi ^ ZOBRIST_EP_HI[ep]) >>> 0;
        this.hashLo = (this.hashLo ^ ZOBRIST_EP_LO[ep]) >>> 0;
      }
    }

    this.halfMoveClock = state.halfMoveClock;
    this.fullMoveNumber = state.fullMoveNumber;
  }

  private matchesBoard(state: GameState): boolean {
    if ((this.side === BLACK ? 'b' : 'w') !== state.turn) return false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        const expected = p ? pieceCodeFromPiece(p.type, p.color) : EMPTY;
        if (this.squares[(r << 4) | c] !== expected) return false;
      }
    }
    return true;
  }

  /**
   * Converts a packed `FastMove` into the UI/App `Move` object (used only at API boundary).
   */
  public fastMoveToAppMove(m: FastMove): Move {
    const fromSq = m & 0x7f;
    const toSq = (m >> 7) & 0x7f;
    const capturedCode = (m >> 14) & 0xf;
    const promo = (m >> 18) & 0x7;
    const pieceCode = this.squares[fromSq];
    const color = (pieceCode & COLOR_BIT) !== 0 ? 'b' : 'w';
    const pieceType = pieceTypeToChar(pieceCode & 7);

    const out: Move = {
      from: sq88ToAlgebraic(fromSq),
      to: sq88ToAlgebraic(toSq),
      piece: { type: pieceType, color },
    };

    if (capturedCode !== EMPTY) {
      out.captured = {
        type: pieceTypeToChar(capturedCode & 7),
        color: (capturedCode & COLOR_BIT) !== 0 ? 'b' : 'w',
      };
    }
    if (promo !== 0) {
      out.promotion = promoTypeToChar(promo);
    }
    if ((m & MOVE_FLAG_EP) !== 0) {
      out.isEnPassant = true;
    }
    if ((m & MOVE_FLAG_CASTLE_K) !== 0) {
      out.isCastle = 'K';
    } else if ((m & MOVE_FLAG_CASTLE_Q) !== 0) {
      out.isCastle = 'Q';
    }
    return out;
  }

  /**
   * Checks whether `sq` (0x88) is attacked by any piece belonging to `bySide` (0=W, 1=B).
   */
  public isSquareAttacked(sq: number, bySide: number): boolean {
    const squares = this.squares;
    const colorBit = bySide << 3;

    // 1. Pawn attacks
    if (bySide === WHITE) {
      const pSq1 = sq + 15;
      if ((pSq1 & 0x88) === 0 && squares[pSq1] === WP) return true;
      const pSq2 = sq + 17;
      if ((pSq2 & 0x88) === 0 && squares[pSq2] === WP) return true;
    } else {
      const pSq1 = sq - 15;
      if ((pSq1 & 0x88) === 0 && squares[pSq1] === BP) return true;
      const pSq2 = sq - 17;
      if ((pSq2 & 0x88) === 0 && squares[pSq2] === BP) return true;
    }

    // 2. Knight attacks
    const knight = KNIGHT | colorBit;
    if (this.pieceCount[knight] > 0) {
      for (let i = 0; i < 8; i++) {
        const nSq = sq + KNIGHT_OFFSETS_88[i];
        if ((nSq & 0x88) === 0 && squares[nSq] === knight) return true;
      }
    }

    // 3. King attacks (fast distance check using known kingSq!)
    const kSq = this.kingSq[bySide];
    if (kSq >= 0) {
      const dr = (sq >> 4) - (kSq >> 4);
      const dc = (sq & 7) - (kSq & 7);
      if (dr >= -1 && dr <= 1 && dc >= -1 && dc <= 1 && (dr !== 0 || dc !== 0)) {
        return true;
      }
    }

    // 4. Orthogonal sliding attacks (Rook / Queen)
    const rook = ROOK | colorBit;
    const queen = QUEEN | colorBit;
    if (this.pieceCount[rook] > 0 || this.pieceCount[queen] > 0) {
      for (let i = 0; i < 4; i++) {
        const dir = ROOK_DIRS_88[i];
        let cur = sq + dir;
        while ((cur & 0x88) === 0) {
          const p = squares[cur];
          if (p !== EMPTY) {
            if (p === rook || p === queen) return true;
            break;
          }
          cur += dir;
        }
      }
    }

    // 5. Diagonal sliding attacks (Bishop / Queen)
    const bishop = BISHOP | colorBit;
    if (this.pieceCount[bishop] > 0 || this.pieceCount[queen] > 0) {
      for (let i = 0; i < 4; i++) {
        const dir = BISHOP_DIRS_88[i];
        let cur = sq + dir;
        while ((cur & 0x88) === 0) {
          const p = squares[cur];
          if (p !== EMPTY) {
            if (p === bishop || p === queen) return true;
            break;
          }
          cur += dir;
        }
      }
    }

    return false;
  }

  public isInCheck(side: number = this.side): boolean {
    const kSq = this.kingSq[side];
    return kSq >= 0 && this.isSquareAttacked(kSq, side ^ 1);
  }

  public hasNonPawnMaterial(side: number = this.side): boolean {
    const cb = side << 3;
    return (
      this.pieceCount[KNIGHT | cb] +
        this.pieceCount[BISHOP | cb] +
        this.pieceCount[ROOK | cb] +
        this.pieceCount[QUEEN | cb] >
      0
    );
  }

  public isInsufficientMaterial(): boolean {
    if (
      this.pieceCount[WP] > 0 ||
      this.pieceCount[BP] > 0 ||
      this.pieceCount[WR] > 0 ||
      this.pieceCount[BR] > 0 ||
      this.pieceCount[WQ] > 0 ||
      this.pieceCount[BQ] > 0
    ) {
      return false;
    }

    const wn = this.pieceCount[WN];
    const bn = this.pieceCount[BN];
    const wb = this.pieceCount[WB];
    const bb = this.pieceCount[BB];
    const totalMinors = wn + bn + wb + bb;

    if (totalMinors <= 1) return true; // K vs K, K+N vs K, K+B vs K
    if (totalMinors === 2 && wn + bn === 2) return true; // K+N vs K+N or K+NN vs K
    if (wn === 0 && bn === 0 && wb + bb >= 2) {
      // Check if all bishops reside on the same square color
      let firstColor = -1;
      for (let i = 0; i < wb; i++) {
        const sq = this.pieceList[(WB << 4) | i];
        const sc = ((sq >> 4) + (sq & 7)) & 1;
        if (firstColor === -1) firstColor = sc;
        else if (sc !== firstColor) return false;
      }
      for (let i = 0; i < bb; i++) {
        const sq = this.pieceList[(BB << 4) | i];
        const sc = ((sq >> 4) + (sq & 7)) & 1;
        if (firstColor === -1) firstColor = sc;
        else if (sc !== firstColor) return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Checks for a position repetition along the current game/search path.
   * Scans backwards in steps of 2 within `halfMoveClock` plies.
   */
  public isRepetition(): boolean {
    const hmc = this.halfMoveClock;
    if (hmc < 4) return false;
    const minPly = Math.max(0, this.ply - hmc);
    const hi = this.hashHi;
    const lo = this.hashLo;
    const uHi = this.undoHashHi;
    const uLo = this.undoHashLo;

    for (let i = this.ply - 2; i >= minPly; i -= 2) {
      if (uHi[i] === hi && uLo[i] === lo) {
        return true;
      }
    }
    return false;
  }

  /**
   * Executes a move incrementally in O(1) with ZERO heap allocations.
   * Returns `true` if the move is strictly legal (own King is not left in check),
   * or automatically unmakes and returns `false` if illegal.
   */
  public makeMove(move: FastMove): boolean {
    const p = this.ply;
    this.undoMove[p] = move;
    this.undoCastling[p] = this.castling;
    this.undoEpSq[p] = this.epSq;
    this.undoHalfMove[p] = this.halfMoveClock;
    this.undoHashHi[p] = this.hashHi;
    this.undoHashLo[p] = this.hashLo;
    this.undoMatMg[p] = this.matMg;
    this.undoMatEg[p] = this.matEg;
    this.undoPstMg[p] = this.pstMg;
    this.undoPstEg[p] = this.pstEg;
    this.undoPhase[p] = this.phase;
    this.ply = p + 1;

    const from = move & 0x7f;
    const to = (move >> 7) & 0x7f;
    const captured = (move >> 14) & 0xf;
    const promo = (move >> 18) & 0x7;
    const moverSide = this.side;
    const piece = this.squares[from];

    // Clear old EP hash
    if (this.epSq !== -1) {
      this.hashHi = (this.hashHi ^ ZOBRIST_EP_HI[this.epSq]) >>> 0;
      this.hashLo = (this.hashLo ^ ZOBRIST_EP_LO[this.epSq]) >>> 0;
      this.epSq = -1;
    }

    // Handle capture
    if (captured !== EMPTY) {
      if ((move & MOVE_FLAG_EP) !== 0) {
        const capSq = (from & 0xf0) | (to & 0x0f);
        this.removePiece(captured, capSq);
      } else {
        this.removePiece(captured, to);
      }
    }

    // Handle promotion vs normal move
    if (promo !== 0) {
      this.removePiece(piece, from);
      const promoPiece = promo | (moverSide << 3);
      this.addPiece(promoPiece, to);
    } else {
      this.movePiece(piece, from, to);
    }

    // Handle castling rook movement
    if ((move & MOVE_FLAG_CASTLE_K) !== 0) {
      const rook = ROOK | (moverSide << 3);
      this.movePiece(rook, from + 3, from + 1);
    } else if ((move & MOVE_FLAG_CASTLE_Q) !== 0) {
      const rook = ROOK | (moverSide << 3);
      this.movePiece(rook, from - 4, from - 1);
    } else if ((move & MOVE_FLAG_DOUBLE_PUSH) !== 0) {
      const ep = (from + to) >> 1;
      this.epSq = ep;
      this.hashHi = (this.hashHi ^ ZOBRIST_EP_HI[ep]) >>> 0;
      this.hashLo = (this.hashLo ^ ZOBRIST_EP_LO[ep]) >>> 0;
    }

    // Update castling rights
    const oldCastling = this.castling;
    const newCastling = oldCastling & CASTLING_MASK[from] & CASTLING_MASK[to];
    if (newCastling !== oldCastling) {
      this.hashHi =
        (this.hashHi ^
          ZOBRIST_CASTLE_HI[oldCastling] ^
          ZOBRIST_CASTLE_HI[newCastling]) >>>
        0;
      this.hashLo =
        (this.hashLo ^
          ZOBRIST_CASTLE_LO[oldCastling] ^
          ZOBRIST_CASTLE_LO[newCastling]) >>>
        0;
      this.castling = newCastling;
    }

    // Halfmove & fullmove clocks
    if ((piece & 7) === PAWN || captured !== EMPTY) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }
    if (moverSide === BLACK) {
      this.fullMoveNumber++;
    }

    // Flip side to move
    this.side = moverSide ^ 1;
    this.hashHi = (this.hashHi ^ ZOBRIST_SIDE_HI) >>> 0;
    this.hashLo = (this.hashLo ^ ZOBRIST_SIDE_LO) >>> 0;

    // Legality check: mover's own king must not be attacked by opponent
    if (this.isSquareAttacked(this.kingSq[moverSide], this.side)) {
      this.unmakeMove();
      return false;
    }
    return true;
  }

  /**
   * Reverts the most recent move in O(1) with ZERO heap allocations.
   */
  public unmakeMove(): void {
    const p = this.ply - 1;
    this.ply = p;
    const move = this.undoMove[p];

    const from = move & 0x7f;
    const to = (move >> 7) & 0x7f;
    const captured = (move >> 14) & 0xf;
    const promo = (move >> 18) & 0x7;

    // Flip side back
    const moverSide = this.side ^ 1;
    this.side = moverSide;
    if (moverSide === BLACK) {
      this.fullMoveNumber--;
    }

    // Undo castling rook movement
    if ((move & MOVE_FLAG_CASTLE_K) !== 0) {
      const rook = ROOK | (moverSide << 3);
      this.movePieceRaw(rook, from + 1, from + 3);
    } else if ((move & MOVE_FLAG_CASTLE_Q) !== 0) {
      const rook = ROOK | (moverSide << 3);
      this.movePieceRaw(rook, from - 1, from - 4);
    }

    // Undo promotion vs normal move
    if (promo !== 0) {
      const promoPiece = promo | (moverSide << 3);
      this.removePieceRaw(promoPiece, to);
      const pawn = PAWN | (moverSide << 3);
      this.addPieceRaw(pawn, from);
    } else {
      const movedPiece = this.squares[to];
      this.movePieceRaw(movedPiece, to, from);
    }

    // Restore captured piece
    if (captured !== EMPTY) {
      if ((move & MOVE_FLAG_EP) !== 0) {
        const capSq = (from & 0xf0) | (to & 0x0f);
        this.addPieceRaw(captured, capSq);
      } else {
        this.addPieceRaw(captured, to);
      }
    }

    // Restore exact state & incremental accumulators from undo stack
    this.castling = this.undoCastling[p];
    this.epSq = this.undoEpSq[p];
    this.halfMoveClock = this.undoHalfMove[p];
    this.hashHi = this.undoHashHi[p];
    this.hashLo = this.undoHashLo[p];
    this.matMg = this.undoMatMg[p];
    this.matEg = this.undoMatEg[p];
    this.pstMg = this.undoPstMg[p];
    this.pstEg = this.undoPstEg[p];
    this.phase = this.undoPhase[p];
  }

  private addPieceRaw(piece: number, sq: number): void {
    this.squares[sq] = piece;
    const count = this.pieceCount[piece];
    this.pieceList[(piece << 4) | count] = sq;
    this.pieceIndex[sq] = count;
    this.pieceCount[piece] = count + 1;
    if (piece === WK) this.kingSq[WHITE] = sq;
    else if (piece === BK) this.kingSq[BLACK] = sq;
  }

  private removePieceRaw(piece: number, sq: number): void {
    this.squares[sq] = EMPTY;
    const idx = this.pieceIndex[sq];
    const lastIdx = this.pieceCount[piece] - 1;
    this.pieceCount[piece] = lastIdx;
    if (idx !== lastIdx) {
      const movedSq = this.pieceList[(piece << 4) | lastIdx];
      this.pieceList[(piece << 4) | idx] = movedSq;
      this.pieceIndex[movedSq] = idx;
    }
    this.pieceIndex[sq] = -1;
  }

  private movePieceRaw(piece: number, from: number, to: number): void {
    this.squares[from] = EMPTY;
    this.squares[to] = piece;
    const idx = this.pieceIndex[from];
    this.pieceList[(piece << 4) | idx] = to;
    this.pieceIndex[to] = idx;
    this.pieceIndex[from] = -1;
    if (piece === WK) this.kingSq[WHITE] = to;
    else if (piece === BK) this.kingSq[BLACK] = to;
  }

  /**
   * Passes the turn (Null Move) in O(1) for Null-Move Pruning.
   */
  public makeNullMove(): void {
    const p = this.ply;
    this.undoMove[p] = 0;
    this.undoCastling[p] = this.castling;
    this.undoEpSq[p] = this.epSq;
    this.undoHalfMove[p] = this.halfMoveClock;
    this.undoHashHi[p] = this.hashHi;
    this.undoHashLo[p] = this.hashLo;
    this.undoMatMg[p] = this.matMg;
    this.undoMatEg[p] = this.matEg;
    this.undoPstMg[p] = this.pstMg;
    this.undoPstEg[p] = this.pstEg;
    this.undoPhase[p] = this.phase;
    this.ply = p + 1;

    if (this.epSq !== -1) {
      this.hashHi = (this.hashHi ^ ZOBRIST_EP_HI[this.epSq]) >>> 0;
      this.hashLo = (this.hashLo ^ ZOBRIST_EP_LO[this.epSq]) >>> 0;
      this.epSq = -1;
    }
    this.halfMoveClock++;
    this.side ^= 1;
    this.hashHi = (this.hashHi ^ ZOBRIST_SIDE_HI) >>> 0;
    this.hashLo = (this.hashLo ^ ZOBRIST_SIDE_LO) >>> 0;
  }

  public unmakeNullMove(): void {
    const p = this.ply - 1;
    this.ply = p;
    this.side ^= 1;
    this.castling = this.undoCastling[p];
    this.epSq = this.undoEpSq[p];
    this.halfMoveClock = this.undoHalfMove[p];
    this.hashHi = this.undoHashHi[p];
    this.hashLo = this.undoHashLo[p];
  }

  /**
   * Generates all pseudo-legal moves (or captures + queen promotions when `capturesOnly = true`)
   * directly into pre-allocated `moveBuf` starting at `offset`.
   * Returns the new end index in `moveBuf`.
   */
  public generateMoves(
    moveBuf: Int32Array,
    offset: number,
    capturesOnly: boolean
  ): number {
    let idx = offset;
    const squares = this.squares;
    const pieceList = this.pieceList;
    const pieceCount = this.pieceCount;
    const side = this.side;
    const colorBit = side << 3;
    const enemyBit = (side ^ 1) << 3;
    const epSq = this.epSq;

    // 1. Pawns
    const pawnPiece = PAWN | colorBit;
    const pawnCount = pieceCount[pawnPiece];
    const pawnBase = pawnPiece << 4;

    if (side === WHITE) {
      for (let i = 0; i < pawnCount; i++) {
        const from = pieceList[pawnBase | i];
        const row = from >> 4;
        const isPromoRank = row === 1;

        // Forward pushes
        const push1 = from - 16;
        if (squares[push1] === EMPTY) {
          if (isPromoRank) {
            if (capturesOnly) {
              moveBuf[idx++] = encodeMove(from, push1, 0, QUEEN, 0);
            } else {
              for (let pr = 0; pr < 4; pr++) {
                moveBuf[idx++] = encodeMove(
                  from,
                  push1,
                  0,
                  PROMO_TYPES_ALL[pr],
                  0
                );
              }
            }
          } else if (!capturesOnly) {
            moveBuf[idx++] = encodeMove(from, push1, 0, 0, 0);
            if (row === 6) {
              const push2 = from - 32;
              if (squares[push2] === EMPTY) {
                moveBuf[idx++] = encodeMove(
                  from,
                  push2,
                  0,
                  0,
                  MOVE_FLAG_DOUBLE_PUSH
                );
              }
            }
          }
        }

        // Diagonal captures & En Passant (left: -17, right: -15)
        for (let d = 0; d < 2; d++) {
          const to = from + (d === 0 ? -17 : -15);
          if ((to & 0x88) !== 0) continue;
          const target = squares[to];
          if (target !== EMPTY && (target & COLOR_BIT) === COLOR_BIT) {
            if (isPromoRank) {
              if (capturesOnly) {
                moveBuf[idx++] = encodeMove(from, to, target, QUEEN, 0);
              } else {
                for (let pr = 0; pr < 4; pr++) {
                  moveBuf[idx++] = encodeMove(
                    from,
                    to,
                    target,
                    PROMO_TYPES_ALL[pr],
                    0
                  );
                }
              }
            } else {
              moveBuf[idx++] = encodeMove(from, to, target, 0, 0);
            }
          } else if (to === epSq) {
            moveBuf[idx++] = encodeMove(from, to, BP, 0, MOVE_FLAG_EP);
          }
        }
      }
    } else {
      for (let i = 0; i < pawnCount; i++) {
        const from = pieceList[pawnBase | i];
        const row = from >> 4;
        const isPromoRank = row === 6;

        // Forward pushes
        const push1 = from + 16;
        if (squares[push1] === EMPTY) {
          if (isPromoRank) {
            if (capturesOnly) {
              moveBuf[idx++] = encodeMove(from, push1, 0, QUEEN, 0);
            } else {
              for (let pr = 0; pr < 4; pr++) {
                moveBuf[idx++] = encodeMove(
                  from,
                  push1,
                  0,
                  PROMO_TYPES_ALL[pr],
                  0
                );
              }
            }
          } else if (!capturesOnly) {
            moveBuf[idx++] = encodeMove(from, push1, 0, 0, 0);
            if (row === 1) {
              const push2 = from + 32;
              if (squares[push2] === EMPTY) {
                moveBuf[idx++] = encodeMove(
                  from,
                  push2,
                  0,
                  0,
                  MOVE_FLAG_DOUBLE_PUSH
                );
              }
            }
          }
        }

        // Diagonal captures & En Passant (left: +15, right: +17)
        for (let d = 0; d < 2; d++) {
          const to = from + (d === 0 ? 15 : 17);
          if ((to & 0x88) !== 0) continue;
          const target = squares[to];
          if (target !== EMPTY && (target & COLOR_BIT) === 0) {
            if (isPromoRank) {
              if (capturesOnly) {
                moveBuf[idx++] = encodeMove(from, to, target, QUEEN, 0);
              } else {
                for (let pr = 0; pr < 4; pr++) {
                  moveBuf[idx++] = encodeMove(
                    from,
                    to,
                    target,
                    PROMO_TYPES_ALL[pr],
                    0
                  );
                }
              }
            } else {
              moveBuf[idx++] = encodeMove(from, to, target, 0, 0);
            }
          } else if (to === epSq) {
            moveBuf[idx++] = encodeMove(from, to, WP, 0, MOVE_FLAG_EP);
          }
        }
      }
    }

    // 2. Knights
    const knightPiece = KNIGHT | colorBit;
    const knightCount = pieceCount[knightPiece];
    const knightBase = knightPiece << 4;
    for (let i = 0; i < knightCount; i++) {
      const from = pieceList[knightBase | i];
      for (let d = 0; d < 8; d++) {
        const to = from + KNIGHT_OFFSETS_88[d];
        if ((to & 0x88) !== 0) continue;
        const target = squares[to];
        if (target === EMPTY) {
          if (!capturesOnly) {
            moveBuf[idx++] = encodeMove(from, to, 0, 0, 0);
          }
        } else if ((target & COLOR_BIT) === enemyBit) {
          moveBuf[idx++] = encodeMove(from, to, target, 0, 0);
        }
      }
    }

    // 3. Bishops
    const bishopPiece = BISHOP | colorBit;
    const bishopCount = pieceCount[bishopPiece];
    const bishopBase = bishopPiece << 4;
    for (let i = 0; i < bishopCount; i++) {
      const from = pieceList[bishopBase | i];
      for (let d = 0; d < 4; d++) {
        const dir = BISHOP_DIRS_88[d];
        let to = from + dir;
        while ((to & 0x88) === 0) {
          const target = squares[to];
          if (target === EMPTY) {
            if (!capturesOnly) {
              moveBuf[idx++] = encodeMove(from, to, 0, 0, 0);
            }
          } else {
            if ((target & COLOR_BIT) === enemyBit) {
              moveBuf[idx++] = encodeMove(from, to, target, 0, 0);
            }
            break;
          }
          to += dir;
        }
      }
    }

    // 4. Rooks
    const rookPiece = ROOK | colorBit;
    const rookCount = pieceCount[rookPiece];
    const rookBase = rookPiece << 4;
    for (let i = 0; i < rookCount; i++) {
      const from = pieceList[rookBase | i];
      for (let d = 0; d < 4; d++) {
        const dir = ROOK_DIRS_88[d];
        let to = from + dir;
        while ((to & 0x88) === 0) {
          const target = squares[to];
          if (target === EMPTY) {
            if (!capturesOnly) {
              moveBuf[idx++] = encodeMove(from, to, 0, 0, 0);
            }
          } else {
            if ((target & COLOR_BIT) === enemyBit) {
              moveBuf[idx++] = encodeMove(from, to, target, 0, 0);
            }
            break;
          }
          to += dir;
        }
      }
    }

    // 5. Queens
    const queenPiece = QUEEN | colorBit;
    const queenCount = pieceCount[queenPiece];
    const queenBase = queenPiece << 4;
    for (let i = 0; i < queenCount; i++) {
      const from = pieceList[queenBase | i];
      for (let d = 0; d < 8; d++) {
        const dir = QUEEN_DIRS_88[d];
        let to = from + dir;
        while ((to & 0x88) === 0) {
          const target = squares[to];
          if (target === EMPTY) {
            if (!capturesOnly) {
              moveBuf[idx++] = encodeMove(from, to, 0, 0, 0);
            }
          } else {
            if ((target & COLOR_BIT) === enemyBit) {
              moveBuf[idx++] = encodeMove(from, to, target, 0, 0);
            }
            break;
          }
          to += dir;
        }
      }
    }

    // 6. King + Castling
    const kingFrom = this.kingSq[side];
    if (kingFrom >= 0) {
      for (let d = 0; d < 8; d++) {
        const to = kingFrom + KING_OFFSETS_88[d];
        if ((to & 0x88) !== 0) continue;
        const target = squares[to];
        if (target === EMPTY) {
          if (!capturesOnly) {
            moveBuf[idx++] = encodeMove(kingFrom, to, 0, 0, 0);
          }
        } else if ((target & COLOR_BIT) === enemyBit) {
          moveBuf[idx++] = encodeMove(kingFrom, to, target, 0, 0);
        }
      }

      if (!capturesOnly && this.castling !== 0) {
        const enemySide = side ^ 1;
        if (side === WHITE && kingFrom === 0x74) {
          if (
            (this.castling & CASTLE_WK) !== 0 &&
            squares[0x77] === WR &&
            squares[0x75] === EMPTY &&
            squares[0x76] === EMPTY &&
            !this.isSquareAttacked(0x74, enemySide) &&
            !this.isSquareAttacked(0x75, enemySide) &&
            !this.isSquareAttacked(0x76, enemySide)
          ) {
            moveBuf[idx++] = encodeMove(0x74, 0x76, 0, 0, MOVE_FLAG_CASTLE_K);
          }
          if (
            (this.castling & CASTLE_WQ) !== 0 &&
            squares[0x70] === WR &&
            squares[0x71] === EMPTY &&
            squares[0x72] === EMPTY &&
            squares[0x73] === EMPTY &&
            !this.isSquareAttacked(0x74, enemySide) &&
            !this.isSquareAttacked(0x73, enemySide) &&
            !this.isSquareAttacked(0x72, enemySide)
          ) {
            moveBuf[idx++] = encodeMove(0x74, 0x72, 0, 0, MOVE_FLAG_CASTLE_Q);
          }
        } else if (side === BLACK && kingFrom === 0x04) {
          if (
            (this.castling & CASTLE_BK) !== 0 &&
            squares[0x07] === BR &&
            squares[0x05] === EMPTY &&
            squares[0x06] === EMPTY &&
            !this.isSquareAttacked(0x04, enemySide) &&
            !this.isSquareAttacked(0x05, enemySide) &&
            !this.isSquareAttacked(0x06, enemySide)
          ) {
            moveBuf[idx++] = encodeMove(0x04, 0x06, 0, 0, MOVE_FLAG_CASTLE_K);
          }
          if (
            (this.castling & CASTLE_BQ) !== 0 &&
            squares[0x00] === BR &&
            squares[0x01] === EMPTY &&
            squares[0x02] === EMPTY &&
            squares[0x03] === EMPTY &&
            !this.isSquareAttacked(0x04, enemySide) &&
            !this.isSquareAttacked(0x03, enemySide) &&
            !this.isSquareAttacked(0x02, enemySide)
          ) {
            moveBuf[idx++] = encodeMove(0x04, 0x02, 0, 0, MOVE_FLAG_CASTLE_Q);
          }
        }
      }
    }

    return idx;
  }

  /**
   * Finds the least-valuable attacker of `targetSq` belonging to `bySide`,
   * ignoring any squares marked with `stamp` in `this.seeRemoved` so X-ray
   * sliders behind removed pieces are accurately discovered.
   * Returns `(pieceType << 8) | fromSq`, or `0` if none exists.
   */
  private findLeastValuableAttacker(
    targetSq: number,
    bySide: number,
    stamp: number
  ): number {
    const squares = this.squares;
    const removed = this.seeRemoved;
    const cb = bySide << 3;

    // 1. Pawns (cheapest)
    const pawn = PAWN | cb;
    if (bySide === WHITE) {
      const s1 = targetSq + 15;
      if ((s1 & 0x88) === 0 && removed[s1] !== stamp && squares[s1] === pawn) {
        return (PAWN << 8) | s1;
      }
      const s2 = targetSq + 17;
      if ((s2 & 0x88) === 0 && removed[s2] !== stamp && squares[s2] === pawn) {
        return (PAWN << 8) | s2;
      }
    } else {
      const s1 = targetSq - 15;
      if ((s1 & 0x88) === 0 && removed[s1] !== stamp && squares[s1] === pawn) {
        return (PAWN << 8) | s1;
      }
      const s2 = targetSq - 17;
      if ((s2 & 0x88) === 0 && removed[s2] !== stamp && squares[s2] === pawn) {
        return (PAWN << 8) | s2;
      }
    }

    // 2. Knights
    const knight = KNIGHT | cb;
    for (let i = 0; i < 8; i++) {
      const sq = targetSq + KNIGHT_OFFSETS_88[i];
      if ((sq & 0x88) === 0 && removed[sq] !== stamp && squares[sq] === knight) {
        return (KNIGHT << 8) | sq;
      }
    }

    // 3. Bishops (diagonal rays, also track potential Queen)
    const bishop = BISHOP | cb;
    const queen = QUEEN | cb;
    let queenSq = -1;

    for (let i = 0; i < 4; i++) {
      const dir = BISHOP_DIRS_88[i];
      let sq = targetSq + dir;
      while ((sq & 0x88) === 0) {
        if (removed[sq] !== stamp) {
          const p = squares[sq];
          if (p !== EMPTY) {
            if (p === bishop) return (BISHOP << 8) | sq;
            if (p === queen && queenSq === -1) queenSq = sq;
            break;
          }
        }
        sq += dir;
      }
    }

    // 4. Rooks (orthogonal rays, also track potential Queen)
    const rook = ROOK | cb;
    for (let i = 0; i < 4; i++) {
      const dir = ROOK_DIRS_88[i];
      let sq = targetSq + dir;
      while ((sq & 0x88) === 0) {
        if (removed[sq] !== stamp) {
          const p = squares[sq];
          if (p !== EMPTY) {
            if (p === rook) return (ROOK << 8) | sq;
            if (p === queen && queenSq === -1) queenSq = sq;
            break;
          }
        }
        sq += dir;
      }
    }

    // 5. Queen
    if (queenSq !== -1) {
      return (QUEEN << 8) | queenSq;
    }

    // 6. King
    const kSq = this.kingSq[bySide];
    if (kSq >= 0 && removed[kSq] !== stamp) {
      const dr = (targetSq >> 4) - (kSq >> 4);
      const dc = (targetSq & 7) - (kSq & 7);
      if (dr >= -1 && dr <= 1 && dc >= -1 && dc <= 1 && (dr !== 0 || dc !== 0)) {
        return (KING << 8) | kSq;
      }
    }

    return 0;
  }

  /**
   * Zero-allocation Static Exchange Evaluation (SEE) with X-ray discovery.
   * Evaluates the expected net centipawn material gain of executing `move`
   * on the current board (before `makeMove`).
   */
  public see(move: FastMove): number {
    const from = move & 0x7f;
    const to = (move >> 7) & 0x7f;
    const captured = (move >> 14) & 0xf;
    const promo = (move >> 18) & 0x7;

    const movingPiece = this.squares[from];
    const movingType = movingPiece & 7;
    const victimType = captured & 7;

    let value = SEE_VALUE[victimType];
    if (promo !== 0) {
      value += SEE_VALUE[promo] - SEE_VALUE[PAWN];
    }

    let stamp = this.seeStamp + 1;
    if (stamp >= 255) {
      this.seeRemoved.fill(0);
      stamp = 1;
    }
    this.seeStamp = stamp;

    const removed = this.seeRemoved;
    removed[from] = stamp;
    if ((move & MOVE_FLAG_EP) !== 0) {
      removed[(from & 0xf0) | (to & 0x0f)] = stamp;
    }

    const gain = this.seeGain;
    gain[0] = value;

    let attackedPieceVal = promo !== 0 ? SEE_VALUE[promo] : SEE_VALUE[movingType];
    let side = this.side ^ 1;
    let d = 0;

    while (d < 30) {
      const found = this.findLeastValuableAttacker(to, side, stamp);
      if (found === 0) break;

      const attType = found >> 8;
      const attSq = found & 0x7f;

      // If previous capturer was a King and opponent still has a recapturer,
      // the King capture was illegal -> stop before allowing it!
      if (attackedPieceVal === SEE_VALUE[KING]) {
        break;
      }

      d++;
      let stepVal = attackedPieceVal;
      let nextPieceVal = SEE_VALUE[attType];

      // Handle pawn recapture on promotion rank
      if (attType === PAWN && ((to >> 4) === 0 || (to >> 4) === 7)) {
        stepVal += SEE_VALUE[QUEEN] - SEE_VALUE[PAWN];
        nextPieceVal = SEE_VALUE[QUEEN];
      }

      gain[d] = stepVal - gain[d - 1];

      // Stand-pat cutoff optimization: if neither side can improve
      if (Math.max(-gain[d - 1], gain[d]) < 0) {
        break;
      }

      removed[attSq] = stamp;
      attackedPieceVal = nextPieceVal;
      side ^= 1;
    }

    while (d > 0) {
      gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
      d--;
    }

    return gain[0];
  }

  /**
   * Standard Perft node counter for verifying 100% move generation & make/unmake accuracy.
   * Uses a pre-allocated move stack with zero per-node allocations.
   */
  public perft(depth: number): number {
    if (depth <= 0) return 1;
    const moveBuf = new Int32Array((depth + 2) * 256);
    return this.perftRec(depth, moveBuf, 0);
  }

  private perftRec(depth: number, moveBuf: Int32Array, offset: number): number {
    const end = this.generateMoves(moveBuf, offset, false);
    if (depth === 1) {
      let legalCount = 0;
      for (let i = offset; i < end; i++) {
        if (this.makeMove(moveBuf[i])) {
          legalCount++;
          this.unmakeMove();
        }
      }
      return legalCount;
    }

    let nodes = 0;
    for (let i = offset; i < end; i++) {
      if (this.makeMove(moveBuf[i])) {
        nodes += this.perftRec(depth - 1, moveBuf, end);
        this.unmakeMove();
      }
    }
    return nodes;
  }
}
