import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState, generateLegalMoves, makeMove } from './engine';
import {
  createEngineProfileFromElo,
  createRatedOpponentProfileFromElo,
  interpolateEngineConfigFromElo,
} from './evaluation';
import {
  applyRatedMatchResult,
  calculateNextOpponentElo,
  calibrateFromSavedSessions,
  computeGamePerformanceMetrics,
  computeGlicko2Update,
  createInitialJourneyProfile,
  createUninitializedJourneyProfile,
  getRankTierForRating,
  getUndoAllowanceForRating,
  isBlunderAlertEnabledForRating,
  isSevereBlunderPly,
  parseJourneyProfile,
  scoreSinglePlayerPly,
  ScoredPlayerPly,
  STARTING_TIER_OPTIONS,
} from './ratedJourney';
import {
  createStoredSession,
  deserializeSession,
  serializeSession,
} from './sessionStorage';
import { GameState } from './types';

function makeSyntheticPlies(
  count: number,
  cpl: number,
  deltaWinProb: number,
  classification: ScoredPlayerPly['classification']
): ScoredPlayerPly[] {
  return Array.from({ length: count }, (_, idx) => ({
    plyIndex: idx * 2,
    turnNumber: idx + 1,
    color: 'w',
    playedSan: 'Nf3',
    bestSan: 'Nf3',
    centipawnLoss: cpl,
    deltaWinProb,
    classification,
    isBookOrForced: false,
    isDecidedPosition: false,
    evalBeforeWhite: 20,
  }));
}

test('progressive undo budget scales strictly from 3 -> 2 -> 1 -> 0 across rating bands', () => {
  assert.equal(getUndoAllowanceForRating(400), 3);
  assert.equal(getUndoAllowanceForRating(600), 3);
  assert.equal(getUndoAllowanceForRating(899), 3);
  assert.equal(getUndoAllowanceForRating(900), 2);
  assert.equal(getUndoAllowanceForRating(1249), 2);
  assert.equal(getUndoAllowanceForRating(1250), 1);
  assert.equal(getUndoAllowanceForRating(1599), 1);
  assert.equal(getUndoAllowanceForRating(1600), 0);
  assert.equal(getUndoAllowanceForRating(2400), 0);
});

test('blunder alert guardrail is active strictly below 1000 Elo', () => {
  assert.equal(isBlunderAlertEnabledForRating(600), true);
  assert.equal(isBlunderAlertEnabledForRating(999), true);
  assert.equal(isBlunderAlertEnabledForRating(1000), false);
  assert.equal(isBlunderAlertEnabledForRating(1500), false);
});

test('starting tier options initialize expected Elo, RD, and welcoming first opponent', () => {
  assert.equal(STARTING_TIER_OPTIONS.length, 4);

  const beg = createInitialJourneyProfile('beginner');
  assert.equal(beg.initialized, true);
  assert.equal(beg.rating, 600);
  assert.equal(beg.rd, 220);
  assert.equal(beg.nextOpponentElo, 575);
  assert.equal(beg.nextColor, 'w');

  const med = createInitialJourneyProfile('medium');
  assert.equal(med.rating, 1050);
  assert.equal(med.nextOpponentElo, 1025);

  const hard = createInitialJourneyProfile('hard');
  assert.equal(hard.rating, 1550);
  assert.equal(hard.nextOpponentElo, 1550);

  const master = createInitialJourneyProfile('master');
  assert.equal(master.rating, 2000);
  assert.equal(master.nextOpponentElo, 2000);
});

test('rank tier mapping progresses smoothly from Apprentice to Grandmaster', () => {
  assert.equal(getRankTierForRating(550).name, 'Apprentice');
  assert.equal(getRankTierForRating(950).name, 'Club Contender');
  assert.equal(getRankTierForRating(1300).name, 'Tactician');
  assert.equal(getRankTierForRating(1700).name, 'Strategist');
  assert.equal(getRankTierForRating(2000).name, 'Candidate Master');
  assert.equal(getRankTierForRating(2400).name, 'Salon Master');
  assert.equal(getRankTierForRating(2800).name, 'Grandmaster');
  assert.equal(getRankTierForRating(2800).nextTierName, null);
});

test('Glicko-2 core moves upward on win, downward on loss, and tightens RD', () => {
  const win = computeGlicko2Update(1000, 260, 0.06, 1000, 1);
  assert.ok(win.rating > 1050, `Expected strong provisional win gain, got ${win.rating}`);
  assert.ok(win.rd < 260, `Expected RD to tighten, got ${win.rd}`);

  const loss = computeGlicko2Update(1000, 260, 0.06, 1000, 0);
  assert.ok(loss.rating < 950, `Expected provisional loss drop, got ${loss.rating}`);
  assert.ok(loss.rd < 260);
});

test('hybrid rating accelerates placement climb for accurate wins and dampens gains when undos are used', () => {
  const profile = createInitialJourneyProfile('beginner');
  const cleanPlies = makeSyntheticPlies(18, 12, 0.01, 'best');

  const cleanResult = applyRatedMatchResult(profile, {
    opponentElo: 575,
    playerColor: 'w',
    outcome: 'win',
    termination: 'checkmate',
    scoredPlies: cleanPlies,
    undosUsed: 0,
    undosAllowed: 3,
    totalPlies: 36,
  });

  assert.equal(cleanResult.summary.wasAbortedTooShort, false);
  assert.ok(
    cleanResult.summary.delta >= 45 && cleanResult.summary.delta <= 85,
    `Expected steady provisional climb on high-accuracy win (+45..+85), got +${cleanResult.summary.delta}`
  );
  assert.equal(cleanResult.updatedProfile.nextColor, 'b');
  assert.ok(cleanResult.updatedProfile.nextOpponentElo > cleanResult.updatedProfile.rating);

  // Same match with 2 undos used should dampen gain by 24% without going negative
  const undoResult = applyRatedMatchResult(profile, {
    opponentElo: 575,
    playerColor: 'w',
    outcome: 'win',
    termination: 'checkmate',
    scoredPlies: cleanPlies,
    undosUsed: 2,
    undosAllowed: 3,
    totalPlies: 36,
  });

  assert.equal(undoResult.summary.undoPenaltyPct, 24);
  assert.ok(undoResult.summary.delta > 0);
  assert.ok(
    undoResult.summary.delta < cleanResult.summary.delta,
    `Expected undo dampening (${undoResult.summary.delta} < ${cleanResult.summary.delta})`
  );
});

test('short resignations under 6 player moves abort safely without corrupting rating', () => {
  const profile = createInitialJourneyProfile('medium');
  const shortPlies = makeSyntheticPlies(3, 50, 0.05, 'good');

  const { updatedProfile, summary } = applyRatedMatchResult(profile, {
    opponentElo: 1025,
    playerColor: 'w',
    outcome: 'loss',
    termination: 'resignation',
    scoredPlies: shortPlies,
    undosUsed: 0,
    undosAllowed: 2,
    totalPlies: 6,
  });

  assert.equal(summary.wasAbortedTooShort, true);
  assert.equal(summary.delta, 0);
  assert.equal(updatedProfile.rating, profile.rating);
  assert.equal(updatedProfile.gamesPlayed, 0);
});

test('undo budget transition and tier promotion flags trigger when crossing 900 Elo', () => {
  const nearThreshold = {
    ...createInitialJourneyProfile('beginner', 860),
    rd: 220,
  };
  const strongPlies = makeSyntheticPlies(16, 15, 0.01, 'best');

  const { updatedProfile, summary } = applyRatedMatchResult(nearThreshold, {
    opponentElo: 875,
    playerColor: 'b',
    outcome: 'win',
    termination: 'checkmate',
    scoredPlies: strongPlies,
    undosUsed: 0,
    undosAllowed: 3,
    totalPlies: 32,
  });

  assert.ok(updatedProfile.rating >= 900);
  assert.equal(summary.undosBefore, 3);
  assert.equal(summary.undosAfter, 2);
  assert.equal(summary.undoBudgetChanged, true);
  assert.equal(updatedProfile.nextColor, 'w');
});

test('adaptive matchmaking raises challenger Elo on win streaks and softens on losses', () => {
  const winStreakOpp = calculateNextOpponentElo({
    newRating: 1100,
    outcome: 'win',
    currentStreak: 3,
    accuracy: 88,
    isProvisional: false,
  });
  assert.ok(winStreakOpp >= 1150 && winStreakOpp % 25 === 0);

  const lossOpp = calculateNextOpponentElo({
    newRating: 1100,
    outcome: 'loss',
    currentStreak: -2,
    accuracy: 65,
    isProvisional: false,
  });
  assert.equal(lossOpp, 1050);
});

test('move quality filters exclude book/forced and dead-decided plies and detect severe blunders', () => {
  const normalBlunder: ScoredPlayerPly = {
    plyIndex: 12,
    turnNumber: 7,
    color: 'w',
    playedSan: 'Qh5',
    bestSan: 'Nf3',
    centipawnLoss: 340,
    deltaWinProb: 0.32,
    classification: 'blunder',
    isBookOrForced: false,
    isDecidedPosition: false,
    evalBeforeWhite: 10,
  };
  assert.equal(isSevereBlunderPly(normalBlunder), true);
  assert.equal(
    isSevereBlunderPly({ ...normalBlunder, isDecidedPosition: true }),
    false
  );

  const metrics = computeGamePerformanceMetrics(
    [
      ...makeSyntheticPlies(6, 10, 0.01, 'best'),
      { ...normalBlunder, isDecidedPosition: true },
    ],
    1000,
    'win'
  );
  // Representative sample should exclude the decided-position blunder from accuracy
  assert.ok(metrics.accuracy > 90);
});

test('scoreSinglePlayerPly and calibrateFromSavedSessions run cleanly on real GameStates', () => {
  const stack: GameState[] = [createInitialGameState()];
  const uciMoves = [
    'e2e4', 'e7e5',
    'g1f3', 'b8c6',
    'f1c4', 'f8c5',
    'c2c3', 'g8f6',
    'd2d4', 'e5d4',
    'c3d4', 'c5b4',
  ];
  for (const uci of uciMoves) {
    const curr = stack[stack.length - 1];
    const legal = generateLegalMoves(curr);
    const mv = legal.find((m) => `${m.from}${m.to}` === uci);
    assert.ok(mv, `Expected legal move ${uci}`);
    stack.push(makeMove(curr, mv));
  }

  const scored = scoreSinglePlayerPly(stack[8], stack[9], 8, {
    maxDepth: 2,
    maxTimeMs: 40,
  });
  assert.equal(scored.color, 'w');
  assert.equal(scored.playedSan, 'd4');
  assert.ok(scored.centipawnLoss >= 0);

  const session = createStoredSession({
    stateStack: stack,
    gameMode: 'ai',
    playerColor: 'w',
    isFlipped: false,
    engineProfile: createEngineProfileFromElo(1000),
  });

  const cal = calibrateFromSavedSessions([session], 1100);
  assert.equal(cal.gamesAnalyzed, 1);
  assert.ok(cal.pliesAnalyzed >= 5);
  assert.ok(cal.estimatedElo >= 400 && cal.estimatedElo <= 3000);
});

test('parseJourneyProfile handles corrupted JSON and restores valid profiles safely', () => {
  const bad = parseJourneyProfile('{not valid json');
  assert.equal(bad.initialized, false);

  const empty = parseJourneyProfile(null);
  assert.equal(empty.initialized, false);

  const valid = createInitialJourneyProfile('hard');
  const restored = parseJourneyProfile(JSON.stringify(valid));
  assert.equal(restored.initialized, true);
  assert.equal(restored.rating, 1550);
  assert.equal(restored.startingTier, 'hard');
  assert.equal(createUninitializedJourneyProfile().initialized, false);
});

test('StoredGameSession preserves ratedJourney metadata across serialize/deserialize and rescues legacy rated saves', () => {
  const initial = createInitialGameState();
  const legal = generateLegalMoves(initial);
  const afterOne = makeMove(initial, legal[0]);
  const stack = [initial, afterOne];

  const ratedSession = createStoredSession({
    stateStack: stack,
    gameMode: 'ai',
    playerColor: 'w',
    isFlipped: false,
    engineProfile: createEngineProfileFromElo(575),
    ratedJourney: {
      opponentElo: 575,
      undosAllowed: 3,
      undosRemaining: 2,
      undosUsed: 1,
      isFinalized: false,
    },
  });

  const restored = deserializeSession(serializeSession(ratedSession));
  assert.ok(restored);
  assert.ok(restored.ratedJourney);
  assert.equal(restored.ratedJourney.opponentElo, 575);
  assert.equal(restored.ratedJourney.undosAllowed, 3);
  assert.equal(restored.ratedJourney.undosRemaining, 2);
  assert.equal(restored.ratedJourney.undosUsed, 1);
  assert.equal(restored.ratedJourney.isFinalized, false);
  assert.match(restored.title, /^Rated vs\. AI 575 Elo/);

  // Legacy saved session without ratedJourney field but with Rated Challenger profile label
  const legacyRaw = serializeSession({
    ...ratedSession,
    ratedJourney: undefined,
  });
  const rescued = deserializeSession(legacyRaw);
  assert.ok(rescued?.ratedJourney);
  assert.equal(rescued.ratedJourney.opponentElo, 575);
  assert.equal(rescued.ratedJourney.undosAllowed, 3);

  // Standard non-rated session remains standard (no ratedJourney)
  const standardSession = createStoredSession({
    stateStack: stack,
    gameMode: 'ai',
    playerColor: 'w',
    isFlipped: false,
    engineProfile: createEngineProfileFromElo(1000),
  });
  const restoredStandard = deserializeSession(serializeSession(standardSession));
  assert.ok(restoredStandard);
  assert.equal(restoredStandard.ratedJourney, undefined);
});

test('beginner 4-game W-L-W-W progression climbs steadily without catapulting to 850 on game 1 or 1100 by game 4', () => {
  let profile = createInitialJourneyProfile('beginner'); // 600 Elo, vs 575
  const goodWinPlies = makeSyntheticPlies(18, 22, 0.02, 'best');
  const roughLossPlies = makeSyntheticPlies(18, 130, 0.12, 'mistake');

  // Game 1: Win vs 575
  const g1 = applyRatedMatchResult(profile, {
    opponentElo: profile.nextOpponentElo,
    playerColor: profile.nextColor,
    outcome: 'win',
    termination: 'checkmate',
    scoredPlies: goodWinPlies,
    undosUsed: 0,
    undosAllowed: 3,
    totalPlies: 36,
  });
  profile = g1.updatedProfile;
  assert.ok(
    profile.rating >= 645 && profile.rating <= 685,
    `Game 1 win should move 600 -> ~650-685 (not 850!), got ${profile.rating}`
  );
  assert.ok(
    profile.nextOpponentElo <= 725,
    `Next opponent after game 1 should stay approachable (<=725), got ${profile.nextOpponentElo}`
  );

  // Game 2: Loss
  const g2 = applyRatedMatchResult(profile, {
    opponentElo: profile.nextOpponentElo,
    playerColor: profile.nextColor,
    outcome: 'loss',
    termination: 'checkmate',
    scoredPlies: roughLossPlies,
    undosUsed: 0,
    undosAllowed: 3,
    totalPlies: 36,
  });
  profile = g2.updatedProfile;
  assert.ok(g2.summary.delta < 0);

  // Game 3: Win
  const g3 = applyRatedMatchResult(profile, {
    opponentElo: profile.nextOpponentElo,
    playerColor: profile.nextColor,
    outcome: 'win',
    termination: 'checkmate',
    scoredPlies: goodWinPlies,
    undosUsed: 0,
    undosAllowed: 3,
    totalPlies: 36,
  });
  profile = g3.updatedProfile;

  // Game 4: Win
  const g4 = applyRatedMatchResult(profile, {
    opponentElo: profile.nextOpponentElo,
    playerColor: profile.nextColor,
    outcome: 'win',
    termination: 'checkmate',
    scoredPlies: goodWinPlies,
    undosUsed: 0,
    undosAllowed: 3,
    totalPlies: 36,
  });
  profile = g4.updatedProfile;

  assert.ok(
    profile.rating >= 720 && profile.rating <= 860,
    `After W-L-W-W from 600, rating should land smoothly in 720-860 (not 1100!), got ${profile.rating}`
  );
  assert.ok(
    profile.nextOpponentElo <= 925,
    `After W-L-W-W, next opponent should stay <= 925, got ${profile.nextOpponentElo}`
  );
});

test('loss-streak self-correction accelerates rating descent, re-inflates RD, and softens opponents', () => {
  // Simulate an established player who got stuck at 1100 Elo
  let profile = {
    ...createInitialJourneyProfile('medium', 1100),
    gamesPlayed: 8,
    rd: 110,
    currentStreak: 0,
    nextOpponentElo: 1100,
  };
  const lossPlies = makeSyntheticPlies(18, 120, 0.11, 'mistake');
  const deltas: number[] = [];
  const oppOffsets: number[] = [];

  for (let i = 0; i < 4; i++) {
    const res = applyRatedMatchResult(profile, {
      opponentElo: profile.nextOpponentElo,
      playerColor: profile.nextColor,
      outcome: 'loss',
      termination: 'checkmate',
      scoredPlies: lossPlies,
      undosUsed: 0,
      undosAllowed: 2,
      totalPlies: 36,
    });
    deltas.push(res.summary.delta);
    oppOffsets.push(res.updatedProfile.nextOpponentElo - res.updatedProfile.rating);
    profile = res.updatedProfile;
  }

  // Consecutive losses should drop progressively faster
  assert.ok(
    Math.abs(deltas[1]) > Math.abs(deltas[0]),
    `2nd loss (${deltas[1]}) should drop more than 1st (${deltas[0]})`
  );
  assert.ok(
    Math.abs(deltas[2]) > Math.abs(deltas[1]),
    `3rd loss (${deltas[2]}) should drop more than 2nd (${deltas[1]})`
  );
  assert.ok(
    Math.abs(deltas[3]) >= Math.abs(deltas[2]),
    `4th loss (${deltas[3]}) should drop at least as much as 3rd (${deltas[2]})`
  );
  // After 4 losses from 1100, player should have descended substantially below 860
  assert.ok(
    profile.rating <= 860,
    `Expected rapid self-correction below 860 after 4 losses from 1100, got ${profile.rating}`
  );
  // RD should have re-inflated back above 150 so the player re-enters flexible calibration
  assert.ok(
    profile.rd > 150,
    `Expected RD re-inflation above 150 on 4-loss streak, got ${profile.rd}`
  );
  // Matchmaker softens more aggressively as loss streak grows (-25 -> -50 -> -75 -> -100)
  assert.ok(oppOffsets[3] <= -75, `Expected steep opponent relief on 4-loss streak, got offset ${oppOffsets[3]}`);
});

test('Rated Journey AI curve scales smoothly across 600-1450 Elo without a 950-1150 tactical cliff', () => {
  const c600 = interpolateEngineConfigFromElo(600);
  const c1000 = interpolateEngineConfigFromElo(1000);
  const c1100 = interpolateEngineConfigFromElo(1100);
  const c1150 = createRatedOpponentProfileFromElo(1150).config;
  const c1450 = interpolateEngineConfigFromElo(1450);

  // Quiescence stays off for beginner/casual tiers and turns on at 1450+
  assert.equal(c600.enableQuiescence, false);
  assert.equal(c1000.enableQuiescence, false);
  assert.equal(c1100.enableQuiescence, false);
  assert.equal(c1150.enableQuiescence, false);
  assert.equal(c1450.enableQuiescence, true);

  // 1150 rated opponent does NOT snap to Reactive's 20cp zero-blunder margin
  assert.ok(
    c1150.errorMarginCentipawns >= 150,
    `Expected smooth human error margin at 1150 Elo (>=150cp), got ${c1150.errorMarginCentipawns}`
  );
  assert.ok(
    c1150.errorProbability >= 0.18,
    `Expected smooth human error probability at 1150 Elo (>=0.18), got ${c1150.errorProbability}`
  );

  // Strictly monotonic humanization decay
  assert.ok(c600.errorProbability > c1000.errorProbability);
  assert.ok(c1000.errorProbability > c1100.errorProbability);
  assert.ok(c1100.errorProbability > c1450.errorProbability);
  assert.ok(c600.errorMarginCentipawns > c1000.errorMarginCentipawns);
  assert.ok(c1000.errorMarginCentipawns > c1100.errorMarginCentipawns);
  assert.ok(c1100.errorMarginCentipawns > c1450.errorMarginCentipawns);
});
