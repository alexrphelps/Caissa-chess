import React, { useState } from 'react';
import {
  describeEngineProfileSummary,
  ENGINE_MILESTONE_PRESETS,
  MAX_ENGINE_ELO,
  MIN_ENGINE_ELO,
} from '../chess/evaluation';
import {
  AIPresetId,
  ChessEngineConfig,
  EngineProfileState,
  EvalWeights,
  SavedEngineProfile,
} from '../chess/types';

export interface EngineCustomizerModalProps {
  isOpen: boolean;
  engineProfile: EngineProfileState;
  savedProfiles: SavedEngineProfile[];
  onClose: () => void;
  onChangeElo: (elo: number) => void;
  onSelectPreset: (presetId: Exclude<AIPresetId, 'custom'>) => void;
  onUpdateCustomConfig: (patch: Partial<ChessEngineConfig>) => void;
  onSaveProfile: (name: string) => void;
  onLoadProfile: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onResetToEloDefault: () => void;
}

const WEIGHT_FIELDS: {
  key: keyof EvalWeights;
  label: string;
  hint: string;
}[] = [
  {
    key: 'material',
    label: 'Material Value',
    hint: 'Piece value preservation & trade priority',
  },
  {
    key: 'kingSafety',
    label: 'King Safety & Shelter',
    hint: 'Pawn shield integrity & open-file defense',
  },
  {
    key: 'pawnStructure',
    label: 'Pawn Structure',
    hint: 'Passed pawns, isolated/doubled/backward penalties',
  },
  {
    key: 'pieceSquareTables',
    label: 'Piece-Square Tables (PST)',
    hint: 'Classical square placement & centralization',
  },
  {
    key: 'mobility',
    label: 'Piece Mobility & Aggression',
    hint: 'Outposts, open files, 7th rank & active pressure',
  },
];

export const EngineCustomizerModal: React.FC<EngineCustomizerModalProps> = ({
  isOpen,
  engineProfile,
  savedProfiles,
  onClose,
  onChangeElo,
  onSelectPreset,
  onUpdateCustomConfig,
  onSaveProfile,
  onLoadProfile,
  onDeleteProfile,
  onResetToEloDefault,
}) => {
  const [profileNameInput, setProfileNameInput] = useState('');

  if (!isOpen) return null;

  const { config, elo, presetId, isCustom, activeSavedProfileId } = engineProfile;
  const summary = describeEngineProfileSummary(engineProfile);

  const handleWeightChange = (key: keyof EvalWeights, value: number) => {
    onUpdateCustomConfig({
      evalWeights: {
        ...config.evalWeights,
        [key]: value,
      },
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = profileNameInput.trim();
    if (!trimmed) return;
    onSaveProfile(trimmed);
    setProfileNameInput('');
  };

  return (
    <div
      data-testid="engine-customizer-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Granular AI Difficulty & Engine Customization"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-[#141E19] border border-[#34463C] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.85)] text-[#F4EFE6] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#101814] border-b border-[#26342C] flex items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h2
                className="text-base sm:text-lg font-bold tracking-tight text-[#F4EFE6]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                AI Engine & Granular Strength Studio
              </h2>
              <span
                data-testid="customizer-status-badge"
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase ${
                  isCustom
                    ? 'bg-[#C6923A] text-[#111815]'
                    : 'bg-[#213028] text-[#C6923A] border border-[#C6923A]/40'
                }`}
              >
                {isCustom ? `Custom · ${elo} Elo` : summary.badge}
              </span>
            </div>
            <p className="text-xs font-mono text-[#A69F91] mt-0.5">
              {summary.subtitle}
            </p>
          </div>

          <button
            type="button"
            data-testid="close-customizer-modal-btn"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-[#212E27] hover:bg-[#2C3D34] border border-[#34463C] text-xs font-semibold text-[#F4EFE6] cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* 1. Primary Control: Continuous Estimated Elo Slider (400 - 3000) + Quick Milestone Presets */}
          <section className="p-4 rounded-xl bg-[#18241E] border border-[#283830] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#C6923A] font-bold">
                  1. Primary Strength · Continuous Elo Slider (400 – 3000)
                </span>
                <p className="text-xs text-[#A69F91] mt-0.5">
                  Automatically interpolates balanced depth, time budget, pruning, weights, and blunder rates.
                </p>
              </div>
              <div className="text-right shrink-0">
                <span
                  data-testid="modal-elo-value"
                  className="text-lg font-mono font-bold text-[#F4EFE6] tabular-nums"
                >
                  {elo} ELO
                </span>
                <span className="block text-[11px] font-mono text-[#C6923A] tabular-nums">
                  {summary.depthBadge}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <input
                type="range"
                data-testid="modal-elo-slider"
                min={MIN_ENGINE_ELO}
                max={MAX_ENGINE_ELO}
                step={25}
                value={elo}
                onChange={(e) => onChangeElo(Number(e.target.value))}
                className="w-full accent-[#C6923A] cursor-pointer h-2 bg-[#101814] rounded-lg"
              />
              <div className="flex justify-between text-[10px] font-mono text-[#857F72] tabular-nums">
                <span>400 (Beginner)</span>
                <span>1000 (Casual)</span>
                <span>1150 (Reactive)</span>
                <span>1400 (Interm.)</span>
                <span>1800 (Club)</span>
                <span>3000 (GM+)</span>
              </div>
            </div>

            {/* Quick-Select Milestone Presets */}
            <div className="pt-1 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#A69F91]">
                <span>QUICK-SELECT MILESTONE PRESETS</span>
                {isCustom && (
                  <button
                    type="button"
                    data-testid="reset-engine-config-btn"
                    onClick={onResetToEloDefault}
                    className="text-[#C6923A] hover:underline cursor-pointer font-semibold"
                  >
                    Reset Knobs to {elo} Elo Default ↺
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ENGINE_MILESTONE_PRESETS.map((preset) => {
                  const selected = !isCustom && presetId === preset.id;
                  const isReactive = preset.id === 'reactive';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`modal-preset-${preset.id}`}
                      onClick={() => onSelectPreset(preset.id)}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex flex-col justify-between gap-1 ${
                        selected
                          ? 'bg-[#C6923A] border-[#C6923A] text-[#111815]'
                          : isReactive
                          ? 'bg-[#172820] hover:bg-[#1E3329] border-[#2E5240] text-[#F4EFE6]'
                          : 'bg-[#121A16] hover:bg-[#1B2721] border-[#26342C] text-[#D6CFC2]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate">
                          {preset.shortLabel}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            selected
                              ? 'bg-[#111815]/20 text-[#111815] font-bold'
                              : isReactive
                              ? 'bg-[#22C55E]/20 text-[#4ADE80]'
                              : 'bg-[#1D2822] text-[#A69F91]'
                          }`}
                        >
                          {isReactive ? 'Safe Trades' : `${preset.config.maxDepth}p`}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] leading-tight line-clamp-2 ${
                          selected ? 'text-[#111815]/85 font-medium' : 'text-[#857F72]'
                        }`}
                      >
                        {preset.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 2. Search Boundaries & Tactical Pruning Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search Boundaries */}
            <section className="p-4 rounded-xl bg-[#18241E] border border-[#283830] space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#C6923A] font-bold block">
                2. Search Boundaries
              </span>

              {/* maxDepth */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <label htmlFor="custom-depth-slider" className="text-[#D6CFC2]">
                    Max Lookahead Depth (`maxDepth`)
                  </label>
                  <span
                    data-testid="custom-depth-value"
                    className="font-bold text-[#F4EFE6] tabular-nums"
                  >
                    {config.maxDepth} {config.maxDepth === 1 ? 'ply' : 'plies'}
                  </span>
                </div>
                <input
                  id="custom-depth-slider"
                  type="range"
                  data-testid="custom-depth-slider"
                  min={1}
                  max={20}
                  step={1}
                  value={config.maxDepth}
                  onChange={(e) =>
                    onUpdateCustomConfig({ maxDepth: Number(e.target.value) })
                  }
                  className="w-full accent-[#C6923A] cursor-pointer h-1.5 bg-[#101814] rounded-lg"
                />
                <p className="text-[11px] text-[#857F72]">
                  1–2 ply: reactive & non-tactical · 3–4 ply: club tactics · 5–20 ply: deep calculation
                </p>
              </div>

              {/* maxTimeMs */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <label htmlFor="custom-time-slider" className="text-[#D6CFC2]">
                    Move Time Budget (`maxTimeMs`)
                  </label>
                  <span
                    data-testid="custom-time-value"
                    className="font-bold text-[#F4EFE6] tabular-nums"
                  >
                    {config.maxTimeMs} ms
                  </span>
                </div>
                <input
                  id="custom-time-slider"
                  type="range"
                  data-testid="custom-time-slider"
                  min={100}
                  max={15000}
                  step={100}
                  value={config.maxTimeMs}
                  onChange={(e) =>
                    onUpdateCustomConfig({ maxTimeMs: Number(e.target.value) })
                  }
                  className="w-full accent-[#C6923A] cursor-pointer h-1.5 bg-[#101814] rounded-lg"
                />
                <p className="text-[11px] text-[#857F72]">
                  Hard cutoff checked every 2,048 nodes (100ms up to 15,000ms cap)
                </p>
              </div>

              {/* Humanization & Blunder Modeling */}
              <div className="pt-2 border-t border-[#24332B] space-y-2.5">
                <span className="text-xs font-mono uppercase tracking-wider text-[#C6923A] font-bold block">
                  3. Humanization & Blunder Modeling
                </span>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <label htmlFor="custom-error-prob" className="text-[#D6CFC2]">
                      Suboptimal Move Rate (`errorProbability`)
                    </label>
                    <span className="font-bold text-[#F4EFE6] tabular-nums">
                      {Math.round(config.errorProbability * 100)}%
                    </span>
                  </div>
                  <input
                    id="custom-error-prob"
                    type="range"
                    data-testid="custom-error-prob"
                    min={0}
                    max={0.5}
                    step={0.02}
                    value={config.errorProbability}
                    onChange={(e) =>
                      onUpdateCustomConfig({
                        errorProbability: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#C6923A] cursor-pointer h-1.5 bg-[#101814] rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <label htmlFor="custom-error-margin" className="text-[#D6CFC2]">
                      Max Inaccuracy Penalty (`errorMarginCentipawns`)
                    </label>
                    <span className="font-bold text-[#F4EFE6] tabular-nums">
                      {config.errorMarginCentipawns} cp
                    </span>
                  </div>
                  <input
                    id="custom-error-margin"
                    type="range"
                    data-testid="custom-error-margin"
                    min={0}
                    max={300}
                    step={5}
                    value={config.errorMarginCentipawns}
                    onChange={(e) =>
                      onUpdateCustomConfig({
                        errorMarginCentipawns: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#C6923A] cursor-pointer h-1.5 bg-[#101814] rounded-lg"
                  />
                  <p className="text-[11px] text-[#857F72]">
                    ≤30cp keeps moves safe & solid · ≥120cp allows occasional loose play
                  </p>
                </div>
              </div>
            </section>

            {/* Tactical & Pruning Toggles */}
            <section className="p-4 rounded-xl bg-[#18241E] border border-[#283830] space-y-2.5">
              <span className="text-xs font-mono uppercase tracking-wider text-[#C6923A] font-bold block">
                4. Tactical & Pruning Toggles
              </span>

              {(
                [
                  {
                    key: 'enableQuiescence',
                    testId: 'toggle-quiescence',
                    label: 'Quiescence Search (Safe Trades)',
                    desc: 'Resolves capture & check chains at leaf nodes so AI never makes naive losing trades',
                  },
                  {
                    key: 'enableTranspositionTable',
                    testId: 'toggle-tt',
                    label: '64-Bit Zobrist Transposition Table',
                    desc: 'Caches evaluated positions and orders best hash moves first',
                  },
                  {
                    key: 'enableNullMovePruning',
                    testId: 'toggle-nmp',
                    label: 'Null-Move Pruning (NMP)',
                    desc: 'Aggressive forward pruning with Zugzwang verification at depth ≥ 3',
                  },
                  {
                    key: 'enableLMR',
                    testId: 'toggle-lmr',
                    label: 'Late Move Reductions (LMR)',
                    desc: 'Searches quiet late moves at reduced depth to reach deeper tactical lines',
                  },
                ] as const
              ).map((item) => {
                const enabled = config[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    data-testid={item.testId}
                    onClick={() =>
                      onUpdateCustomConfig({ [item.key]: !enabled })
                    }
                    className={`w-full p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                      enabled
                        ? 'bg-[#15251D] border-[#2E5240]'
                        : 'bg-[#121A16] border-[#24332B]'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-[#F4EFE6]">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-[#857F72] leading-snug">
                        {item.desc}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                        enabled
                          ? 'bg-[#16A34A]/25 text-[#4ADE80] border border-[#22C55E]/40'
                          : 'bg-[#1D2822] text-[#857F72]'
                      }`}
                    >
                      {enabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}
            </section>
          </div>

          {/* 5. Evaluation Weight Multipliers (0.0x - 2.0x) */}
          <section className="p-4 rounded-xl bg-[#18241E] border border-[#283830] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-[#C6923A] font-bold">
                5. Evaluation Weight Multipliers (0.0× – 2.0×)
              </span>
              <span className="text-[11px] font-mono text-[#857F72]">
                Tune positional personality (e.g. high King Safety + Material for defensive play)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {WEIGHT_FIELDS.map((field) => {
                const val = config.evalWeights[field.key] ?? 1.0;
                return (
                  <div
                    key={field.key}
                    className="p-2.5 rounded-lg bg-[#121A16] border border-[#24332B] space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#F4EFE6] font-semibold truncate">
                        {field.label}
                      </span>
                      <span
                        data-testid={`weight-val-${field.key}`}
                        className="text-[#C6923A] font-bold tabular-nums"
                      >
                        {val.toFixed(2)}×
                      </span>
                    </div>
                    <input
                      type="range"
                      data-testid={`weight-${field.key}`}
                      min={0}
                      max={2}
                      step={0.05}
                      value={val}
                      onChange={(e) =>
                        handleWeightChange(field.key, Number(e.target.value))
                      }
                      className="w-full accent-[#C6923A] cursor-pointer h-1.5 bg-[#101814] rounded-lg"
                    />
                    <p className="text-[10px] text-[#857F72] leading-tight">
                      {field.hint}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 6. Custom Profile Manager (Save, Name, Load, Delete) */}
          <section className="p-4 rounded-xl bg-[#18241E] border border-[#283830] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[#C6923A] font-bold">
                6. Saved Custom Profiles (Persisted in LocalStorage)
              </span>
              <span className="text-[11px] font-mono text-[#857F72]">
                Save & name your favorite sparring bots
              </span>
            </div>

            <form onSubmit={handleSave} className="flex items-center gap-2">
              <input
                type="text"
                data-testid="custom-profile-name-input"
                placeholder="Name current setup (e.g., Solid Reactive 1150)..."
                value={profileNameInput}
                onChange={(e) => setProfileNameInput(e.target.value)}
                maxLength={36}
                className="flex-1 h-9 px-3 rounded-lg bg-[#101814] border border-[#2F4238] text-xs text-[#F4EFE6] placeholder-[#6E6A5F] focus:outline-none focus:border-[#C6923A]"
              />
              <button
                type="submit"
                data-testid="save-custom-profile-btn"
                disabled={!profileNameInput.trim()}
                className="h-9 px-4 rounded-lg bg-[#C6923A] hover:bg-[#D4A048] disabled:opacity-40 disabled:pointer-events-none text-xs font-bold text-[#111815] cursor-pointer transition-colors shrink-0"
              >
                Save Profile
              </button>
            </form>

            {savedProfiles.length === 0 ? (
              <p className="text-xs font-mono text-[#7A7467]">
                No custom profiles saved yet. Adjust any slider above and save a named profile.
              </p>
            ) : (
              <div
                data-testid="saved-profiles-list"
                className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1"
              >
                {savedProfiles.map((prof) => {
                  const isActive = activeSavedProfileId === prof.id;
                  return (
                    <div
                      key={prof.id}
                      data-testid={`saved-profile-card-${prof.id}`}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-[#1F2E26] border-[#C6923A]'
                          : 'bg-[#121A16] border-[#24332B]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#F4EFE6] truncate">
                          {prof.name}
                        </div>
                        <div className="text-[10px] font-mono text-[#A69F91] tabular-nums">
                          {prof.elo} Elo · {prof.config.maxDepth}p
                          {prof.config.enableQuiescence ? '+Q' : ''} ·{' '}
                          {prof.config.maxTimeMs}ms
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          data-testid={`load-profile-${prof.id}`}
                          onClick={() => onLoadProfile(prof.id)}
                          className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-[#C6923A] text-[#111815]'
                              : 'bg-[#212E27] hover:bg-[#2C3D34] text-[#F4EFE6]'
                          }`}
                        >
                          {isActive ? 'Active' : 'Load'}
                        </button>
                        <button
                          type="button"
                          data-testid={`delete-profile-${prof.id}`}
                          onClick={() => onDeleteProfile(prof.id)}
                          title="Delete saved profile"
                          className="px-2 py-1 rounded bg-[#2A1818] hover:bg-[#3B1D1D] text-[#F87171] text-[11px] font-mono cursor-pointer transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
