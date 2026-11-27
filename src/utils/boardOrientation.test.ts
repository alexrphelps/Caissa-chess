import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_ROTATIONS,
  boardToVisualCoords,
  describeBoardRotation,
  describePieceOrientation,
  flipBoardRotation,
  getBoardEdgeLabels,
  getColorBoardSide,
  getPieceVisualRotation,
  normalizeBoardRotation,
  resolveBoardRotation,
  rotateBoardCCW,
  rotateBoardCW,
  squareToSvgCenterCoords,
  visualToBoardCoords,
} from './boardOrientation';
import { computeSlideOffset, coordsToSquare, squareToCoords } from '../chess/engine';

test('boardToVisualCoords and visualToBoardCoords are exact inverses for all 64 squares across all 4 rotations', () => {
  for (const rot of BOARD_ROTATIONS) {
    const seenVisual = new Set<string>();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const { visualRow, visualCol } = boardToVisualCoords(row, col, rot);
        assert.ok(visualRow >= 0 && visualRow < 8);
        assert.ok(visualCol >= 0 && visualCol < 8);
        seenVisual.add(`${visualRow},${visualCol}`);

        const back = visualToBoardCoords(visualRow, visualCol, rot);
        assert.deepEqual(back, { row, col });
      }
    }
    assert.equal(seenVisual.size, 64);
  }
});

test('corner squares land at exact physical clockwise positions for 0, 90, 180, and 270 degrees', () => {
  const cornerVisual = (sq: string, rot: 0 | 90 | 180 | 270) => {
    const { row, col } = squareToCoords(sq);
    return boardToVisualCoords(row, col, rot);
  };

  // 0° (White Bottom): a8 top-left, h8 top-right, a1 bottom-left, h1 bottom-right
  assert.deepEqual(cornerVisual('a8', 0), { visualRow: 0, visualCol: 0 });
  assert.deepEqual(cornerVisual('h8', 0), { visualRow: 0, visualCol: 7 });
  assert.deepEqual(cornerVisual('a1', 0), { visualRow: 7, visualCol: 0 });
  assert.deepEqual(cornerVisual('h1', 0), { visualRow: 7, visualCol: 7 });

  // 90° CW (White Left, Black Right): a1 top-left, a8 top-right, h1 bottom-left, h8 bottom-right
  assert.deepEqual(cornerVisual('a1', 90), { visualRow: 0, visualCol: 0 });
  assert.deepEqual(cornerVisual('a8', 90), { visualRow: 0, visualCol: 7 });
  assert.deepEqual(cornerVisual('h1', 90), { visualRow: 7, visualCol: 0 });
  assert.deepEqual(cornerVisual('h8', 90), { visualRow: 7, visualCol: 7 });

  // 180° (Black Bottom): h1 top-left, a1 top-right, h8 bottom-left, a8 bottom-right
  assert.deepEqual(cornerVisual('h1', 180), { visualRow: 0, visualCol: 0 });
  assert.deepEqual(cornerVisual('a1', 180), { visualRow: 0, visualCol: 7 });
  assert.deepEqual(cornerVisual('h8', 180), { visualRow: 7, visualCol: 0 });
  assert.deepEqual(cornerVisual('a8', 180), { visualRow: 7, visualCol: 7 });

  // 270° CW (White Right, Black Left): h8 top-left, h1 top-right, a8 bottom-left, a1 bottom-right
  assert.deepEqual(cornerVisual('h8', 270), { visualRow: 0, visualCol: 0 });
  assert.deepEqual(cornerVisual('h1', 270), { visualRow: 0, visualCol: 7 });
  assert.deepEqual(cornerVisual('a8', 270), { visualRow: 7, visualCol: 0 });
  assert.deepEqual(cornerVisual('a1', 270), { visualRow: 7, visualCol: 7 });
});

test('getBoardEdgeLabels matches the actual file/rank of every border square for all 4 rotations', () => {
  for (const rot of BOARD_ROTATIONS) {
    const labels = getBoardEdgeLabels(rot);
    for (let i = 0; i < 8; i++) {
      // Top row cell (0, i)
      const topCoords = visualToBoardCoords(0, i, rot);
      const topSq = coordsToSquare(topCoords.row, topCoords.col);
      // Left col cell (i, 0)
      const leftCoords = visualToBoardCoords(i, 0, rot);
      const leftSq = coordsToSquare(leftCoords.row, leftCoords.col);

      if (rot === 0 || rot === 180) {
        assert.equal(labels.top[i], topSq[0]);
        assert.equal(labels.bottom[i], topSq[0]);
        assert.equal(labels.left[i], leftSq[1]);
        assert.equal(labels.right[i], leftSq[1]);
      } else {
        assert.equal(labels.top[i], topSq[1]);
        assert.equal(labels.bottom[i], topSq[1]);
        assert.equal(labels.left[i], leftSq[0]);
        assert.equal(labels.right[i], leftSq[0]);
      }
    }
  }
});

test('squareToSvgCenterCoords aligns arrows accurately across 0, 90, 180, and 270 degrees', () => {
  // e2 -> e4 at 0° moves vertically upward (same x, decreasing y)
  const e2_0 = squareToSvgCenterCoords('e2', 0);
  const e4_0 = squareToSvgCenterCoords('e4', 0);
  assert.equal(e2_0.x, e4_0.x);
  assert.equal(e2_0.y - e4_0.y, 25);

  // e2 -> e4 at 90° CW moves horizontally left-to-right (increasing x, same y)
  const e2_90 = squareToSvgCenterCoords('e2', 90);
  const e4_90 = squareToSvgCenterCoords('e4', 90);
  assert.equal(e2_90.y, e4_90.y);
  assert.equal(e4_90.x - e2_90.x, 25);

  // e2 -> e4 at 180° moves vertically downward (same x, increasing y)
  const e2_180 = squareToSvgCenterCoords('e2', 180);
  const e4_180 = squareToSvgCenterCoords('e4', 180);
  assert.equal(e2_180.x, e4_180.x);
  assert.equal(e4_180.y - e2_180.y, 25);

  // e2 -> e4 at 270° CW moves horizontally right-to-left (decreasing x, same y)
  const e2_270 = squareToSvgCenterCoords('e2', 270);
  const e4_270 = squareToSvgCenterCoords('e4', 270);
  assert.equal(e2_270.y, e4_270.y);
  assert.equal(e2_270.x - e4_270.x, 25);
});

test('computeSlideOffset supports 90-degree rotations and boolean fallback', () => {
  assert.deepEqual(computeSlideOffset('e2', 'e4', 0), { dCol: 0, dRow: 2 });
  assert.deepEqual(computeSlideOffset('e2', 'e4', 90), { dCol: -2, dRow: 0 });
  assert.deepEqual(computeSlideOffset('e2', 'e4', 180), { dCol: 0, dRow: -2 });
  assert.deepEqual(computeSlideOffset('e2', 'e4', 270), { dCol: 2, dRow: 0 });

  // Knight move g1 -> f3: at 90° CW, g1 is (visualRow 6, visualCol 0), f3 is (visualRow 5, visualCol 2)
  assert.deepEqual(computeSlideOffset('g1', 'f3', 90), { dCol: -2, dRow: 1 });
  // At 270° CW, g1 is (visualRow 1, visualCol 7), f3 is (visualRow 2, visualCol 5)
  assert.deepEqual(computeSlideOffset('g1', 'f3', 270), { dCol: 2, dRow: -1 });
});

test('rotation stepping, flipping, normalization, and side descriptors work deterministically', () => {
  assert.equal(rotateBoardCW(0), 90);
  assert.equal(rotateBoardCW(90), 180);
  assert.equal(rotateBoardCW(180), 270);
  assert.equal(rotateBoardCW(270), 0);

  assert.equal(rotateBoardCCW(0), 270);
  assert.equal(rotateBoardCCW(270), 180);
  assert.equal(rotateBoardCCW(180), 90);
  assert.equal(rotateBoardCCW(90), 0);

  assert.equal(flipBoardRotation(0), 180);
  assert.equal(flipBoardRotation(90), 270);
  assert.equal(flipBoardRotation(180), 0);
  assert.equal(flipBoardRotation(270), 90);

  assert.equal(normalizeBoardRotation(-90), 270);
  assert.equal(normalizeBoardRotation(450), 90);
  assert.equal(normalizeBoardRotation('bad', 180), 180);
  assert.equal(resolveBoardRotation(undefined, true), 180);
  assert.equal(resolveBoardRotation(90, true), 90);

  assert.equal(describeBoardRotation(0), 'White Bottom');
  assert.equal(describeBoardRotation(90), 'White Left');
  assert.equal(describeBoardRotation(180), 'Black Bottom');
  assert.equal(describeBoardRotation(270), 'White Right');

  assert.equal(getColorBoardSide('w', 90), 'left');
  assert.equal(getColorBoardSide('b', 90), 'right');
  assert.equal(getColorBoardSide('w', 270), 'right');
  assert.equal(getColorBoardSide('b', 270), 'left');
});

test('getPieceVisualRotation orients pieces accurately in facing, board, and upright modes', () => {
  // Facing opponent (default): White faces rank 8 (boardRotation), Black faces rank 1 (boardRotation + 180)
  assert.equal(getPieceVisualRotation('w', 0, 'facing'), 0);
  assert.equal(getPieceVisualRotation('b', 0, 'facing'), 180);
  assert.equal(getPieceVisualRotation('w', 90, 'facing'), 90);
  assert.equal(getPieceVisualRotation('b', 90, 'facing'), 270);
  assert.equal(getPieceVisualRotation('w', 180, 'facing'), 180);
  assert.equal(getPieceVisualRotation('b', 180, 'facing'), 0);
  assert.equal(getPieceVisualRotation('w', 270, 'facing'), 270);
  assert.equal(getPieceVisualRotation('b', 270, 'facing'), 90);

  // Follow board: all pieces rotate uniformly relative to perspectiveColor home side
  assert.equal(getPieceVisualRotation('w', 90, 'board', 'w'), 90);
  assert.equal(getPieceVisualRotation('b', 90, 'board', 'w'), 90);
  assert.equal(getPieceVisualRotation('w', 180, 'board', 'b'), 0);
  assert.equal(getPieceVisualRotation('b', 180, 'board', 'b'), 0);
  assert.equal(getPieceVisualRotation('w', 270, 'board', 'b'), 90);
  assert.equal(getPieceVisualRotation('b', 270, 'board', 'b'), 90);

  // Always upright: always 0 regardless of angle or color
  for (const rot of BOARD_ROTATIONS) {
    assert.equal(getPieceVisualRotation('w', rot, 'upright'), 0);
    assert.equal(getPieceVisualRotation('b', rot, 'upright'), 0);
  }

  assert.equal(describePieceOrientation('facing'), 'Facing Opponent');
  assert.equal(describePieceOrientation('board'), 'With Board');
  assert.equal(describePieceOrientation('upright'), 'Always Upright');
});

