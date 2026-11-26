import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStateStackUpToPly,
  formatPgnGameSummary,
  parsePgnDatabase,
  parseSinglePgnGame,
  splitPgnGames,
} from './pgnParser';
import {
  FAMOUS_GAMES_LIBRARY,
  parseFamousGameEntry,
} from './famousGames';
import { generateLegalMoves, makeMove } from './engine';

test('all 52 preloaded famous games parse cleanly with zero errors, unique IDs, and FIDE-legal moves', () => {
  assert.ok(
    FAMOUS_GAMES_LIBRARY.length >= 50,
    `Expected at least 50 curated games, got ${FAMOUS_GAMES_LIBRARY.length}`
  );

  const seenIds = new Set<string>();
  let modernCount = 0;

  for (const entry of FAMOUS_GAMES_LIBRARY) {
    assert.ok(!seenIds.has(entry.id), `Duplicate game id: ${entry.id}`);
    seenIds.add(entry.id);
    if (entry.year >= 2010) modernCount += 1;

    const parsed = parseFamousGameEntry(entry);
    assert.ok(
      parsed.timeline.length >= 16,
      `${entry.title} should have >= 16 plies (got ${parsed.timeline.length})`
    );
    assert.equal(
      parsed.result,
      entry.result,
      `${entry.title} result mismatch`
    );
    assert.equal(parsed.timeline[0].ply, 0);
    assert.equal(parsed.timeline[0].san, null);

    // Every subsequent ply has valid SAN, from, to, FEN, and incremented ply index
    for (let i = 1; i < parsed.timeline.length; i++) {
      const node = parsed.timeline[i];
      assert.equal(node.ply, i);
      assert.ok(node.san && node.san.length >= 2);
      assert.ok(node.from && node.to);
      assert.ok(node.fen.split(' ').length === 6);
    }
  }

  assert.ok(
    modernCount >= 18,
    `Expected at least 18 modern (2010+) games, got ${modernCount}`
  );
});

test('famous games hit iconic historical and modern key moves and checkmates', () => {
  // 1. Carlsen vs Topalov (Nanjing 2009): 30.h5
  const carlsenTopalov = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'carlsen-topalov-nanjing-2009')!
  );
  const move30w = carlsenTopalov.timeline.find(
    (n) => n.turnNumber === 30 && n.color === 'w'
  );
  assert.equal(move30w?.san, 'h5');
  assert.equal(move30w?.nag, '!');
  assert.ok(move30w?.comment?.includes('dark squares'));

  // 2. Immortal Game ends in checkmate on 23.Be7#
  const immortal = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'anderssen-kieseritzky-1851')!
  );
  const immortalFinal = immortal.timeline[immortal.timeline.length - 1];
  assert.equal(immortalFinal.san, 'Be7#');
  assert.equal(immortalFinal.flags.checkmate, true);
  assert.equal(immortalFinal.gameState.status, 'checkmate');

  // 3. Opera Game ends in checkmate on 17.Rd8#
  const opera = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'morphy-consultants-1858')!
  );
  const operaFinal = opera.timeline[opera.timeline.length - 1];
  assert.equal(operaFinal.san, 'Rd8#');
  assert.equal(operaFinal.flags.checkmate, true);

  // 4. Game of the Century: 17...Be6 and 41...Rc2#
  const century = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'byrne-fischer-1956')!
  );
  const be6 = century.timeline.find(
    (n) => n.turnNumber === 17 && n.color === 'b'
  );
  assert.equal(be6?.san, 'Be6');
  assert.equal(century.timeline[century.timeline.length - 1].flags.checkmate, true);

  // 5. Kasparov's Immortal: 24.Rxd4
  const kasparov = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'kasparov-topalov-1999')!
  );
  const rxd4 = kasparov.timeline.find(
    (n) => n.turnNumber === 24 && n.color === 'w'
  );
  assert.equal(rxd4?.san, 'Rxd4');

  // 6. Carlsen vs Karjakin (2016 WCh TB4): 50.Qh6+!!
  const carlsenKarjakin = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'carlsen-karjakin-2016-tb4')!
  );
  const qh6 = carlsenKarjakin.timeline[carlsenKarjakin.timeline.length - 1];
  assert.equal(qh6.san, 'Qh6+');
  assert.equal(qh6.nag, '!!');

  // 7. Ding Liren's Immortal (2017): ends in checkmate 35...Ng3#
  const dingImmortal = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'bai-ding-2017')!
  );
  const dingFinal = dingImmortal.timeline[dingImmortal.timeline.length - 1];
  assert.equal(dingFinal.san, 'Ng3#');
  assert.equal(dingFinal.flags.checkmate, true);

  // 8. Nepomniachtchi vs Ding (2023 WCh TB4): 46...Rg6!!
  const dingTitle = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'nepomniachtchi-ding-2023-tb4')!
  );
  const rg6 = dingTitle.timeline.find(
    (n) => n.turnNumber === 46 && n.color === 'b'
  );
  assert.equal(rg6?.san, 'Rg6');
  assert.equal(rg6?.nag, '!!');

  // 9. Edward Lasker vs Thomas (1912): King Walk ends in 18.Kd2#
  const kingWalk = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'elasker-thomas-1912')!
  );
  const kingWalkFinal = kingWalk.timeline[kingWalk.timeline.length - 1];
  assert.equal(kingWalkFinal.san, 'Kd2#');
  assert.equal(kingWalkFinal.flags.checkmate, true);

  // 10. Reti vs Tartakower (1910): 11-move double-check mate 11.Bd8#
  const retiMate = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'reti-tartakower-1910')!
  );
  const retiFinal = retiMate.timeline[retiMate.timeline.length - 1];
  assert.equal(retiFinal.san, 'Bd8#');
  assert.equal(retiFinal.flags.checkmate, true);
});

test('handles comments, clock tags, NAGs, and nested RAV variations gracefully', () => {
  const richPgn = `
[Event "Database Export Test"]
[Site "365Chess / TWIC"]
[Date "2024.05.12"]
[Round "3"]
[White "Player A"]
[Black "Player B"]
[Result "1-0"]
[WhiteElo "2650"]
[BlackElo "2610"]
[ECO "C50"]

{Intro comment before move 1.}
1. e4 $1 {[%clk 1:30:00] Strong center grab!} (1. d4 d5 (1... Nf6 2. c4) 2. c4)
1... e5 ; semicolon comment
2. Nf3 Nc6?! 3. Bc4 Bc5 (3... Nf6 4. Ng5 d5) 4. O-O Nf6 5. d3 1-0
`;

  const parsed = parseSinglePgnGame(richPgn);
  assert.equal(parsed.headers.White, 'Player A');
  assert.equal(parsed.headers.WhiteElo, '2650');
  assert.equal(parsed.timeline.length, 10); // ply 0 + 9 plies
  assert.equal(parsed.timeline[0].comment, 'Intro comment before move 1.');
  assert.equal(parsed.timeline[1].san, 'e4');
  assert.equal(parsed.timeline[1].nag, '!');
  assert.equal(parsed.timeline[1].comment, 'Strong center grab!');
  assert.equal(parsed.timeline[2].comment, 'semicolon comment');
  assert.equal(parsed.timeline[4].nag, '?!');
  assert.equal(parsed.timeline[7].san, 'O-O');
  assert.equal(parsed.timeline[7].flags.castle, 'K');
});

test('parses multi-game PGN bundles and formats summaries accurately', () => {
  const multiPgn = `
[Event "Tournament A"]
[Site "London"]
[Date "2023.01.10"]
[White "Alpha"]
[Black "Beta"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0

[Event "Tournament A"]
[Site "London"]
[Date "2023.01.11"]
[White "Gamma"]
[Black "Delta"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 1/2-1/2

[Event "Custom Study"]
[Site "Study"]
[Date "2023.02.01"]
[White "Endgame White"]
[Black "Endgame Black"]
[Result "*"]
[SetUp "1"]
[FEN "8/5P1k/8/8/8/8/6K1/8 w - - 0 42"]

42. f8=Q *
`;

  const chunks = splitPgnGames(multiPgn);
  assert.equal(chunks.length, 3);

  const batch = parsePgnDatabase(multiPgn);
  assert.equal(batch.errors.length, 0);
  assert.equal(batch.games.length, 3);

  assert.equal(batch.games[0].timeline[batch.games[0].timeline.length - 1].flags.checkmate, true);
  assert.equal(formatPgnGameSummary(batch.games[0]), 'Alpha vs. Beta (1-0) - Tournament A · 2023');

  // Verify custom FEN game promoted on ply 1
  const study = batch.games[2];
  assert.equal(study.isCustomStart, true);
  assert.equal(study.timeline[0].turnNumber, 42);
  assert.equal(study.timeline[1].san, 'f8=Q');
  assert.equal(study.timeline[1].flags.promotion, 'q');
});

test('buildStateStackUpToPly preserves exact state for Continue Play From Here branching', () => {
  const opera = parseFamousGameEntry(
    FAMOUS_GAMES_LIBRARY.find((g) => g.id === 'morphy-consultants-1858')!
  );
  // Branch at ply 12 (after 6...Nf6, White to move)
  const stack = buildStateStackUpToPly(opera, 12);
  assert.equal(stack.length, 13); // ply 0..12
  const branchState = stack[stack.length - 1];
  assert.equal(branchState.turn, 'w');
  assert.equal(branchState.moveHistory.length, 12);
  assert.equal(branchState.castlingRights.wK, true);
  assert.equal(branchState.castlingRights.wQ, true);

  // Verify we can make a brand new alternative move (e.g., O-O) from the branched state
  const legal = generateLegalMoves(branchState);
  const castleMove = legal.find((m) => m.isCastle === 'K');
  assert.ok(castleMove, 'White should be able to castle kingside from branched Opera Game ply 12');
  const next = makeMove(branchState, castleMove);
  assert.equal(next.moveHistory.length, 13);
  assert.equal(next.moveHistory[12].san, 'O-O');
});

test('reports clear errors on malformed or illegal PGNs', () => {
  const emptyRes = parsePgnDatabase('   ');
  assert.equal(emptyRes.games.length, 0);
  assert.equal(emptyRes.errors.length, 1);

  const illegalPgn = `
[Event "Bad Move"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Qh9 *
`;
  const badRes = parsePgnDatabase(illegalPgn);
  assert.equal(badRes.games.length, 0);
  assert.equal(badRes.errors.length, 1);
  assert.ok(badRes.errors[0].error.includes('Qh9'));

  const badFenPgn = `
[Event "Bad FEN"]
[SetUp "1"]
[FEN "invalid/fen/string w - - 0 1"]

1. e4 *
`;
  const badFenRes = parsePgnDatabase(badFenPgn);
  assert.equal(badFenRes.games.length, 0);
  assert.equal(badFenRes.errors.length, 1);
  assert.ok(badFenRes.errors[0].error.includes('Invalid starting FEN'));
});

test('extracts [%clk] and [%eval] tags cleanly from comments and preserves clickable RAV variations', async () => {
  const { convertStateStackToParsedPgnGame, convertSessionToParsedPgnGame } =
    await import('./pgnParser');
  const { createInitialGameState } = await import('./engine');
  const { createStoredSession } = await import('./sessionStorage');
  const { createEngineProfileFromPreset } = await import('./evaluation');

  const annotatedPgn = `
[Event "Lichess Rapid"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 {[%clk 0:10:00] [%eval 0.25] Standard king pawn} (1. d4 d5 2. c4)
1... e5 {[%clk 0:09:58] [%eval #3] Forced mate sequence}
2. Nf3 Nc6 1-0
`;
  const parsed = parseSinglePgnGame(annotatedPgn);
  assert.equal(parsed.timeline[1].clock, '10:00');
  assert.equal(parsed.timeline[1].pgnEval, 25);
  assert.equal(parsed.timeline[1].pgnEvalFormatted, '+0.3');
  assert.equal(parsed.timeline[1].comment, 'Standard king pawn');
  assert.ok(
    parsed.timeline[1].variations && parsed.timeline[1].variations.length === 1
  );
  assert.equal(parsed.timeline[1].variations![0].nodes.length, 3);
  assert.equal(parsed.timeline[1].variations![0].nodes[0].san, 'd4');

  // Mate eval parsing
  assert.equal(parsed.timeline[2].clock, '9:58');
  assert.ok((parsed.timeline[2].pgnEval ?? 0) > 20000);
  assert.equal(parsed.timeline[2].pgnEvalFormatted, 'M3');
  assert.equal(parsed.timeline[2].comment, 'Forced mate sequence');

  // Session & stateStack conversion into ParsedPgnGame
  const s0 = createInitialGameState();
  const m1 = generateLegalMoves(s0).find((m) => m.from === 'e2' && m.to === 'e4')!;
  const s1 = makeMove(s0, m1);
  const m2 = generateLegalMoves(s1).find((m) => m.from === 'e7' && m.to === 'e5')!;
  const s2 = makeMove(s1, m2);

  const fromStack = convertStateStackToParsedPgnGame({
    stateStack: [s0, s1, s2],
    gameMode: 'ai',
    playerColor: 'w',
    engineProfile: createEngineProfileFromPreset('club'),
    title: 'Stack Replay',
  });
  assert.equal(fromStack.timeline.length, 3);
  assert.equal(fromStack.timeline[1].san, 'e4');
  assert.equal(fromStack.timeline[2].san, 'e5');

  const stored = createStoredSession({
    stateStack: [s0, s1, s2],
    gameMode: 'ai',
    playerColor: 'w',
    isFlipped: false,
    engineProfile: createEngineProfileFromPreset('club'),
    customTitle: 'Club Test Match',
  });
  const fromSession = convertSessionToParsedPgnGame(stored);
  assert.equal(fromSession.headers.Event, 'Club Test Match');
  assert.equal(fromSession.timeline.length, 3);
  assert.equal(fromSession.headers.White, 'You');
});

