import { verifyAndSave } from './build_verified_puzzles';
import { ChessPuzzle } from '../src/chess/puzzles/types';

import puz0400 from '../src/chess/puzzles/data/puzzles_0400_0800.json';
import puz0800 from '../src/chess/puzzles/data/puzzles_0800_1200.json';
import puz1200 from '../src/chess/puzzles/data/puzzles_1200_1600.json';
import puz1600 from '../src/chess/puzzles/data/puzzles_1600_2000.json';
import puz2000 from '../src/chess/puzzles/data/puzzles_2000_2400.json';
import puz2400 from '../src/chess/puzzles/data/puzzles_2400_plus.json';

const more_0400: ChessPuzzle[] = [
  {
    id: "puz_0421",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    moves: ["b8c6", "f1c4", "f8c5", "e1g1"],
    rating: 450,
    ratingDeviation: 40,
    themes: ["Opening", "Development", "Italian Game"],
    description: "Develop knights and bishops toward the center in the Italian Game."
  },
  {
    id: "puz_0422",
    fen: "r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 5",
    moves: ["e1g1", "e8g8", "d2d3", "d7d6"],
    rating: 510,
    ratingDeviation: 42,
    themes: ["Castling", "Four Knights", "King Safety"],
    description: "Castle kingside quickly to safeguard the king in the Four Knights Game."
  },
  {
    id: "puz_0423",
    fen: "4r1k1/5ppp/8/8/8/8/4RPPP/6K1 w - - 0 1",
    moves: ["e2e1", "e8e1"],
    rating: 420,
    ratingDeviation: 35,
    themes: ["Back-Rank Mate", "Capture", "Mate in 1"],
    description: "Capture the white rook to deliver clean back-rank mate."
  },
  {
    id: "puz_0424",
    fen: "6k1/5ppp/8/8/8/8/4rPPP/5RK1 b - - 0 1",
    moves: ["e2e8", "f1d1", "g8f8", "g1f1"],
    rating: 540,
    ratingDeviation: 40,
    themes: ["Rook Reposition", "Endgame", "King Centralization"],
    description: "Reposition the rook back to the 8th rank to defend against invasion."
  },
  {
    id: "puz_0425",
    fen: "r1bqk2r/ppp2ppp/2n5/3np3/1bB5/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 7",
    moves: ["c1d2", "b4c3", "b2c3", "e8g8"],
    rating: 570,
    ratingDeviation: 44,
    themes: ["Recapture", "Pawn Structure", "Opening"],
    description: "Break the pin on c3 by interposing the bishop on d2."
  }
];

const more_0800: ChessPuzzle[] = [
  {
    id: "puz_0821",
    fen: "r1bq1rk1/pp3ppp/2n1pn2/2pp4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 8",
    moves: ["e1g1", "c5d4", "e3d4", "d5c4", "d3c4"],
    rating: 830,
    ratingDeviation: 45,
    themes: ["Opening Recapture", "Central Tension", "IQP Development"],
    description: "Castle and recapture in the center with bishop tempo."
  },
  {
    id: "puz_0822",
    fen: "2r3k1/pp3ppp/8/8/8/1P3N2/P1r2PPP/3RR1K1 b - - 0 1",
    moves: ["c2a2", "d1d7", "b7b6", "e1e7"],
    rating: 910,
    ratingDeviation: 47,
    themes: ["Pawn Grab", "7th Rank Counter", "Endgame"],
    description: "Snatch the weak a2 pawn and safeguard the b7 flank."
  },
  {
    id: "puz_0823",
    fen: "r1bqk2r/pppp1ppp/2n5/4p3/2B1n3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 5",
    moves: ["e4f6", "c1g5", "h7h6", "g5f6", "d8f6"],
    rating: 850,
    ratingDeviation: 43,
    themes: ["Knight Retreat", "Pin Neutralization", "Recapture"],
    description: "Retreat knight safely to f6 and recapture with the queen."
  },
  {
    id: "puz_0824",
    fen: "r1b2rk1/pp1n1ppp/2p1pn2/q5B1/2PP4/2N2N2/PP1QBPPP/R3K2R b KQ - 4 10",
    moves: ["f8e8", "e1g1", "e6e5", "d4e5", "d7e5"],
    rating: 970,
    ratingDeviation: 48,
    themes: ["Central Break", "Recapture", "Middlegame Initiative"],
    description: "Strike the center with e5 and recapture with the knight."
  },
  {
    id: "puz_0825",
    fen: "r2qk2r/ppp2ppp/2n1b3/2b1p3/2B5/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 7",
    moves: ["e6c4", "d3c4", "d8d1", "f1d1"],
    rating: 1020,
    ratingDeviation: 46,
    themes: ["Queen Exchange", "Doubled Pawns Inflicted", "Endgame Transition"],
    description: "Trade off queens and ruin white's pawn symmetry."
  },
  {
    id: "puz_0826",
    fen: "r1bq1rk1/ppp2ppp/2n5/3np3/1b6/2NP1N2/PPPBBPPP/R2QK2R w KQ - 2 8",
    moves: ["e1g1", "b4c3", "b2c3", "f8e8"],
    rating: 880,
    ratingDeviation: 42,
    themes: ["Solid Development", "Castling", "Rook Activation"],
    description: "Safeguard the king and absorb the minor piece exchange."
  }
];

const more_1200: ChessPuzzle[] = [
  {
    id: "puz_1219",
    fen: "r1b2rk1/pp3ppp/2n1pn2/q1pp4/2PP4/2N1PN2/PP1Q1PPP/R3KB1R b KQ - 2 9",
    moves: ["c5d4", "f3d4", "c6d4", "d2d4", "c8d7"],
    rating: 1240,
    ratingDeviation: 46,
    themes: ["Simplification", "Queen Centralization", "Bishop Development"],
    description: "Trade central knights to develop the light-squared bishop."
  },
  {
    id: "puz_1220",
    fen: "2r3k1/pp3ppp/8/3p4/3P4/1P3P2/P2r2PP/4RRK1 b - - 0 24",
    moves: ["d2a2", "e1c1", "c8c1", "f1c1", "g7g6"],
    rating: 1310,
    ratingDeviation: 49,
    themes: ["Endgame Conversion", "Luft Creation", "Passed Pawn"],
    description: "Create an escape square for the king while enjoying an extra pawn."
  },
  {
    id: "puz_1221",
    fen: "r1bq1rk1/pp3ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 8",
    moves: ["e1g1", "d5c4", "d3c4", "b7b6", "e3e4"],
    rating: 1390,
    ratingDeviation: 51,
    themes: ["Central Dominance", "Bishop Recapture", "Opening"],
    description: "Seize the center with e4 after black surrenders central tension."
  },
  {
    id: "puz_1222",
    fen: "r2qk2r/ppp1bppp/2np1n2/4p3/2B1P1b1/2NP1N2/PPP1QPPP/R1B2RK1 b kq - 4 7",
    moves: ["c6d4", "e2d1", "d4f3", "g2f3", "g4h5"],
    rating: 1450,
    ratingDeviation: 52,
    themes: ["Outpost Sacrifice", "Ruined Pawn Cover", "Pin Maintenance"],
    description: "Inflict doubled f-pawns and maintain the annoying pin on the f3 square."
  }
];

const more_1600: ChessPuzzle[] = [
  {
    id: "puz_1617",
    fen: "r1b2rk1/pp1n1ppp/2p1pn2/q5B1/2PP4/2N2N2/PP1QBPPP/2KR3R w - - 7 12",
    moves: ["c1b1", "b7b5", "c4b5", "c6b5", "c3b5"],
    rating: 1670,
    ratingDeviation: 50,
    themes: ["King Prophylaxis", "Pawn Snatch", "Opening Theory"],
    description: "Step king to b1 out of potential pin before grabbing flank pawn."
  },
  {
    id: "puz_1618",
    fen: "2r3k1/1p3ppp/4p3/p2p4/3P4/bP2P1P1/P1r2P1P/R2R2K1 b - - 0 24",
    moves: ["c2b2", "d1c1", "c8c1", "a1c1", "g7g6"],
    rating: 1730,
    ratingDeviation: 52,
    themes: ["7th Rank Rook", "Air Pocket", "Minor Piece Domination"],
    description: "Keep the 7th rank pressure and ensure the king has no back-rank vulnerabilities."
  },
  {
    id: "puz_1619",
    fen: "8/5pk1/6p1/7p/4R2P/r4KP1/5P2/8 w - - 5 37",
    moves: ["e4e3", "a3a2", "e3c3", "g7f6", "c3c5"],
    rating: 1810,
    ratingDeviation: 54,
    themes: ["Cut-off Defense", "Endgame Technique", "Prophylaxis"],
    description: "Cut off black's king along the 5th rank to neutralize advancing ideas."
  }
];

const more_2000: ChessPuzzle[] = [
  {
    id: "puz_2015",
    fen: "r2q1rk1/1pp1bppp/p1np1n2/4p3/2B1P1b1/2NPBN2/PPP1QPPP/R4RK1 w - - 7 10",
    moves: ["a2a3", "c6d4", "e3d4", "e5d4", "c3d5"],
    rating: 2060,
    ratingDeviation: 55,
    themes: ["Prophylactic a3", "Central Blockade", "Light-Square Control"],
    description: "Anticipate queenside expansion while anchoring knight on d5."
  },
  {
    id: "puz_2016",
    fen: "8/8/4k1p1/7p/4KP1P/r5P1/8/5R2 b - - 3 48",
    moves: ["a3g3", "f1f3", "g3g4", "f3a3", "g4h4"],
    rating: 2180,
    ratingDeviation: 57,
    themes: ["Pawn Decimation", "Rook Endgame", "Precision Conversion"],
    description: "Liquidate white's kingside pawns to promote the outside h-pawn."
  }
];

const more_2400: ChessPuzzle[] = [
  {
    id: "puz_2413",
    fen: "r2q1rk1/1pp1bppp/p1np1n2/4p3/2B1P1b1/2NPBN2/PPP1QPPP/R3R1K1 w - - 8 10",
    moves: ["a2a3", "c6d4", "e3d4", "e5d4", "c3d5", "f6d5", "c4d5", "c7c6", "d5b3"],
    rating: 2490,
    ratingDeviation: 62,
    themes: ["Master Prophylaxis", "Structural Squeeze", "Grandmaster Precision"],
    description: "Meticulously tuck bishop to b3 to retain long diagonal control."
  },
  {
    id: "puz_2414",
    fen: "8/5pk1/6p1/7p/4R2P/5KP1/r4P2/8 w - - 5 37",
    moves: ["f3g2", "g7f6", "e4f4", "f6e6", "f4e4", "e6f5", "e4f4"],
    rating: 2580,
    ratingDeviation: 66,
    themes: ["Endgame Triangulation", "King Harassment", "Fortress Holding"],
    description: "Repeat checking patterns along the e-file and f-file to deny any king progress."
  }
];

import { testPuzzleList } from './test_puzzles_runner';

let totalFailures = 0;
totalFailures += testPuzzleList('0400_0800', more_0400);
totalFailures += testPuzzleList('0800_1200', more_0800);
totalFailures += testPuzzleList('1200_1600', more_1200);
totalFailures += testPuzzleList('1600_2000', more_1600);
totalFailures += testPuzzleList('2000_2400', more_2000);
totalFailures += testPuzzleList('2400_plus', more_2400);

if (totalFailures === 0) {
  verifyAndSave('0400_0800', puz0400 as ChessPuzzle[], more_0400);
  verifyAndSave('0800_1200', puz0800 as ChessPuzzle[], more_0800);
  verifyAndSave('1200_1600', puz1200 as ChessPuzzle[], more_1200);
  verifyAndSave('1600_2000', puz1600 as ChessPuzzle[], more_1600);
  verifyAndSave('2000_2400', puz2000 as ChessPuzzle[], more_2000);
  verifyAndSave('2400_plus', puz2400 as ChessPuzzle[], more_2400);
  console.log("SUCCESS: All second batch puzzles validated and merged!");
} else {
  console.error(`Total failures to fix: ${totalFailures}`);
  process.exit(1);
}
