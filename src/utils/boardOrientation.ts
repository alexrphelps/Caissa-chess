import { Color, Square } from '../chess/types';

export type BoardRotation = 0 | 90 | 180 | 270;

export const BOARD_ROTATIONS: readonly BoardRotation[] = [0, 90, 180, 270];

const BOARD_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const BOARD_RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

export function normalizeBoardRotation(
  value: unknown,
  fallback: BoardRotation = 0
): BoardRotation {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const snapped = (((Math.round(value / 90) * 90) % 360) + 360) % 360;
  if (snapped === 0 || snapped === 90 || snapped === 180 || snapped === 270) {
    return snapped;
  }
  return fallback;
}

export function resolveBoardRotation(
  boardRotation?: BoardRotation,
  isFlipped?: boolean
): BoardRotation {
  if (boardRotation !== undefined) {
    return normalizeBoardRotation(boardRotation, 0);
  }
  return isFlipped ? 180 : 0;
}

export function rotateBoardCW(rotation: BoardRotation): BoardRotation {
  return normalizeBoardRotation(rotation + 90);
}

export function rotateBoardCCW(rotation: BoardRotation): BoardRotation {
  return normalizeBoardRotation(rotation - 90);
}

export function flipBoardRotation(rotation: BoardRotation): BoardRotation {
  return normalizeBoardRotation(rotation + 180);
}

/**
 * Maps canonical board indices (row 0 = rank 8 .. row 7 = rank 1, col 0 = file 'a' .. col 7 = file 'h')
 * to visual grid indices (visualRow 0 = top .. 7 = bottom, visualCol 0 = left .. 7 = right)
 * under a clockwise board rotation of 0, 90, 180, or 270 degrees.
 */
export function boardToVisualCoords(
  row: number,
  col: number,
  rotation: BoardRotation
): { visualRow: number; visualCol: number } {
  switch (rotation) {
    case 90:
      return { visualRow: col, visualCol: 7 - row };
    case 180:
      return { visualRow: 7 - row, visualCol: 7 - col };
    case 270:
      return { visualRow: 7 - col, visualCol: row };
    case 0:
    default:
      return { visualRow: row, visualCol: col };
  }
}

/**
 * Inverse of `boardToVisualCoords`: maps visual grid cell (visualRow, visualCol)
 * back to canonical board indices (row, col).
 */
export function visualToBoardCoords(
  visualRow: number,
  visualCol: number,
  rotation: BoardRotation
): { row: number; col: number } {
  switch (rotation) {
    case 90:
      return { row: 7 - visualCol, col: visualRow };
    case 180:
      return { row: 7 - visualRow, col: 7 - visualCol };
    case 270:
      return { row: visualCol, col: 7 - visualRow };
    case 0:
    default:
      return { row: visualRow, col: visualCol };
  }
}

/**
 * Maps an algebraic chess square ('a1'..'h8') to its SVG overlay center in 0..100 viewBox space.
 */
export function squareToSvgCenterCoords(
  square: Square,
  rotation: BoardRotation
): { x: number; y: number } {
  const col = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const row = 8 - rank;
  const { visualRow, visualCol } = boardToVisualCoords(row, col, rotation);
  return {
    x: (visualCol + 0.5) * 12.5,
    y: (visualRow + 0.5) * 12.5,
  };
}

export interface BoardEdgeLabels {
  top: string[];
  bottom: string[];
  left: string[];
  right: string[];
}

/**
 * Returns the 8 coordinate labels rendered along each outer edge of the board frame
 * (and mirrored to inner corner edge squares) for any 90-degree rotation.
 */
export function getBoardEdgeLabels(rotation: BoardRotation): BoardEdgeLabels {
  const filesAsc = [...BOARD_FILES];
  const filesDesc = [...BOARD_FILES].reverse();
  const ranksDesc = [...BOARD_RANKS]; // 8..1
  const ranksAsc = [...BOARD_RANKS].reverse(); // 1..8

  switch (rotation) {
    case 90:
      // White on Left (rank 1 at col 0), Black on Right (rank 8 at col 7)
      // Top-to-bottom along col 0 is a1..h1 (files a..h)
      return {
        top: ranksAsc,
        bottom: ranksAsc,
        left: filesAsc,
        right: filesAsc,
      };
    case 180:
      // Black on Bottom: files h..a across top/bottom, ranks 1..8 top-to-bottom
      return {
        top: filesDesc,
        bottom: filesDesc,
        left: ranksAsc,
        right: ranksAsc,
      };
    case 270:
      // White on Right (rank 1 at col 7), Black on Left (rank 8 at col 0)
      // Top-to-bottom along col 0 is h8..a8 (files h..a)
      return {
        top: ranksDesc,
        bottom: ranksDesc,
        left: filesDesc,
        right: filesDesc,
      };
    case 0:
    default:
      // White on Bottom: files a..h across top/bottom, ranks 8..1 top-to-bottom
      return {
        top: filesAsc,
        bottom: filesAsc,
        left: ranksDesc,
        right: ranksDesc,
      };
  }
}

export function describeBoardRotation(rotation: BoardRotation): string {
  switch (rotation) {
    case 90:
      return 'White Left';
    case 180:
      return 'Black Bottom';
    case 270:
      return 'White Right';
    case 0:
    default:
      return 'White Bottom';
  }
}

export function getColorBoardSide(
  color: Color,
  rotation: BoardRotation
): 'bottom' | 'top' | 'left' | 'right' {
  if (color === 'w') {
    switch (rotation) {
      case 90:
        return 'left';
      case 180:
        return 'top';
      case 270:
        return 'right';
      case 0:
      default:
        return 'bottom';
    }
  }
  switch (rotation) {
    case 90:
      return 'right';
    case 180:
      return 'bottom';
    case 270:
      return 'left';
    case 0:
    default:
      return 'top';
  }
}
