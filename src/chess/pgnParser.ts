import {
  createInitialGameState,
  fenToGameState,
  generateLegalMoves,
  makeMove,
} from './engine';
import { formatEvalScore } from './evaluation';
import { exportSessionToPgn, gameStateToFen } from './sessionStorage';
import {
  Color,
  EngineProfileState,
  GameMode,
  GameState,
  Move,
  PieceType,
  PromotionPieceType,
  StoredGameSession,
} from './types';
import {
  ParsedPgnGame,
  PgnBatchGameError,
  PgnHeaders,
  PgnParseBatchResult,
  PgnVariationLine,
  TimelineMoveFlags,
  TimelineNode,
} from './pgnTypes';

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

const NAG_MAP: Record<string, string> = {
  $1: '!',
  $2: '?',
  $3: '!!',
  $4: '??',
  $5: '!?',
  $6: '?!',
  $7: '□',
  $10: '=',
  $13: '∞',
  $14: '⩲',
  $15: '⩱',
  $16: '±',
  $17: '∓',
  $18: '+-',
  $19: '-+',
};

const EMPTY_FLAGS: TimelineMoveFlags = {
  check: false,
  checkmate: false,
  stalemate: false,
  castle: null,
  promotion: null,
  enPassant: false,
  capture: false,
};

interface MovetextToken {
  type: 'san' | 'comment' | 'nag' | 'result' | 'variation';
  value: string;
  clock?: string | null;
  pgnEval?: number | null;
  pgnEvalFormatted?: string | null;
}

/**
 * Parses machine annotations like `[%clk 0:05:12]` and `[%eval +0.42]` or `[%eval #-3]`
 * embedded inside PGN `{...}` comments, returning both structured metadata and cleaned prose.
 */
export function extractCommentMetadata(rawComment: string): {
  cleanedComment: string;
  clock: string | null;
  pgnEval: number | null;
  pgnEvalFormatted: string | null;
} {
  let clock: string | null = null;
  let pgnEval: number | null = null;
  let pgnEvalFormatted: string | null = null;

  const clkMatch = rawComment.match(/\[%clk\s+([0-9:.]+)\]/i);
  if (clkMatch) {
    // Normalize e.g. "0:05:12.3" -> "5:12" or "1:23:45" -> "1:23:45"
    const rawClk = clkMatch[1].replace(/\.\d+$/, '');
    const parts = rawClk.split(':');
    if (parts.length === 3 && Number(parts[0]) === 0) {
      clock = `${Number(parts[1])}:${parts[2].padStart(2, '0')}`;
    } else {
      clock = rawClk;
    }
  }

  const evalMatch = rawComment.match(/\[%eval\s+([#+-]?\d+(?:\.\d+)?)\]/i);
  if (evalMatch) {
    const rawEval = evalMatch[1].trim();
    if (rawEval.startsWith('#')) {
      const mateNum = parseInt(rawEval.slice(1), 10);
      if (Number.isFinite(mateNum) && mateNum !== 0) {
        pgnEval = mateNum > 0 ? 100000 - Math.abs(mateNum) * 2 : -(100000 - Math.abs(mateNum) * 2);
        pgnEvalFormatted = mateNum > 0 ? `M${mateNum}` : `-M${Math.abs(mateNum)}`;
      }
    } else {
      const pawns = parseFloat(rawEval);
      if (Number.isFinite(pawns)) {
        pgnEval = Math.round(pawns * 100);
        pgnEvalFormatted = formatEvalScore(pgnEval);
      }
    }
  }

  const cleanedComment = rawComment
    .replace(/\[%[a-zA-Z0-9_]+\s+[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { cleanedComment, clock, pgnEval, pgnEvalFormatted };
}

/**
 * Splits a raw PGN string (possibly containing dozens of games from 365Chess,
 * PGN Mentor, TWIC, Chessgames.com, Lichess, or Chess.com) into individual
 * game chunks without breaking on brackets inside comments or quoted strings.
 */
export function splitPgnGames(rawPgn: string): string[] {
  const normalized = rawPgn.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  const lines = normalized.split('\n');

  let currentLines: string[] = [];
  let seenMovesInCurrent = false;
  let inBraceComment = false;

  const isTagLine = (line: string): boolean =>
    /^\s*\[\s*[A-Za-z0-9_]+\s+"(?:\\.|[^"\\])*"\s*\]\s*$/.test(line);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inBraceComment && isTagLine(line)) {
      if (seenMovesInCurrent && currentLines.length > 0) {
        const joined = currentLines.join('\n').trim();
        if (joined) chunks.push(joined);
        currentLines = [];
        seenMovesInCurrent = false;
      }
      currentLines.push(line);
      continue;
    }

    if (trimmed.length > 0 && !inBraceComment && !trimmed.startsWith('%')) {
      seenMovesInCurrent = true;
    }

    // Track multiline `{ ... }` comments so a `[Tag "..."]` inside a comment doesn't split
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (!inBraceComment && ch === ';') {
        break; // Rest of line is a semicolon comment
      }
      if (ch === '{') {
        inBraceComment = true;
      } else if (ch === '}' && inBraceComment) {
        inBraceComment = false;
      }
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    const joined = currentLines.join('\n').trim();
    if (joined) chunks.push(joined);
  }

  return chunks;
}

/**
 * Extracts standard PGN tag pairs `[Tag "Value"]` and returns the remaining movetext.
 */
export function parsePgnHeaders(gameChunk: string): {
  headers: PgnHeaders;
  movetext: string;
} {
  const headers: PgnHeaders = {
    Event: 'Casual Game',
    Site: '?',
    Date: '????.??.??',
    Round: '?',
    White: 'White',
    Black: 'Black',
    Result: '*',
  };

  const lines = gameChunk.split('\n');
  const movetextLines: string[] = [];
  let readingHeaders = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('%')) {
      continue; // PGN escape line
    }

    if (readingHeaders) {
      if (trimmed === '') {
        continue;
      }
      const tagMatch = trimmed.match(
        /^\[\s*([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\s*\]$/
      );
      if (tagMatch) {
        const key = tagMatch[1];
        const value = tagMatch[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        headers[key] = value;
        continue;
      }
      readingHeaders = false;
    }

    movetextLines.push(line);
  }

  return {
    headers,
    movetext: movetextLines.join('\n').trim(),
  };
}

/**
 * Tokenizes PGN movetext while gracefully:
 * - Capturing `{...}` and `;...` comments along with `[%clk]` & `[%eval]` tags
 * - Capturing NAG symbols (`$1`, `!`, `?`, `!!`, `??`, `!?`, `?!`)
 * - Capturing Recursive Annotation Variations `(... (...))` as structured variation tokens
 * - Stripping move numbers (`1.`, `12...`)
 */
export function tokenizeMovetext(movetext: string): MovetextToken[] {
  const tokens: MovetextToken[] = [];
  const len = movetext.length;
  let i = 0;

  while (i < len) {
    const ch = movetext[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Brace comment `{ ... }`
    if (ch === '{') {
      i++;
      const start = i;
      while (i < len && movetext[i] !== '}') {
        i++;
      }
      const rawComment = movetext.slice(start, i).replace(/\s+/g, ' ').trim();
      if (i < len && movetext[i] === '}') i++;

      const meta = extractCommentMetadata(rawComment);
      if (meta.cleanedComment || meta.clock || meta.pgnEval !== null) {
        tokens.push({
          type: 'comment',
          value: meta.cleanedComment,
          clock: meta.clock,
          pgnEval: meta.pgnEval,
          pgnEvalFormatted: meta.pgnEvalFormatted,
        });
      }
      continue;
    }

    // Semicolon end-of-line comment `; ...`
    if (ch === ';') {
      i++;
      const start = i;
      while (i < len && movetext[i] !== '\n') {
        i++;
      }
      const comment = movetext.slice(start, i).trim();
      if (comment) {
        tokens.push({ type: 'comment', value: comment });
      }
      continue;
    }

    // Recursive Annotation Variation `( ... )` — capture inner movetext cleanly
    if (ch === '(') {
      let depth = 1;
      i++;
      const varStart = i;
      let insideBrace = false;
      while (i < len && depth > 0) {
        const c = movetext[i];
        if (insideBrace) {
          if (c === '}') insideBrace = false;
        } else {
          if (c === '{') insideBrace = true;
          else if (c === ';') {
            while (i < len && movetext[i] !== '\n') i++;
            continue;
          } else if (c === '(') depth++;
          else if (c === ')') depth--;
        }
        i++;
      }
      const varContent = movetext.slice(varStart, Math.max(varStart, i - 1)).trim();
      if (varContent) {
        tokens.push({ type: 'variation', value: varContent });
      }
      continue;
    }

    // Unmatched stray closing paren
    if (ch === ')') {
      i++;
      continue;
    }

    // Numeric Annotation Glyph `$1` .. `$255`
    if (ch === '$') {
      const start = i;
      i++;
      while (i < len && /[0-9]/.test(movetext[i])) {
        i++;
      }
      const rawNag = movetext.slice(start, i);
      const mapped = NAG_MAP[rawNag];
      if (mapped) {
        tokens.push({ type: 'nag', value: mapped });
      }
      continue;
    }

    // Read word token up to whitespace or delimiter
    const start = i;
    while (i < len && !/[\s{}();]/.test(movetext[i])) {
      i++;
    }
    let word = movetext.slice(start, i);
    if (!word) continue;

    // Result tokens
    if (RESULT_TOKENS.has(word)) {
      tokens.push({ type: 'result', value: word });
      continue;
    }

    // Pure move numbers or ellipsis (`1.`, `12...`, `...`, `..`)
    if (/^\d+\.+$/.test(word) || /^\.+$/.test(word)) {
      continue;
    }

    // Handle attached move number like `1.e4` or `12...Nf6`
    word = word.replace(/^\d+\.+/, '');
    if (!word) continue;

    // Handle standalone annotation symbols `!`, `?`, `!!`, `??`, `!?`, `?!`
    if (/^[!?]{1,2}$/.test(word)) {
      tokens.push({ type: 'nag', value: word });
      continue;
    }

    // Strip trailing NAG suffix attached to SAN (`Nf6!`, `Rxd4!!`, `Qh5+?`, `e4!?`)
    let attachedNag: string | null = null;
    const nagSuffixMatch = word.match(/^(.+?)([!?]{1,2})$/);
    if (nagSuffixMatch) {
      word = nagSuffixMatch[1];
      attachedNag = nagSuffixMatch[2];
    }

    if (RESULT_TOKENS.has(word)) {
      tokens.push({ type: 'result', value: word });
      continue;
    }

    if (word) {
      tokens.push({ type: 'san', value: word });
    }
    if (attachedNag) {
      tokens.push({ type: 'nag', value: attachedNag });
    }
  }

  return tokens;
}

/**
 * Resolves a Standard Algebraic Notation (SAN) move token against all strictly
 * legal moves in `state`. Supports:
 * - Kingside / queenside castling (`O-O`, `O-O-O`, `0-0`, `0-0-0`)
 * - Optional capture marker (`x`, `:`)
 * - File, rank, and full-square disambiguation (`Nbd7`, `R1e2`, `Qh4e1`)
 * - Pawn promotions (`e8=Q`, `e8Q`, `exd8=N+`)
 * - Check/checkmate/en passant suffixes (`+`, `#`, `e.p.`)
 */
export function resolveSanMove(state: GameState, rawSan: string): Move | null {
  const legalMoves = generateLegalMoves(state);
  if (legalMoves.length === 0) return null;

  // Clean trailing check/checkmate/en-passant annotations
  let cleaned = rawSan
    .trim()
    .replace(/e\.p\.$/i, '')
    .replace(/[+#]+$/g, '')
    .replace(/[!?]+$/g, '');

  if (!cleaned) return null;

  // Castling (accept both letter O and digit 0)
  const upperCastle = cleaned.toUpperCase().replace(/0/g, 'O');
  if (upperCastle === 'O-O') {
    return legalMoves.find((m) => m.isCastle === 'K') ?? null;
  }
  if (upperCastle === 'O-O-O') {
    return legalMoves.find((m) => m.isCastle === 'Q') ?? null;
  }

  // Extract optional promotion (`=Q`, `=R`, `=B`, `=N`, or trailing `Q`/`R`/`B`/`N` after rank 1/8)
  let promotion: PromotionPieceType | undefined;
  const eqPromoMatch = cleaned.match(/^(.+?)=([QRBNqrbn])$/);
  if (eqPromoMatch) {
    cleaned = eqPromoMatch[1];
    promotion = eqPromoMatch[2].toLowerCase() as PromotionPieceType;
  } else {
    const barePromoMatch = cleaned.match(/^([a-h](?:x[a-h])?[18])([QRBN])$/);
    if (barePromoMatch) {
      cleaned = barePromoMatch[1];
      promotion = barePromoMatch[2].toLowerCase() as PromotionPieceType;
    }
  }

  // Remove capture symbol (`x` or `:`)
  const isExplicitCapture = /[x:]/.test(cleaned);
  const compact = cleaned.replace(/[x:]/g, '');

  // Determine piece type
  let pieceType: PieceType = 'p';
  let body = compact;
  if (/^[NBRQK]/.test(compact)) {
    pieceType = compact[0].toLowerCase() as PieceType;
    body = compact.slice(1);
  } else if (compact.startsWith('P')) {
    pieceType = 'p';
    body = compact.slice(1);
  }

  // Last 2 characters of `body` must be the destination square (e.g., `e4`)
  if (body.length < 2) return null;
  const toSquare = body.slice(-2);
  if (!/^[a-h][1-8]$/.test(toSquare)) return null;

  const disambig = body.slice(0, -2);
  let fromFile: string | null = null;
  let fromRank: string | null = null;

  if (disambig.length === 1) {
    if (/[a-h]/.test(disambig)) {
      fromFile = disambig;
    } else if (/[1-8]/.test(disambig)) {
      fromRank = disambig;
    } else {
      return null;
    }
  } else if (disambig.length === 2) {
    if (/^[a-h][1-8]$/.test(disambig)) {
      fromFile = disambig[0];
      fromRank = disambig[1];
    } else {
      return null;
    }
  } else if (disambig.length > 2) {
    return null;
  }

  const candidates = legalMoves.filter((m) => {
    if (m.piece.type !== pieceType) return false;
    if (m.to !== toSquare) return false;
    if ((m.promotion ?? undefined) !== promotion) return false;
    if (fromFile && m.from[0] !== fromFile) return false;
    if (fromRank && m.from[1] !== fromRank) return false;
    return true;
  });

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length > 1 && isExplicitCapture) {
    const capCandidates = candidates.filter((m) => Boolean(m.captured));
    if (capCandidates.length === 1) return capCandidates[0];
  }

  return null;
}

/**
 * Builds a TimelineNode from applying a resolved legal move to `stateBefore`.
 */
export function buildTimelineNodeFromMove(
  stateBefore: GameState,
  resolvedMove: Move,
  ply: number
): TimelineNode {
  const moverColor = stateBefore.turn;
  const moveTurnNumber = stateBefore.fullMoveNumber;
  const nextState = makeMove(stateBefore, resolvedMove);
  const lastRecord = nextState.moveHistory[nextState.moveHistory.length - 1];
  const canonicalSan = lastRecord?.san ?? `${resolvedMove.from}${resolvedMove.to}`;
  const nextFen = gameStateToFen(nextState);

  const flags: TimelineMoveFlags = {
    check: nextState.inCheck,
    checkmate: nextState.status === 'checkmate',
    stalemate: nextState.status === 'stalemate',
    castle: resolvedMove.isCastle ?? null,
    promotion: resolvedMove.promotion ?? null,
    enPassant: Boolean(resolvedMove.isEnPassant),
    capture: Boolean(resolvedMove.captured),
  };

  return {
    ply,
    fen: nextFen,
    san: canonicalSan,
    from: resolvedMove.from,
    to: resolvedMove.to,
    captured: resolvedMove.captured?.type ?? null,
    flags,
    comment: null,
    nag: null,
    clock: null,
    pgnEval: null,
    pgnEvalFormatted: null,
    turnNumber: moveTurnNumber,
    color: moverColor,
    gameState: nextState,
  };
}

/**
 * Formats a concise human-readable SAN preview label for a variation line
 * e.g., "18... Nxd6 19. Bxd6 Qe7".
 */
function formatVariationLabel(nodes: TimelineNode[]): string {
  const parts: string[] = [];
  for (let i = 0; i < nodes.length && i < 6; i++) {
    const n = nodes[i];
    if (!n.san) continue;
    if (n.color === 'w') {
      parts.push(`${n.turnNumber}. ${n.san}${n.nag ?? ''}`);
    } else if (i === 0) {
      parts.push(`${n.turnNumber}... ${n.san}${n.nag ?? ''}`);
    } else {
      parts.push(`${n.san}${n.nag ?? ''}`);
    }
  }
  const suffix = nodes.length > 6 ? ' …' : '';
  return `${parts.join(' ')}${suffix}`;
}

/**
 * Parses a PGN Recursive Annotation Variation `( ... )` starting from `branchBaseState`
 * (the board state immediately BEFORE the mainline move that the variation is an alternative to).
 * Gracefully returns null if the variation text has no valid legal moves.
 */
function parseVariationLine(
  varMovetext: string,
  branchBaseState: GameState,
  basePly: number,
  variationId: string
): PgnVariationLine | null {
  const tokens = tokenizeMovetext(varMovetext);
  const nodes: TimelineNode[] = [];
  let curr = branchBaseState;

  for (const token of tokens) {
    if (token.type === 'comment') {
      const last = nodes[nodes.length - 1];
      if (last) {
        if (token.value) {
          last.comment = last.comment ? `${last.comment} ${token.value}` : token.value;
        }
        if (token.clock) last.clock = token.clock;
        if (token.pgnEval !== undefined && token.pgnEval !== null) {
          last.pgnEval = token.pgnEval;
          last.pgnEvalFormatted = token.pgnEvalFormatted ?? null;
        }
      }
      continue;
    }

    if (token.type === 'nag') {
      const last = nodes[nodes.length - 1];
      if (last) {
        last.nag = last.nag ? `${last.nag}${token.value}` : token.value;
      }
      continue;
    }

    if (token.type === 'variation') {
      // Nested sub-variations inside a variation are safely ignored to keep UI clean
      continue;
    }

    if (token.type === 'result') {
      break;
    }

    const resolved = resolveSanMove(curr, token.value);
    if (!resolved) {
      // Stop parsing malformed variation cleanly without throwing on the mainline game
      break;
    }

    const node = buildTimelineNodeFromMove(curr, resolved, basePly + nodes.length + 1);
    nodes.push(node);
    curr = node.gameState;
  }

  if (nodes.length === 0) return null;

  return {
    id: variationId,
    label: formatVariationLabel(nodes),
    nodes,
  };
}

/**
 * Parses a single PGN game chunk into an indexed `ParsedPgnGame` with a complete
 * pre-computed timeline (`ply 0..N`) of immutable `GameState` snapshots, FENs,
 * parsed clock/eval tags, and Recursive Annotation Variations.
 */
export function parseSinglePgnGame(
  gameChunk: string,
  options?: {
    id?: string;
    description?: string;
    theme?: ParsedPgnGame['theme'];
  }
): ParsedPgnGame {
  const { headers, movetext } = parsePgnHeaders(gameChunk);

  let initialState: GameState;
  let isCustomStart = false;

  if (headers.FEN && headers.FEN.trim().length > 0) {
    const parsedFen = fenToGameState(headers.FEN);
    if (!parsedFen) {
      throw new Error(`Invalid starting FEN in PGN header: "${headers.FEN}"`);
    }
    initialState = parsedFen;
    isCustomStart = true;
  } else {
    initialState = createInitialGameState();
  }

  const startingFen = gameStateToFen(initialState);
  const tokens = tokenizeMovetext(movetext);

  // Validate that the input actually looks like a PGN (has tags, valid FEN, or at least one move/result)
  const hasAnyTag = /^\s*\[[A-Za-z0-9_]+\s+"/.test(gameChunk);
  const hasSanOrResult = tokens.some(
    (t) => t.type === 'san' || t.type === 'result'
  );
  if (!hasAnyTag && !hasSanOrResult) {
    throw new Error('No valid PGN headers or chess moves found.');
  }

  const timeline: TimelineNode[] = [
    {
      ply: 0,
      fen: startingFen,
      san: null,
      from: null,
      to: null,
      captured: null,
      flags: { ...EMPTY_FLAGS },
      comment: null,
      nag: null,
      clock: null,
      pgnEval: null,
      pgnEvalFormatted: null,
      turnNumber: initialState.fullMoveNumber,
      color: null,
      gameState: initialState,
    },
  ];

  let currentState = initialState;
  let detectedResult: string | null = null;

  for (const token of tokens) {
    if (token.type === 'comment') {
      const lastNode = timeline[timeline.length - 1];
      if (token.value) {
        lastNode.comment = lastNode.comment
          ? `${lastNode.comment} ${token.value}`
          : token.value;
      }
      if (token.clock) {
        lastNode.clock = token.clock;
      }
      if (token.pgnEval !== undefined && token.pgnEval !== null) {
        lastNode.pgnEval = token.pgnEval;
        lastNode.pgnEvalFormatted = token.pgnEvalFormatted ?? null;
      }
      continue;
    }

    if (token.type === 'nag') {
      const lastNode = timeline[timeline.length - 1];
      if (lastNode.ply > 0) {
        lastNode.nag = lastNode.nag
          ? `${lastNode.nag}${token.value}`
          : token.value;
      }
      continue;
    }

    if (token.type === 'variation') {
      // Standard PGN RAV: a variation immediately following move M is an alternative to move M,
      // so it branches from the state BEFORE move M (`timeline[timeline.length - 2]`).
      if (timeline.length >= 2) {
        const targetNode = timeline[timeline.length - 1];
        const parentNode = timeline[timeline.length - 2];
        const varIndex = targetNode.variations?.length ?? 0;
        const parsedVar = parseVariationLine(
          token.value,
          parentNode.gameState,
          parentNode.ply,
          `var_${targetNode.ply}_${varIndex}`
        );
        if (parsedVar) {
          if (!targetNode.variations) {
            targetNode.variations = [];
          }
          targetNode.variations.push(parsedVar);
        }
      }
      continue;
    }

    if (token.type === 'result') {
      detectedResult = token.value;
      break;
    }

    // SAN move token
    const resolvedMove = resolveSanMove(currentState, token.value);
    if (!resolvedMove) {
      const moveNumLabel = `${currentState.fullMoveNumber}${
        currentState.turn === 'w' ? '.' : '...'
      }`;
      throw new Error(
        `Illegal or unrecognized SAN move "${token.value}" at move ${moveNumLabel} (ply ${timeline.length}).`
      );
    }

    const node = buildTimelineNodeFromMove(currentState, resolvedMove, timeline.length);
    timeline.push(node);
    currentState = node.gameState;
  }

  // Reject bare gibberish with no headers and 0 moves
  if (!hasAnyTag && timeline.length <= 1 && !detectedResult) {
    throw new Error('Could not parse any valid chess moves from the provided PGN.');
  }

  // Determine final result
  let finalResult = headers.Result;
  if (!finalResult || !RESULT_TOKENS.has(finalResult)) {
    finalResult = detectedResult ?? '*';
  }
  if (finalResult === '*' && detectedResult && detectedResult !== '*') {
    finalResult = detectedResult;
  }
  // If game ended on board in checkmate/stalemate and header was '*', infer result
  if (finalResult === '*') {
    if (currentState.status === 'checkmate') {
      finalResult = currentState.winner === 'w' ? '1-0' : '0-1';
    } else if (
      currentState.status === 'stalemate' ||
      currentState.status.startsWith('draw_')
    ) {
      finalResult = '1/2-1/2';
    }
  }

  headers.Result = finalResult;

  const id =
    options?.id ??
    `pgn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    headers,
    timeline,
    startingFen,
    isCustomStart,
    result: finalResult,
    description: options?.description,
    theme: options?.theme,
    rawPgn: gameChunk.trim(),
  };
}

/**
 * Parses a single-game or multi-game PGN text/file into an indexed list of games
 * plus per-game error diagnostics if any individual game in a bundle failed.
 */
export function parsePgnDatabase(rawPgn: string): PgnParseBatchResult {
  const chunks = splitPgnGames(rawPgn);
  if (chunks.length === 0) {
    return {
      games: [],
      errors: [
        {
          index: 0,
          title: 'Empty PGN',
          error: 'Please paste PGN text or upload a .pgn file containing at least one game.',
        },
      ],
    };
  }

  const games: ParsedPgnGame[] = [];
  const errors: PgnBatchGameError[] = [];

  chunks.forEach((chunk, index) => {
    try {
      const parsed = parseSinglePgnGame(chunk, {
        id: `imported_${index}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 6)}`,
      });
      games.push(parsed);
    } catch (err) {
      const { headers } = parsePgnHeaders(chunk);
      const title =
        headers.White !== 'White' || headers.Black !== 'Black'
          ? `${headers.White} vs. ${headers.Black}`
          : `Game #${index + 1}`;
      errors.push({
        index,
        title,
        error: err instanceof Error ? err.message : 'Failed to parse PGN game.',
      });
    }
  });

  return { games, errors };
}

/**
 * Extracts a clean, independent `GameState[]` stack from ply 0 up to `targetPly`
 * so the main game engine can branch seamlessly into active play while preserving
 * full historical move records, castling rights, en passant squares, and clocks.
 */
export function buildStateStackUpToPly(
  game: ParsedPgnGame,
  targetPly: number
): GameState[] {
  const clampedPly = Math.max(
    0,
    Math.min(targetPly, game.timeline.length - 1)
  );
  return game.timeline.slice(0, clampedPly + 1).map((node) => node.gameState);
}

/**
 * Converts a live or archived `stateStack` (e.g. a saved match or completed user game)
 * directly into a `ParsedPgnGame` ready to open in Replay Studio without losing any
 * custom starting position, castling rights, or move history.
 */
export function convertStateStackToParsedPgnGame(params: {
  id?: string;
  title?: string;
  stateStack: GameState[];
  gameMode: GameMode;
  playerColor: Color;
  engineProfile?: EngineProfileState;
  createdAt?: number;
  rawPgn?: string;
}): ParsedPgnGame {
  const stack =
    params.stateStack.length > 0
      ? params.stateStack
      : [createInitialGameState()];
  const firstState = stack[0];
  const lastState = stack[stack.length - 1];

  const startingFen = gameStateToFen(firstState);
  const standardStartFen = gameStateToFen(createInitialGameState());
  const isCustomStart = startingFen !== standardStartFen;

  let result = '*';
  if (lastState.status === 'checkmate') {
    result = lastState.winner === 'w' ? '1-0' : '0-1';
  } else if (
    lastState.status === 'stalemate' ||
    lastState.status.startsWith('draw_')
  ) {
    result = '1/2-1/2';
  }

  const aiLabel = `Caïssa AI (${params.engineProfile?.elo ?? 1000} Elo)`;
  const whiteName =
    params.gameMode === 'pass_and_play'
      ? 'Player 1 (White)'
      : params.playerColor === 'w'
      ? 'You'
      : aiLabel;
  const blackName =
    params.gameMode === 'pass_and_play'
      ? 'Player 2 (Black)'
      : params.playerColor === 'b'
      ? 'You'
      : aiLabel;

  const dateStr = new Date(params.createdAt ?? Date.now())
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '.');

  const headers: PgnHeaders = {
    Event: params.title || 'Saved User Match',
    Site: 'Caïssa Chess Salon',
    Date: dateStr,
    Round: '?',
    White: whiteName,
    Black: blackName,
    Result: result,
    ...(isCustomStart ? { FEN: startingFen, SetUp: '1' } : {}),
  };

  const timeline: TimelineNode[] = [
    {
      ply: 0,
      fen: startingFen,
      san: null,
      from: null,
      to: null,
      captured: null,
      flags: { ...EMPTY_FLAGS },
      comment: null,
      nag: null,
      clock: null,
      pgnEval: null,
      pgnEvalFormatted: null,
      turnNumber: firstState.fullMoveNumber,
      color: null,
      gameState: firstState,
    },
  ];

  for (let i = 1; i < stack.length; i++) {
    const st = stack[i];
    const lastRec = st.moveHistory[st.moveHistory.length - 1];
    if (!lastRec) continue;

    const flags: TimelineMoveFlags = {
      check: st.inCheck,
      checkmate: st.status === 'checkmate',
      stalemate: st.status === 'stalemate',
      castle: lastRec.move.isCastle ?? null,
      promotion: lastRec.move.promotion ?? null,
      enPassant: Boolean(lastRec.move.isEnPassant),
      capture: Boolean(lastRec.move.captured),
    };

    timeline.push({
      ply: i,
      fen: gameStateToFen(st),
      san: lastRec.san,
      from: lastRec.move.from,
      to: lastRec.move.to,
      captured: lastRec.move.captured?.type ?? null,
      flags,
      comment: null,
      nag: null,
      clock: null,
      pgnEval: null,
      pgnEvalFormatted: null,
      turnNumber: lastRec.turnNumber,
      color: lastRec.color,
      gameState: st,
    });
  }

  // Generate clean PGN text if not provided
  let rawPgn = params.rawPgn ?? '';
  if (!rawPgn) {
    const moveTokens: string[] = [];
    for (let i = 1; i < timeline.length; i++) {
      const node = timeline[i];
      if (!node.san) continue;
      if (node.color === 'w') {
        moveTokens.push(`${node.turnNumber}. ${node.san}`);
      } else if (i === 1) {
        moveTokens.push(`${node.turnNumber}... ${node.san}`);
      } else {
        moveTokens.push(node.san);
      }
    }
    const headerLines = [
      `[Event "${headers.Event}"]`,
      `[Site "${headers.Site}"]`,
      `[Date "${headers.Date}"]`,
      `[White "${headers.White}"]`,
      `[Black "${headers.Black}"]`,
      `[Result "${headers.Result}"]`,
    ];
    if (isCustomStart) {
      headerLines.push(`[SetUp "1"]`, `[FEN "${startingFen}"]`);
    }
    const movesText =
      moveTokens.length > 0 ? `${moveTokens.join(' ')} ${result}` : result;
    rawPgn = `${headerLines.join('\n')}\n\n${movesText}`;
  }

  return {
    id: params.id ?? `user_replay_${Date.now()}`,
    headers,
    timeline,
    startingFen,
    isCustomStart,
    result,
    description: params.title ? `Your match: ${params.title}` : undefined,
    rawPgn,
  };
}

/**
 * Converts a saved `StoredGameSession` directly into a `ParsedPgnGame` for Replay Studio.
 */
export function convertSessionToParsedPgnGame(
  session: StoredGameSession
): ParsedPgnGame {
  return convertStateStackToParsedPgnGame({
    id: `session_replay_${session.id}`,
    title: session.title,
    stateStack: session.stateStack,
    gameMode: session.gameMode,
    playerColor: session.playerColor,
    engineProfile: session.engineProfile,
    createdAt: session.createdAt,
    rawPgn: exportSessionToPgn(session),
  });
}

/**
 * Formats a concise human-readable display string for a parsed PGN game:
 * `White vs. Black (Result) - Event/Date`
 */
export function formatPgnGameSummary(game: ParsedPgnGame): string {
  const white = game.headers.White || 'White';
  const black = game.headers.Black || 'Black';
  const result = game.result || '*';
  const event = game.headers.Event && game.headers.Event !== '?' ? game.headers.Event : '';
  const year =
    game.headers.Date && !game.headers.Date.startsWith('????')
      ? game.headers.Date.slice(0, 4)
      : '';
  const context = [event, year].filter(Boolean).join(' · ');
  return context
    ? `${white} vs. ${black} (${result}) - ${context}`
    : `${white} vs. ${black} (${result})`;
}
