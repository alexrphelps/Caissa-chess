import {
  BOARD_SIZE,
  coordsToSquare,
  findKingSquare,
   getLegalSquareAttackers,
  getSquareAttackers,
  isInsideBoard,
  isKingInCheck,
  isSquareAttacked,
  MATERIAL_DISPLAY_VALUES,
  oppositeColor,
  PIECE_VALUES,
  squareToCoords,
} from './engine';
import {
  computeWinProbability,
  evaluateCaptureGain,
  evaluateSEE,
  evaluateSquareVulnerability,
  getTotalHangingRisk,
  isMoveSafe,
  MATE_THRESHOLD,
  MultiPVItem,
  PVStep,
  searchMultiPV,
} from './ai';
import {
  evaluateTaperedBreakdown,
  TaperedEvalBreakdown,
} from './evaluation';
import { lookupBookPosition } from './openingBook';
import {
  buildCoachEngineConfig,
  COACH_ENGINE_RATING_LABEL,
  DEFAULT_COACH_PLAYSTYLE,
  detectPlaystyleAlignmentNote,
  sanitizeCoachPlaystyle,
} from './coachPlaystyle';
import {
  Board,
  ChessEngineConfig,
  CoachPlaystyleProfile,
  Color,
  GameState,
  Move,
  Piece,
  PieceType,
  Square,
} from './types';

export type ThreatLevel = 'critical' | 'high' | 'moderate';

export interface ThreatenedPieceInfo {
  square: Square;
  piece: Piece;
  level: ThreatLevel;
  label: string; // e.g. "Hanging (Undefended)" | "Losing Exchange" | "Contested"
  attackerSquares: Square[];
  lowestAttackerType: PieceType;
  defended: boolean;
}

export type TacticalMotifTag =
  | 'CHECKMATE'
  | 'FORCED MATE'
  | 'THREAT RESCUE'
  | 'WINNING CAPTURE'
  | 'FORK'
  | 'DISCOVERED ATTACK'
  | 'PIN / SKEWER'
  | 'TRAP AVOIDED'
  | 'OUTPOST'
  | 'OPEN FILE / 7TH RANK'
  | 'PASSED PAWN'
  | 'BOOK LINE'
  | 'KING SAFETY'
  | 'CENTER & TEMPO'
  | 'POSITIONAL';

export interface RecommendedMove {
  rank: 1 | 2 | 3;
  move: Move;
  from: Square;
  to: Square;
  san: string;
  score: number;
  engineEval: number; // Centipawn evaluation from White's perspective
  formattedEval: string; // e.g., "+0.8", "-0.3", "0.0", "M2"
  winProb: number; // 0..100 estimated win probability for the active player
  searchDepth: number; // Search depth in plies (+ Quiescence)
  seeScore: number; // Static Exchange Evaluation score in centipawns
  tacticalMotif: TacticalMotifTag;
  positionalDelta: {
    pawnStructure: number;
    kingSafety: number;
    mobility: number;
  };
  pvLine: { from: Square; to: Square; san: string; color: Color }[];
  pvFormatted: string; // Full Principal Variation line e.g. "1. Nf3 Nc6 2. Bb5 a6"
  headline: string; // Short title e.g. "Capture undefended Rook on d5 (+5)"
  rationale: string; // Single-line summary for board status bar
  coachWhy: string; // Coach explanation of why the move works
  followUpPlan: string; // Follow-up plan & continuation line
  playstyleNote?: string; // Optional note when move aligns with the player's customized playstyle
  opponentReply?: { from: Square; to: Square; san: string };
  playerFollowUp?: { from: Square; to: Square; san: string };
}

export interface OpponentThreatInfo {
  from: Square;
  to: Square;
  san: string;
  severity: 'critical' | 'high' | 'positional';
  headline: string; // e.g. "Capture Threat: ...Nxd4 targets your Knight on d4"
  detail: string;
  continuationLine?: string;
}

export interface TacticsAnalysis {
  attackedSquares: Set<Square>;
  threatenedPieces: Map<Square, ThreatenedPieceInfo>;
  topMoves: RecommendedMove[];
  opponentThreat: OpponentThreatInfo | null;
  searchDepth: number;
  searchNodes: number;
  ttHits: number;
  elapsedMs: number;
  isDeepAnalysis: boolean;
  evalBreakdown: TaperedEvalBreakdown;
  engineConfig: ChessEngineConfig;
  engineRatingLabel: string;
  playstyle: CoachPlaystyleProfile;
}

const PIECE_LABELS: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

const FILE_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

const CENTER_SQUARES = new Set<Square>(['d4', 'd5', 'e4', 'e5']);
const EXTENDED_CENTER = new Set<Square>([
  'c3', 'd3', 'e3', 'f3',
  'c4', 'f4',
  'c5', 'f5',
  'c6', 'd6', 'e6', 'f6',
]);

/**
 * Computes all squares currently attacked by `enemyColor` on `board`,
 * accounting for sliding rays blocked by intervening pieces.
 * Note: Under FIDE rules, pinned enemy pieces still control squares against the player's King.
 */
export function getAttackedSquares(board: Board, enemyColor: Color): Set<Square> {
  const attacked = new Set<Square>();
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isSquareAttacked(board, r, c, enemyColor)) {
        attacked.add(coordsToSquare(r, c));
      }
    }
  }
  return attacked;
}

/**
 * Detects all friendly pieces of `playerColor` currently targeted by an opponent piece
 * and classifies their threat level:
 * - 'critical' (Hanging): Targeted piece is completely undefended.
 * - 'high' (Losing Exchange): Targeted piece is defended, but attacked by a lower-value piece
 *   (or outnumbered by attackers).
 * - 'moderate' (Contested): Targeted piece is defended and attacker has equal or higher value.
 */
export function detectThreatenedPieces(
  board: Board,
  playerColor: Color
): Map<Square, ThreatenedPieceInfo> {
  const result = new Map<Square, ThreatenedPieceInfo>();
  const enemyColor = oppositeColor(playerColor);

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== playerColor) continue;

      const square = coordsToSquare(r, c);

      if (piece.type === 'k') {
        const kingAttackers = getSquareAttackers(board, r, c, enemyColor);
        if (kingAttackers.length === 0) continue;
        kingAttackers.sort(
          (a, b) => PIECE_VALUES[a.piece.type] - PIECE_VALUES[b.piece.type]
        );
        const lowestAttacker = kingAttackers[0];
        const attackerName = PIECE_LABELS[lowestAttacker.piece.type];
        result.set(square, {
          square,
          piece,
          level: 'critical',
          label: `King in Check by ${attackerName} on ${lowestAttacker.square}`,
          attackerSquares: kingAttackers.map((a) => a.square),
          lowestAttackerType: lowestAttacker.piece.type,
          defended: false,
        });
        continue;
      }

      const attackers = getLegalSquareAttackers(board, r, c, enemyColor);
      if (attackers.length === 0) continue;

      const defenders = getLegalSquareAttackers(board, r, c, playerColor);

      // Sort attackers by ascending value to find the most dangerous (cheapest) attacker
      attackers.sort(
        (a, b) => PIECE_VALUES[a.piece.type] - PIECE_VALUES[b.piece.type]
      );
      const lowestAttacker = attackers[0];
      const pieceName = PIECE_LABELS[piece.type];
      const attackerName = PIECE_LABELS[lowestAttacker.piece.type];

      const pieceVal = PIECE_VALUES[piece.type];
      const minAttackerVal = PIECE_VALUES[lowestAttacker.piece.type];

      if (defenders.length === 0) {
        result.set(square, {
          square,
          piece,
          level: 'critical',
          label: `Hanging ${pieceName} (undefended, attacked by ${attackerName} on ${lowestAttacker.square})`,
          attackerSquares: attackers.map((a) => a.square),
          lowestAttackerType: lowestAttacker.piece.type,
          defended: false,
        });
      } else if (
        minAttackerVal < pieceVal ||
        (attackers.length > defenders.length && minAttackerVal <= pieceVal)
      ) {
        result.set(square, {
          square,
          piece,
          level: 'high',
          label: `Losing Exchange: ${pieceName} attacked by lower-value ${attackerName} (${lowestAttacker.square})`,
          attackerSquares: attackers.map((a) => a.square),
          lowestAttackerType: lowestAttacker.piece.type,
          defended: true,
        });
      } else {
        result.set(square, {
          square,
          piece,
          level: 'moderate',
          label: `Contested ${pieceName} (defended against ${attackerName} on ${lowestAttacker.square})`,
          attackerSquares: attackers.map((a) => a.square),
          lowestAttackerType: lowestAttacker.piece.type,
          defended: true,
        });
      }
    }
  }

  return result;
}

/**
 * Formats a sequence of PVSteps into numbered chess move notation
 * e.g. "1. e4 e5 2. Nf3 Nc6 3. Bb5" or "4... Nf6 5. O-O Be7".
 */
function formatPVLine(pvSteps: PVStep[], startFullMove: number): string {
  if (pvSteps.length === 0) return '';
  const parts: string[] = [];
  let moveNum = startFullMove;

  for (let i = 0; i < pvSteps.length; i++) {
    const step = pvSteps[i];
    if (step.color === 'w') {
      parts.push(`${moveNum}. ${step.san}`);
    } else {
      if (i === 0) {
        parts.push(`${moveNum}... ${step.san}`);
      } else {
        parts.push(step.san);
      }
      moveNum++;
    }
  }
  return parts.join(' ');
}

/**
 * Detects whether the moved piece on `move.to` creates a double attack / Fork
 * against two or more valuable or undefended enemy targets.
 */
function detectForkTargetNames(
  boardAfter: Board,
  move: Move,
  playerColor: Color
): string[] {
  const enemyColor = oppositeColor(playerColor);
  const landedVal = PIECE_VALUES[move.promotion ?? move.piece.type];
  const targets: { type: PieceType; square: Square; val: number }[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = boardAfter[r][c];
      if (!p || p.color !== enemyColor) continue;
      if (p.type === 'p') continue; // Focus on minor/major pieces and King for forks

      const attackers =
        p.type === 'k'
          ? getSquareAttackers(boardAfter, r, c, playerColor)
          : getLegalSquareAttackers(boardAfter, r, c, playerColor);

      const attackedByMovedPiece = attackers.some((a) => a.square === move.to);
      if (!attackedByMovedPiece) continue;

      if (p.type === 'k') {
        targets.push({ type: 'k', square: coordsToSquare(r, c), val: 20000 });
        continue;
      }

      const defenders = getLegalSquareAttackers(boardAfter, r, c, enemyColor);
      const targetVal = PIECE_VALUES[p.type];
      if (defenders.length === 0 || targetVal > landedVal) {
        targets.push({
          type: p.type,
          square: coordsToSquare(r, c),
          val: targetVal,
        });
      }
    }
  }

  if (targets.length >= 2) {
    targets.sort((a, b) => b.val - a.val);
    return targets
      .slice(0, 2)
      .map((t) => `${PIECE_LABELS[t.type]} (${t.square})`);
  }
  return [];
}

/**
 * Detects whether moving `move.piece` off `move.from` unblocks a friendly sliding piece
 * to create a Discovered Attack or Discovered Check on a high-value enemy target.
 */
function detectDiscoveredAttackTarget(
  boardBefore: Board,
  boardAfter: Board,
  move: Move,
  playerColor: Color
): string | null {
  const enemyColor = oppositeColor(playerColor);
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = boardAfter[r][c];
      if (!p || p.color !== enemyColor) continue;
      if (p.type === 'p' || PIECE_VALUES[p.type] < 320) continue;

      const beforeAttackers =
        p.type === 'k'
          ? getSquareAttackers(boardBefore, r, c, playerColor)
          : getLegalSquareAttackers(boardBefore, r, c, playerColor);
      const afterAttackers =
        p.type === 'k'
          ? getSquareAttackers(boardAfter, r, c, playerColor)
          : getLegalSquareAttackers(boardAfter, r, c, playerColor);

      const newSliderAttacker = afterAttackers.find(
        (a) =>
          a.square !== move.to &&
          (a.piece.type === 'r' || a.piece.type === 'b' || a.piece.type === 'q') &&
          !beforeAttackers.some((b) => b.square === a.square)
      );

      if (newSliderAttacker) {
        const targetSq = coordsToSquare(r, c);
        return `${PIECE_LABELS[p.type]} on ${targetSq} with ${PIECE_LABELS[newSliderAttacker.piece.type]} (${newSliderAttacker.square})`;
      }
    }
  }
  return null;
}

/**
 * Detects whether a sliding piece (`b`, `r`, `q`) landing on `move.to` creates a Pin or Skewer
 * along a rank, file, or diagonal against two aligned enemy pieces.
 */
export function detectPinOrSkewerTarget(
  boardAfter: Board,
  move: Move,
  playerColor: Color
): string | null {
  const pieceType = move.promotion ?? move.piece.type;
  if (pieceType !== 'b' && pieceType !== 'r' && pieceType !== 'q') {
    return null;
  }

  const enemyColor = oppositeColor(playerColor);
  const toCoords = squareToCoords(move.to);
  const dirs: [number, number][] = [];

  if (pieceType === 'r' || pieceType === 'q') {
    dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }
  if (pieceType === 'b' || pieceType === 'q') {
    dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }

  const attackerVal = PIECE_VALUES[pieceType];

  for (const [dr, dc] of dirs) {
    let r = toCoords.row + dr;
    let c = toCoords.col + dc;
    let firstEnemy: { piece: Piece; sq: Square; val: number } | null = null;

    while (isInsideBoard(r, c)) {
      const p = boardAfter[r][c];
      if (p) {
        if (p.color === playerColor) {
          break; // Blocked by friendly piece
        }
        const sq = coordsToSquare(r, c);
        const val = p.type === 'k' ? 20000 : PIECE_VALUES[p.type];
        if (!firstEnemy) {
          firstEnemy = { piece: p, sq, val };
        } else {
          // Second enemy piece along the same ray!
          const secondEnemy = { piece: p, sq, val };
          // Case 1: Pin (First piece is less valuable than the piece behind it, e.g., Knight pinned to King or Queen)
          if (
            firstEnemy.piece.type !== 'p' &&
            secondEnemy.val > firstEnemy.val &&
            secondEnemy.val >= 500
          ) {
            return `Pin ${PIECE_LABELS[firstEnemy.piece.type]} (${firstEnemy.sq}) to ${PIECE_LABELS[secondEnemy.piece.type]} (${secondEnemy.sq})`;
          }
          // Case 2: Skewer (First piece is King or higher-value piece forced to move, exposing piece behind it)
          if (
            firstEnemy.val > attackerVal &&
            secondEnemy.val >= 320 &&
            firstEnemy.val >= secondEnemy.val
          ) {
            return `Skewer ${PIECE_LABELS[firstEnemy.piece.type]} (${firstEnemy.sq}) & ${PIECE_LABELS[secondEnemy.piece.type]} (${secondEnemy.sq})`;
          }
          break;
        }
      }
      r += dr;
      c += dc;
    }
  }

  return null;
}

/**
 * Detects whether a Knight move establishes a classical central Outpost
 * (ranks 4-6 on files c/d/e/f, defended by a friendly pawn and immune to enemy pawn attacks).
 */
export function detectKnightOutpostReason(
  boardAfter: Board,
  move: Move,
  playerColor: Color
): string | null {
  if (move.piece.type !== 'n') return null;
  const { row, col } = squareToCoords(move.to);
  if (col < 2 || col > 5) return null;

  const isOutpostRank =
    playerColor === 'w' ? row >= 2 && row <= 4 : row >= 3 && row <= 5;
  if (!isOutpostRank) return null;

  const pawnDefRow = playerColor === 'w' ? row + 1 : row - 1;
  const defendedByPawn =
    (isInsideBoard(pawnDefRow, col - 1) &&
      boardAfter[pawnDefRow][col - 1]?.color === playerColor &&
      boardAfter[pawnDefRow][col - 1]?.type === 'p') ||
    (isInsideBoard(pawnDefRow, col + 1) &&
      boardAfter[pawnDefRow][col + 1]?.color === playerColor &&
      boardAfter[pawnDefRow][col + 1]?.type === 'p');

  if (!defendedByPawn) return null;

  const enemyColor = oppositeColor(playerColor);
  let canBeDrivenAwayByPawn = false;
  for (const adjCol of [col - 1, col + 1]) {
    if (adjCol < 0 || adjCol >= BOARD_SIZE) continue;
    if (playerColor === 'w') {
      for (let r = 0; r < row; r++) {
        const p = boardAfter[r][adjCol];
        if (p?.color === enemyColor && p.type === 'p') {
          canBeDrivenAwayByPawn = true;
          break;
        }
      }
    } else {
      for (let r = row + 1; r < BOARD_SIZE; r++) {
        const p = boardAfter[r][adjCol];
        if (p?.color === enemyColor && p.type === 'p') {
          canBeDrivenAwayByPawn = true;
          break;
        }
      }
    }
  }

  if (canBeDrivenAwayByPawn) return null;
  return `Establish Knight outpost on ${move.to} (supported by pawn, immune to enemy pawns)`;
}

/**
 * Detects whether a Rook move infiltrates the 7th rank or seizes an open / semi-open file.
 */
export function detectRookFileAnd7thRankReason(
  boardBefore: Board,
  boardAfter: Board,
  move: Move,
  playerColor: Color
): string | null {
  if (move.piece.type !== 'r') return null;
  const fromCoords = squareToCoords(move.from);
  const toCoords = squareToCoords(move.to);
  const seventhRank = playerColor === 'w' ? 1 : 6;

  if (toCoords.row === seventhRank && fromCoords.row !== seventhRank) {
    return `Infiltrate 7th rank with Rook on ${move.to}`;
  }

  if (fromCoords.col !== toCoords.col) {
    let friendlyPawns = 0;
    let enemyPawns = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      const p = boardAfter[r][toCoords.col];
      if (p?.type === 'p') {
        if (p.color === playerColor) friendlyPawns++;
        else enemyPawns++;
      }
    }
    const fileLabel = FILE_NAMES[toCoords.col];
    if (friendlyPawns === 0 && enemyPawns === 0) {
      return `Activate Rook on open ${fileLabel}-file (${move.to})`;
    }
    if (friendlyPawns === 0 && enemyPawns > 0) {
      return `Place Rook on semi-open ${fileLabel}-file (${move.to})`;
    }
  }

  return null;
}

/**
 * Detects whether a Pawn move creates or advances a Passed Pawn.
 */
export function detectPassedPawnAdvanceReason(
  boardAfter: Board,
  move: Move,
  playerColor: Color
): string | null {
  if (move.piece.type !== 'p' || move.promotion) return null;
  const { row, col } = squareToCoords(move.to);
  const enemyColor = oppositeColor(playerColor);

  for (let c = Math.max(0, col - 1); c <= Math.min(7, col + 1); c++) {
    if (playerColor === 'w') {
      for (let r = 0; r < row; r++) {
        const p = boardAfter[r][c];
        if (p?.color === enemyColor && p.type === 'p') return null;
      }
    } else {
      for (let r = row + 1; r < BOARD_SIZE; r++) {
        const p = boardAfter[r][c];
        if (p?.color === enemyColor && p.type === 'p') return null;
      }
    }
  }

  const rankAdvancement = playerColor === 'w' ? 7 - row : row;
  if (rankAdvancement >= 3) {
    return `Advance passed pawn to ${move.to}`;
  }
  return null;
}

/**
 * Builds rich Coach Commentary and Continuation Plan directly from the Multi-PV
 * Principal Variation line (`pvLine`), Tapered Positional Delta, and tactical analysis.
 */
function buildDeepCoachContinuation(
  item: MultiPVItem,
  startFullMove: number,
  primaryReason: string,
  secondaryReason?: string,
  refutedTrapNote?: string,
  positionalDelta?: {
    pawnStructure: number;
    kingSafety: number;
    mobility: number;
  }
): {
  coachWhy: string;
  followUpPlan: string;
  pvFormatted: string;
  opponentReply?: { from: Square; to: Square; san: string };
  playerFollowUp?: { from: Square; to: Square; san: string };
} {
  let expandedReason = `${primaryReason}.`;
  if (secondaryReason) {
    expandedReason = `${primaryReason}. Also ${secondaryReason
      .charAt(0)
      .toLowerCase()}${secondaryReason.slice(1)}.`;
  } else if (primaryReason.startsWith('Develop ')) {
    expandedReason = `${primaryReason}, activating a minor piece toward the center and clearing the back rank for castling.`;
  } else if (primaryReason.startsWith('Control central square')) {
    expandedReason = `${primaryReason}, contesting key central territory and opening lines for your pieces.`;
  } else if (primaryReason.startsWith('Castle ')) {
    expandedReason = `${primaryReason}, tucking the King away from central files and activating your Rook.`;
  } else if (primaryReason.startsWith('Capture ')) {
    expandedReason = `${primaryReason}, converting an immediate tactical opportunity verified by Static Exchange Evaluation.`;
  } else if (primaryReason.startsWith('Rescue ')) {
    expandedReason = `${primaryReason}, moving your attacked piece to a safe, defended square before the opponent can capture it.`;
  } else if (primaryReason.startsWith('Establish Knight outpost')) {
    expandedReason = `${primaryReason}, anchoring a dominant central piece that enemy pawns cannot dislodge.`;
  } else if (
    primaryReason.startsWith('Activate Rook on open') ||
    primaryReason.startsWith('Infiltrate 7th rank')
  ) {
    expandedReason = `${primaryReason}, maximizing heavy-piece mobility and pressuring deep enemy targets.`;
  } else if (primaryReason.startsWith('Advance passed pawn')) {
    expandedReason = `${primaryReason}, increasing promotion pressure and tying down enemy defenders.`;
  }

  // Append Tapered Positional insight when a quiet move yields a significant structural/activity gain
  if (positionalDelta && !secondaryReason && !refutedTrapNote) {
    const highlights: string[] = [];
    if (positionalDelta.mobility >= 18) {
      highlights.push(`+${(positionalDelta.mobility / 100).toFixed(1)} piece activity`);
    }
    if (positionalDelta.pawnStructure >= 15) {
      highlights.push(`+${(positionalDelta.pawnStructure / 100).toFixed(1)} pawn structure`);
    }
    if (positionalDelta.kingSafety >= 20) {
      highlights.push(`+${(positionalDelta.kingSafety / 100).toFixed(1)} King shelter`);
    }
    if (highlights.length > 0) {
      expandedReason = `${expandedReason} Tapered eval gain: ${highlights.join(', ')}.`;
    }
  }

  if (refutedTrapNote) {
    expandedReason = `${expandedReason} ${refutedTrapNote}`;
  }

  const pvFormatted = formatPVLine(item.pvLine, startFullMove);

  if (item.nextState.status === 'checkmate') {
    return {
      coachWhy: `${item.san} delivers immediate checkmate—the opponent King has no legal escape.`,
      followUpPlan: 'Match concludes immediately on this move.',
      pvFormatted,
    };
  }

  if (item.nextState.status !== 'playing') {
    return {
      coachWhy: expandedReason,
      followUpPlan: 'Concludes the game by FIDE draw rules.',
      pvFormatted,
    };
  }

  const replyStep = item.pvLine[1];
  if (!replyStep) {
    return {
      coachWhy: expandedReason,
      followUpPlan: 'Maintain piece coordination and central pressure.',
      pvFormatted,
    };
  }

  const opponentReply = {
    from: replyStep.from,
    to: replyStep.to,
    san: replyStep.san,
  };

  const followStep = item.pvLine[2];
  if (!followStep) {
    return {
      coachWhy: expandedReason,
      followUpPlan: `If opponent replies ${replyStep.san}, consolidate your position (${pvFormatted}).`,
      pvFormatted,
      opponentReply,
    };
  }

  const playerFollowUp = {
    from: followStep.from,
    to: followStep.to,
    san: followStep.san,
  };

  const followUpPieceName = PIECE_LABELS[followStep.move.piece.type];
  let actionDesc = `continue with ${followStep.san} (${followUpPieceName} to ${followStep.to})`;
  if (followStep.move.isCastle) {
    actionDesc = `castle (${followStep.san}) to secure your King`;
  } else if (followStep.move.captured) {
    const capName = PIECE_LABELS[followStep.move.captured.type];
    actionDesc = `answer with ${followStep.san}, capturing the ${capName} on ${followStep.to}`;
  } else if (CENTER_SQUARES.has(followStep.to)) {
    actionDesc = `follow up with ${followStep.san} to contest the center`;
  }

  const extraSteps =
    item.pvLine.length > 3
      ? ` · Line: ${pvFormatted}`
      : '';

  return {
    coachWhy: expandedReason,
    followUpPlan: `If ${replyStep.san}, ${actionDesc}.${extraSteps}`,
    pvFormatted,
    opponentReply,
    playerFollowUp,
  };
}

/**
 * Predicts what the opponent is threatening on the next turn using a Zobrist-accelerated
 * Null-Move (Pass) search when not in check, or reports the active checking attacker when in check.
 */
export function detectOpponentThreat(
  state: GameState,
  options?: {
    maxDepth?: number;
    maxTimeMs?: number;
    engineConfig?: Partial<ChessEngineConfig>;
  }
): OpponentThreatInfo | null {
  if (state.status !== 'playing') return null;

  const playerColor = state.turn;
  const enemyColor = oppositeColor(playerColor);

  // 1. If King is currently in check, highlight the checking piece
  if (state.inCheck) {
    const kingSq = findKingSquare(state.board, playerColor);
    if (kingSq) {
      const kCoords = squareToCoords(kingSq);
      const attackers = getSquareAttackers(
        state.board,
        kCoords.row,
        kCoords.col,
        enemyColor
      );
      if (attackers.length > 0) {
        const atk = attackers[0];
        const atkName = PIECE_LABELS[atk.piece.type];
        return {
          from: atk.square,
          to: kingSq,
          san: `${atk.square}→${kingSq}+`,
          severity: 'critical',
          headline: `Active Check: Enemy ${atkName} on ${atk.square} checks your King`,
          detail: `You must resolve check immediately by capturing on ${atk.square}, interposing a blocker, or moving your King to an unattacked square.`,
        };
      }
    }
  }

  // 2. Null-Move (Pass) search: what would the opponent do if given the move right now?
  const passState: GameState = {
    ...state,
    turn: enemyColor,
    enPassantTarget: null,
    inCheck: false,
  };

  const passSearch = searchMultiPV(passState, {
    maxDepth: options?.maxDepth ?? 6,
    maxTimeMs: options?.maxTimeMs ?? 70,
    multiPvCount: 1,
    engineConfig: options?.engineConfig,
    forCoach: true,
  });

  const enemyBest = passSearch.items[0];
  if (!enemyBest) return null;

  const { move, san, seeScore, scoreForTurn, nextState, pvLine } = enemyBest;
  const continuationLine = formatPVLine(pvLine, state.fullMoveNumber);

  if (nextState.status === 'checkmate' || scoreForTurn >= MATE_THRESHOLD) {
    return {
      from: move.from,
      to: move.to,
      san,
      severity: 'critical',
      headline: `Mate Threat: Opponent threatens ...${san} (${move.from} → ${move.to})`,
      detail: `Critical defensive alert: if left unaddressed, opponent has a forced checkmate sequence beginning with ${san}.`,
      continuationLine,
    };
  }

  if (move.captured && seeScore >= 80) {
    const victimName = PIECE_LABELS[move.captured.type];
    const netGainPts = Math.max(1, Math.round(seeScore / 100));
    return {
      from: move.from,
      to: move.to,
      san,
      severity: seeScore >= 280 ? 'critical' : 'high',
      headline: `Capture Threat: Opponent threatens ...${san}, winning ${victimName} on ${move.to} (+${netGainPts})`,
      detail: `Opponent's best next move if unaddressed is ${san} (${move.from} → ${move.to}). Our #1 recommended move accounts for this threat.`,
      continuationLine,
    };
  }

  const enemyForkTargets = detectForkTargetNames(
    nextState.board,
    move,
    enemyColor
  );
  if (enemyForkTargets.length >= 2) {
    return {
      from: move.from,
      to: move.to,
      san,
      severity: 'high',
      headline: `Fork Threat: Opponent eyes ...${san}, forking ${enemyForkTargets.join(' & ')}`,
      detail: `Opponent threatens ${san} to attack multiple pieces simultaneously.`,
      continuationLine,
    };
  }

  const enemyPinOrSkewer = detectPinOrSkewerTarget(
    nextState.board,
    move,
    enemyColor
  );
  if (enemyPinOrSkewer) {
    return {
      from: move.from,
      to: move.to,
      san,
      severity: 'high',
      headline: `Tactical Threat: Opponent eyes ...${san} (${enemyPinOrSkewer})`,
      detail: `Opponent threatens to align your pieces along a tactical ray with ${san}.`,
      continuationLine,
    };
  }

  if (isKingInCheck(nextState.board, playerColor)) {
    return {
      from: move.from,
      to: move.to,
      san,
      severity: 'high',
      headline: `Tactical Alert: Opponent eyes check ...${san} (${move.from} → ${move.to})`,
      detail: `Opponent threatens to play ${san} with tempo against your King.`,
      continuationLine,
    };
  }

  return {
    from: move.from,
    to: move.to,
    san,
    severity: 'positional',
    headline: `Opponent Plan: Eyes ...${san} (${move.from} → ${move.to})`,
    detail: `No immediate material blunder is forced; opponent's main positional plan is ${san}.`,
    continuationLine,
  };
}

/**
 * Evaluates all legal moves for the active player using Multi-PV Alpha-Beta + Quiescence search,
 * 64-bit Zobrist TT, NMP, LMR, Static Exchange Evaluation (SEE), Tapered Positional Breakdown,
 * and FIDE Opening Book synergy, returning the Top 3 Recommended Moves.
 */
export function computeTopRecommendations(
  state: GameState,
  threatenedPieces: Map<Square, ThreatenedPieceInfo>,
  searchOptions?: {
    maxDepth?: number;
    maxTimeMs?: number;
    engineConfig?: Partial<ChessEngineConfig>;
  }
): RecommendedMove[] {
  return computeRecommendationsWithTelemetry(
    state,
    threatenedPieces,
    searchOptions
  ).topMoves;
}

function computeRecommendationsWithTelemetry(
  state: GameState,
  threatenedPieces: Map<Square, ThreatenedPieceInfo>,
  searchOptions?: {
    maxDepth?: number;
    maxTimeMs?: number;
    engineConfig?: Partial<ChessEngineConfig>;
    coachPlaystyle?: CoachPlaystyleProfile;
  }
): {
  topMoves: RecommendedMove[];
  searchDepth: number;
  searchNodes: number;
  ttHits: number;
  elapsedMs: number;
  evalBreakdown: TaperedEvalBreakdown;
  engineConfig: ChessEngineConfig;
} {
  const playerColor = state.turn;
  const activePlaystyle = sanitizeCoachPlaystyle(
    searchOptions?.coachPlaystyle ?? DEFAULT_COACH_PLAYSTYLE
  );
  const baseBreakdown = evaluateTaperedBreakdown(
    state.board,
    playerColor,
    searchOptions?.engineConfig ?? 'club'
  );

  if (state.status !== 'playing') {
    const emptyRes = searchMultiPV(state, {
      ...searchOptions,
      forCoach: true,
    });
    return {
      topMoves: [],
      searchDepth: 0,
      searchNodes: 0,
      ttHits: 0,
      elapsedMs: 0,
      evalBreakdown: baseBreakdown,
      engineConfig: emptyRes.config,
    };
  }

  const multiPvResult = searchMultiPV(state, {
    maxDepth: searchOptions?.maxDepth ?? 6,
    maxTimeMs: searchOptions?.maxTimeMs ?? 90,
    multiPvCount: 3,
    engineConfig: searchOptions?.engineConfig,
    forCoach: true,
  });

  if (multiPvResult.items.length === 0) {
    return {
      topMoves: [],
      searchDepth: 0,
      searchNodes: 0,
      ttHits: 0,
      elapsedMs: 0,
      evalBreakdown: baseBreakdown,
      engineConfig: multiPvResult.config,
    };
  }

  const enemyColor = oppositeColor(playerColor);
  const currentRisk = getTotalHangingRisk(state.board, playerColor);
  const backRankRow = playerColor === 'w' ? 7 : 0;
  const signForWhite = playerColor === 'w' ? 1 : -1;

  interface EnrichedCandidate {
    item: MultiPVItem;
    combinedRankScore: number;
    static1PlyScore: number;
    tacticalMotif: TacticalMotifTag;
    positionalDelta: {
      pawnStructure: number;
      kingSafety: number;
      mobility: number;
    };
    primaryReason: string;
    secondaryReason?: string;
    playstyleNote?: string;
    headline: string;
    rationale: string;
  }

  const enemyKingSq = findKingSquare(state.board, enemyColor);
  const enemyKingCoords = enemyKingSq ? squareToCoords(enemyKingSq) : null;
  const enriched: EnrichedCandidate[] = [];

  for (const item of multiPvResult.items) {
    const { move, nextState, san, scoreForTurn, seeScore } = item;
    const boardAfter = nextState.board;

    // 1. Immediate Checkmate
    if (nextState.status === 'checkmate') {
      enriched.push({
        item,
        combinedRankScore: 100000,
        static1PlyScore: 100000,
        tacticalMotif: 'CHECKMATE',
        positionalDelta: { pawnStructure: 0, kingSafety: 0, mobility: 0 },
        primaryReason: `Delivers immediate checkmate on ${move.to}`,
        headline: `Checkmate (${san})`,
        rationale: `${san}: Delivers immediate checkmate on ${move.to}!`,
      });
      continue;
    }

    const afterBreakdown = evaluateTaperedBreakdown(
      boardAfter,
      playerColor,
      multiPvResult.config
    );
    const positionalDelta = {
      pawnStructure: afterBreakdown.pawnStructure - baseBreakdown.pawnStructure,
      kingSafety: afterBreakdown.kingSafety - baseBreakdown.kingSafety,
      mobility: afterBreakdown.mobility - baseBreakdown.mobility,
    };

    const captureNetGain = evaluateCaptureGain(state.board, move, playerColor);
    const safeMove = isMoveSafe(state.board, move, playerColor);
    const rawAfterRisk = getTotalHangingRisk(boardAfter, playerColor);
    const toCoords = squareToCoords(move.to);
    const fromCoords = squareToCoords(move.from);

    const riskOnTargetAfter =
      move.captured || move.promotion
        ? evaluateSquareVulnerability(
            boardAfter,
            toCoords.row,
            toCoords.col,
            playerColor
          )
        : 0;
    const effectiveAfterRisk = Math.max(
      0,
      rawAfterRisk.totalRisk - riskOnTargetAfter
    );
    const riskReduction = currentRisk.totalRisk - effectiveAfterRisk;
    const givesCheck = isKingInCheck(boardAfter, enemyColor);
    const pieceName = PIECE_LABELS[move.piece.type];

    // Check FIDE Opening Book match in first 14 moves
    const bookEntry =
      state.fullMoveNumber <= 14
        ? lookupBookPosition(boardAfter, nextState.turn)
        : null;

    // Detect tactical & positional motifs (Fork, Discovered Attack, Pin/Skewer, Outpost, 7th Rank/Open File, Passed Pawn)
    const forkTargets =
      safeMove && scoreForTurn > -150
        ? detectForkTargetNames(boardAfter, move, playerColor)
        : [];
    const discoveredTarget =
      safeMove && scoreForTurn > -150
        ? detectDiscoveredAttackTarget(
            state.board,
            boardAfter,
            move,
            playerColor
          )
        : null;
    const pinOrSkewerTarget =
      safeMove && scoreForTurn > -150
        ? detectPinOrSkewerTarget(boardAfter, move, playerColor)
        : null;
    const knightOutpostReason =
      safeMove && !move.captured
        ? detectKnightOutpostReason(boardAfter, move, playerColor)
        : null;
    const rookFileReason =
      safeMove && !move.captured
        ? detectRookFileAnd7thRankReason(
            state.board,
            boardAfter,
            move,
            playerColor
          )
        : null;
    const passedPawnReason =
      safeMove && !move.captured
        ? detectPassedPawnAdvanceReason(boardAfter, move, playerColor)
        : null;

    let positionalBonus = 0;
    const reasons: string[] = [];
    let motif: TacticalMotifTag = 'POSITIONAL';

    if (scoreForTurn >= MATE_THRESHOLD) {
      const pliesToMate = Math.max(1, Math.round(100000 - scoreForTurn));
      const movesToMate = Math.max(1, Math.ceil(pliesToMate / 2));
      motif = 'FORCED MATE';
      reasons.unshift(`Forced Checkmate in ${movesToMate} (${san})`);
    }

    if (move.isCastle === 'K') {
      positionalBonus += 45;
      if (motif === 'POSITIONAL') motif = 'KING SAFETY';
      reasons.push('Castle King-side to shelter King & activate Rook');
    } else if (move.isCastle === 'Q') {
      positionalBonus += 40;
      if (motif === 'POSITIONAL') motif = 'KING SAFETY';
      reasons.push('Castle Queen-side to shelter King & centralize Rook');
    }

    if (move.promotion) {
      const promoPoints = MATERIAL_DISPLAY_VALUES[move.promotion];
      positionalBonus += PIECE_VALUES[move.promotion];
      if (motif === 'POSITIONAL') motif = 'WINNING CAPTURE';
      reasons.push(
        `Promote Pawn to ${PIECE_LABELS[move.promotion]} (+${promoPoints})`
      );
    }

    // Material capture evaluation backed by SEE + Deep Search
    if (move.captured) {
      const targetName = PIECE_LABELS[move.captured.type];
      const targetPts = MATERIAL_DISPLAY_VALUES[move.captured.type];
      const enemyAttackersAfter = getLegalSquareAttackers(
        boardAfter,
        toCoords.row,
        toCoords.col,
        enemyColor
      );

      if (enemyAttackersAfter.length === 0) {
        if (motif === 'POSITIONAL') motif = 'WINNING CAPTURE';
        reasons.unshift(
          `Capture undefended ${targetName} on ${move.to} (+${targetPts})`
        );
      } else if (captureNetGain >= 80) {
        const netPts = Math.max(1, Math.round(captureNetGain / 100));
        if (motif === 'POSITIONAL') motif = 'WINNING CAPTURE';
        reasons.unshift(
          `Winning exchange: capture ${targetName} on ${move.to} (+${netPts})`
        );
      } else if (captureNetGain >= 0) {
        if (riskReduction >= 80) {
          if (motif === 'POSITIONAL') motif = 'THREAT RESCUE';
          reasons.unshift(
            `Trade ${pieceName} for ${targetName} on ${move.to} & resolve threat`
          );
        } else {
          reasons.push(`Equal trade for ${targetName} on ${move.to}`);
        }
      } else {
        reasons.push(`Unfavorable capture on ${move.to} (loses material)`);
      }
    }

    // Threat neutralization (rescuing or defending a threatened friendly piece)
    const movedPieceThreat = threatenedPieces.get(move.from);
    if (
      movedPieceThreat &&
      (movedPieceThreat.level === 'critical' ||
        movedPieceThreat.level === 'high') &&
      safeMove &&
      riskReduction >= 80 &&
      !move.captured
    ) {
      const savedPts = Math.max(1, Math.round(riskReduction / 100));
      if (motif === 'POSITIONAL') motif = 'THREAT RESCUE';
      reasons.unshift(
        `Rescue threatened ${pieceName} to safe square ${move.to} (saves +${savedPts})`
      );
    } else if (riskReduction >= 100 && safeMove && !move.captured) {
      const savedPts = Math.max(1, Math.round(riskReduction / 100));
      if (motif === 'POSITIONAL') motif = 'THREAT RESCUE';
      reasons.unshift(
        `Defend threatened piece & neutralize attack (+${savedPts})`
      );
    }

    // Tactical Ray & Double-Attack motifs (Fork, Discovered Attack, Pin/Skewer)
    if (forkTargets.length >= 2) {
      if (motif === 'POSITIONAL') {
        motif = 'FORK';
      }
      reasons.unshift(`Tactical Fork on ${forkTargets.join(' & ')}`);
    } else if (discoveredTarget) {
      if (motif === 'POSITIONAL') {
        motif = 'DISCOVERED ATTACK';
      }
      reasons.unshift(`Discovered attack on ${discoveredTarget}`);
    } else if (pinOrSkewerTarget) {
      if (motif === 'POSITIONAL') {
        motif = 'PIN / SKEWER';
      }
      reasons.unshift(pinOrSkewerTarget);
    }

    // Classical Positional Motifs (Knight Outpost, Rook Open File / 7th Rank, Passed Pawn)
    if (knightOutpostReason) {
      positionalBonus += 28;
      if (motif === 'POSITIONAL') motif = 'OUTPOST';
      reasons.push(knightOutpostReason);
    }
    if (rookFileReason) {
      positionalBonus += 26;
      if (motif === 'POSITIONAL') motif = 'OPEN FILE / 7TH RANK';
      reasons.push(rookFileReason);
    }
    if (passedPawnReason) {
      positionalBonus += 30;
      if (motif === 'POSITIONAL') motif = 'PASSED PAWN';
      reasons.push(passedPawnReason);
    }

    // Opening Book Mainline synergy
    if (bookEntry && safeMove) {
      positionalBonus += 26;
      if (motif === 'POSITIONAL') motif = 'BOOK LINE';
      reasons.push(`Book Line: ${bookEntry.family} (${bookEntry.eco})`);
    }

    // Center control & development
    if (CENTER_SQUARES.has(move.to)) {
      positionalBonus += move.piece.type === 'p' ? 28 : 22;
      if (motif === 'POSITIONAL') motif = 'CENTER & TEMPO';
      reasons.push(`Control central square ${move.to}`);
    } else if (EXTENDED_CENTER.has(move.to)) {
      positionalBonus += 10;
    }

    if (
      (move.piece.type === 'n' || move.piece.type === 'b') &&
      fromCoords.row === backRankRow &&
      toCoords.row !== backRankRow
    ) {
      positionalBonus += 24;
      if (motif === 'POSITIONAL') motif = 'CENTER & TEMPO';
      reasons.push(`Develop ${pieceName} off the back rank`);
    }

    if (givesCheck && safeMove) {
      positionalBonus += 15;
      reasons.push(`Deliver safe check (${san})`);
    }

    if (state.inCheck && safeMove) {
      if (motif === 'POSITIONAL') motif = 'THREAT RESCUE';
      reasons.unshift(`Escape check safely (${san})`);
    }

    // 1-ply naive static score (used to detect multi-ply tactical traps!)
    const static1PlyScore =
      captureNetGain * 1.4 +
      riskReduction * 1.15 +
      positionalBonus -
      (safeMove ? 0 : 650);

    // Deep Combined Rank Score: Strictly driven by the Multi-PV Alpha-Beta + Quiescence engine evaluation
    // (`scoreForTurn`) so the Coach has full 5-6 ply + Quiescence tactical strength, with only a
    // <= 3cp tie-breaker for Opening Book theory and development when moves have identical engine scores.
    const microBookTieBreaker =
      bookEntry && safeMove && state.fullMoveNumber <= 10 ? 2 : 0;
    const microPositionalTieBreaker = Math.min(
      1,
      Math.max(0, Math.round(positionalBonus * 0.02))
    );
    let combinedRankScore =
      scoreForTurn + microBookTieBreaker + microPositionalTieBreaker;

    if (!safeMove && seeScore < -150 && scoreForTurn < MATE_THRESHOLD) {
      combinedRankScore -= 150;
      reasons.unshift(`Warning: places ${pieceName} on an unsafe square`);
    }

    const primaryReason =
      reasons[0] ?? `Improve ${pieceName} activity on ${move.to}`;
    const secondaryReason = reasons[1];

    let movesTowardEnemyKing = false;
    if (enemyKingCoords) {
      const distBefore =
        Math.abs(fromCoords.row - enemyKingCoords.row) +
        Math.abs(fromCoords.col - enemyKingCoords.col);
      const distAfter =
        Math.abs(toCoords.row - enemyKingCoords.row) +
        Math.abs(toCoords.col - enemyKingCoords.col);
      movesTowardEnemyKing = distAfter < distBefore && distAfter <= 4;
    }

    const playstyleNote =
      scoreForTurn < MATE_THRESHOLD
        ? detectPlaystyleAlignmentNote(
            activePlaystyle,
            move,
            positionalDelta,
            givesCheck,
            movesTowardEnemyKing
          )
        : undefined;

    enriched.push({
      item,
      combinedRankScore: Math.round(combinedRankScore),
      static1PlyScore: Math.round(static1PlyScore),
      tacticalMotif: motif,
      positionalDelta,
      primaryReason,
      secondaryReason,
      playstyleNote,
      headline: primaryReason,
      rationale: `${san}: ${primaryReason}${
        secondaryReason ? ` · ${secondaryReason}` : ''
      }`,
    });
  }

  // Sort descending by the Deep Multi-PV combined rank score
  enriched.sort((a, b) => b.combinedRankScore - a.combinedRankScore);

  // Detect if there was a tempting 1-ply trap that the deep search refuted
  let refutedTrapNote: string | undefined;
  const bestCandidate = enriched[0];
  if (bestCandidate && bestCandidate.combinedRankScore < MATE_THRESHOLD) {
    const temptingTrap = enriched.find(
      (c) =>
        c !== bestCandidate &&
        c.static1PlyScore > bestCandidate.static1PlyScore + 90 &&
        c.item.scoreForTurn < bestCandidate.item.scoreForTurn - 140
    );
    if (temptingTrap) {
      const refutationSan = temptingTrap.item.pvLine[1]?.san;
      refutedTrapNote = refutationSan
        ? `Refutes the tempting trap ${temptingTrap.item.san}, which fails to opponent's ${refutationSan}.`
        : `Avoids the tactical trap in ${temptingTrap.item.san}.`;
      if (bestCandidate.tacticalMotif === 'POSITIONAL') {
        bestCandidate.tacticalMotif = 'TRAP AVOIDED';
      }
    }
  }

  // If a Mate-in-1 move exists, the Tactical Coach must ONLY recommend the winning checkmate move
  const matingCandidates = enriched.filter(
    (c) => c.item.nextState.status === 'checkmate'
  );
  const selectedCandidates =
    matingCandidates.length > 0
      ? [matingCandidates[0]]
      : enriched.slice(0, 3);

  const topMoves: RecommendedMove[] = selectedCandidates.map((cand, idx) => {
    const coach = buildDeepCoachContinuation(
      cand.item,
      state.fullMoveNumber,
      cand.primaryReason,
      cand.secondaryReason,
      idx === 0 ? refutedTrapNote : undefined,
      cand.positionalDelta
    );

    const whiteScore =
      cand.item.nextState.status === 'checkmate'
        ? 100000 * signForWhite
        : cand.item.whiteScore;

    return {
      rank: (idx + 1) as 1 | 2 | 3,
      move: cand.item.move,
      from: cand.item.move.from,
      to: cand.item.move.to,
      san: cand.item.san,
      score: cand.combinedRankScore,
      engineEval: whiteScore,
      formattedEval:
        cand.item.nextState.status === 'checkmate'
          ? signForWhite > 0
            ? 'M1'
            : '-M1'
          : cand.item.formattedScore,
      winProb:
        cand.item.nextState.status === 'checkmate'
          ? 100
          : computeWinProbability(cand.item.scoreForTurn),
      searchDepth: multiPvResult.depth,
      seeScore: cand.item.seeScore,
      tacticalMotif: cand.tacticalMotif,
      positionalDelta: cand.positionalDelta,
      pvLine: cand.item.pvLine.map((s) => ({
        from: s.from,
        to: s.to,
        san: s.san,
        color: s.color,
      })),
      pvFormatted: coach.pvFormatted,
      headline: cand.headline,
      rationale: cand.rationale,
      coachWhy: coach.coachWhy,
      followUpPlan: coach.followUpPlan,
      playstyleNote: cand.playstyleNote,
      opponentReply: coach.opponentReply,
      playerFollowUp: coach.playerFollowUp,
    };
  });

  return {
    topMoves,
    searchDepth: multiPvResult.depth,
    searchNodes: multiPvResult.nodes,
    ttHits: multiPvResult.ttHits,
    elapsedMs: multiPvResult.elapsedMs,
    evalBreakdown: baseBreakdown,
    engineConfig: multiPvResult.config,
  };
}

/**
 * Synchronous fast 3000+ tactical analysis (up to 6-ply + Quiescence Multi-PV on the
 * zero-allocation 0x88 engine with isolated 16 MB TT) for immediate UI rendering (~15-65ms).
 * Always operates at full 3000+ GM tactical soundness regardless of Opponent AI difficulty.
 */
export function analyzeTactics(
  state: GameState,
  engineConfig?: Partial<ChessEngineConfig>,
  coachPlaystyle?: CoachPlaystyleProfile
): TacticsAnalysis {
  const effectivePlaystyle = sanitizeCoachPlaystyle(
    coachPlaystyle ?? DEFAULT_COACH_PLAYSTYLE
  );
  const fastCoachConfig = buildCoachEngineConfig(
    effectivePlaystyle,
    'fast',
    engineConfig
  );
  const threatCoachConfig = buildCoachEngineConfig(
    effectivePlaystyle,
    'threat',
    {
      ...engineConfig,
      maxDepth: Math.min(5, fastCoachConfig.maxDepth),
      maxTimeMs: 45,
    }
  );

  const enemyColor = oppositeColor(state.turn);
  const attackedSquares = getAttackedSquares(state.board, enemyColor);
  const threatenedPieces = detectThreatenedPieces(state.board, state.turn);
  const {
    topMoves,
    searchDepth,
    searchNodes,
    ttHits,
    elapsedMs,
    evalBreakdown,
    engineConfig: resolvedConfig,
  } = computeRecommendationsWithTelemetry(state, threatenedPieces, {
    maxDepth: fastCoachConfig.maxDepth,
    maxTimeMs: fastCoachConfig.maxTimeMs,
    engineConfig: fastCoachConfig,
    coachPlaystyle: effectivePlaystyle,
  });
  const opponentThreat = detectOpponentThreat(state, {
    maxDepth: threatCoachConfig.maxDepth,
    maxTimeMs: threatCoachConfig.maxTimeMs,
    engineConfig: threatCoachConfig,
  });

  return {
    attackedSquares,
    threatenedPieces,
    topMoves,
    opponentThreat,
    searchDepth,
    searchNodes,
    ttHits,
    elapsedMs,
    isDeepAnalysis: false,
    evalBreakdown,
    engineConfig: resolvedConfig,
    engineRatingLabel: COACH_ENGINE_RATING_LABEL,
    playstyle: effectivePlaystyle,
  };
}

/**
 * Deep asynchronous 3000+ GM Multi-PV Coach Analysis (Iterative Deepening PVS up to 14-16 ply
 * + Quiescence + 64-bit Zobrist TT + NMP + LMR + RFP + 8-ply Null-Move Threat Predictor).
 * Always runs at full 3000+ Grandmaster strength inside the Web Worker, independent of the
 * Opponent AI's Elo setting, while applying the user's tuned playstyle weights.
 */
export function analyzeTacticsDeep(
  state: GameState,
  maxDepth?: number,
  maxTimeMs = 1050,
  engineConfig?: Partial<ChessEngineConfig>,
  coachPlaystyle?: CoachPlaystyleProfile
): TacticsAnalysis {
  const enemyColor = oppositeColor(state.turn);
  const attackedSquares = getAttackedSquares(state.board, enemyColor);
  const threatenedPieces = detectThreatenedPieces(state.board, state.turn);

  let pieceCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.board[r][c]) pieceCount++;
    }
  }
  const isEndgamePos = pieceCount <= 12;
  const effectivePlaystyle = sanitizeCoachPlaystyle(
    coachPlaystyle ?? DEFAULT_COACH_PLAYSTYLE
  );

  const deepCoachConfig = buildCoachEngineConfig(
    effectivePlaystyle,
    'deep',
    {
      ...engineConfig,
      ...(maxDepth !== undefined ? { maxDepth } : {}),
      maxTimeMs: engineConfig?.maxTimeMs ?? maxTimeMs,
    },
    isEndgamePos
  );
  const threatCoachConfig = buildCoachEngineConfig(
    effectivePlaystyle,
    'threat',
    {
      ...engineConfig,
      maxDepth: Math.min(8, deepCoachConfig.maxDepth),
      maxTimeMs: 130,
    },
    isEndgamePos
  );

  const {
    topMoves,
    searchDepth,
    searchNodes,
    ttHits,
    elapsedMs,
    evalBreakdown,
    engineConfig: resolvedConfig,
  } = computeRecommendationsWithTelemetry(state, threatenedPieces, {
    maxDepth: deepCoachConfig.maxDepth,
    maxTimeMs: deepCoachConfig.maxTimeMs,
    engineConfig: deepCoachConfig,
    coachPlaystyle: effectivePlaystyle,
  });
  const opponentThreat = detectOpponentThreat(state, {
    maxDepth: threatCoachConfig.maxDepth,
    maxTimeMs: threatCoachConfig.maxTimeMs,
    engineConfig: threatCoachConfig,
  });

  return {
    attackedSquares,
    threatenedPieces,
    topMoves,
    opponentThreat,
    searchDepth: Math.max(1, searchDepth),
    searchNodes,
    ttHits,
    elapsedMs,
    isDeepAnalysis: true,
    evalBreakdown,
    engineConfig: resolvedConfig,
    engineRatingLabel: COACH_ENGINE_RATING_LABEL,
    playstyle: effectivePlaystyle,
  };
}
