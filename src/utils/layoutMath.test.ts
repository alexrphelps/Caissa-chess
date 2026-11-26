import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampCoachPanelWidth,
  computeBoardGridSize,
  computeScaleFromCornerDrag,
  DEFAULT_UI_LAYOUT_PREFERENCES,
  getBoardFrameChrome,
  MIN_BOARD_GRID_PX,
  MIN_BOARD_SCALE,
  MIN_COACH_WIDTH,
  sanitizeUILayoutPreferences,
} from './layoutMath';

test('computeBoardGridSize delivers a generous board at standard 1440x900 desktop', () => {
  // Typical board column space at 1440x900 with 440px coach panel + 14px splitter + padding
  const geo = computeBoardGridSize({
    availableWidth: 940,
    availableHeight: 820,
    boardScale: 1.0,
    coordinateStyle: 'both',
    showHelperBox: true,
    underBoardStripHeight: 98,
    isStackedLayout: false,
  });

  // Significantly larger than the old 420px cap, snapped to a multiple of 8
  assert.ok(geo.boardSizePx >= 560, `expected >= 560, got ${geo.boardSizePx}`);
  assert.equal(geo.boardSizePx % 8, 0);
  // Frame + under-board strip must fit strictly inside available width & height
  assert.ok(geo.frameWidthPx <= 940);
  assert.ok(geo.frameHeightPx + 98 <= 820);
});

test('computeBoardGridSize scales smoothly across browser zoom levels (75%, 125%, 150%)', () => {
  // 75% browser zoom (effective 1920x1200 viewport -> board stage ~1380x1100)
  const zoom75 = computeBoardGridSize({
    availableWidth: 1380,
    availableHeight: 1100,
    boardScale: 1.0,
    coordinateStyle: 'both',
    showHelperBox: true,
  });
  assert.ok(
    zoom75.boardSizePx >= 800,
    `75% zoom should expand generously, got ${zoom75.boardSizePx}`
  );
  assert.equal(zoom75.boardSizePx % 8, 0);

  // 125% browser zoom (effective 1152x720 -> board stage ~710x640)
  const zoom125 = computeBoardGridSize({
    availableWidth: 710,
    availableHeight: 640,
    boardScale: 1.0,
    coordinateStyle: 'both',
    showHelperBox: true,
  });
  assert.ok(
    zoom125.boardSizePx >= 400 && zoom125.boardSizePx <= 480,
    `125% zoom should fit comfortably, got ${zoom125.boardSizePx}`
  );
  assert.ok(zoom125.frameHeightPx + 98 <= 640);

  // 150% browser zoom (effective 960x600 -> stacked layout, never crushed to 160px)
  const zoom150 = computeBoardGridSize({
    availableWidth: 920,
    availableHeight: 520,
    boardScale: 1.0,
    coordinateStyle: 'both',
    showHelperBox: true,
    isStackedLayout: true,
  });
  assert.ok(
    zoom150.boardSizePx >= 380,
    `150% zoom stacked should stay comfortably playable, got ${zoom150.boardSizePx}`
  );
});

test('computeBoardGridSize reclaims space when helper box or outside coordinates are hidden', () => {
  const withChrome = computeBoardGridSize({
    availableWidth: 800,
    availableHeight: 720,
    boardScale: 1.0,
    coordinateStyle: 'both',
    showHelperBox: true,
  });

  const cleanBoard = computeBoardGridSize({
    availableWidth: 800,
    availableHeight: 720,
    boardScale: 1.0,
    coordinateStyle: 'inside',
    showHelperBox: false,
  });

  assert.ok(
    cleanBoard.boardSizePx > withChrome.boardSizePx,
    `expected cleanBoard (${cleanBoard.boardSizePx}) > withChrome (${withChrome.boardSizePx})`
  );
});

test('computeBoardGridSize respects user boardScale and enforces minimum playable floor', () => {
  const full = computeBoardGridSize({
    availableWidth: 900,
    availableHeight: 800,
    boardScale: 1.0,
    coordinateStyle: 'both',
    showHelperBox: true,
  });

  const scaled75 = computeBoardGridSize({
    availableWidth: 900,
    availableHeight: 800,
    boardScale: 0.75,
    coordinateStyle: 'both',
    showHelperBox: true,
  });

  assert.ok(scaled75.boardSizePx < full.boardSizePx);
  assert.ok(scaled75.boardSizePx >= MIN_BOARD_GRID_PX);
  assert.equal(scaled75.boardSizePx % 8, 0);

  // Tiny viewport never collapses below MIN_BOARD_GRID_PX
  const tiny = computeBoardGridSize({
    availableWidth: 320,
    availableHeight: 300,
    boardScale: 0.55,
    coordinateStyle: 'both',
    showHelperBox: true,
  });
  assert.equal(tiny.boardSizePx, MIN_BOARD_GRID_PX);
});

test('clampCoachPanelWidth protects minimum board width and enforces bounds', () => {
  // Standard 1400px container: desired 500px allowed
  assert.equal(clampCoachPanelWidth(500, 1400), 500);

  // Attempting to drag coach panel too narrow clamps to MIN_COACH_WIDTH
  assert.equal(clampCoachPanelWidth(120, 1400), MIN_COACH_WIDTH);

  // Attempting to drag coach panel so wide it would starve the board clamps safely
  const clampedWide = clampCoachPanelWidth(1000, 1020);
  // 1020 - 360 (minBoard) - 14 (splitter) = 646
  assert.equal(clampedWide, 646);

  // Very narrow desktop container still keeps coach at least MIN_COACH_WIDTH
  assert.equal(clampCoachPanelWidth(500, 620), MIN_COACH_WIDTH);
});

test('computeScaleFromCornerDrag scales smoothly and clamps to [0.55, 1.0]', () => {
  const shrunk = computeScaleFromCornerDrag(600, 600, -100, -100);
  assert.ok(shrunk < 0.8 && shrunk >= MIN_BOARD_SCALE);

  const clampedMin = computeScaleFromCornerDrag(400, 600, -500, -500);
  assert.equal(clampedMin, MIN_BOARD_SCALE);

  const clampedMax = computeScaleFromCornerDrag(500, 600, 300, 300);
  assert.equal(clampedMax, 1.0);
});

test('getBoardFrameChrome differentiates outside coordinates and helper tooltip', () => {
  const bothWithTip = getBoardFrameChrome('both', true);
  const insideNoTip = getBoardFrameChrome('inside', false);
  assert.ok(bothWithTip.extraWidthPx > insideNoTip.extraWidthPx);
  assert.ok(bothWithTip.extraHeightPx > insideNoTip.extraHeightPx);
});

test('sanitizeUILayoutPreferences validates and repairs invalid persisted values', () => {
  assert.deepEqual(
    sanitizeUILayoutPreferences(null),
    DEFAULT_UI_LAYOUT_PREFERENCES
  );

  const repaired = sanitizeUILayoutPreferences({
    boardTheme: 'invalid_theme',
    coordinateStyle: 'weird',
    boardScale: 99,
    coachPanelWidth: 50,
    isCoachPanelOpen: false,
    showBoardTooltip: false,
    showEvalBar: false,
    isReplayCoachExpanded: false,
    isReplayMoveListExpanded: false,
  });

  assert.equal(repaired.boardTheme, 'mahogany');
  assert.equal(repaired.coordinateStyle, 'both');
  assert.equal(repaired.boardScale, 1.0);
  assert.equal(repaired.coachPanelWidth, MIN_COACH_WIDTH);
  assert.equal(repaired.isCoachPanelOpen, false);
  assert.equal(repaired.showBoardTooltip, false);
  assert.equal(repaired.showEvalBar, false);
  assert.equal(repaired.isReplayCoachExpanded, false);
  assert.equal(repaired.isReplayMoveListExpanded, false);
});

test('computeBoardGridSize reserves horizontal room for EvalBar without clipping', () => {
  const withoutBar = computeBoardGridSize({
    availableWidth: 600,
    availableHeight: 820,
    boardScale: 1.0,
    coordinateStyle: 'both',
    showHelperBox: false,
    showEvalBar: false,
  });

  const withBar = computeBoardGridSize({
    availableWidth: 600,
    availableHeight: 820,
    boardScale: 1.0,
    coordinateStyle: 'both',
    showHelperBox: false,
    showEvalBar: true,
  });

  assert.ok(
    withBar.frameWidthPx + 34 <= 600,
    `Board frame (${withBar.frameWidthPx}) + eval bar (34) must fit in 600px`
  );
  assert.ok(withBar.boardSizePx <= withoutBar.boardSizePx);
});

