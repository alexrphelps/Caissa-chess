import { PieceOrientationMode } from './boardOrientation';

export type BoardThemeId = 'mahogany' | 'emerald' | 'slate' | 'obsidian';

export type CoordinateStyle = 'both' | 'inside' | 'outside' | 'none';

export type { PieceOrientationMode };

export interface BoardThemeConfig {
  id: BoardThemeId;
  name: string;
  subtitle: string;
  lightSquare: string;
  darkSquare: string;
  selectedSquare: string;
  lastMoveLight: string;
  lastMoveDark: string;
  frameBg: string;
  frameBorder: string;
  gridBorder: string;
  coordOuterText: string;
  coordOnLight: string;
  coordOnDark: string;
}

export const BOARD_THEMES: Record<BoardThemeId, BoardThemeConfig> = {
  mahogany: {
    id: 'mahogany',
    name: 'Classic Mahogany',
    subtitle: 'Warm walnut & parchment',
    lightSquare: '#EADBC8',
    darkSquare: '#8B5A3C',
    selectedSquare: '#E2B94B',
    lastMoveLight: '#E5C878',
    lastMoveDark: '#AA8239',
    frameBg: '#2B1B12',
    frameBorder: '#4A3222',
    gridBorder: '#160D08',
    coordOuterText: '#C6B39E',
    coordOnLight: '#73482D',
    coordOnDark: '#EADBC8',
  },
  emerald: {
    id: 'emerald',
    name: 'Tournament Emerald',
    subtitle: 'Classic club green & cream',
    lightSquare: '#EEEED2',
    darkSquare: '#588157',
    selectedSquare: '#E9C46A',
    lastMoveLight: '#DCE69E',
    lastMoveDark: '#7FA35C',
    frameBg: '#192820',
    frameBorder: '#314D3E',
    gridBorder: '#0E1712',
    coordOuterText: '#B7CEBF',
    coordOnLight: '#426641',
    coordOnDark: '#EEEED2',
  },
  slate: {
    id: 'slate',
    name: 'Nordic Slate',
    subtitle: 'Architectural stone & steel',
    lightSquare: '#E2E8F0',
    darkSquare: '#64748B',
    selectedSquare: '#F59E0B',
    lastMoveLight: '#CBD5E1',
    lastMoveDark: '#4E6B8A',
    frameBg: '#1E2530',
    frameBorder: '#384558',
    gridBorder: '#0F141B',
    coordOuterText: '#CBD5E1',
    coordOnLight: '#475569',
    coordOnDark: '#E2E8F0',
  },
  obsidian: {
    id: 'obsidian',
    name: 'Midnight Obsidian',
    subtitle: 'Low-glare dark study',
    lightSquare: '#B8B3A8',
    darkSquare: '#4E555B',
    selectedSquare: '#D99B38',
    lastMoveLight: '#C8B88A',
    lastMoveDark: '#6B6948',
    frameBg: '#171A1D',
    frameBorder: '#333940',
    gridBorder: '#0B0D0F',
    coordOuterText: '#A8B0B8',
    coordOnLight: '#363C42',
    coordOnDark: '#D8D4CC',
  },
};

export const BOARD_THEME_LIST: BoardThemeConfig[] = [
  BOARD_THEMES.mahogany,
  BOARD_THEMES.emerald,
  BOARD_THEMES.slate,
  BOARD_THEMES.obsidian,
];

export interface UILayoutPreferences {
  boardTheme: BoardThemeId;
  coordinateStyle: CoordinateStyle;
  pieceOrientation: PieceOrientationMode;
  boardScale: number; // 0.55 to 1.0 (1.0 = auto-fit max)
  coachPanelWidth: number; // px on desktop split layout
  isCoachPanelOpen: boolean;
  showBoardTooltip: boolean;
  showEvalBar: boolean;
  isReplayCoachExpanded: boolean;
  isReplayMoveListExpanded: boolean;
}

export const DEFAULT_UI_LAYOUT_PREFERENCES: UILayoutPreferences = {
  boardTheme: 'mahogany',
  coordinateStyle: 'both',
  pieceOrientation: 'facing',
  boardScale: 1.0,
  coachPanelWidth: 440,
  isCoachPanelOpen: true,
  showBoardTooltip: true,
  showEvalBar: true,
  isReplayCoachExpanded: true,
  isReplayMoveListExpanded: true,
};

export const UI_LAYOUT_STORAGE_KEY = 'caissa_ui_layout_preferences_v1';

export const MIN_COACH_WIDTH = 280;
export const MAX_COACH_WIDTH = 760;
export const MIN_BOARD_COLUMN_WIDTH = 360;
export const SPLITTER_WIDTH_PX = 14;
export const EVAL_BAR_RESERVE_PX = 34; // 26px bar + 8px gap
export const MIN_BOARD_SCALE = 0.55;
export const MAX_BOARD_SCALE = 1.0;
export const MIN_BOARD_GRID_PX = 240;
export const MAX_BOARD_GRID_PX = 960;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (min > max) return min;
  return Math.max(min, Math.min(max, value));
}

export function snapToBoardMultiple(px: number): number {
  const clamped = clampNumber(px, MIN_BOARD_GRID_PX, MAX_BOARD_GRID_PX);
  return Math.max(MIN_BOARD_GRID_PX, Math.floor(clamped / 8) * 8);
}

/**
 * Computes the clamped width for the Tactical Coach panel in desktop split-pane mode.
 * Ensures the chessboard column ALWAYS retains enough horizontal room so neither pane clips.
 */
export function clampCoachPanelWidth(
  desiredWidth: number,
  containerWidth: number,
  options?: {
    minCoachWidth?: number;
    maxCoachWidth?: number;
    minBoardColumnWidth?: number;
    splitterWidth?: number;
  }
): number {
  const minCoach = options?.minCoachWidth ?? MIN_COACH_WIDTH;
  const maxCoachCap = options?.maxCoachWidth ?? MAX_COACH_WIDTH;
  const minBoardCol = options?.minBoardColumnWidth ?? MIN_BOARD_COLUMN_WIDTH;
  const splitter = options?.splitterWidth ?? SPLITTER_WIDTH_PX;

  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return clampNumber(Math.round(desiredWidth), minCoach, maxCoachCap);
  }

  const maxAllowedByContainer = Math.max(
    minCoach,
    containerWidth - minBoardCol - splitter
  );
  const effectiveMax = Math.min(maxCoachCap, maxAllowedByContainer);

  return Math.round(clampNumber(desiredWidth, minCoach, effectiveMax));
}

export interface BoardChromeDimensions {
  extraWidthPx: number;
  extraHeightPx: number;
}

/**
 * Exact outer chrome overhead added by the board frame (padding, coordinate gutters,
 * border, and optional under-board helper tooltip box).
 */
export function getBoardFrameChrome(
  coordinateStyle: CoordinateStyle,
  showHelperBox: boolean
): BoardChromeDimensions {
  const hasOutsideCoords =
    coordinateStyle === 'both' || coordinateStyle === 'outside';

  // Frame padding (p-2.5 sm:p-3 -> ~24px total) + outer border (4px) + grid border (4px) = 32px
  // Outside rank gutters: left (14px + 6px margin) + right (14px + 6px margin) = 40px
  // Outside file gutters: top (16px + 4px margin) + bottom (16px + 4px margin) = 40px
  const extraWidthPx = 32 + (hasOutsideCoords ? 40 : 0);
  const extraHeightPx =
    32 + (hasOutsideCoords ? 40 : 0) + (showHelperBox ? 66 : 0);

  return { extraWidthPx, extraHeightPx };
}

export interface ComputeBoardGridSizeInput {
  availableWidth: number;
  availableHeight: number;
  boardScale: number;
  coordinateStyle: CoordinateStyle;
  showHelperBox: boolean;
  showEvalBar?: boolean;
  underBoardStripHeight?: number;
  isStackedLayout?: boolean;
  minGridPx?: number;
}

export interface ComputedBoardGeometry {
  boardSizePx: number;
  maxFitSizePx: number;
  frameWidthPx: number;
  frameHeightPx: number;
  effectiveScale: number;
}

/**
 * Computes the optimal crisp 8x8 board grid pixel size so the board + frame + player strip
 * ALWAYS fits inside the remaining viewport/container without clipping or overflowing,
 * while properly responding to browser zoom, panel resizing, and user board scaling.
 */
export function computeBoardGridSize(
  input: ComputeBoardGridSizeInput
): ComputedBoardGeometry {
  const {
    availableWidth,
    availableHeight,
    boardScale,
    coordinateStyle,
    showHelperBox,
    showEvalBar = false,
    underBoardStripHeight = 98,
    isStackedLayout = false,
    minGridPx = MIN_BOARD_GRID_PX,
  } = input;

  const chrome = getBoardFrameChrome(coordinateStyle, showHelperBox);
  const evalBarExtra = showEvalBar ? EVAL_BAR_RESERVE_PX : 0;
  const clampedScale = clampNumber(
    boardScale,
    MIN_BOARD_SCALE,
    MAX_BOARD_SCALE
  );

  // Horizontal budget for the 8x8 grid itself
  const maxGridByWidth = Math.max(
    minGridPx,
    availableWidth - chrome.extraWidthPx - evalBarExtra
  );

  // Vertical budget for the 8x8 grid itself (leave room for under-board player strip & gap)
  const rawMaxGridByHeight =
    availableHeight - chrome.extraHeightPx - underBoardStripHeight;

  // In stacked layouts (mobile or high browser zoom < 1024px where page scrolls vertically),
  // never crush the board to a tiny square if viewport height is short; guarantee a comfortable floor.
  const maxGridByHeight = isStackedLayout
    ? Math.max(Math.min(maxGridByWidth, 420), rawMaxGridByHeight)
    : Math.max(minGridPx, rawMaxGridByHeight);

  const rawMaxFit = Math.min(maxGridByWidth, maxGridByHeight, MAX_BOARD_GRID_PX);
  const maxFitSizePx = snapToBoardMultiple(Math.max(minGridPx, rawMaxFit));

  const scaledTarget = Math.max(minGridPx, maxFitSizePx * clampedScale);
  const boardSizePx = snapToBoardMultiple(Math.min(maxFitSizePx, scaledTarget));

  const frameWidthPx = boardSizePx + chrome.extraWidthPx;
  const frameHeightPx = boardSizePx + chrome.extraHeightPx;
  const effectiveScale =
    maxFitSizePx > 0 ? Number((boardSizePx / maxFitSizePx).toFixed(2)) : 1;

  return {
    boardSizePx,
    maxFitSizePx,
    frameWidthPx,
    frameHeightPx,
    effectiveScale,
  };
}

/**
 * Translates a pointer drag delta from the board's bottom-right resize handle into a
 * smooth clamped boardScale value (0.55 to 1.0).
 * Because the board is centered horizontally in its column, moving right by +dx expands
 * both left & right edges symmetrically, so we scale deltaX appropriately for tactile 1:1 feel.
 */
export function computeScaleFromCornerDrag(
  startBoardSizePx: number,
  maxFitSizePx: number,
  deltaX: number,
  deltaY: number
): number {
  if (!Number.isFinite(maxFitSizePx) || maxFitSizePx <= 0) {
    return MAX_BOARD_SCALE;
  }
  // Combine horizontal & vertical drag motion (diagonal down-right = larger, up-left = smaller)
  const dominantDelta = deltaX * 1.15 + deltaY * 0.85;
  const desiredSize = startBoardSizePx + dominantDelta;
  const nextScale = desiredSize / maxFitSizePx;
  return Number(
    clampNumber(nextScale, MIN_BOARD_SCALE, MAX_BOARD_SCALE).toFixed(3)
  );
}

/**
 * Parses and validates persisted UI layout preferences with safe fallbacks.
 */
export function sanitizeUILayoutPreferences(
  raw: unknown
): UILayoutPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_UI_LAYOUT_PREFERENCES };
  }
  const obj = raw as Partial<UILayoutPreferences>;

  const boardTheme: BoardThemeId =
    obj.boardTheme && obj.boardTheme in BOARD_THEMES
      ? obj.boardTheme
      : DEFAULT_UI_LAYOUT_PREFERENCES.boardTheme;

  const coordinateStyle: CoordinateStyle =
    obj.coordinateStyle === 'both' ||
    obj.coordinateStyle === 'inside' ||
    obj.coordinateStyle === 'outside' ||
    obj.coordinateStyle === 'none'
      ? obj.coordinateStyle
      : DEFAULT_UI_LAYOUT_PREFERENCES.coordinateStyle;

  const pieceOrientation: PieceOrientationMode =
    obj.pieceOrientation === 'facing' ||
    obj.pieceOrientation === 'board' ||
    obj.pieceOrientation === 'upright'
      ? obj.pieceOrientation
      : DEFAULT_UI_LAYOUT_PREFERENCES.pieceOrientation;

  const boardScale =
    typeof obj.boardScale === 'number'
      ? clampNumber(obj.boardScale, MIN_BOARD_SCALE, MAX_BOARD_SCALE)
      : DEFAULT_UI_LAYOUT_PREFERENCES.boardScale;

  const coachPanelWidth =
    typeof obj.coachPanelWidth === 'number'
      ? Math.round(
          clampNumber(obj.coachPanelWidth, MIN_COACH_WIDTH, MAX_COACH_WIDTH)
        )
      : DEFAULT_UI_LAYOUT_PREFERENCES.coachPanelWidth;

  const isCoachPanelOpen =
    typeof obj.isCoachPanelOpen === 'boolean'
      ? obj.isCoachPanelOpen
      : DEFAULT_UI_LAYOUT_PREFERENCES.isCoachPanelOpen;

  const showBoardTooltip =
    typeof obj.showBoardTooltip === 'boolean'
      ? obj.showBoardTooltip
      : DEFAULT_UI_LAYOUT_PREFERENCES.showBoardTooltip;

  const showEvalBar =
    typeof obj.showEvalBar === 'boolean'
      ? obj.showEvalBar
      : DEFAULT_UI_LAYOUT_PREFERENCES.showEvalBar;

  const isReplayCoachExpanded =
    typeof obj.isReplayCoachExpanded === 'boolean'
      ? obj.isReplayCoachExpanded
      : DEFAULT_UI_LAYOUT_PREFERENCES.isReplayCoachExpanded;

  const isReplayMoveListExpanded =
    typeof obj.isReplayMoveListExpanded === 'boolean'
      ? obj.isReplayMoveListExpanded
      : DEFAULT_UI_LAYOUT_PREFERENCES.isReplayMoveListExpanded;

  return {
    boardTheme,
    coordinateStyle,
    pieceOrientation,
    boardScale,
    coachPanelWidth,
    isCoachPanelOpen,
    showBoardTooltip,
    showEvalBar,
    isReplayCoachExpanded,
    isReplayMoveListExpanded,
  };
}

export function loadUILayoutPreferences(): UILayoutPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_UI_LAYOUT_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(UI_LAYOUT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_LAYOUT_PREFERENCES };
    return sanitizeUILayoutPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_UI_LAYOUT_PREFERENCES };
  }
}

export function saveUILayoutPreferences(prefs: UILayoutPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_LAYOUT_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}
