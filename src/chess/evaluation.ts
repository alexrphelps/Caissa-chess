import {
  BOARD_SIZE,
  isInsideBoard,
  PIECE_VALUES,
} from './engine';
import {
  AIDifficulty,
  AIDifficultyInfo,
  AIPresetId,
  Board,
  ChessEngineConfig,
  Color,
  EnginePresetInfo,
  EngineProfileState,
  EvalWeights,
  PieceType,
} from './types';

export const MATE_SCORE = 100000;
export const MATE_THRESHOLD = 90000;
export const MAX_HARD_TIME_LIMIT_MS = 15000;
export const MAX_GAME_PHASE = 24;
export const MIN_ENGINE_ELO = 400;
export const MAX_ENGINE_ELO = 3000;

export const DEFAULT_EVAL_WEIGHTS: Readonly<EvalWeights> = {
  material: 1.0,
  pieceSquareTables: 1.0,
  pawnStructure: 1.0,
  kingSafety: 1.0,
  mobility: 1.0,
};

export const DEFAULT_ENGINE_CONFIG: Readonly<ChessEngineConfig> = {
  maxDepth: 18,
  maxTimeMs: 1200,
  enableQuiescence: true,
  enableTranspositionTable: true,
  enableNullMovePruning: true,
  enableLMR: true,
  evalWeights: { ...DEFAULT_EVAL_WEIGHTS },
  errorProbability: 0.0,
  errorMarginCentipawns: 0,
};

export const AI_DIFFICULTY_LEVELS: readonly AIDifficultyInfo[] = [
  {
    id: 'novice',
    level: 1,
    name: 'Novice',
    shortLabel: 'Novice (600)',
    elo: 600,
    depthLabel: '1 ply',
    description: 'Material count only · 35% random legal moves',
  },
  {
    id: 'casual',
    level: 2,
    name: 'Casual',
    shortLabel: 'Casual (1000)',
    elo: 1000,
    depthLabel: '2 ply',
    description: 'Material + 1-ply safety · Avoids hanging pieces',
  },
  {
    id: 'intermediate',
    level: 3,
    name: 'Intermediate',
    shortLabel: 'Intermediate (1400)',
    elo: 1400,
    depthLabel: '3–4 ply',
    description: 'Material + Piece-Square Tables + King safety + LMR',
  },
  {
    id: 'club',
    level: 4,
    name: 'Grandmaster',
    shortLabel: 'GM (3000+)',
    elo: 3000,
    depthLabel: '12–20p+Q · PVS/64MB TT',
    description: '3000+ Elo · 0x88 PVS + 64MB TT + Aspiration + NMP/LMR/RFP + PeSTO Eval',
  },
] as const;

export function getDifficultyInfo(difficulty: AIDifficulty): AIDifficultyInfo {
  return (
    AI_DIFFICULTY_LEVELS.find((d) => d.id === difficulty) ??
    AI_DIFFICULTY_LEVELS[1]
  );
}

/**
 * Returns the canonical `ChessEngineConfig` preset corresponding to a legacy `AIDifficulty` tier.
 */
export function getEngineConfigForDifficulty(
  difficulty: AIDifficulty
): ChessEngineConfig {
  switch (difficulty) {
    case 'novice':
      return {
        maxDepth: 1,
        maxTimeMs: 350,
        enableQuiescence: false,
        enableTranspositionTable: false,
        enableNullMovePruning: false,
        enableLMR: false,
        evalWeights: {
          material: 1.0,
          pieceSquareTables: 0.0,
          pawnStructure: 0.0,
          kingSafety: 0.0,
          mobility: 0.0,
        },
        errorProbability: 0.35,
        errorMarginCentipawns: 200,
      };
    case 'casual':
      return {
        maxDepth: 2,
        maxTimeMs: 550,
        enableQuiescence: false,
        enableTranspositionTable: true,
        enableNullMovePruning: false,
        enableLMR: false,
        evalWeights: {
          material: 1.0,
          pieceSquareTables: 0.35,
          pawnStructure: 0.2,
          kingSafety: 0.3,
          mobility: 0.25,
        },
        errorProbability: 0.1,
        errorMarginCentipawns: 65,
      };
    case 'intermediate':
      return {
        maxDepth: 4,
        maxTimeMs: 950,
        enableQuiescence: false,
        enableTranspositionTable: true,
        enableNullMovePruning: false,
        enableLMR: true,
        evalWeights: {
          material: 1.0,
          pieceSquareTables: 1.0,
          pawnStructure: 0.75,
          kingSafety: 1.0,
          mobility: 0.65,
        },
        errorProbability: 0.05,
        errorMarginCentipawns: 35,
      };
    case 'club':
    default:
      return {
        maxDepth: 20,
        maxTimeMs: 1200,
        enableQuiescence: true,
        enableTranspositionTable: true,
        enableNullMovePruning: true,
        enableLMR: true,
        evalWeights: {
          material: 1.0,
          pieceSquareTables: 1.0,
          pawnStructure: 1.0,
          kingSafety: 1.0,
          mobility: 1.0,
        },
        errorProbability: 0.0,
        errorMarginCentipawns: 0,
      };
  }
}

function roundToTwo(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Deterministic continuous Elo-to-Engine-Parameters interpolation across the 400–3000 Elo spectrum.
 * Smoothly adjusts search depth, time budget, tactical pruning flags, evaluation weights,
 * and humanization error rates so every rating increment produces a calibrated change in strength.
 */
export function interpolateEngineConfigFromElo(rawElo: number): ChessEngineConfig {
  const elo = Math.max(
    MIN_ENGINE_ELO,
    Math.min(MAX_ENGINE_ELO, Math.round(rawElo))
  );
  // Normalized progress t in [0.0, 1.0] across 400..3000
  const t = (elo - MIN_ENGINE_ELO) / (MAX_ENGINE_ELO - MIN_ENGINE_ELO);

  // 1. Search Depth scaling smoothly from 1 ply (400 Elo) up to 20 ply (3000 Elo)
  let maxDepth = 1;
  if (elo >= 2900) maxDepth = 20;
  else if (elo >= 2700) maxDepth = 16;
  else if (elo >= 2500) maxDepth = 12;
  else if (elo >= 2300) maxDepth = 9;
  else if (elo >= 2100) maxDepth = 7;
  else if (elo >= 1750) maxDepth = 5;
  else if (elo >= 1450) maxDepth = 4;
  else if (elo >= 1200) maxDepth = 3;
  else if (elo >= 700) maxDepth = 2;

  // 2. Time Budget (smoothly scales from 200ms at 400 Elo to 1600ms at 3000 Elo)
  const maxTimeMs = Math.round(200 + Math.pow(t, 1.2) * 1400);

  // 3. Tactical & Pruning Toggles
  // Enable Quiescence from 950 Elo upward so the bot resolves capture chains and makes sound trades!
  const enableQuiescence = elo >= 950;
  const enableTranspositionTable = elo >= 800;
  const enableLMR = elo >= 1350;
  const enableNullMovePruning = elo >= 1750;

  // 4. Evaluation Weight Multipliers (0.0 - 2.0)
  const material = 1.0;
  const pieceSquareTables =
    elo < 550
      ? 0.0
      : roundToTwo(Math.min(1.0, ((elo - 500) / 1100) * 1.0));
  const kingSafety =
    elo < 600
      ? 0.0
      : roundToTwo(Math.min(1.0, ((elo - 550) / 1050) * 1.0));
  const pawnStructure =
    elo < 650
      ? 0.0
      : roundToTwo(Math.min(1.0, ((elo - 600) / 1200) * 1.0));
  const mobility =
    elo < 700
      ? 0.0
      : roundToTwo(Math.min(1.0, ((elo - 650) / 1250) * 1.0));

  // 5. Humanization & Blunder Modeling
  // Smooth decay from 0.42 at 400 Elo down to 0.0 at 2050+ Elo
  let errorProbability = 0.0;
  let errorMarginCentipawns = 0;
  if (elo < 2050) {
    const u = (2050 - elo) / (2050 - MIN_ENGINE_ELO); // 1.0 at 400, 0.0 at 2050
    errorProbability = roundToTwo(Math.min(0.45, Math.pow(u, 1.75) * 0.42));
    errorMarginCentipawns = Math.round(Math.pow(u, 1.9) * 230);
  }

  return {
    maxDepth,
    maxTimeMs,
    enableQuiescence,
    enableTranspositionTable,
    enableNullMovePruning,
    enableLMR,
    evalWeights: {
      material,
      pieceSquareTables,
      pawnStructure,
      kingSafety,
      mobility,
    },
    errorProbability,
    errorMarginCentipawns,
  };
}

/**
 * Curated Milestone Presets across 600–2200+ Elo, including the special
 * "Reactive (1150)" preset designed for sound trades, piece protection, and zero obvious blunders
 * without aggressive multi-ply tactical combinations.
 */
export const ENGINE_MILESTONE_PRESETS: readonly EnginePresetInfo[] = [
  {
    id: 'novice',
    legacyDifficulty: 'novice',
    name: 'Beginner',
    shortLabel: 'Beginner (600)',
    elo: 600,
    depthLabel: '1 ply',
    description: 'Material count only · Frequent inaccuracies for relaxed learning',
    config: getEngineConfigForDifficulty('novice'),
  },
  {
    id: 'casual',
    legacyDifficulty: 'casual',
    name: 'Casual',
    shortLabel: 'Casual (1000)',
    elo: 1000,
    depthLabel: '2 ply',
    description: 'Material + 1-ply safety · Avoids hanging pieces directly',
    config: getEngineConfigForDifficulty('casual'),
  },
  {
    id: 'reactive',
    legacyDifficulty: 'casual',
    name: 'Reactive',
    shortLabel: 'Reactive (1150)',
    elo: 1150,
    depthLabel: '2p+Q · Safe Trades',
    description:
      'Sound trades & self-defense · No obvious blunders or deep tactical traps',
    config: {
      maxDepth: 2,
      maxTimeMs: 480,
      enableQuiescence: true, // Resolves capture chains so it always makes sound trades!
      enableTranspositionTable: true,
      enableNullMovePruning: false,
      enableLMR: false,
      evalWeights: {
        material: 1.25,
        pieceSquareTables: 0.45,
        pawnStructure: 0.85,
        kingSafety: 1.35,
        mobility: 0.25, // Low aggression: reactive & self-protecting rather than launching combos
      },
      errorProbability: 0.06,
      errorMarginCentipawns: 20, // Only calm, safe positional variety
    },
  },
  {
    id: 'intermediate',
    legacyDifficulty: 'intermediate',
    name: 'Intermediate',
    shortLabel: 'Interm. (1400)',
    elo: 1400,
    depthLabel: '3–4 ply',
    description: 'Positional Piece-Square Tables + King safety + Late Move Reductions',
    config: getEngineConfigForDifficulty('intermediate'),
  },
  {
    id: 'club_1800',
    legacyDifficulty: 'club',
    name: 'Club',
    shortLabel: 'Club (1800)',
    elo: 1800,
    depthLabel: '4p+Q · Zobrist/LMR',
    description: '4-ply + Quiescence · Tactical awareness, SEE trades & Zobrist TT',
    config: {
      maxDepth: 4,
      maxTimeMs: 850,
      enableQuiescence: true,
      enableTranspositionTable: true,
      enableNullMovePruning: true,
      enableLMR: true,
      evalWeights: {
        material: 1.0,
        pieceSquareTables: 0.9,
        pawnStructure: 0.85,
        kingSafety: 0.95,
        mobility: 0.85,
      },
      errorProbability: 0.02,
      errorMarginCentipawns: 15,
    },
  },
  {
    id: 'club',
    legacyDifficulty: 'club',
    name: 'Grandmaster',
    shortLabel: 'GM (3000+)',
    elo: 3000,
    depthLabel: '12–20p+Q · Full 3000+',
    description:
      '3000+ Elo classical strength · 0x88 PVS + 64MB TT + Aspiration + NMP/LMR/RFP + PeSTO',
    config: getEngineConfigForDifficulty('club'),
  },
] as const;

export function getEnginePresetInfo(
  presetId: Exclude<AIPresetId, 'custom'>
): EnginePresetInfo {
  return (
    ENGINE_MILESTONE_PRESETS.find((p) => p.id === presetId) ??
    ENGINE_MILESTONE_PRESETS[2]
  );
}

export function mapEloToLegacyDifficulty(elo: number): AIDifficulty {
  if (elo < 800) return 'novice';
  if (elo <= 1250) return 'casual';
  if (elo < 1700) return 'intermediate';
  return 'club';
}

export function createEngineProfileFromPreset(
  presetId: Exclude<AIPresetId, 'custom'>
): EngineProfileState {
  const preset = getEnginePresetInfo(presetId);
  return {
    elo: preset.elo,
    presetId: preset.id,
    isCustom: false,
    activeSavedProfileId: null,
    config: {
      ...preset.config,
      evalWeights: { ...preset.config.evalWeights },
    },
  };
}

export function createEngineProfileFromElo(rawElo: number): EngineProfileState {
  const elo = Math.max(
    MIN_ENGINE_ELO,
    Math.min(MAX_ENGINE_ELO, Math.round(rawElo))
  );
  const matchingPreset = ENGINE_MILESTONE_PRESETS.find(
    (p) => Math.abs(p.elo - elo) <= 15
  );
  if (matchingPreset) {
    return createEngineProfileFromPreset(matchingPreset.id);
  }
  return {
    elo,
    presetId: 'custom',
    isCustom: false,
    activeSavedProfileId: null,
    config: interpolateEngineConfigFromElo(elo),
  };
}

export function describeEngineProfileSummary(profile: EngineProfileState): {
  title: string;
  badge: string;
  depthBadge: string;
  subtitle: string;
} {
  const { config, elo, presetId, isCustom } = profile;
  const qSuffix = config.enableQuiescence ? '+Q' : '';
  const depthBadge = `${config.maxDepth}p${qSuffix}`;

  if (!isCustom && presetId !== 'custom') {
    const preset = getEnginePresetInfo(presetId);
    return {
      title: `${preset.name} (${elo})`,
      badge: `${elo} ELO`,
      depthBadge: preset.depthLabel,
      subtitle: preset.description,
    };
  }

  const features: string[] = [`${config.maxDepth}p${qSuffix}`];
  if (config.enableTranspositionTable) features.push('TT');
  if (config.enableNullMovePruning) features.push('NMP');
  if (config.enableLMR) features.push('LMR');
  const errPct = Math.round(config.errorProbability * 100);

  return {
    title: isCustom ? `Custom (${elo} Elo)` : `Interpolated (${elo} Elo)`,
    badge: isCustom ? `CUSTOM · ${elo}` : `${elo} ELO`,
    depthBadge,
    subtitle: `${features.join('/')} · ${config.maxTimeMs}ms budget · ${errPct}% humanization`,
  };
}

function clampWeight(val: number | undefined, fallback = 1.0, min = 0.0): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return fallback;
  return Math.max(min, Math.min(2.0, val));
}

/**
 * Normalizes and validates either a difficulty preset name or a partial/full `ChessEngineConfig`,
 * strictly enforcing the hard computation budget (`100ms` to `15000ms` max) and valid weight bounds.
 * Material weight is clamped to [0.5, 2.0] so play-style tuning never overrides basic material sanity.
 */
export function resolveEngineConfig(
  difficultyOrConfig?: AIDifficulty | Partial<ChessEngineConfig>,
  overrides?: Partial<ChessEngineConfig>
): ChessEngineConfig {
  const base: ChessEngineConfig =
    typeof difficultyOrConfig === 'string'
      ? getEngineConfigForDifficulty(difficultyOrConfig)
      : {
          ...DEFAULT_ENGINE_CONFIG,
          evalWeights: { ...DEFAULT_EVAL_WEIGHTS },
        };

  const patch: Partial<ChessEngineConfig> =
    typeof difficultyOrConfig === 'object' && difficultyOrConfig !== null
      ? { ...difficultyOrConfig, ...overrides }
      : overrides ?? {};

  const mergedWeights: EvalWeights = {
    material: clampWeight(
      patch.evalWeights?.material,
      base.evalWeights.material,
      0.5
    ),
    pieceSquareTables: clampWeight(
      patch.evalWeights?.pieceSquareTables,
      base.evalWeights.pieceSquareTables
    ),
    pawnStructure: clampWeight(
      patch.evalWeights?.pawnStructure,
      base.evalWeights.pawnStructure
    ),
    kingSafety: clampWeight(
      patch.evalWeights?.kingSafety,
      base.evalWeights.kingSafety
    ),
    mobility: clampWeight(
      patch.evalWeights?.mobility,
      base.evalWeights.mobility
    ),
    ...(patch.evalWeights?.aggression !== undefined ||
    base.evalWeights.aggression !== undefined
      ? {
          aggression: clampWeight(
            patch.evalWeights?.aggression,
            base.evalWeights.aggression ?? 1.0
          ),
        }
      : {}),
  };

  const rawDepth = patch.maxDepth ?? base.maxDepth;
  const maxDepth = Math.max(1, Math.min(24, Math.floor(rawDepth)));

  const rawTime = patch.maxTimeMs ?? base.maxTimeMs;
  const maxTimeMs = Math.max(
    20,
    Math.min(MAX_HARD_TIME_LIMIT_MS, Math.floor(rawTime))
  );

  const rawErrProb = patch.errorProbability ?? base.errorProbability;
  const errorProbability = Math.max(0.0, Math.min(0.5, rawErrProb));

  const rawErrMargin =
    patch.errorMarginCentipawns ?? base.errorMarginCentipawns;
  const errorMarginCentipawns = Math.max(0, Math.min(1000, Math.floor(rawErrMargin)));

  return {
    maxDepth,
    maxTimeMs,
    enableQuiescence: patch.enableQuiescence ?? base.enableQuiescence,
    enableTranspositionTable:
      patch.enableTranspositionTable ?? base.enableTranspositionTable,
    enableNullMovePruning:
      patch.enableNullMovePruning ?? base.enableNullMovePruning,
    enableLMR: patch.enableLMR ?? base.enableLMR,
    evalWeights: mergedWeights,
    errorProbability,
    errorMarginCentipawns,
  };
}

/**
 * Standard Piece-Square Tables (PST) from White's perspective:
 * Row 0 = Rank 8 (opponent back rank), Row 7 = Rank 1 (White home rank).
 * For Black, we mirror the row index: `7 - row`.
 */
export const PAWN_PST: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 22, 22, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

export const PAWN_ENDGAME_PST: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [80, 80, 80, 80, 80, 80, 80, 80],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [30, 30, 30, 30, 30, 30, 30, 30],
  [15, 15, 15, 20, 20, 15, 15, 15],
  [5, 5, 5, 5, 5, 5, 5, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

export const KNIGHT_PST: readonly (readonly number[])[] = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

export const BISHOP_PST: readonly (readonly number[])[] = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

export const ROOK_PST: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];

export const QUEEN_PST: readonly (readonly number[])[] = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

export const KING_MIDDLEGAME_PST: readonly (readonly number[])[] = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

export const KING_ENDGAME_PST: readonly (readonly number[])[] = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10, 0, 0, -10, -20, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -30, 0, 0, 0, 0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50],
];

const KNIGHT_STEPS: readonly [number, number][] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const BISHOP_DIRS: readonly [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ROOK_DIRS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const PHASE_WEIGHTS: Record<PieceType, number> = {
  p: 0,
  n: 1,
  b: 1,
  r: 2,
  q: 4,
  k: 0,
};

/**
 * Computes the Tapered Evaluation game phase weights from remaining non-pawn material:
 * - `mgWeight`: 0 (pure endgame) to 24 (opening/midgame with full piece set)
 * - `egWeight`: 24 - mgWeight
 * - `phaseRatio`: mgWeight / 24 (1.0 in opening, 0.0 in pure pawn endgame)
 */
export function computeGamePhase(board: Board): {
  mgWeight: number;
  egWeight: number;
  phaseRatio: number;
} {
  let phase = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (p) {
        phase += PHASE_WEIGHTS[p.type];
      }
    }
  }
  const mgWeight = Math.min(MAX_GAME_PHASE, phase);
  const egWeight = MAX_GAME_PHASE - mgWeight;
  return {
    mgWeight,
    egWeight,
    phaseRatio: mgWeight / MAX_GAME_PHASE,
  };
}

/**
 * Interpolates a Midgame (MG) and Endgame (EG) score using the current board phase.
 */
export function interpolateTaperedScore(
  mgScore: number,
  egScore: number,
  mgWeight: number,
  egWeight: number
): number {
  return Math.round((mgScore * mgWeight + egScore * egWeight) / MAX_GAME_PHASE);
}

/**
 * Determines whether the board is predominantly in the endgame phase.
 */
export function isEndgamePhase(board: Board): boolean {
  let whiteQueens = 0;
  let blackQueens = 0;
  let whiteNonPawnMaterial = 0;
  let blackNonPawnMaterial = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p || p.type === 'k' || p.type === 'p') continue;
      const val = PIECE_VALUES[p.type];
      if (p.color === 'w') {
        whiteNonPawnMaterial += val;
        if (p.type === 'q') whiteQueens++;
      } else {
        blackNonPawnMaterial += val;
        if (p.type === 'q') blackQueens++;
      }
    }
  }

  if (whiteQueens === 0 && blackQueens === 0) return true;
  if (whiteNonPawnMaterial <= 1200 && blackNonPawnMaterial <= 1200) return true;
  return false;
}

/**
 * Checks whether `color` has at least one non-pawn piece (Knight, Bishop, Rook, or Queen)
 * on the board. Used for Zugzwang verification in Null-Move Pruning (NMP).
 */
export function hasNonPawnMaterial(board: Board, color: Color): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type !== 'p' && p.type !== 'k') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Looks up the Piece-Square Table value for a piece at (row, col).
 */
export function getPieceSquareBonus(
  type: PieceType,
  color: Color,
  row: number,
  col: number,
  isEndgame: boolean
): number {
  const tableRow = color === 'w' ? row : 7 - row;
  switch (type) {
    case 'p':
      return isEndgame
        ? PAWN_ENDGAME_PST[tableRow][col]
        : PAWN_PST[tableRow][col];
    case 'n':
      return KNIGHT_PST[tableRow][col];
    case 'b':
      return BISHOP_PST[tableRow][col];
    case 'r':
      return ROOK_PST[tableRow][col];
    case 'q':
      return QUEEN_PST[tableRow][col];
    case 'k':
      return isEndgame
        ? KING_ENDGAME_PST[tableRow][col]
        : KING_MIDDLEGAME_PST[tableRow][col];
  }
}

interface TaperedTerm {
  mg: number;
  eg: number;
}

/**
 * Evaluates Pawn Structure with Tapered MG/EG scores (White minus Black):
 * - Doubled pawns penalty
 * - Isolated pawns penalty
 * - Backward pawns penalty (neighbors all more advanced + stop square controlled by enemy pawn)
 * - Passed pawns bonus scaled by rank advancement and King proximity in the endgame
 */
export function evaluatePawnStructureTapered(
  board: Board,
  whiteKing: { r: number; c: number } | null,
  blackKing: { r: number; c: number } | null,
  whitePawnsPerCol: Int8Array,
  blackPawnsPerCol: Int8Array,
  whitePawns: { r: number; c: number }[],
  blackPawns: { r: number; c: number }[]
): TaperedTerm {
  let mg = 0;
  let eg = 0;

  // 1. Doubled and Isolated Pawns
  for (let c = 0; c < 8; c++) {
    if (whitePawnsPerCol[c] > 1) {
      const extra = whitePawnsPerCol[c] - 1;
      mg -= extra * 14;
      eg -= extra * 20;
    }
    if (blackPawnsPerCol[c] > 1) {
      const extra = blackPawnsPerCol[c] - 1;
      mg += extra * 14;
      eg += extra * 20;
    }

    const whiteHasNeighbor =
      (c > 0 && whitePawnsPerCol[c - 1] > 0) ||
      (c < 7 && whitePawnsPerCol[c + 1] > 0);
    if (whitePawnsPerCol[c] > 0 && !whiteHasNeighbor) {
      mg -= 12;
      eg -= 16;
    }

    const blackHasNeighbor =
      (c > 0 && blackPawnsPerCol[c - 1] > 0) ||
      (c < 7 && blackPawnsPerCol[c + 1] > 0);
    if (blackPawnsPerCol[c] > 0 && !blackHasNeighbor) {
      mg += 12;
      eg += 16;
    }
  }

  // 2. Passed Pawns & Backward Pawns
  const passedMgBonus = [0, 5, 10, 20, 35, 60, 95, 0];
  const passedEgBonus = [0, 10, 22, 42, 72, 115, 175, 0];

  for (const wp of whitePawns) {
    let isPassed = true;
    // A rear doubled pawn blocked by another friendly pawn ahead on the same file cannot be a passed pawn
    for (const otherWp of whitePawns) {
      if (otherWp.c === wp.c && otherWp.r < wp.r) {
        isPassed = false;
        break;
      }
    }
    if (isPassed) {
      for (const bp of blackPawns) {
        if (Math.abs(bp.c - wp.c) <= 1 && bp.r < wp.r) {
          isPassed = false;
          break;
        }
      }
    }

    if (isPassed) {
      const advance = 7 - wp.r;
      mg += passedMgBonus[advance] ?? 0;
      eg += passedEgBonus[advance] ?? 0;

      // King proximity to passed pawn stop square in endgame
      if (advance >= 2 && whiteKing && blackKing) {
        const stopRow = Math.max(0, wp.r - 1);
        const friendlyDist = Math.max(
          Math.abs(whiteKing.r - stopRow),
          Math.abs(whiteKing.c - wp.c)
        );
        const enemyDist = Math.max(
          Math.abs(blackKing.r - stopRow),
          Math.abs(blackKing.c - wp.c)
        );
        eg += (enemyDist * 5 - friendlyDist * 3) * (advance - 1);
      }
    } else {
      // Check for backward pawn:
      // Has adjacent friendly pawns, but none at the same rank or behind (all adjacent friendly pawns have r < wp.r),
      // and the stop square (wp.r - 1, wp.c) is attacked by an enemy pawn.
      const hasNeighbor =
        (wp.c > 0 && whitePawnsPerCol[wp.c - 1] > 0) ||
        (wp.c < 7 && whitePawnsPerCol[wp.c + 1] > 0);
      if (hasNeighbor && wp.r >= 3) {
        let hasSupportingNeighbor = false;
        for (const otherWp of whitePawns) {
          if (Math.abs(otherWp.c - wp.c) === 1 && otherWp.r >= wp.r) {
            hasSupportingNeighbor = true;
            break;
          }
        }
        if (!hasSupportingNeighbor) {
          const stopRow = wp.r - 1;
          const enemyAttackRow = stopRow - 1;
          const stopAttackedByBlackPawn =
            enemyAttackRow >= 0 &&
            ((wp.c > 0 &&
              board[enemyAttackRow][wp.c - 1]?.color === 'b' &&
              board[enemyAttackRow][wp.c - 1]?.type === 'p') ||
              (wp.c < 7 &&
                board[enemyAttackRow][wp.c + 1]?.color === 'b' &&
                board[enemyAttackRow][wp.c + 1]?.type === 'p'));
          if (stopAttackedByBlackPawn) {
            mg -= 10;
            eg -= 12;
          }
        }
      }
    }
  }

  for (const bp of blackPawns) {
    let isPassed = true;
    for (const otherBp of blackPawns) {
      if (otherBp.c === bp.c && otherBp.r > bp.r) {
        isPassed = false;
        break;
      }
    }
    if (isPassed) {
      for (const wp of whitePawns) {
        if (Math.abs(wp.c - bp.c) <= 1 && wp.r > bp.r) {
          isPassed = false;
          break;
        }
      }
    }

    if (isPassed) {
      const advance = bp.r;
      mg -= passedMgBonus[advance] ?? 0;
      eg -= passedEgBonus[advance] ?? 0;

      if (advance >= 2 && whiteKing && blackKing) {
        const stopRow = Math.min(7, bp.r + 1);
        const friendlyDist = Math.max(
          Math.abs(blackKing.r - stopRow),
          Math.abs(blackKing.c - bp.c)
        );
        const enemyDist = Math.max(
          Math.abs(whiteKing.r - stopRow),
          Math.abs(whiteKing.c - bp.c)
        );
        eg -= (enemyDist * 5 - friendlyDist * 3) * (advance - 1);
      }
    } else {
      const hasNeighbor =
        (bp.c > 0 && blackPawnsPerCol[bp.c - 1] > 0) ||
        (bp.c < 7 && blackPawnsPerCol[bp.c + 1] > 0);
      if (hasNeighbor && bp.r <= 4) {
        let hasSupportingNeighbor = false;
        for (const otherBp of blackPawns) {
          if (Math.abs(otherBp.c - bp.c) === 1 && otherBp.r <= bp.r) {
            hasSupportingNeighbor = true;
            break;
          }
        }
        if (!hasSupportingNeighbor) {
          const stopRow = bp.r + 1;
          const enemyAttackRow = stopRow + 1;
          const stopAttackedByWhitePawn =
            enemyAttackRow <= 7 &&
            ((bp.c > 0 &&
              board[enemyAttackRow][bp.c - 1]?.color === 'w' &&
              board[enemyAttackRow][bp.c - 1]?.type === 'p') ||
              (bp.c < 7 &&
                board[enemyAttackRow][bp.c + 1]?.color === 'w' &&
                board[enemyAttackRow][bp.c + 1]?.type === 'p'));
          if (stopAttackedByWhitePawn) {
            mg += 10;
            eg += 12;
          }
        }
      }
    }
  }

  return { mg, eg };
}

/**
 * Evaluates Piece Placement & Mobility (Tapered MG/EG, White minus Black):
 * - Bishops: Pair bonus, penalty for friendly pawns blocked/central on same square color, diagonal mobility
 * - Rooks: Open and semi-open file bonuses, 7th-rank infiltration bonus, orthogonal mobility
 * - Knights: Outpost square bonuses on central ranks (defended by friendly pawn, unattackable by enemy pawns), step mobility
 * - Queens: Mobility
 */
export function evaluatePiecePlacementAndMobilityTapered(
  board: Board,
  whiteKing: { r: number; c: number } | null,
  blackKing: { r: number; c: number } | null,
  whitePawnsPerCol: Int8Array,
  blackPawnsPerCol: Int8Array,
  whitePawns: { r: number; c: number }[],
  blackPawns: { r: number; c: number }[]
): TaperedTerm {
  let mg = 0;
  let eg = 0;
  let whiteBishops = 0;
  let blackBishops = 0;

  // Precompute friendly pawns by square color (0 = light, 1 = dark) that are blocked or central
  let whiteBlockedLightPawns = 0;
  let whiteBlockedDarkPawns = 0;
  for (const wp of whitePawns) {
    const isBlocked = wp.r > 0 && board[wp.r - 1][wp.c] !== null;
    const isCentral = wp.c >= 2 && wp.c <= 5 && wp.r >= 3 && wp.r <= 5;
    if (isBlocked || isCentral) {
      if ((wp.r + wp.c) % 2 === 0) whiteBlockedLightPawns++;
      else whiteBlockedDarkPawns++;
    }
  }

  let blackBlockedLightPawns = 0;
  let blackBlockedDarkPawns = 0;
  for (const bp of blackPawns) {
    const isBlocked = bp.r < 7 && board[bp.r + 1][bp.c] !== null;
    const isCentral = bp.c >= 2 && bp.c <= 5 && bp.r >= 2 && bp.r <= 4;
    if (isBlocked || isCentral) {
      if ((bp.r + bp.c) % 2 === 0) blackBlockedLightPawns++;
      else blackBlockedDarkPawns++;
    }
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p || p.type === 'p' || p.type === 'k') continue;
      const sign = p.color === 'w' ? 1 : -1;

      if (p.type === 'n') {
        // 1. Knight Mobility
        let count = 0;
        for (const [dr, dc] of KNIGHT_STEPS) {
          const nr = r + dr;
          const nc = c + dc;
          if (!isInsideBoard(nr, nc)) continue;
          const target = board[nr][nc];
          if (!target || target.color !== p.color) {
            count++;
          }
        }
        const mob = (count - 4) * 4;
        mg += sign * mob;
        eg += sign * mob;

        // 2. Knight Outpost Bonus on central files (c, d, e, f) and advanced ranks
        const isOutpostRank =
          p.color === 'w' ? r >= 2 && r <= 4 : r >= 3 && r <= 5;
        if (isOutpostRank && c >= 2 && c <= 5) {
          const pawnSupportRow = p.color === 'w' ? r + 1 : r - 1;
          const supportedByPawn =
            isInsideBoard(pawnSupportRow, c) &&
            ((c > 0 &&
              board[pawnSupportRow][c - 1]?.color === p.color &&
              board[pawnSupportRow][c - 1]?.type === 'p') ||
              (c < 7 &&
                board[pawnSupportRow][c + 1]?.color === p.color &&
                board[pawnSupportRow][c + 1]?.type === 'p'));

          if (supportedByPawn) {
            let canBeAttackedByEnemyPawn = false;
            const enemyPawns = p.color === 'w' ? blackPawns : whitePawns;
            for (const ep of enemyPawns) {
              if (Math.abs(ep.c - c) === 1) {
                if (p.color === 'w' && ep.r < r) {
                  canBeAttackedByEnemyPawn = true;
                  break;
                }
                if (p.color === 'b' && ep.r > r) {
                  canBeAttackedByEnemyPawn = true;
                  break;
                }
              }
            }
            if (!canBeAttackedByEnemyPawn) {
              mg += sign * 24;
              eg += sign * 16;
            } else {
              mg += sign * 8;
              eg += sign * 6;
            }
          }
        }
      } else if (p.type === 'b') {
        if (p.color === 'w') whiteBishops++;
        else blackBishops++;

        // 1. Bishop Mobility
        let count = 0;
        for (const [dr, dc] of BISHOP_DIRS) {
          let nr = r + dr;
          let nc = c + dc;
          while (isInsideBoard(nr, nc)) {
            const target = board[nr][nc];
            if (!target) {
              count++;
            } else {
              if (target.color !== p.color) count++;
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
        const mob = (count - 6) * 3;
        mg += sign * mob;
        eg += sign * mob;

        // 2. Penalty for blocked/central friendly pawns on the same color complex as the Bishop
        const isLightSquare = (r + c) % 2 === 0;
        const sameColorBlockedPawns =
          p.color === 'w'
            ? isLightSquare
              ? whiteBlockedLightPawns
              : whiteBlockedDarkPawns
            : isLightSquare
            ? blackBlockedLightPawns
            : blackBlockedDarkPawns;
        mg -= sign * sameColorBlockedPawns * 4;
        eg -= sign * sameColorBlockedPawns * 5;
      } else if (p.type === 'r') {
        // 1. Rook Mobility
        let count = 0;
        for (const [dr, dc] of ROOK_DIRS) {
          let nr = r + dr;
          let nc = c + dc;
          while (isInsideBoard(nr, nc)) {
            const target = board[nr][nc];
            if (!target) {
              count++;
            } else {
              if (target.color !== p.color) count++;
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
        mg += sign * (count - 7) * 2;
        eg += sign * (count - 7) * 3;

        // 2. Open and Semi-Open File Bonuses
        const friendlyPawnsOnFile =
          p.color === 'w' ? whitePawnsPerCol[c] : blackPawnsPerCol[c];
        const enemyPawnsOnFile =
          p.color === 'w' ? blackPawnsPerCol[c] : whitePawnsPerCol[c];
        if (friendlyPawnsOnFile === 0) {
          if (enemyPawnsOnFile === 0) {
            mg += sign * 24;
            eg += sign * 20;
          } else {
            mg += sign * 12;
            eg += sign * 10;
          }
        }

        // 3. 7th-Rank Infiltration Bonus
        if (p.color === 'w' && r === 1) {
          const blackKingTrapped = blackKing !== null && blackKing.r === 0;
          const blackPawnsOn7th = blackPawns.some((bp) => bp.r === 1);
          if (blackKingTrapped || blackPawnsOn7th) {
            mg += 28;
            eg += 36;
          } else {
            mg += 14;
            eg += 18;
          }
        } else if (p.color === 'b' && r === 6) {
          const whiteKingTrapped = whiteKing !== null && whiteKing.r === 7;
          const whitePawnsOn2nd = whitePawns.some((wp) => wp.r === 6);
          if (whiteKingTrapped || whitePawnsOn2nd) {
            mg -= 28;
            eg -= 36;
          } else {
            mg -= 14;
            eg -= 18;
          }
        }
      } else if (p.type === 'q') {
        let count = 0;
        for (const [dr, dc] of [...BISHOP_DIRS, ...ROOK_DIRS]) {
          let nr = r + dr;
          let nc = c + dc;
          while (isInsideBoard(nr, nc)) {
            const target = board[nr][nc];
            if (!target) {
              count++;
            } else {
              if (target.color !== p.color) count++;
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
        mg += sign * (count - 10) * 1;
        eg += sign * (count - 10) * 2;
      }

      // 4. Penalty for minor pieces standing where an enemy pawn can immediately advance 1 step to kick them with tempo
      if (p.type === 'n' || p.type === 'b') {
        const enemyColor = p.color === 'w' ? 'b' : 'w';
        const pawnAttackRow = p.color === 'w' ? r - 1 : r + 1;
        const enemyPawnOriginRow = p.color === 'w' ? r - 2 : r + 2;
        if (isInsideBoard(pawnAttackRow, c)) {
          let kickableByPawnPush = false;
          for (const dc of [-1, 1]) {
            const ac = c + dc;
            if (!isInsideBoard(pawnAttackRow, ac)) continue;
            const currentAttacker = board[pawnAttackRow][ac];
            if (
              currentAttacker?.color === enemyColor &&
              currentAttacker.type === 'p'
            ) {
              kickableByPawnPush = true;
              break;
            }
            if (
              !currentAttacker &&
              isInsideBoard(enemyPawnOriginRow, ac) &&
              board[enemyPawnOriginRow][ac]?.color === enemyColor &&
              board[enemyPawnOriginRow][ac]?.type === 'p'
            ) {
              kickableByPawnPush = true;
              break;
            }
          }
          if (kickableByPawnPush) {
            mg -= sign * 18;
            eg -= sign * 10;
          }
        }
      }
    }
  }

  // Bishop Pair Bonus
  if (whiteBishops >= 2) {
    mg += 30;
    eg += 45;
  }
  if (blackBishops >= 2) {
    mg -= 30;
    eg -= 45;
  }

  return { mg, eg };
}

/**
 * Evaluates King Safety (Midgame pawn shelter & open file exposure; Endgame centralization is handled via Tapered PST + Passed Pawn proximity).
 */
export function evaluateKingSafetyTapered(
  board: Board,
  whiteKing: { r: number; c: number } | null,
  blackKing: { r: number; c: number } | null,
  whitePawnsPerCol: Int8Array,
  blackPawnsPerCol: Int8Array
): TaperedTerm {
  let mg = 0;
  let eg = 0;

  if (whiteKing && whiteKing.r >= 6) {
    if (whiteKing.c >= 5 || whiteKing.c <= 2) {
      const shieldCols = whiteKing.c >= 5 ? [5, 6, 7] : [0, 1, 2];
      for (const sc of shieldCols) {
        const p1 = board[6][sc];
        const p2 = board[5][sc];
        if (p1?.color === 'w' && p1.type === 'p') mg += 10;
        else if (p2?.color === 'w' && p2.type === 'p') mg += 5;
        else mg -= 9;

        if (whitePawnsPerCol[sc] === 0) {
          mg -= blackPawnsPerCol[sc] === 0 ? 12 : 6;
        }
      }
    }
  }

  if (blackKing && blackKing.r <= 1) {
    if (blackKing.c >= 5 || blackKing.c <= 2) {
      const shieldCols = blackKing.c >= 5 ? [5, 6, 7] : [0, 1, 2];
      for (const sc of shieldCols) {
        const p1 = board[1][sc];
        const p2 = board[2][sc];
        if (p1?.color === 'b' && p1.type === 'p') mg -= 10;
        else if (p2?.color === 'b' && p2.type === 'p') mg -= 5;
        else mg += 9;

        if (blackPawnsPerCol[sc] === 0) {
          mg += whitePawnsPerCol[sc] === 0 ? 12 : 6;
        }
      }
    }
  }

  return { mg, eg };
}

/**
 * Evaluates the board from White's perspective (positive favors White, negative favors Black).
 * Supports both legacy `AIDifficulty` strings and parameterized `Partial<ChessEngineConfig>`.
 */
export function evaluateBoardWhitePerspective(
  board: Board,
  difficultyOrConfig: AIDifficulty | Partial<ChessEngineConfig> = 'club'
): number {
  // Fast path for pure novice material-only evaluation
  if (difficultyOrConfig === 'novice') {
    let mat = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = board[r][c];
        if (p && p.type !== 'k') {
          mat += (p.color === 'w' ? 1 : -1) * PIECE_VALUES[p.type];
        }
      }
    }
    return mat;
  }

  if (difficultyOrConfig === 'casual') {
    let mat = 0;
    let center = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = board[r][c];
        if (!p) continue;
        const sign = p.color === 'w' ? 1 : -1;
        if (p.type !== 'k') {
          mat += sign * PIECE_VALUES[p.type];
        }
        if ((r === 3 || r === 4) && (c === 3 || c === 4)) {
          center += sign * (p.type === 'p' ? 16 : 8);
        }
      }
    }
    return mat + center;
  }

  const weights: EvalWeights =
    typeof difficultyOrConfig === 'string'
      ? getEngineConfigForDifficulty(difficultyOrConfig).evalWeights
      : resolveEngineConfig(difficultyOrConfig).evalWeights;

  let materialBalance = 0;
  let pstMg = 0;
  let pstEg = 0;
  let centerBonus = 0;

  let whiteKing: { r: number; c: number } | null = null;
  let blackKing: { r: number; c: number } | null = null;
  const whitePawnsPerCol = new Int8Array(8);
  const blackPawnsPerCol = new Int8Array(8);
  const whitePawns: { r: number; c: number }[] = [];
  const blackPawns: { r: number; c: number }[] = [];

  let phasePoints = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;

      phasePoints += PHASE_WEIGHTS[p.type];
      const sign = p.color === 'w' ? 1 : -1;

      if (p.type !== 'k') {
        materialBalance += sign * PIECE_VALUES[p.type];
      } else {
        if (p.color === 'w') whiteKing = { r, c };
        else blackKing = { r, c };
      }

      if (p.type === 'p') {
        if (p.color === 'w') {
          whitePawnsPerCol[c]++;
          whitePawns.push({ r, c });
        } else {
          blackPawnsPerCol[c]++;
          blackPawns.push({ r, c });
        }
      }

      pstMg += sign * getPieceSquareBonus(p.type, p.color, r, c, false);
      pstEg += sign * getPieceSquareBonus(p.type, p.color, r, c, true);

      if ((r === 3 || r === 4) && (c === 3 || c === 4)) {
        centerBonus += sign * (p.type === 'p' ? 16 : 8);
      }
    }
  }

  const mgWeight = Math.min(MAX_GAME_PHASE, phasePoints);
  const egWeight = MAX_GAME_PHASE - mgWeight;

  const taperedPst = interpolateTaperedScore(pstMg, pstEg, mgWeight, egWeight);

  let total =
    materialBalance * weights.material +
    (taperedPst + centerBonus) * weights.pieceSquareTables;

  if (weights.pawnStructure > 0) {
    const pawnTerm = evaluatePawnStructureTapered(
      board,
      whiteKing,
      blackKing,
      whitePawnsPerCol,
      blackPawnsPerCol,
      whitePawns,
      blackPawns
    );
    total +=
      interpolateTaperedScore(pawnTerm.mg, pawnTerm.eg, mgWeight, egWeight) *
      weights.pawnStructure;
  }

  if (weights.kingSafety > 0) {
    const kingTerm = evaluateKingSafetyTapered(
      board,
      whiteKing,
      blackKing,
      whitePawnsPerCol,
      blackPawnsPerCol
    );
    total +=
      interpolateTaperedScore(kingTerm.mg, kingTerm.eg, mgWeight, egWeight) *
      weights.kingSafety;
  }

  if (weights.mobility > 0) {
    const mobTerm = evaluatePiecePlacementAndMobilityTapered(
      board,
      whiteKing,
      blackKing,
      whitePawnsPerCol,
      blackPawnsPerCol,
      whitePawns,
      blackPawns
    );
    total +=
      interpolateTaperedScore(mobTerm.mg, mobTerm.eg, mgWeight, egWeight) *
      weights.mobility;
  }

  return Math.round(total);
}

/**
 * Evaluates the board strictly from the perspective of `sideToMove`
 * (+ favors `sideToMove`, - favors opponent).
 */
export function evaluateForSide(
  board: Board,
  sideToMove: Color,
  difficultyOrConfig: AIDifficulty | Partial<ChessEngineConfig> = 'club'
): number {
  const whiteScore = evaluateBoardWhitePerspective(board, difficultyOrConfig);
  return sideToMove === 'w' ? whiteScore : -whiteScore;
}

export interface TaperedEvalBreakdown {
  /** Remaining non-pawn material phase score (0 = pure endgame, 24 = full opening/middlegame) */
  gamePhase: number;
  /** Human-readable phase label ('Opening' | 'Middlegame' | 'Endgame') */
  phaseLabel: 'Opening' | 'Middlegame' | 'Endgame';
  /** Percentage of midgame weight (0..100) */
  mgWeightPct: number;
  /** Percentage of endgame weight (0..100) */
  egWeightPct: number;
  /** Material balance in centipawns from `perspectiveColor` */
  material: number;
  /** Tapered Piece-Square Table + center control score from `perspectiveColor` */
  pieceSquareTables: number;
  /** Tapered Pawn Structure score (passed, isolated, doubled, backward) from `perspectiveColor` */
  pawnStructure: number;
  /** Tapered King Safety & Endgame King Centralization score from `perspectiveColor` */
  kingSafety: number;
  /** Tapered Piece Placement & Mobility score (Bishop pair, Rook open/7th rank, Knight outposts) from `perspectiveColor` */
  mobility: number;
  /** Weighted total evaluation in centipawns from `perspectiveColor` */
  total: number;
}

/**
 * Computes a complete decomposed Tapered Evaluation breakdown from `perspectiveColor`'s perspective
 * for the Tactical Coach Studio and positional diagnostics.
 */
export function evaluateTaperedBreakdown(
  board: Board,
  perspectiveColor: Color = 'w',
  difficultyOrConfig: AIDifficulty | Partial<ChessEngineConfig> = 'club'
): TaperedEvalBreakdown {
  const config =
    typeof difficultyOrConfig === 'string'
      ? getEngineConfigForDifficulty(difficultyOrConfig)
      : resolveEngineConfig(difficultyOrConfig);
  const weights = config.evalWeights;
  const perspectiveSign = perspectiveColor === 'w' ? 1 : -1;

  let materialBalance = 0;
  let pstMg = 0;
  let pstEg = 0;
  let centerBonus = 0;

  let whiteKing: { r: number; c: number } | null = null;
  let blackKing: { r: number; c: number } | null = null;

  const whitePawnsPerCol = new Int8Array(8);
  const blackPawnsPerCol = new Int8Array(8);
  const whitePawns: { r: number; c: number }[] = [];
  const blackPawns: { r: number; c: number }[] = [];

  let phasePoints = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;

      phasePoints += PHASE_WEIGHTS[p.type];
      const sign = p.color === 'w' ? 1 : -1;

      if (p.type !== 'k') {
        materialBalance += sign * PIECE_VALUES[p.type];
      } else {
        if (p.color === 'w') whiteKing = { r, c };
        else blackKing = { r, c };
      }

      if (p.type === 'p') {
        if (p.color === 'w') {
          whitePawnsPerCol[c]++;
          whitePawns.push({ r, c });
        } else {
          blackPawnsPerCol[c]++;
          blackPawns.push({ r, c });
        }
      }

      pstMg += sign * getPieceSquareBonus(p.type, p.color, r, c, false);
      pstEg += sign * getPieceSquareBonus(p.type, p.color, r, c, true);

      if ((r === 3 || r === 4) && (c === 3 || c === 4)) {
        centerBonus += sign * (p.type === 'p' ? 16 : 8);
      }
    }
  }

  const mgWeight = Math.min(MAX_GAME_PHASE, phasePoints);
  const egWeight = MAX_GAME_PHASE - mgWeight;
  const mgWeightPct = Math.round((mgWeight / MAX_GAME_PHASE) * 100);
  const egWeightPct = 100 - mgWeightPct;

  const phaseLabel: 'Opening' | 'Middlegame' | 'Endgame' =
    mgWeight >= 20 ? 'Opening' : mgWeight <= 8 ? 'Endgame' : 'Middlegame';

  const rawPst =
    (interpolateTaperedScore(pstMg, pstEg, mgWeight, egWeight) + centerBonus) *
    weights.pieceSquareTables;

  const pawnTerm = evaluatePawnStructureTapered(
    board,
    whiteKing,
    blackKing,
    whitePawnsPerCol,
    blackPawnsPerCol,
    whitePawns,
    blackPawns
  );
  const rawPawn =
    interpolateTaperedScore(pawnTerm.mg, pawnTerm.eg, mgWeight, egWeight) *
    weights.pawnStructure;

  const kingTerm = evaluateKingSafetyTapered(
    board,
    whiteKing,
    blackKing,
    whitePawnsPerCol,
    blackPawnsPerCol
  );
  const rawKing =
    interpolateTaperedScore(kingTerm.mg, kingTerm.eg, mgWeight, egWeight) *
    weights.kingSafety;

  const mobTerm = evaluatePiecePlacementAndMobilityTapered(
    board,
    whiteKing,
    blackKing,
    whitePawnsPerCol,
    blackPawnsPerCol,
    whitePawns,
    blackPawns
  );
  const rawMobility =
    interpolateTaperedScore(mobTerm.mg, mobTerm.eg, mgWeight, egWeight) *
    weights.mobility;

  const rawMaterial = materialBalance * weights.material;
  const rawTotal = rawMaterial + rawPst + rawPawn + rawKing + rawMobility;

  return {
    gamePhase: mgWeight,
    phaseLabel,
    mgWeightPct,
    egWeightPct,
    material: Math.round(rawMaterial * perspectiveSign),
    pieceSquareTables: Math.round(rawPst * perspectiveSign),
    pawnStructure: Math.round(rawPawn * perspectiveSign),
    kingSafety: Math.round(rawKing * perspectiveSign),
    mobility: Math.round(rawMobility * perspectiveSign),
    total: Math.round(rawTotal * perspectiveSign),
  };
}

/**
 * Formats a centipawn evaluation (White perspective) into human-readable chess notation
 * such as "+1.4", "-0.8", "0.0", "M2", or "-M1".
 */
export function formatEvalScore(whiteCentipawns: number): string {
  if (Math.abs(whiteCentipawns) >= MATE_THRESHOLD) {
    const sign = whiteCentipawns > 0 ? '' : '-';
    const pliesToMate = Math.max(
      1,
      Math.round(MATE_SCORE - Math.abs(whiteCentipawns))
    );
    const movesToMate = Math.max(1, Math.ceil(pliesToMate / 2));
    return `${sign}M${movesToMate}`;
  }

  const pawns = whiteCentipawns / 100;
  if (Math.abs(pawns) < 0.05) {
    return '0.0';
  }
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}
