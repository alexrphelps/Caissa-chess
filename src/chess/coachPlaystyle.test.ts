import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCoachEngineConfig,
  COACH_ENGINE_RATING_LABEL,
  COACH_KNOB_MAX,
  COACH_KNOB_MIN,
  createCoachPlaystyleFromPreset,
  DEFAULT_COACH_PLAYSTYLE,
  describeCoachPlaystyle,
  isBalancedPlaystyle,
  sanitizeCoachPlaystyle,
  serializeCoachPlaystyleKey,
  updateCoachPlaystyleKnob,
} from './coachPlaystyle';
import { createInitialGameState } from './engine';
import { FastBoard } from './engineCore/board';
import { areDefaultWeights, evaluateFast } from './engineCore/eval';
import { fenToGameState } from './sessionStorage';
import { analyzeTactics, analyzeTacticsDeep } from './tacticsHelper';

test('buildCoachEngineConfig always enforces full 3000+ GM engine capabilities regardless of overrides', () => {
  const aggressive = createCoachPlaystyleFromPreset('aggressive');

  // Even if someone passes handicapped flags, the Tactical Coach locks 3000+ search features ON
  const deepCfg = buildCoachEngineConfig(aggressive, 'deep', {
    enableQuiescence: false,
    enableTranspositionTable: false,
    enableNullMovePruning: false,
    enableLMR: false,
    errorProbability: 0.4,
    errorMarginCentipawns: 250,
  });

  assert.equal(deepCfg.enableQuiescence, true);
  assert.equal(deepCfg.enableTranspositionTable, true);
  assert.equal(deepCfg.enableNullMovePruning, true);
  assert.equal(deepCfg.enableLMR, true);
  assert.equal(deepCfg.errorProbability, 0);
  assert.equal(deepCfg.errorMarginCentipawns, 0);
  assert.ok(deepCfg.maxDepth >= 14, `Expected deep maxDepth >= 14, got ${deepCfg.maxDepth}`);
  assert.equal(deepCfg.evalWeights.material, 1.0);
  assert.equal(deepCfg.evalWeights.aggression, aggressive.knobs.aggression);
  assert.equal(deepCfg.evalWeights.mobility, aggressive.knobs.mobility);
  assert.equal(deepCfg.evalWeights.kingSafety, aggressive.knobs.kingSafety);
  assert.equal(deepCfg.evalWeights.pawnStructure, aggressive.knobs.pawnStructure);
  assert.equal(deepCfg.evalWeights.pieceSquareTables, aggressive.knobs.piecePlacement);

  const endgameCfg = buildCoachEngineConfig(DEFAULT_COACH_PLAYSTYLE, 'deep', undefined, true);
  assert.ok(endgameCfg.maxDepth >= 16, `Expected endgame maxDepth >= 16, got ${endgameCfg.maxDepth}`);
});

test('sanitizeCoachPlaystyle clamps extreme/malformed payloads and detects presets accurately', () => {
  const fallback = sanitizeCoachPlaystyle(null);
  assert.equal(fallback.presetId, 'balanced');
  assert.equal(isBalancedPlaystyle(fallback), true);

  const clamped = sanitizeCoachPlaystyle({
    presetId: 'aggressive',
    knobs: {
      aggression: 99,
      mobility: -5,
      kingSafety: Number.NaN,
      pawnStructure: 1.5,
      piecePlacement: 'bad',
    },
  });

  assert.equal(clamped.knobs.aggression, COACH_KNOB_MAX);
  assert.equal(clamped.knobs.mobility, COACH_KNOB_MIN);
  assert.equal(clamped.knobs.kingSafety, 1.0);
  assert.equal(clamped.knobs.pawnStructure, 1.5);
  assert.equal(clamped.knobs.piecePlacement, 1.0);
  assert.equal(clamped.presetId, 'custom');

  // Updating a knob away from preset marks custom; returning it restores preset detection
  const solid = createCoachPlaystyleFromPreset('solid');
  const tweaked = updateCoachPlaystyleKnob(solid, 'aggression', 1.4);
  assert.equal(tweaked.presetId, 'custom');
  assert.notEqual(serializeCoachPlaystyleKey(solid), serializeCoachPlaystyleKey(tweaked));

  const restored = updateCoachPlaystyleKnob(tweaked, 'aggression', solid.knobs.aggression);
  assert.equal(restored.presetId, 'solid');

  const desc = describeCoachPlaystyle(createCoachPlaystyleFromPreset('aggressive'));
  assert.equal(desc.isCustomized, true);
  assert.equal(desc.label, 'Aggressive');
  assert.ok(desc.focusSummary.includes('Agg 160%'));
});

test('evaluateFast responds genuinely to aggression, kingSafety, and mobility weights while preserving default path', () => {
  const board = new FastBoard();

  // Position where White has active attacking pieces aimed at Black's castled king zone (Qg4, Bh6, Nf5)
  board.loadFen('r1bq1rk1/ppp2ppp/2np4/4pN2/2B1P1Q1/2N4B/PPP2PPP/R4RK1 w - - 0 12');

  const defaultScore = evaluateFast(board, undefined, true);
  const explicitBalanced = {
    material: 1.0,
    pieceSquareTables: 1.0,
    pawnStructure: 1.0,
    kingSafety: 1.0,
    mobility: 1.0,
    aggression: 1.0,
  };
  assert.equal(areDefaultWeights(explicitBalanced), true);
  assert.equal(
    evaluateFast(board, explicitBalanced, areDefaultWeights(explicitBalanced)),
    defaultScore,
    'Explicit 1.0 weights must match the zero-overhead default fast path exactly'
  );

  const highAggr = { ...explicitBalanced, aggression: 1.8 };
  const lowAggr = { ...explicitBalanced, aggression: 0.4 };
  assert.equal(areDefaultWeights(highAggr), false);

  const highAggrScore = evaluateFast(board, highAggr, false);
  const lowAggrScore = evaluateFast(board, lowAggr, false);
  assert.ok(
    highAggrScore > defaultScore && defaultScore > lowAggrScore,
    `Expected highAggr (${highAggrScore}) > default (${defaultScore}) > lowAggr (${lowAggrScore}) on king-side attack position`
  );

  // Position where White is safely castled behind intact shield while Black's king is exposed in center on open e-file
  board.loadFen('rnbqk2r/ppp2ppp/3p1n2/8/4P3/5N2/PPP2PPP/RNBQ1RK1 w kq - 0 7');
  const highKingSafety = evaluateFast(
    board,
    { ...explicitBalanced, kingSafety: 1.8 },
    false
  );
  const lowKingSafety = evaluateFast(
    board,
    { ...explicitBalanced, kingSafety: 0.4 },
    false
  );
  assert.ok(
    highKingSafety > lowKingSafety,
    `Expected highKingSafety (${highKingSafety}) > lowKingSafety (${lowKingSafety}) when White king is sheltered and Black king is exposed`
  );
});

test('3000+ Tactical Coach reaches deep Multi-PV search, preserves mate/blunder safety under extreme playstyle, and annotates style', () => {
  // 1. Mate-in-1 invariance even under maximum Aggression & minimum King Safety
  const extremeAggressive = sanitizeCoachPlaystyle({
    presetId: 'custom',
    knobs: {
      aggression: 1.8,
      mobility: 1.8,
      kingSafety: 0.4,
      pawnStructure: 0.4,
      piecePlacement: 1.2,
    },
  });

  const mateInOne = fenToGameState(
    '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1'
  );
  assert.ok(mateInOne, 'Expected valid mate-in-1 FEN');
  const mateAnalysis = analyzeTactics(mateInOne, undefined, extremeAggressive);
  assert.equal(mateAnalysis.engineRatingLabel, COACH_ENGINE_RATING_LABEL);
  assert.equal(mateAnalysis.topMoves.length, 1);
  assert.equal(mateAnalysis.topMoves[0].san, 'Re8#');

  // 2. Deep 3000+ Multi-PV analysis on starting/middlegame position achieves deep ply & reports 3000+ GM
  const startState = createInitialGameState();
  const deepBalanced = analyzeTacticsDeep(
    startState,
    undefined,
    550,
    undefined,
    DEFAULT_COACH_PLAYSTYLE
  );
  assert.equal(deepBalanced.engineRatingLabel, '3000+ GM');
  assert.equal(deepBalanced.isDeepAnalysis, true);
  assert.equal(deepBalanced.engineConfig.enableQuiescence, true);
  assert.equal(deepBalanced.engineConfig.enableNullMovePruning, true);
  assert.equal(deepBalanced.engineConfig.enableLMR, true);
  assert.equal(deepBalanced.engineConfig.errorProbability, 0);
  assert.ok(
    deepBalanced.searchDepth >= 5,
    `Expected deep 3000+ Coach to reach depth >= 5 in 550ms, got ${deepBalanced.searchDepth}`
  );
  assert.equal(deepBalanced.topMoves.length, 3);

  // 3. Playstyle steering on a rich middlegame position (Aggressive vs Solid produces distinct eval weighting without TT contamination)
  const middlegame = fenToGameState(
    'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7'
  );
  assert.ok(middlegame, 'Expected valid middlegame FEN');
  const aggrAnalysis = analyzeTacticsDeep(
    middlegame,
    6,
    450,
    undefined,
    createCoachPlaystyleFromPreset('aggressive')
  );
  const solidAnalysis = analyzeTacticsDeep(
    middlegame,
    6,
    450,
    undefined,
    createCoachPlaystyleFromPreset('solid')
  );

  assert.equal(aggrAnalysis.playstyle.presetId, 'aggressive');
  assert.equal(solidAnalysis.playstyle.presetId, 'solid');
  assert.equal(aggrAnalysis.topMoves.length, 3);
  assert.equal(solidAnalysis.topMoves.length, 3);
  // Both profiles must still only recommend sound GM-level moves (within +/- 1.5 pawns on an equal Italian middlegame)
  assert.ok(
    Math.abs(aggrAnalysis.topMoves[0].engineEval) < 200,
    `Aggressive top move eval should stay sound, got ${aggrAnalysis.topMoves[0].engineEval}`
  );
  assert.ok(
    Math.abs(solidAnalysis.topMoves[0].engineEval) < 200,
    `Solid top move eval should stay sound, got ${solidAnalysis.topMoves[0].engineEval}`
  );
});
