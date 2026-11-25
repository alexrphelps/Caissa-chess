import {
  ChessEngineConfig,
  CoachPlaystyleKnobs,
  CoachPlaystylePresetId,
  CoachPlaystylePresetInfo,
  CoachPlaystyleProfile,
  Move,
} from './types';

export const COACH_PLAYSTYLE_STORAGE_KEY = 'caissa_coach_playstyle_v1';
export const COACH_KNOB_MIN = 0.4;
export const COACH_KNOB_MAX = 1.8;
export const COACH_KNOB_STEP = 0.1;
export const COACH_ENGINE_RATING_LABEL = '3000+ GM';

export const COACH_PLAYSTYLE_KNOB_META: readonly {
  key: keyof CoachPlaystyleKnobs;
  label: string;
  shortLabel: string;
  description: string;
  lowLabel: string;
  highLabel: string;
}[] = [
  {
    key: 'aggression',
    label: 'Aggression',
    shortLabel: 'Agg',
    description: 'King-zone attacks & forward pressure',
    lowLabel: 'Calm',
    highLabel: 'Sharp',
  },
  {
    key: 'mobility',
    label: 'Mobility',
    shortLabel: 'Mob',
    description: 'Active squares, open files & diagonals',
    lowLabel: 'Compact',
    highLabel: 'Dynamic',
  },
  {
    key: 'kingSafety',
    label: 'King Safety',
    shortLabel: 'King',
    description: 'Castling shelter & intact pawn shields',
    lowLabel: 'Bold',
    highLabel: 'Fortress',
  },
  {
    key: 'pawnStructure',
    label: 'Pawn Structure',
    shortLabel: 'Pawn',
    description: 'Passed & connected pawn chains',
    lowLabel: 'Fluid',
    highLabel: 'Classical',
  },
  {
    key: 'piecePlacement',
    label: 'Piece Harmony',
    shortLabel: 'Pos',
    description: 'Central outposts & piece coordination',
    lowLabel: 'Concrete',
    highLabel: 'Harmonious',
  },
] as const;

export const COACH_PLAYSTYLE_PRESETS: readonly CoachPlaystylePresetInfo[] = [
  {
    id: 'balanced',
    name: 'Balanced GM',
    shortLabel: 'Balanced',
    summary:
      'Pure 3000+ classical equilibrium with neutral positional weights.',
    knobs: {
      aggression: 1.0,
      mobility: 1.0,
      kingSafety: 1.0,
      pawnStructure: 1.0,
      piecePlacement: 1.0,
    },
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    shortLabel: 'Aggressive',
    summary:
      'Leans toward king-side attacks, open lines against the enemy king, and forward pressure.',
    knobs: {
      aggression: 1.6,
      mobility: 1.3,
      kingSafety: 0.8,
      pawnStructure: 0.85,
      piecePlacement: 1.1,
    },
  },
  {
    id: 'active',
    name: 'Active',
    shortLabel: 'Active',
    summary:
      'Maximizes piece activity, open files, and tactical flexibility across the board.',
    knobs: {
      aggression: 1.25,
      mobility: 1.6,
      kingSafety: 0.95,
      pawnStructure: 0.9,
      piecePlacement: 1.2,
    },
  },
  {
    id: 'solid',
    name: 'Solid',
    shortLabel: 'Solid',
    summary:
      'Prioritizes king shelter, sound pawn chains, and low-risk positional consolidation.',
    knobs: {
      aggression: 0.6,
      mobility: 0.9,
      kingSafety: 1.6,
      pawnStructure: 1.35,
      piecePlacement: 1.0,
    },
  },
  {
    id: 'positional',
    name: 'Positional',
    shortLabel: 'Positional',
    summary:
      'Focuses on pawn structure, dominant outposts, and long-term space control.',
    knobs: {
      aggression: 0.85,
      mobility: 1.25,
      kingSafety: 1.15,
      pawnStructure: 1.5,
      piecePlacement: 1.45,
    },
  },
] as const;

export const DEFAULT_COACH_PLAYSTYLE: Readonly<CoachPlaystyleProfile> = {
  presetId: 'balanced',
  knobs: { ...COACH_PLAYSTYLE_PRESETS[0].knobs },
};

function clampCoachKnob(val: unknown, fallback = 1.0): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  const clamped = Math.max(COACH_KNOB_MIN, Math.min(COACH_KNOB_MAX, val));
  return Math.round(clamped * 100) / 100;
}

function knobsMatch(a: CoachPlaystyleKnobs, b: CoachPlaystyleKnobs): boolean {
  return (
    Math.abs(a.aggression - b.aggression) < 0.015 &&
    Math.abs(a.mobility - b.mobility) < 0.015 &&
    Math.abs(a.kingSafety - b.kingSafety) < 0.015 &&
    Math.abs(a.pawnStructure - b.pawnStructure) < 0.015 &&
    Math.abs(a.piecePlacement - b.piecePlacement) < 0.015
  );
}

export function detectMatchingPresetId(
  knobs: CoachPlaystyleKnobs
): CoachPlaystylePresetId {
  for (const preset of COACH_PLAYSTYLE_PRESETS) {
    if (knobsMatch(knobs, preset.knobs)) {
      return preset.id;
    }
  }
  return 'custom';
}

export function createCoachPlaystyleFromPreset(
  presetId: Exclude<CoachPlaystylePresetId, 'custom'>
): CoachPlaystyleProfile {
  const found =
    COACH_PLAYSTYLE_PRESETS.find((p) => p.id === presetId) ??
    COACH_PLAYSTYLE_PRESETS[0];
  return {
    presetId: found.id,
    knobs: { ...found.knobs },
  };
}

export function updateCoachPlaystyleKnob(
  profile: CoachPlaystyleProfile,
  key: keyof CoachPlaystyleKnobs,
  value: number
): CoachPlaystyleProfile {
  const nextKnobs: CoachPlaystyleKnobs = {
    ...profile.knobs,
    [key]: clampCoachKnob(value, profile.knobs[key]),
  };
  return {
    presetId: detectMatchingPresetId(nextKnobs),
    knobs: nextKnobs,
  };
}

export function sanitizeCoachPlaystyle(raw: unknown): CoachPlaystyleProfile {
  if (!raw || typeof raw !== 'object') {
    return {
      presetId: DEFAULT_COACH_PLAYSTYLE.presetId,
      knobs: { ...DEFAULT_COACH_PLAYSTYLE.knobs },
    };
  }
  const obj = raw as Record<string, unknown>;
  const rawKnobs =
    obj.knobs && typeof obj.knobs === 'object'
      ? (obj.knobs as Record<string, unknown>)
      : {};

  const knobs: CoachPlaystyleKnobs = {
    aggression: clampCoachKnob(rawKnobs.aggression, 1.0),
    mobility: clampCoachKnob(rawKnobs.mobility, 1.0),
    kingSafety: clampCoachKnob(rawKnobs.kingSafety, 1.0),
    pawnStructure: clampCoachKnob(rawKnobs.pawnStructure, 1.0),
    piecePlacement: clampCoachKnob(rawKnobs.piecePlacement, 1.0),
  };

  return {
    presetId: detectMatchingPresetId(knobs),
    knobs,
  };
}

export function loadCoachPlaystyle(): CoachPlaystyleProfile {
  if (typeof window === 'undefined') {
    return createCoachPlaystyleFromPreset('balanced');
  }
  try {
    const raw = window.localStorage.getItem(COACH_PLAYSTYLE_STORAGE_KEY);
    if (!raw) return createCoachPlaystyleFromPreset('balanced');
    return sanitizeCoachPlaystyle(JSON.parse(raw));
  } catch {
    return createCoachPlaystyleFromPreset('balanced');
  }
}

export function saveCoachPlaystyle(profile: CoachPlaystyleProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      COACH_PLAYSTYLE_STORAGE_KEY,
      JSON.stringify(sanitizeCoachPlaystyle(profile))
    );
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function isBalancedPlaystyle(profile?: CoachPlaystyleProfile): boolean {
  if (!profile) return true;
  return knobsMatch(profile.knobs, DEFAULT_COACH_PLAYSTYLE.knobs);
}

export function serializeCoachPlaystyleKey(
  profile?: CoachPlaystyleProfile
): string {
  const p = profile ? sanitizeCoachPlaystyle(profile) : DEFAULT_COACH_PLAYSTYLE;
  const k = p.knobs;
  return `${p.presetId}:${k.aggression.toFixed(2)},${k.mobility.toFixed(
    2
  )},${k.kingSafety.toFixed(2)},${k.pawnStructure.toFixed(
    2
  )},${k.piecePlacement.toFixed(2)}`;
}

/**
 * Builds the Tactical Coach's guaranteed 3000+ Elo `ChessEngineConfig`.
 * Regardless of what difficulty or Elo the Opponent AI is set to, the Tactical Coach ALWAYS
 * runs with full 3000+ PVS + 64-bit Zobrist TT + NMP + LMR + Quiescence and zero humanization
 * error, while applying the user's playstyle tuning knobs to evaluation weights.
 */
export function buildCoachEngineConfig(
  playstyle: CoachPlaystyleProfile = DEFAULT_COACH_PLAYSTYLE,
  mode: 'fast' | 'deep' | 'threat' = 'deep',
  overrides?: Partial<ChessEngineConfig>,
  isEndgamePosition = false
): ChessEngineConfig {
  const safe = sanitizeCoachPlaystyle(playstyle);
  const k = safe.knobs;

  const defaultDepth =
    mode === 'deep'
      ? isEndgamePosition
        ? 16
        : 14
      : mode === 'threat'
      ? 8
      : 6;

  const defaultTimeMs =
    mode === 'deep' ? 1050 : mode === 'threat' ? 130 : 85;

  const requestedDepth = overrides?.maxDepth;
  const maxDepth = Math.max(
    1,
    Math.min(24, Math.floor(requestedDepth ?? defaultDepth))
  );

  const requestedTime = overrides?.maxTimeMs;
  const maxTimeMs = Math.max(
    25,
    Math.min(15000, Math.floor(requestedTime ?? defaultTimeMs))
  );

  // Merge user playstyle knobs; explicit overrides.evalWeights (if passed by unit tests) take precedence
  const ovWeights = overrides?.evalWeights;
  const evalWeights = {
    material: ovWeights?.material ?? 1.0,
    pieceSquareTables: ovWeights?.pieceSquareTables ?? k.piecePlacement,
    pawnStructure: ovWeights?.pawnStructure ?? k.pawnStructure,
    kingSafety: ovWeights?.kingSafety ?? k.kingSafety,
    mobility: ovWeights?.mobility ?? k.mobility,
    aggression: ovWeights?.aggression ?? k.aggression,
  };

  return {
    maxDepth,
    maxTimeMs,
    // Always lock full 3000+ GM tactical capabilities ON (zero handicap/humanization!)
    enableQuiescence: true,
    enableTranspositionTable: true,
    enableNullMovePruning: true,
    enableLMR: true,
    evalWeights,
    errorProbability: 0.0,
    errorMarginCentipawns: 0,
  };
}

export function describeCoachPlaystyle(profile: CoachPlaystyleProfile): {
  label: string;
  shortTag: string;
  focusSummary: string;
  isCustomized: boolean;
} {
  const safe = sanitizeCoachPlaystyle(profile);
  const isCustomized = !isBalancedPlaystyle(safe);

  if (!isCustomized) {
    return {
      label: 'Balanced GM',
      shortTag: 'Balanced',
      focusSummary: 'Neutral 3000+ classical weights',
      isCustomized: false,
    };
  }

  const preset = COACH_PLAYSTYLE_PRESETS.find((p) => p.id === safe.presetId);
  const highlights = COACH_PLAYSTYLE_KNOB_META.map((m) => ({
    meta: m,
    val: safe.knobs[m.key],
    delta: Math.abs(safe.knobs[m.key] - 1.0),
  }))
    .filter((entry) => entry.delta >= 0.1)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2)
    .map((entry) => `${entry.meta.shortLabel} ${Math.round(entry.val * 100)}%`);

  return {
    label: preset ? preset.name : 'Custom Style',
    shortTag: preset ? preset.shortLabel : 'Custom',
    focusSummary:
      highlights.length > 0
        ? highlights.join(' · ')
        : 'Subtle playstyle lean active',
    isCustomized: true,
  };
}

/**
 * Generates an honest, plain-language explanation when a top move aligns with the
 * player's customized playstyle knobs. Returns `undefined` when Balanced or no strong match.
 */
export function detectPlaystyleAlignmentNote(
  profile: CoachPlaystyleProfile | undefined,
  move: Move,
  positionalDelta: {
    pawnStructure: number;
    kingSafety: number;
    mobility: number;
  },
  givesCheck: boolean,
  movesTowardEnemyKing: boolean
): string | undefined {
  if (!profile || isBalancedPlaystyle(profile)) return undefined;
  const k = profile.knobs;

  if (
    k.aggression >= 1.25 &&
    (givesCheck || movesTowardEnemyKing || Boolean(move.captured))
  ) {
    return `Matches your Aggressive style (${Math.round(
      k.aggression * 100
    )}%): builds direct attacking pressure.`;
  }
  if (
    k.kingSafety >= 1.25 &&
    (Boolean(move.isCastle) || positionalDelta.kingSafety >= 12)
  ) {
    return `Matches your King Safety focus (${Math.round(
      k.kingSafety * 100
    )}%): reinforces king shelter.`;
  }
  if (k.mobility >= 1.25 && positionalDelta.mobility >= 12) {
    return `Matches your Mobility focus (${Math.round(
      k.mobility * 100
    )}%): unlocks active squares and lines.`;
  }
  if (k.pawnStructure >= 1.25 && positionalDelta.pawnStructure >= 10) {
    return `Matches your Pawn Structure focus (${Math.round(
      k.pawnStructure * 100
    )}%): improves long-term pawn health.`;
  }
  if (k.piecePlacement >= 1.25 && !move.captured) {
    return `Matches your Piece Harmony focus (${Math.round(
      k.piecePlacement * 100
    )}%): elevates piece coordination.`;
  }
  return undefined;
}
