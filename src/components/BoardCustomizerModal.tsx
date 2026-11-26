import React from 'react';
import { BoardRotation } from '../chess/types';
import {
  BOARD_ROTATIONS,
  describeBoardRotation,
  rotateBoardCCW,
  rotateBoardCW,
} from '../utils/boardOrientation';
import {
  BOARD_THEME_LIST,
  BoardThemeId,
  CoordinateStyle,
  MAX_BOARD_SCALE,
  MAX_COACH_WIDTH,
  MIN_BOARD_SCALE,
  MIN_COACH_WIDTH,
  UILayoutPreferences,
} from '../utils/layoutMath';
import {
  LayoutPanelLeft,
  Maximize2,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react';

interface BoardCustomizerModalProps {
  isOpen: boolean;
  preferences: UILayoutPreferences;
  currentBoardPx: number;
  maxFitBoardPx: number;
  boardRotation?: BoardRotation;
  onChangeBoardRotation?: (rotation: BoardRotation) => void;
  onClose: () => void;
  onChangePreferences: (patch: Partial<UILayoutPreferences>) => void;
  onResetDefaults: () => void;
}

const COORDINATE_OPTIONS: { id: CoordinateStyle; label: string }[] = [
  { id: 'both', label: 'Frame + Inside' },
  { id: 'inside', label: 'Inside Only' },
  { id: 'outside', label: 'Frame Only' },
  { id: 'none', label: 'Hidden' },
];

const COACH_WIDTH_PRESETS: { label: string; width: number }[] = [
  { label: 'Compact', width: 320 },
  { label: 'Balanced', width: 440 },
  { label: 'Spacious', width: 580 },
];

export const BoardCustomizerModal: React.FC<BoardCustomizerModalProps> = ({
  isOpen,
  preferences,
  currentBoardPx,
  maxFitBoardPx,
  boardRotation = 0,
  onChangeBoardRotation,
  onClose,
  onChangePreferences,
  onResetDefaults,
}) => {
  if (!isOpen) return null;

  const scalePercent = Math.round(preferences.boardScale * 100);

  return (
    <div
      data-testid="board-customizer-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Board and Workspace Customizer"
      className="fixed inset-0 z-50 bg-[#0B100E]/75 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-[520px] max-h-[90dvh] overflow-y-auto bg-[#16201B] border border-[#34463C] rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.8)] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#121A16] border-b border-[#26342C] flex items-center justify-between gap-3 sticky top-0 z-10">
          <div>
            <h2
              className="text-base font-bold text-[#F4EFE6] tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Board & Workspace Customizer
            </h2>
            <p className="text-xs text-[#A69F91] mt-0.5">
              Personalize board appearance, sizing, and Tactical Coach layout
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Board Customizer"
            className="w-8 h-8 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-[#D6CFC2] hover:text-[#F4EFE6] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 1. Board Surface Theme */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#EADBC8]">
                Board Surface Theme
              </span>
              <span className="text-xs font-mono text-[#A69F91]">
                {
                  BOARD_THEME_LIST.find((t) => t.id === preferences.boardTheme)
                    ?.name
                }
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {BOARD_THEME_LIST.map((theme) => {
                const isSelected = preferences.boardTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    data-testid={`board-theme-${theme.id}`}
                    aria-pressed={isSelected}
                    onClick={() =>
                      onChangePreferences({
                        boardTheme: theme.id as BoardThemeId,
                      })
                    }
                    className={`p-2.5 rounded-lg border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#1F2E26] border-[#C6923A] shadow-[0_0_0_1px_rgba(198,146,58,0.3)]'
                        : 'bg-[#121A16] border-[#26342C] hover:border-[#3D5246]'
                    }`}
                  >
                    {/* 2x2 Mini Board Swatch */}
                    <div
                      className="w-10 h-10 rounded-md p-1 shrink-0 grid grid-cols-2 grid-rows-2 border"
                      style={{
                        backgroundColor: theme.frameBg,
                        borderColor: theme.frameBorder,
                      }}
                      aria-hidden="true"
                    >
                      <div style={{ backgroundColor: theme.lightSquare }} />
                      <div style={{ backgroundColor: theme.darkSquare }} />
                      <div style={{ backgroundColor: theme.darkSquare }} />
                      <div style={{ backgroundColor: theme.lightSquare }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#F4EFE6] truncate">
                        {theme.name}
                      </div>
                      <div className="text-[11px] text-[#A69F91] truncate mt-0.5">
                        {theme.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 1b. Board Angle & 90° Perspective Rotation */}
          {onChangeBoardRotation && (
            <section className="space-y-2.5 pt-4 border-t border-[#24332B]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#EADBC8] flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-[#C6923A]" />
                  <span>Board Angle & Perspective</span>
                </span>
                <span className="text-xs font-mono text-[#C6923A] font-bold tabular-nums">
                  {boardRotation}° · {describeBoardRotation(boardRotation)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {BOARD_ROTATIONS.map((deg) => {
                  const isSelected = boardRotation === deg;
                  return (
                    <button
                      key={deg}
                      type="button"
                      data-testid={`customizer-angle-${deg}`}
                      aria-pressed={isSelected}
                      onClick={() => onChangeBoardRotation(deg)}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer text-center ${
                        isSelected
                          ? 'bg-[#C6923A] text-[#111815] border-[#C6923A] font-bold'
                          : 'bg-[#121A16] hover:bg-[#1D2822] border-[#293830] text-[#D6CFC2]'
                      }`}
                    >
                      <div className="font-mono tabular-nums">{deg}°</div>
                      <div
                        className={`text-[10px] leading-tight mt-0.5 ${
                          isSelected ? 'text-[#111815]/80' : 'text-[#A69F91]'
                        }`}
                      >
                        {describeBoardRotation(deg)}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#A69F91]">
                  Shortcuts: [T] Rotate +90° · [Shift+T] -90° · [F] Flip 180°
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-testid="customizer-rotate-ccw-btn"
                    onClick={() =>
                      onChangeBoardRotation(rotateBoardCCW(boardRotation))
                    }
                    className="px-2 py-1 rounded-md text-[11px] font-mono font-semibold bg-[#1D2822] hover:bg-[#27362E] border border-[#34463C] text-[#EADBC8] flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 text-[#C6923A]" />
                    <span>-90°</span>
                  </button>
                  <button
                    type="button"
                    data-testid="customizer-rotate-cw-btn"
                    onClick={() =>
                      onChangeBoardRotation(rotateBoardCW(boardRotation))
                    }
                    className="px-2 py-1 rounded-md text-[11px] font-mono font-semibold bg-[#1D2822] hover:bg-[#27362E] border border-[#34463C] text-[#EADBC8] flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3 text-[#C6923A]" />
                    <span>+90°</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 2. Chessboard Scale & Auto-Fit */}
          <section className="space-y-2.5 pt-4 border-t border-[#24332B]">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="customizer-board-scale"
                className="text-xs font-semibold text-[#EADBC8] flex items-center gap-1.5"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#C6923A]" />
                <span>Chessboard Size</span>
              </label>
              <span className="text-xs font-mono text-[#C6923A] font-bold tabular-nums">
                {scalePercent}% · {currentBoardPx}px (Max {maxFitBoardPx}px)
              </span>
            </div>

            <input
              id="customizer-board-scale"
              data-testid="customizer-board-scale-slider"
              type="range"
              min={Math.round(MIN_BOARD_SCALE * 100)}
              max={Math.round(MAX_BOARD_SCALE * 100)}
              step={1}
              value={scalePercent}
              onChange={(e) =>
                onChangePreferences({
                  boardScale: Number(e.target.value) / 100,
                })
              }
              className="w-full h-1.5 bg-[#25352C] rounded-lg appearance-none cursor-pointer accent-[#C6923A]"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-[#A69F91]">
                Tip: Drag the bottom-right corner handle on the board frame anytime.
              </span>
              <button
                type="button"
                data-testid="customizer-autofit-board-btn"
                onClick={() => onChangePreferences({ boardScale: 1.0 })}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border transition-colors cursor-pointer ${
                  scalePercent === 100
                    ? 'bg-[#C6923A]/20 border-[#C6923A] text-[#C6923A]'
                    : 'bg-[#1D2822] hover:bg-[#27362E] border-[#34463C] text-[#EADBC8]'
                }`}
              >
                Auto-Fit 100%
              </button>
            </div>
          </section>

          {/* 3. Tactical Coach Panel Width & Visibility */}
          <section className="space-y-2.5 pt-4 border-t border-[#24332B]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#EADBC8] flex items-center gap-1.5">
                <LayoutPanelLeft className="w-3.5 h-3.5 text-[#C6923A]" />
                <span>Tactical Coach Panel</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.isCoachPanelOpen}
                data-testid="customizer-toggle-coach-panel-btn"
                onClick={() =>
                  onChangePreferences({
                    isCoachPanelOpen: !preferences.isCoachPanelOpen,
                  })
                }
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                  preferences.isCoachPanelOpen
                    ? 'bg-[#16A34A]/20 border-[#22C55E] text-[#4ADE80]'
                    : 'bg-[#1D2822] border-[#34463C] text-[#A69F91] hover:text-[#F4EFE6]'
                }`}
              >
                {preferences.isCoachPanelOpen ? 'Visible' : 'Hidden (Zen Board)'}
              </button>
            </div>

            {preferences.isCoachPanelOpen && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-[#A69F91]">
                  <label htmlFor="customizer-coach-width">Panel Width</label>
                  <span className="text-[#F4EFE6] font-bold tabular-nums">
                    {preferences.coachPanelWidth}px
                  </span>
                </div>
                <input
                  id="customizer-coach-width"
                  data-testid="customizer-coach-width-slider"
                  type="range"
                  min={MIN_COACH_WIDTH}
                  max={MAX_COACH_WIDTH}
                  step={10}
                  value={preferences.coachPanelWidth}
                  onChange={(e) =>
                    onChangePreferences({
                      coachPanelWidth: Number(e.target.value),
                    })
                  }
                  className="w-full h-1.5 bg-[#25352C] rounded-lg appearance-none cursor-pointer accent-[#C6923A]"
                />
                <div className="flex items-center gap-1.5">
                  {COACH_WIDTH_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        onChangePreferences({ coachPanelWidth: preset.width })
                      }
                      className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-mono font-semibold border transition-colors cursor-pointer ${
                        Math.abs(preferences.coachPanelWidth - preset.width) <=
                        15
                          ? 'bg-[#C6923A] text-[#111815] border-[#C6923A] font-bold'
                          : 'bg-[#121A16] hover:bg-[#1D2822] border-[#293830] text-[#D6CFC2]'
                      }`}
                    >
                      {preset.label} ({preset.width})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 4. Coordinates & Under-Board Helper Box */}
          <section className="space-y-3 pt-4 border-t border-[#24332B]">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-[#EADBC8] block">
                Board Coordinates
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {COORDINATE_OPTIONS.map((opt) => {
                  const isSelected = preferences.coordinateStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`coord-style-${opt.id}`}
                      aria-pressed={isSelected}
                      onClick={() =>
                        onChangePreferences({ coordinateStyle: opt.id })
                      }
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? 'bg-[#C6923A] text-[#111815] border-[#C6923A] font-bold'
                          : 'bg-[#121A16] hover:bg-[#1D2822] border-[#293830] text-[#D6CFC2]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <div className="text-xs font-semibold text-[#EADBC8]">
                  Under-Board Live Coach Bar
                </div>
                <div className="text-[11px] text-[#A69F91]">
                  Hide to reclaim extra vertical room for a larger board
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.showBoardTooltip}
                data-testid="customizer-toggle-board-tooltip-btn"
                onClick={() =>
                  onChangePreferences({
                    showBoardTooltip: !preferences.showBoardTooltip,
                  })
                }
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold border transition-colors cursor-pointer shrink-0 ${
                  preferences.showBoardTooltip
                    ? 'bg-[#16A34A]/20 border-[#22C55E] text-[#4ADE80]'
                    : 'bg-[#1D2822] border-[#34463C] text-[#A69F91] hover:text-[#F4EFE6]'
                }`}
              >
                {preferences.showBoardTooltip ? 'Shown' : 'Hidden'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <div className="text-xs font-semibold text-[#EADBC8]">
                  Vertical Evaluation Bar
                </div>
                <div className="text-[11px] text-[#A69F91]">
                  Live centipawn advantage meter beside the chessboard
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.showEvalBar}
                data-testid="customizer-toggle-eval-bar-btn"
                onClick={() =>
                  onChangePreferences({
                    showEvalBar: !preferences.showEvalBar,
                  })
                }
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold border transition-colors cursor-pointer shrink-0 ${
                  preferences.showEvalBar
                    ? 'bg-[#16A34A]/20 border-[#22C55E] text-[#4ADE80]'
                    : 'bg-[#1D2822] border-[#34463C] text-[#A69F91] hover:text-[#F4EFE6]'
                }`}
              >
                {preferences.showEvalBar ? 'Shown' : 'Hidden'}
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#121A16] border-t border-[#26342C] flex items-center justify-between gap-3">
          <button
            type="button"
            data-testid="customizer-reset-layout-btn"
            onClick={onResetDefaults}
            className="px-3 py-1.5 rounded-lg bg-[#1D2822] hover:bg-[#27362E] border border-[#34463C] text-xs font-semibold text-[#D6CFC2] hover:text-[#F4EFE6] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#C6923A]" />
            <span>Reset Layout</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] text-xs font-bold text-[#111815] transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
