import {
  BOARD_SIZE,
  coordsToSquare,
  createInitialGameState,
  fenToGameState,
} from './engine';
import { createEngineProfileFromPreset, describeEngineProfileSummary } from './evaluation';
import { analyzeOpeningAndStrategy } from './openingBook';
import {
  Color,
  EngineProfileState,
  GameMode,
  GameState,
  StoredGameSession,
} from './types';

export const ACTIVE_SESSION_STORAGE_KEY = 'caissa_active_session';
export const SAVED_SESSIONS_STORAGE_KEY = 'caissa_saved_sessions';
export const MAX_STORED_SESSIONS = 30;

/**
 * Converts a GameState board, turn, castling rights, en passant, half-move clock,
 * and full-move number into standard Forsyth-Edwards Notation (FEN).
 */
export function gameStateToFen(gameState: GameState): string {
  const rows: string[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let empty = 0;
    let rowStr = '';
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = gameState.board[r][c];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          rowStr += empty.toString();
          empty = 0;
        }
        const char =
          piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
        rowStr += char;
      }
    }
    if (empty > 0) {
      rowStr += empty.toString();
    }
    rows.push(rowStr);
  }

  let castlingStr = '';
  if (gameState.castlingRights.wK) castlingStr += 'K';
  if (gameState.castlingRights.wQ) castlingStr += 'Q';
  if (gameState.castlingRights.bK) castlingStr += 'k';
  if (gameState.castlingRights.bQ) castlingStr += 'q';
  if (!castlingStr) castlingStr = '-';

  const epStr = gameState.enPassantTarget ?? '-';
  const halfMove = gameState.halfMoveClock ?? 0;
  const fullMove = gameState.fullMoveNumber ?? 1;

  return `${rows.join('/')} ${gameState.turn} ${castlingStr} ${epStr} ${halfMove} ${fullMove}`;
}

/**
 * Generates an evocative, descriptive title for a game session based on opening book,
 * opponent settings, move count, and resolution status.
 */
export function generateSessionTitle(
  state: GameState,
  mode: GameMode,
  playerColor: Color,
  engineProfile?: EngineProfileState
): string {
  const opening = analyzeOpeningAndStrategy(state);
  const moveCount = state.fullMoveNumber;
  const plies = state.moveHistory.length;

  if (state.status === 'checkmate') {
    const winnerName = state.winner === 'w' ? 'White' : 'Black';
    return `Checkmate (${winnerName}) · Move ${moveCount}`;
  }
  if (state.status.startsWith('draw')) {
    return `Draw · Move ${moveCount}`;
  }

  if (
    opening.family &&
    opening.family !== 'Standard Starting Position' &&
    opening.family !== "King's Pawn Opening" &&
    opening.family !== "Queen's Pawn Opening"
  ) {
    return `${opening.family} · Move ${moveCount}`;
  }

  if (mode === 'ai' && engineProfile) {
    const summary = describeEngineProfileSummary(engineProfile);
    const colorLabel = playerColor === 'w' ? 'White' : 'Black';
    return `${colorLabel} vs ${summary.title} · Move ${moveCount}`;
  }

  if (mode === 'pass_and_play') {
    return `Two-Player Match · Move ${moveCount}`;
  }

  return `Chess Session · Ply ${plies}`;
}

/**
 * Custom JSON serialization replacer supporting BigInt values (e.g. Zobrist hashes).
 */
export function serializeSession(session: StoredGameSession): string {
  return JSON.stringify(session, (_key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  });
}

/**
 * Validates whether an untrusted parsed object matches the StoredGameSession contract.
 */
export function isValidSessionShape(data: unknown): data is StoredGameSession {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Partial<StoredGameSession>;
  if (typeof obj.id !== 'string' || !obj.id) return false;
  if (typeof obj.title !== 'string') return false;
  if (!Array.isArray(obj.stateStack) || obj.stateStack.length === 0) return false;

  // Validate the latest state in the stack
  const latestState = obj.stateStack[obj.stateStack.length - 1];
  if (!latestState || !Array.isArray(latestState.board) || latestState.board.length !== 8) {
    return false;
  }
  if (latestState.turn !== 'w' && latestState.turn !== 'b') return false;
  if (!latestState.castlingRights || typeof latestState.castlingRights !== 'object') {
    return false;
  }
  if (!Array.isArray(latestState.moveHistory)) return false;

  return true;
}

/**
 * Deserializes and validates a JSON string into a StoredGameSession.
 */
export function deserializeSession(raw: string): StoredGameSession | null {
  try {
    const parsed = JSON.parse(raw);
    if (!isValidSessionShape(parsed)) return null;

    // Ensure stateStack GameStates have valid properties
    const stateStack: GameState[] = parsed.stateStack.map((st) => ({
      board: st.board,
      turn: st.turn,
      castlingRights: {
        wK: Boolean(st.castlingRights?.wK),
        wQ: Boolean(st.castlingRights?.wQ),
        bK: Boolean(st.castlingRights?.bK),
        bQ: Boolean(st.castlingRights?.bQ),
      },
      enPassantTarget: st.enPassantTarget ?? null,
      halfMoveClock: Number(st.halfMoveClock) || 0,
      fullMoveNumber: Number(st.fullMoveNumber) || 1,
      positionCounts: st.positionCounts && typeof st.positionCounts === 'object' ? st.positionCounts : {},
      moveHistory: Array.isArray(st.moveHistory) ? st.moveHistory : [],
      capturedByWhite: Array.isArray(st.capturedByWhite) ? st.capturedByWhite : [],
      capturedByBlack: Array.isArray(st.capturedByBlack) ? st.capturedByBlack : [],
      status: st.status ?? 'playing',
      winner: st.winner ?? null,
      inCheck: Boolean(st.inCheck),
      lastMove: st.lastMove ?? null,
    }));

    const latest = stateStack[stateStack.length - 1];
    const fen = typeof parsed.fen === 'string' && parsed.fen.length > 5
      ? parsed.fen
      : gameStateToFen(latest);

    return {
      id: parsed.id,
      title: parsed.title || 'Saved Game',
      createdAt: Number(parsed.createdAt) || Date.now(),
      updatedAt: Number(parsed.updatedAt) || Date.now(),
      gameMode: parsed.gameMode === 'pass_and_play' ? 'pass_and_play' : 'ai',
      playerColor: parsed.playerColor === 'b' ? 'b' : 'w',
      isFlipped: Boolean(parsed.isFlipped),
      engineProfile: parsed.engineProfile,
      stateStack,
      fen,
      turn: latest.turn,
      fullMoveNumber: latest.fullMoveNumber,
      plyCount: latest.moveHistory.length,
      status: latest.status,
      winner: latest.winner,
      lastMoveSan: latest.moveHistory.length > 0
        ? latest.moveHistory[latest.moveHistory.length - 1].san
        : null,
      isAutoSave: Boolean(parsed.isAutoSave),
    };
  } catch {
    return null;
  }
}

/**
 * Creates a brand new StoredGameSession structure from active game parameters.
 */
export function createStoredSession(params: {
  stateStack: GameState[];
  gameMode: GameMode;
  playerColor: Color;
  isFlipped: boolean;
  engineProfile: EngineProfileState;
  customTitle?: string;
  isAutoSave?: boolean;
  existingId?: string;
}): StoredGameSession {
  const {
    stateStack,
    gameMode,
    playerColor,
    isFlipped,
    engineProfile,
    customTitle,
    isAutoSave = false,
    existingId,
  } = params;

  const validStack = stateStack.length > 0 ? stateStack : [createInitialGameState()];
  const latest = validStack[validStack.length - 1];
  const fen = gameStateToFen(latest);
  const now = Date.now();
  const id = existingId ?? `session_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const title =
    customTitle && customTitle.trim().length > 0
      ? customTitle.trim()
      : generateSessionTitle(latest, gameMode, playerColor, engineProfile);

  const lastMoveSan =
    latest.moveHistory.length > 0
      ? latest.moveHistory[latest.moveHistory.length - 1].san
      : null;

  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    gameMode,
    playerColor,
    isFlipped,
    engineProfile,
    stateStack: validStack,
    fen,
    turn: latest.turn,
    fullMoveNumber: latest.fullMoveNumber,
    plyCount: latest.moveHistory.length,
    status: latest.status,
    winner: latest.winner,
    lastMoveSan,
    isAutoSave,
  };
}

/**
 * Saves the active game session to localStorage for seamless restart recovery.
 */
export function saveActiveSession(session: StoredGameSession): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = serializeSession({ ...session, isAutoSave: true });
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, raw);
    return true;
  } catch (err) {
    console.warn('Failed to save active session to localStorage:', err);
    return false;
  }
}

/**
 * Loads the active session from localStorage if present and valid.
 */
export function loadActiveSession(): StoredGameSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return deserializeSession(raw);
  } catch {
    return null;
  }
}

/**
 * Clears the active session from localStorage.
 */
export function clearActiveSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {}
}

/**
 * Retrieves all stored game sessions from localStorage.
 */
export function getSavedSessions(): StoredGameSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: StoredGameSession[] = [];
    for (const item of parsed) {
      if (isValidSessionShape(item)) {
        const deserialized = deserializeSession(JSON.stringify(item));
        if (deserialized) {
          result.push(deserialized);
        }
      }
    }
    // Sort descending by most recently updated
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Adds or updates a saved session slot in localStorage and returns the new list.
 */
export function saveSessionSlot(session: StoredGameSession): StoredGameSession[] {
  if (typeof window === 'undefined') return [session];
  try {
    const existing = getSavedSessions();
    const updatedSession: StoredGameSession = {
      ...session,
      isAutoSave: false,
      updatedAt: Date.now(),
    };

    const filtered = existing.filter((s) => s.id !== session.id);
    const nextList = [updatedSession, ...filtered].slice(0, MAX_STORED_SESSIONS);

    const serializedList = JSON.stringify(nextList, (_key, val) =>
      typeof val === 'bigint' ? val.toString() : val
    );
    window.localStorage.setItem(SAVED_SESSIONS_STORAGE_KEY, serializedList);
    return nextList;
  } catch (err) {
    console.warn('Failed to save session slot:', err);
    return [];
  }
}

/**
 * Deletes a saved session slot by ID from localStorage.
 */
export function deleteSessionSlot(id: string): StoredGameSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const existing = getSavedSessions();
    const nextList = existing.filter((s) => s.id !== id);
    const serializedList = JSON.stringify(nextList, (_key, val) =>
      typeof val === 'bigint' ? val.toString() : val
    );
    window.localStorage.setItem(SAVED_SESSIONS_STORAGE_KEY, serializedList);
    return nextList;
  } catch {
    return [];
  }
}

/**
 * Renames a saved session slot by ID.
 */
export function renameSessionSlot(id: string, newTitle: string): StoredGameSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const existing = getSavedSessions();
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) return existing;

    const nextList = existing.map((s) => {
      if (s.id === id) {
        return { ...s, title: cleanTitle, updatedAt: Date.now() };
      }
      return s;
    });

    const serializedList = JSON.stringify(nextList, (_key, val) =>
      typeof val === 'bigint' ? val.toString() : val
    );
    window.localStorage.setItem(SAVED_SESSIONS_STORAGE_KEY, serializedList);
    return nextList;
  } catch {
    return [];
  }
}

/**
 * Formats a StoredGameSession into standard Portable Game Notation (PGN) text format.
 */
export function exportSessionToPgn(session: StoredGameSession): string {
  const dateStr = new Date(session.createdAt)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '.');

  let resultHeader = '*';
  if (session.status === 'checkmate') {
    resultHeader = session.winner === 'w' ? '1-0' : '0-1';
  } else if (session.status.startsWith('draw') || session.winner === 'draw') {
    resultHeader = '1/2-1/2';
  }

  const whitePlayer =
    session.gameMode === 'pass_and_play'
      ? 'Player 1'
      : session.playerColor === 'w'
      ? 'Human'
      : `Caïssa AI (${session.engineProfile?.elo ?? 1000} Elo)`;

  const blackPlayer =
    session.gameMode === 'pass_and_play'
      ? 'Player 2'
      : session.playerColor === 'b'
      ? 'Human'
      : `Caïssa AI (${session.engineProfile?.elo ?? 1000} Elo)`;

  const headers = [
    `[Event "${session.title || 'Caïssa Chess Salon'}"]`,
    `[Site "Caïssa FIDE Chess Salon"]`,
    `[Date "${dateStr}"]`,
    `[Round "1"]`,
    `[White "${whitePlayer}"]`,
    `[Black "${blackPlayer}"]`,
    `[Result "${resultHeader}"]`,
    `[FEN "${session.fen}"]`,
    `[SetUp "1"]`,
  ];

  // Format move pairs with SAN
  const history = session.stateStack[session.stateStack.length - 1]?.moveHistory ?? [];
  const moveLines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < history.length; i++) {
    const record = history[i];
    let token = '';
    if (record.color === 'w') {
      token = `${record.turnNumber}. ${record.san}`;
    } else {
      if (i === 0) {
        token = `${record.turnNumber}... ${record.san}`;
      } else {
        token = `${record.san}`;
      }
    }

    if (currentLine.length + token.length + 1 > 78) {
      moveLines.push(currentLine.trim());
      currentLine = token;
    } else {
      currentLine = currentLine ? `${currentLine} ${token}` : token;
    }
  }

  if (resultHeader !== '*') {
    currentLine = currentLine ? `${currentLine} ${resultHeader}` : resultHeader;
  }
  if (currentLine) {
    moveLines.push(currentLine.trim());
  }

  return `${headers.join('\n')}\n\n${moveLines.join('\n')}\n`;
}

/**
 * Exports a session as a standalone formatted JSON string.
 */
export function exportSessionToJson(session: StoredGameSession): string {
  return JSON.stringify(session, (_key, val) =>
    typeof val === 'bigint' ? val.toString() : val,
    2
  );
}

/**
 * Imports a stored game session from JSON string.
 */
export function importSessionFromJson(raw: string): StoredGameSession | null {
  return deserializeSession(raw);
}

/**
 * Creates a brand new StoredGameSession from a FEN string for custom board setup.
 */
export function importSessionFromFen(
  fen: string,
  options?: {
    customTitle?: string;
    gameMode?: GameMode;
    playerColor?: Color;
    engineProfile?: EngineProfileState;
    isFlipped?: boolean;
  }
): StoredGameSession | null {
  const gameState = fenToGameState(fen);
  if (!gameState) return null;
  const profile =
    options?.engineProfile ?? createEngineProfileFromPreset('casual');
  const playerColor = options?.playerColor ?? gameState.turn;
  const isFlipped = options?.isFlipped ?? (playerColor === 'b');
  return createStoredSession({
    stateStack: [gameState],
    gameMode: options?.gameMode ?? 'ai',
    playerColor,
    isFlipped,
    engineProfile: profile,
    customTitle:
      options?.customTitle ?? `Custom FEN · Move ${gameState.fullMoveNumber}`,
    isAutoSave: false,
  });
}

export { fenToGameState };
