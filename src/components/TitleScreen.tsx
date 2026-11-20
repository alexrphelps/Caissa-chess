import React, { useState } from 'react';
import {
  describeEngineProfileSummary,
  ENGINE_MILESTONE_PRESETS,
  MAX_ENGINE_ELO,
  MIN_ENGINE_ELO,
} from '../chess/evaluation';
import {
  AIDifficulty,
  AIPresetId,
  Color,
  EngineProfileState,
  GameMode,
  StoredGameSession,
} from '../chess/types';
import { ChessPieceSvg } from './ChessPieceSvg';

interface TitleScreenProps {
  gameMode: GameMode;
  playerColor: Color;
  aiDifficulty: AIDifficulty;
  engineProfile: EngineProfileState;
  activeSession?: StoredGameSession | null;
  savedSessionsCount?: number;
  onSelectMode: (mode: GameMode) => void;
  onSelectColor: (color: Color) => void;
  onSelectDifficulty: (difficulty: AIDifficulty) => void;
  onSelectPreset: (presetId: Exclude<AIPresetId, 'custom'>) => void;
  onChangeElo: (elo: number) => void;
  onOpenCustomizer: () => void;
  onOpenSavedGames?: () => void;
  onResumeActiveGame?: () => void;
  onOpenPuzzles?: () => void;
  onStartGame: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  gameMode,
  playerColor,
  engineProfile,
  activeSession,
  savedSessionsCount = 0,
  onSelectMode,
  onSelectColor,
  onSelectPreset,
  onChangeElo,
  onOpenCustomizer,
  onOpenSavedGames,
  onResumeActiveGame,
  onOpenPuzzles,
  onStartGame,
}) => {
  const [hoveredPiece, setHoveredPiece] = useState<number | null>(null);
  const summary = describeEngineProfileSummary(engineProfile);

  const showcaseSquares: {
    sq: string;
    isLight: boolean;
    piece?: { type: 'k' | 'q' | 'n' | 'b' | 'r' | 'p'; color: Color };
    highlight?: boolean;
  }[] = [
    { sq: 'c6', isLight: true, piece: { type: 'n', color: 'b' } },
    { sq: 'd6', isLight: false, piece: { type: 'p', color: 'b' } },
    { sq: 'e6', isLight: true },
    { sq: 'f6', isLight: false, piece: { type: 'n', color: 'b' } },
    { sq: 'c5', isLight: false },
    { sq: 'd5', isLight: true, piece: { type: 'p', color: 'b' }, highlight: true },
    { sq: 'e5', isLight: false, piece: { type: 'p', color: 'w' }, highlight: true },
    { sq: 'f5', isLight: true },
    { sq: 'c4', isLight: true, piece: { type: 'b', color: 'w' }, highlight: true },
    { sq: 'd4', isLight: false, piece: { type: 'p', color: 'w' } },
    { sq: 'e4', isLight: true },
    { sq: 'f4', isLight: false },
    { sq: 'c3', isLight: false, piece: { type: 'n', color: 'w' } },
    { sq: 'd3', isLight: true },
    { sq: 'e3', isLight: false, piece: { type: 'q', color: 'w' } },
    { sq: 'f3', isLight: true, piece: { type: 'k', color: 'w' } },
  ];

  return (
    <div className="min-h-screen w-full bg-[#111815] text-[#F4EFE6] flex flex-col justify-between px-6 py-6 md:px-14 md:py-8 select-none relative overflow-hidden">
      {/* Subtle ambient radial vignette */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(circle at 72% 45%, rgba(198, 146, 58, 0.10) 0%, rgba(17, 24, 21, 0) 60%)',
        }}
      />

      {/* Top subtle club mark and Saved Games button */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-xs tracking-[0.22em] uppercase text-[#A69F91] font-medium">
          FIDE Rules Standard · 8×8 Algebraic Board
        </span>
        <div className="flex items-center gap-3">
          {onOpenSavedGames && (
            <button
              type="button"
              data-testid="title-open-saved-games-btn"
              onClick={onOpenSavedGames}
              className="px-2.5 py-1 rounded-md bg-[#1C2621] hover:bg-[#27372E] border border-[#C6923A]/40 text-xs font-mono text-[#EADBC8] hover:text-[#F4EFE6] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span className="text-[#C6923A]">📁</span>
              <span>Saved Games</span>
              {savedSessionsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#C6923A] text-[#111815] text-[10px] font-bold">
                  {savedSessionsCount}
                </span>
              )}
            </button>
          )}
          <span className="text-xs font-mono text-[#A69F91] tabular-nums hidden sm:inline">
            STD · 400–2400 ELO ENGINE
          </span>
        </div>
      </div>

      {/* Main Split Stage: Left Negative Space + Emblem & Controls, Right Interactive Centerpiece */}
      <main className="relative z-10 max-w-6xl w-full mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center py-4">
        {/* Left Column: Custom Inline SVG Title Lockup & Match Configuration */}
        <div className="lg:col-span-7 flex flex-col items-start space-y-6">
          {/* Bespoke Inline SVG Title Emblem Lockup */}
          <div className="w-full max-w-lg">
            <svg
              viewBox="0 0 520 148"
              className="w-full h-auto overflow-visible"
              role="img"
              aria-label="Caïssa — FIDE Standard Chess"
            >
              {/* Diegetic Brass Crest Shield */}
              <g transform="translate(4, 12)">
                <path
                  d="M 48,4 L 90,18 L 90,64 C 90,96 68,116 48,126 C 28,116 6,96 6,64 L 6,18 Z"
                  fill="#1C2621"
                  stroke="#C6923A"
                  strokeWidth="2.5"
                />
                <path
                  d="M 48,11 L 83,23 L 83,63 C 83,90 64,108 48,117 C 32,108 13,90 13,63 L 13,23 Z"
                  fill="none"
                  stroke="#8C6523"
                  strokeWidth="1.2"
                  strokeDasharray="3 2"
                />
                {/* Checkered Quadrant Motif inside Crest */}
                <rect x="28" y="34" width="20" height="20" fill="#EADBC8" opacity="0.15" />
                <rect x="48" y="54" width="20" height="20" fill="#EADBC8" opacity="0.15" />
                {/* Crowned King Silhouette in Crest */}
                <path
                  d="M 48,20 L 48,30 M 43,25 L 53,25 M 33,88 L 63,88 L 60,76 C 60,76 66,64 60,52 C 55,43 48,51 48,51 C 48,51 41,43 36,52 C 30,64 36,76 36,76 Z"
                  fill="#EADBC8"
                  stroke="#C6923A"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>

              {/* Main Display Typography Lockup */}
              <text
                x="118"
                y="76"
                fill="#F4EFE6"
                fontFamily="Fraunces, Georgia, serif"
                fontWeight="700"
                fontSize="64"
                letterSpacing="0.04em"
              >
                CAÏSSA
              </text>
              {/* Decorative Brass Rule */}
              <line
                x1="120"
                y1="94"
                x2="495"
                y2="94"
                stroke="#C6923A"
                strokeWidth="1.5"
                strokeOpacity="0.6"
              />
              <circle cx="120" cy="94" r="3" fill="#C6923A" />
              <text
                x="120"
                y="122"
                fill="#C6923A"
                fontFamily="Plus Jakarta Sans, sans-serif"
                fontWeight="600"
                fontSize="15"
                letterSpacing="0.24em"
              >
                CLASSICAL FIDE CHESS SALON
              </text>
            </svg>
          </div>

          {/* Match Configuration Controls (Mode + Granular AI Elo & Presets + Side) */}
          <div className="w-full max-w-lg space-y-4">
            {/* Mode Selector */}
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-[#A69F91] font-medium">
                Opponent Mode
              </div>
              <div className="grid grid-cols-2 gap-3 p-1.5 bg-[#19231E] border border-[#2C3A33] rounded-lg">
                <button
                  type="button"
                  onClick={() => onSelectMode('ai')}
                  className={`py-2 px-4 rounded-md text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    gameMode === 'ai'
                      ? 'bg-[#C6923A] text-[#111815] shadow-sm'
                      : 'text-[#D6CFC2] hover:text-[#F4EFE6] hover:bg-[#222F28]'
                  }`}
                >
                  Player vs. AI
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMode('pass_and_play')}
                  className={`py-2 px-4 rounded-md text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    gameMode === 'pass_and_play'
                      ? 'bg-[#C6923A] text-[#111815] shadow-sm'
                      : 'text-[#D6CFC2] hover:text-[#F4EFE6] hover:bg-[#222F28]'
                  }`}
                >
                  Two-Player Local
                </button>
              </div>
            </div>

            {/* Granular AI Difficulty & Engine Customization Section */}
            {gameMode === 'ai' && (
              <div
                className="p-3.5 rounded-xl bg-[#16201B] border border-[#2C3A33] space-y-3"
                data-testid="title-difficulty-selector"
              >
                {/* Top Row: Elo Slider Label + Active Badge + Advanced Tune Button */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-[#A69F91] font-medium">
                      AI Strength
                    </span>
                    <span
                      data-testid="title-elo-badge"
                      className="px-2 py-0.5 rounded bg-[#23322A] border border-[#C6923A]/40 text-xs font-mono font-bold text-[#C6923A] tabular-nums"
                    >
                      {summary.title}
                    </span>
                  </div>

                  <button
                    type="button"
                    data-testid="open-engine-customizer-btn"
                    onClick={onOpenCustomizer}
                    className="px-2.5 py-1 rounded-md bg-[#212E27] hover:bg-[#2C3D34] border border-[#384C41] text-[11px] font-mono font-semibold text-[#EADBC8] hover:text-[#F4EFE6] transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>Tune Engine Knobs</span>
                    <span className="text-[#C6923A]">⚙</span>
                  </button>
                </div>

                {/* Continuous 400 - 2400 Elo Slider */}
                <div className="space-y-1">
                  <input
                    type="range"
                    data-testid="title-elo-slider"
                    aria-label="Estimated AI Elo Rating"
                    min={MIN_ENGINE_ELO}
                    max={MAX_ENGINE_ELO}
                    step={25}
                    value={engineProfile.elo}
                    onChange={(e) => onChangeElo(Number(e.target.value))}
                    className="w-full accent-[#C6923A] cursor-pointer h-1.5 bg-[#101714] rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[#7A7467] tabular-nums">
                    <span>400 Elo</span>
                    <span>1000</span>
                    <span className="text-[#4ADE80]">1150 Reactive</span>
                    <span>1500</span>
                    <span>2000</span>
                    <span>2400+</span>
                  </div>
                </div>

                {/* 6 Milestone Presets Grid (including Reactive 1150 Safe-Trades Bot) */}
                <div
                  role="radiogroup"
                  aria-label="AI Difficulty Presets"
                  className="grid grid-cols-3 gap-1.5"
                >
                  {ENGINE_MILESTONE_PRESETS.map((preset) => {
                    const isSelected =
                      !engineProfile.isCustom &&
                      engineProfile.presetId === preset.id;
                    const isReactive = preset.id === 'reactive';
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-testid={`title-diff-${preset.id}`}
                        onClick={() => onSelectPreset(preset.id)}
                        className={`py-1.5 px-2.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-between border ${
                          isSelected
                            ? 'bg-[#C6923A] border-[#C6923A] text-[#111815] font-bold shadow-xs'
                            : isReactive
                            ? 'bg-[#172820] hover:bg-[#1E3329] border-[#2E5240] text-[#E2F2E8]'
                            : 'bg-[#121A16] hover:bg-[#1C2822] border-[#24332B] text-[#D6CFC2]'
                        }`}
                      >
                        <span className="truncate">{preset.name}</span>
                        <span
                          className={`text-[10px] font-mono tabular-nums ${
                            isSelected
                              ? 'text-[#111815]/80'
                              : isReactive
                              ? 'text-[#4ADE80]'
                              : 'text-[#857F72]'
                          }`}
                        >
                          {preset.elo}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Active Profile Behavioral Description */}
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#A69F91] pt-0.5">
                  <span className="truncate">{summary.subtitle}</span>
                  <span className="text-[#C6923A] shrink-0 tabular-nums">
                    {summary.depthBadge}
                  </span>
                </div>
              </div>
            )}

            {/* Player Color Selector */}
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-[#A69F91] font-medium">
                {gameMode === 'ai' ? 'Your Side' : 'Bottom Board Perspective'}
              </div>
              <div className="grid grid-cols-2 gap-3 p-1.5 bg-[#19231E] border border-[#2C3A33] rounded-lg">
                <button
                  type="button"
                  onClick={() => onSelectColor('w')}
                  className={`py-2 px-4 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    playerColor === 'w'
                      ? 'bg-[#EADBC8] text-[#1A1410] shadow-sm'
                      : 'text-[#D6CFC2] hover:text-[#F4EFE6] hover:bg-[#222F28]'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#FCF9F2] border border-[#231B15] inline-block shrink-0" />
                  Play as White
                </button>
                <button
                  type="button"
                  onClick={() => onSelectColor('b')}
                  className={`py-2 px-4 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    playerColor === 'b'
                      ? 'bg-[#EADBC8] text-[#1A1410] shadow-sm'
                      : 'text-[#D6CFC2] hover:text-[#F4EFE6] hover:bg-[#222F28]'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#22262A] border border-[#C8B9A6] inline-block shrink-0" />
                  Play as Black
                </button>
              </div>
            </div>

            {/* Resume Active Session Card (if unfinished game exists) */}
            {activeSession && activeSession.plyCount > 0 && onResumeActiveGame && (
              <div
                data-testid="title-resume-card"
                className="p-3.5 rounded-xl bg-[#192720] border-2 border-[#3F5A4B] shadow-md flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse shrink-0" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#4ADE80] font-bold">
                      Unfinished Session in Progress
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#F4EFE6] truncate mt-0.5">
                    {activeSession.title}
                  </div>
                  <div className="text-[11px] font-mono text-[#A69F91]">
                    Move {activeSession.fullMoveNumber} · {activeSession.plyCount} Plies ·{' '}
                    {activeSession.gameMode === 'ai'
                      ? `vs. AI (${activeSession.engineProfile?.elo ?? 1000} Elo)`
                      : '2-Player Local'}{' '}
                    · {activeSession.turn === 'w' ? 'White' : 'Black'} to move
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="title-resume-btn"
                  onClick={onResumeActiveGame}
                  className="px-4 py-2.5 rounded-lg bg-[#4ADE80] hover:bg-[#38C66E] active:bg-[#2CA85A] text-[#0D1E14] font-bold text-xs whitespace-nowrap transition-colors cursor-pointer shrink-0 shadow-sm flex items-center gap-1"
                >
                  <span>Resume Match</span>
                  <span>→</span>
                </button>
              </div>
            )}

            {/* Primary Start & Saved Games Action Row */}
            <div className="pt-1 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onStartGame();
                }}
                className="flex-1 w-full py-3.5 px-6 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] active:bg-[#B5822D] text-[#111815] font-bold text-base tracking-wide transition-transform duration-150 cursor-pointer shadow-[0_6px_20px_rgba(198,146,58,0.28)] whitespace-nowrap shrink-0 text-center"
              >
                Start New Match
              </button>

              {onOpenPuzzles && (
                <button
                  type="button"
                  data-testid="title-puzzles-btn"
                  onClick={onOpenPuzzles}
                  className="w-full sm:w-auto py-3.5 px-5 rounded-lg bg-[#162B21] hover:bg-[#1E3B2D] border border-emerald-500/50 text-xs font-mono font-bold text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(16,185,129,0.18)]"
                >
                  <span className="text-emerald-400">⚡</span>
                  <span>Tactical Puzzles</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Adaptive
                  </span>
                </button>
              )}

              {onOpenSavedGames && (
                <button
                  type="button"
                  data-testid="title-saved-games-btn"
                  onClick={onOpenSavedGames}
                  className="w-full sm:w-auto py-3.5 px-5 rounded-lg bg-[#1D2A23] hover:bg-[#25352C] border border-[#34463C] text-xs font-mono font-semibold text-[#EADBC8] hover:text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5"
                >
                  <span className="text-[#C6923A]">📁</span>
                  <span>Saved Games</span>
                  {savedSessionsCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-[#C6923A] text-[#111815] text-[10px] font-bold">
                      {savedSessionsCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Centerpiece / Hero Showcase */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="p-4 rounded-xl bg-[#2B1B12] border-2 border-[#4A3222] shadow-[0_24px_48px_rgba(0,0,0,0.65)]">
            <div className="grid grid-cols-4 w-68 h-68 sm:w-80 sm:h-80 rounded overflow-hidden border border-[#1A100A]">
              {showcaseSquares.map((cell, idx) => {
                const isHovered = hoveredPiece === idx;
                return (
                  <div
                    key={cell.sq}
                    onMouseEnter={() => setHoveredPiece(idx)}
                    onMouseLeave={() => setHoveredPiece(null)}
                    className="relative flex items-center justify-center transition-transform duration-150"
                    style={{
                      backgroundColor: cell.highlight
                        ? cell.isLight
                          ? '#E5C687'
                          : '#A6783E'
                        : cell.isLight
                        ? '#EADBC8'
                        : '#8B5A3C',
                    }}
                  >
                    <span
                      className={`absolute top-1 left-1.5 text-[10px] font-mono select-none ${
                        cell.isLight ? 'text-[#6E472F]' : 'text-[#DFCBB5]'
                      }`}
                    >
                      {cell.sq}
                    </span>
                    {cell.piece && (
                      <div
                        className={`w-4/5 h-4/5 transition-transform duration-150 ${
                          isHovered ? '-translate-y-1 scale-105' : ''
                        }`}
                      >
                        <ChessPieceSvg
                          type={cell.piece.type}
                          color={cell.piece.color}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between px-1 text-xs font-mono text-[#D6CFC2]">
              <span>CENTER CONTROL · d4/d5/e4/e5</span>
              <span>FIDE LAWS</span>
            </div>
          </div>
        </div>
      </main>

      {/* Flat borderless inline control hint at bottom safe margin */}
      <div className="relative z-10 text-center text-xs text-[#A69F91] tracking-wide font-mono">
        Click or Drag to Move · P Pause · R New Game · F Flip Board · Enter Start
      </div>
    </div>
  );
};
