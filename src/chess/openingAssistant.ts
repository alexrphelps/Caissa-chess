import {
  BOARD_SIZE,
  coordsToSquare,
  findKingSquare,
  isSquareAttacked,
  oppositeColor,
  squareToCoords,
} from './engine';
import { Board, Color, GameState, Move, MoveRecord, PieceType, Square } from './types';

export type PrincipleId =
  | 'center_control'
  | 'minor_development'
  | 'king_safety'
  | 'queen_restraint';

export interface PrincipleMilestone {
  id: PrincipleId;
  title: string;
  shortLabel: string;
  status: 'achieved' | 'progress' | 'warning' | 'pending';
  progressPercent: number; // 0 to 100
  detail: string;
  hint: string;
}

export interface OpeningPrinciplesReport {
  moveNumber: number;
  phaseActive: boolean; // True during first 12 full moves
  overallScore: number; // 0 to 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'Developing';
  milestones: PrincipleMilestone[];
  headlineFeedback: string;
}

const CENTER_SQUARES_WHITE: Square[] = ['e4', 'd4'];
const CENTER_SQUARES_BLACK: Square[] = ['e5', 'd5'];
const CORE_CENTER_SQUARES: Square[] = ['e4', 'd4', 'e5', 'd5'];

/**
 * Evaluates whether a player has established central pawn control.
 */
function evaluateCenterPawnControl(
  board: Board,
  playerColor: Color,
  fullMoveNumber: number
): { status: PrincipleMilestone['status']; progressPercent: number; detail: string; hint: string } {
  const targetPawns = playerColor === 'w' ? CENTER_SQUARES_WHITE : CENTER_SQUARES_BLACK;
  let pawnsInCenter = 0;

  for (const sq of targetPawns) {
    const { row, col } = squareToCoords(sq);
    const piece = board[row][col];
    if (piece && piece.type === 'p' && piece.color === playerColor) {
      pawnsInCenter++;
    }
  }

  // Also check extended center control (attacks into e4, d4, e5, d5)
  let centerAttacks = 0;
  for (const sq of CORE_CENTER_SQUARES) {
    const { row, col } = squareToCoords(sq);
    if (isSquareAttacked(board, row, col, playerColor)) {
      centerAttacks++;
    }
  }

  if (pawnsInCenter >= 2) {
    return {
      status: 'achieved',
      progressPercent: 100,
      detail: `Both central pawns (${targetPawns.join(' & ')}) anchored firmly in the center.`,
      hint: 'Central foundation secured. Support your pawns with minor pieces.',
    };
  }

  if (pawnsInCenter === 1) {
    return {
      status: fullMoveNumber <= 5 ? 'progress' : 'achieved',
      progressPercent: 75,
      detail: `One central pawn stake established (${targetPawns[0]} or ${targetPawns[1]}).`,
      hint: 'Consider advancing your second central pawn or maintaining space.',
    };
  }

  if (centerAttacks >= 2) {
    return {
      status: 'progress',
      progressPercent: 50,
      detail: 'Hypermodern center pressure: pieces controlling center from the flanks.',
      hint: 'Strike at the center with a pawn break when ready.',
    };
  }

  return {
    status: fullMoveNumber >= 4 ? 'warning' : 'pending',
    progressPercent: 15,
    detail: 'No central pawns occupying the core center squares.',
    hint: `Advance ${playerColor === 'w' ? 'e4 or d4' : 'e5 or d5'} to dispute central space.`,
  };
}

/**
 * Evaluates development of minor pieces (Knights & Bishops off their home squares).
 */
function evaluateMinorDevelopment(
  board: Board,
  playerColor: Color,
  fullMoveNumber: number
): { status: PrincipleMilestone['status']; progressPercent: number; detail: string; hint: string } {
  const homeRow = playerColor === 'w' ? 7 : 0;
  let developedMinors = 0;
  const undevelopedNames: string[] = [];

  // Knights
  const bKnight = board[homeRow][1];
  if (!bKnight || bKnight.type !== 'n' || bKnight.color !== playerColor) {
    developedMinors++;
  } else {
    undevelopedNames.push('Queen’s Knight');
  }

  const gKnight = board[homeRow][6];
  if (!gKnight || gKnight.type !== 'n' || gKnight.color !== playerColor) {
    developedMinors++;
  } else {
    undevelopedNames.push('King’s Knight');
  }

  // Bishops
  const cBishop = board[homeRow][2];
  if (!cBishop || cBishop.type !== 'b' || cBishop.color !== playerColor) {
    developedMinors++;
  } else {
    undevelopedNames.push('Queen’s Bishop');
  }

  const fBishop = board[homeRow][5];
  if (!fBishop || fBishop.type !== 'b' || fBishop.color !== playerColor) {
    developedMinors++;
  } else {
    undevelopedNames.push('King’s Bishop');
  }

  const pct = Math.round((developedMinors / 4) * 100);

  if (developedMinors === 4) {
    return {
      status: 'achieved',
      progressPercent: 100,
      detail: 'All 4 minor pieces (both Knights and Bishops) mobilized actively.',
      hint: 'Development complete. Connect rooks and prepare middlegame plans.',
    };
  }

  if (developedMinors >= 2) {
    return {
      status: 'progress',
      progressPercent: pct,
      detail: `${developedMinors} of 4 minor pieces mobilized.`,
      hint: `Bring out your remaining minor pieces (${undevelopedNames.slice(0, 2).join(', ')}).`,
    };
  }

  return {
    status: fullMoveNumber >= 5 ? 'warning' : 'pending',
    progressPercent: pct,
    detail: `${developedMinors} of 4 minor pieces developed.`,
    hint: 'Knights before Bishops: bring minor pieces toward the center.',
  };
}

/**
 * Evaluates King Safety and Castling.
 */
function evaluateKingSafety(
  gameState: GameState,
  playerColor: Color,
  fullMoveNumber: number
): { status: PrincipleMilestone['status']; progressPercent: number; detail: string; hint: string } {
  // Check if player has castled in move history
  const hasCastled = gameState.moveHistory.some(
    (rec) => rec.color === playerColor && rec.move.isCastle
  );

  if (hasCastled) {
    return {
      status: 'achieved',
      progressPercent: 100,
      detail: 'King safely tucked behind castled pawn shield with connected rooks.',
      hint: 'King is secure. Keep your f-pawn and h-pawn shields stable.',
    };
  }

  const rights = gameState.castlingRights;
  const canCastleAny =
    playerColor === 'w' ? rights.wK || rights.wQ : rights.bK || rights.bQ;

  const kingSq = findKingSquare(gameState.board, playerColor);
  const homeKingSq: Square = playerColor === 'w' ? 'e1' : 'e8';

  if (!canCastleAny && !hasCastled) {
    return {
      status: 'warning',
      progressPercent: 30,
      detail: 'Castling rights lost before castling! King remains vulnerable in the center.',
      hint: 'Protect your king with nearby pieces and prevent open center files.',
    };
  }

  if (kingSq !== homeKingSq) {
    return {
      status: 'warning',
      progressPercent: 40,
      detail: 'King moved without castling, forfeiting castling safety.',
      hint: 'Shelter the king on an artificial castle square or safe flank.',
    };
  }

  if (fullMoveNumber <= 7) {
    return {
      status: 'progress',
      progressPercent: 60,
      detail: 'Castling rights preserved. Clearing back rank for castling.',
      hint: 'Develop king-side pieces quickly to castle within the first 10 moves.',
    };
  }

  return {
    status: 'warning',
    progressPercent: 40,
    detail: `Move ${fullMoveNumber}: King remains uncastled on the open center file.`,
    hint: 'Castle as soon as possible before the center opens up!',
  };
}

/**
 * Evaluates Queen Restraint / Tempo Economy:
 * Queen should not be moved prematurely before developing minor pieces.
 */
function evaluateQueenRestraint(
  gameState: GameState,
  playerColor: Color,
  fullMoveNumber: number
): { status: PrincipleMilestone['status']; progressPercent: number; detail: string; hint: string } {
  const playerMoves = gameState.moveHistory.filter(
    (rec) => rec.color === playerColor
  );

  // Check if queen moved early (before move 6)
  const earlyQueenMove = playerMoves.find(
    (rec) => rec.move.piece.type === 'q' && rec.turnNumber < 6
  );

  // Check how many minor pieces were developed at the time of the first queen move
  if (earlyQueenMove) {
    // Count how many queen moves have been made
    const queenMoveCount = playerMoves.filter(
      (rec) => rec.move.piece.type === 'q'
    ).length;

    if (queenMoveCount > 2 && fullMoveNumber <= 8) {
      return {
        status: 'warning',
        progressPercent: 30,
        detail: `Queen moved ${queenMoveCount} times in the opening! Surrendering development tempo.`,
        hint: 'Avoid hunting pawns with the Queen early; your opponent develops pieces with tempo.',
      };
    }

    return {
      status: 'warning',
      progressPercent: 55,
      detail: 'Early Queen sortie: Queen brought out before minor pieces completed development.',
      hint: 'Be vigilant against opponent tactical traps targeting your exposed Queen.',
    };
  }

  return {
    status: 'achieved',
    progressPercent: 100,
    detail: 'Patience maintained: Queen restrained safely behind developing minor pieces.',
    hint: 'Excellent tempo discipline. The Queen is saved for decisive middlegame strikes.',
  };
}

/**
 * Computes the full Opening Principles Report for the active game state.
 */
export function analyzeOpeningPrinciples(
  gameState: GameState,
  playerColor: Color
): OpeningPrinciplesReport {
  const moveNumber = gameState.fullMoveNumber;
  const phaseActive = moveNumber <= 12;

  const center = evaluateCenterPawnControl(gameState.board, playerColor, moveNumber);
  const development = evaluateMinorDevelopment(gameState.board, playerColor, moveNumber);
  const kingSafety = evaluateKingSafety(gameState, playerColor, moveNumber);
  const queenRestraint = evaluateQueenRestraint(gameState, playerColor, moveNumber);

  const milestones: PrincipleMilestone[] = [
    {
      id: 'center_control',
      title: 'Control the Center',
      shortLabel: 'Center Control',
      status: center.status,
      progressPercent: center.progressPercent,
      detail: center.detail,
      hint: center.hint,
    },
    {
      id: 'minor_development',
      title: 'Develop Minor Pieces',
      shortLabel: 'Minor Pieces',
      status: development.status,
      progressPercent: development.progressPercent,
      detail: development.detail,
      hint: development.hint,
    },
    {
      id: 'king_safety',
      title: 'King Safety & Castling',
      shortLabel: 'King Safety',
      status: kingSafety.status,
      progressPercent: kingSafety.progressPercent,
      detail: kingSafety.detail,
      hint: kingSafety.hint,
    },
    {
      id: 'queen_restraint',
      title: 'Tempo & Queen Restraint',
      shortLabel: 'Queen Restraint',
      status: queenRestraint.status,
      progressPercent: queenRestraint.progressPercent,
      detail: queenRestraint.detail,
      hint: queenRestraint.hint,
    },
  ];

  // Weighted overall opening score:
  // Center (30%), Development (35%), King Safety (25%), Queen Restraint (10%)
  const overallScore = Math.round(
    center.progressPercent * 0.3 +
    development.progressPercent * 0.35 +
    kingSafety.progressPercent * 0.25 +
    queenRestraint.progressPercent * 0.1
  );

  let grade: OpeningPrinciplesReport['grade'] = 'Developing';
  if (overallScore >= 92) grade = 'A+';
  else if (overallScore >= 80) grade = 'A';
  else if (overallScore >= 65) grade = 'B';
  else if (overallScore >= 50) grade = 'C';

  let headlineFeedback = 'Opening phase in progress. Focus on center pawns and piece activity.';
  if (grade === 'A+' || grade === 'A') {
    headlineFeedback = 'Master-class opening execution: sound center, rapid development, and king safety!';
  } else if (milestones.some((m) => m.status === 'warning')) {
    const warning = milestones.find((m) => m.status === 'warning');
    if (warning) headlineFeedback = `Attention needed on ${warning.shortLabel}: ${warning.hint}`;
  }

  return {
    moveNumber,
    phaseActive,
    overallScore,
    grade,
    milestones,
    headlineFeedback,
  };
}
