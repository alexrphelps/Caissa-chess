import { verifyAndSave } from './build_verified_puzzles';
import { ChessPuzzle } from '../src/chess/puzzles/types';

import puz0400 from '../src/chess/puzzles/data/puzzles_0400_0800.json';
import puz0800 from '../src/chess/puzzles/data/puzzles_0800_1200.json';
import puz1200 from '../src/chess/puzzles/data/puzzles_1200_1600.json';
import puz1600 from '../src/chess/puzzles/data/puzzles_1600_2000.json';
import puz2000 from '../src/chess/puzzles/data/puzzles_2000_2400.json';
import puz2400 from '../src/chess/puzzles/data/puzzles_2400_plus.json';

// --- 0400 - 0800: Beginner & Novice Motifs ---
const additional_0400: ChessPuzzle[] = [
  {
    id: "puz_0409",
    fen: "r1bqk2r/pppp1ppp/2n5/4p3/1b2n3/2NP1N2/PPP1BPPP/R1BQK2R w KQkq - 0 6",
    moves: ["c1d2", "e4d2", "d1d2", "e8g8"],
    rating: 520,
    ratingDeviation: 50,
    themes: ["Hanging Piece", "Recapture", "Opening"],
    description: "Exchange minor pieces cleanly after black offers a bishop pin."
  },
  {
    id: "puz_0410",
    fen: "4r1k1/5ppp/8/8/8/8/1r3PPP/R5K1 b - - 0 1",
    moves: ["b2e2", "g1f1", "e2e1", "a1e1"],
    rating: 610,
    ratingDeviation: 45,
    themes: ["Back-Rank", "Simplification", "Endgame"],
    description: "Infiltrate with the active rook to trade into a won endgame."
  },
  {
    id: "puz_0411",
    fen: "r1b1k2r/pppp1ppp/8/4q3/1bP5/2N1P3/PP3PPP/R2QKB1R b KQkq - 0 9",
    moves: ["b4c3", "b2c3", "e5c3", "e1e2"],
    rating: 680,
    ratingDeviation: 48,
    themes: ["Double Attack", "Fork", "Pawn Structure"],
    description: "Damage white's queenside pawn structure and pick up the loose c3 pawn."
  },
  {
    id: "puz_0412",
    fen: "r3k2r/ppp2ppp/2n5/3qp3/1b6/3P1N2/PPP2PPP/R1BQK2R w KQkq - 0 9",
    moves: ["c1d2", "b4d2", "d1d2", "e8g8"],
    rating: 490,
    ratingDeviation: 52,
    themes: ["Defense", "Discovered Attack", "Opening"],
    description: "Neutralize black's check by blocking with the bishop."
  },
  {
    id: "puz_0413",
    fen: "6k1/5ppp/8/8/8/8/r4PPP/4R1K1 w - - 0 1",
    moves: ["g2g3", "g8f8", "g1g2", "a2b2"],
    rating: 580,
    ratingDeviation: 46,
    themes: ["Back-Rank Mate Prevention", "Luft", "Endgame"],
    description: "Create flight squares (luft) for the king to evade back-rank mate."
  },
  {
    id: "puz_0414",
    fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5",
    moves: ["d7d6", "c1g5", "h7h6", "g5f6", "d8f6"],
    rating: 640,
    ratingDeviation: 47,
    themes: ["Pin", "Recapture", "Opening"],
    description: "Break the pin on the knight and recapture toward the center."
  },
  {
    id: "puz_0415",
    fen: "r2qkb1r/pp2pppp/2n2n2/3p4/3P2b1/2NB1N2/PPP2PPP/R1BQK2R b KQkq - 4 6",
    moves: ["c6d4", "f3d4", "g4d1", "d3b5"],
    rating: 740,
    ratingDeviation: 53,
    themes: ["Discovered Attack", "Decoy", "Queen Trap"],
    description: "Exploit the pinned d3 square to initiate a sharp tactical sequence."
  },
  {
    id: "puz_0416",
    fen: "6k1/pp3ppp/8/8/8/1P6/P1r2PPP/3R2K1 b - - 0 1",
    moves: ["g8f8", "d1d8", "f8e7", "d8d1", "c2a2"],
    rating: 690,
    ratingDeviation: 49,
    themes: ["King Activity", "Endgame", "Pawn Grab"],
    description: "Step the king forward to defend against back-rank check and win a pawn."
  },
  {
    id: "puz_0417",
    fen: "r1b1k2r/ppppqppp/2n5/4P3/1bP2Bn1/5N2/PP1NPPPP/R2QKB1R b KQkq - 6 6",
    moves: ["g4e5", "f4e5", "c6e5", "f3e5", "e7e5"],
    rating: 720,
    ratingDeviation: 50,
    themes: ["Tactical Exchange", "Center Control", "Recapture"],
    description: "Regain piece parity while exerting pressure on the central e5 square."
  },
  {
    id: "puz_0418",
    fen: "8/5pk1/6p1/7p/7P/5KP1/r4P2/4R3 b - - 0 1",
    moves: ["a2a6", "e1e3", "a6f6", "f3g2"],
    rating: 760,
    ratingDeviation: 48,
    themes: ["Rook Check", "Endgame", "Positional"],
    description: "Check the opponent's king to push it back and seize open files."
  },
  {
    id: "puz_0419",
    fen: "r1bqk2r/pppp1ppp/2n5/2b1p3/4n3/2PP1N2/PP2BPPP/RNBQK2R b KQkq - 0 6",
    moves: ["e4f2", "d1b3", "f2h1", "c1g5"],
    rating: 780,
    ratingDeviation: 45,
    themes: ["Fork", "Royal Fork", "Material Advantage"],
    description: "Fork queen and rook on f2 to win decisive exchange."
  },
  {
    id: "puz_0420",
    fen: "3r2k1/p4ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1",
    moves: ["a7a6", "d1d8"],
    rating: 460,
    ratingDeviation: 40,
    themes: ["Back-Rank Mate", "Hanging Piece", "Mate in 1"],
    description: "Deliver immediate back-rank checkmate against the pinned king."
  }
];

// --- 0800 - 1200: Tactical Motifs (Pins, Skewers, Discovered Attacks, Forks) ---
const additional_0800: ChessPuzzle[] = [
  {
    id: "puz_0809",
    fen: "r1b2rk1/pp1n1ppp/2p1pn2/q2p2B1/1bPP4/2N1PN2/PPQ2PPP/2KR1B1R b - - 6 9",
    moves: ["b4c3", "b2c3", "f6e4", "c1b2"],
    rating: 980,
    ratingDeviation: 52,
    themes: ["Fork", "Outpost", "Pawn Structure"],
    description: "Jump the knight into the powerful e4 outpost targeting c3 and f2."
  },
  {
    id: "puz_0810",
    fen: "2r3k1/pp3ppp/8/8/8/1P3N2/P1r2PPP/R3R1K1 b - - 0 1",
    moves: ["c2b2", "e1c1", "c8c1", "a1c1", "h7h6"],
    rating: 870,
    ratingDeviation: 50,
    themes: ["7th Rank", "Simplification", "Luft"],
    description: "Invade the 7th rank with the rook and ensure king safety."
  },
  {
    id: "puz_0811",
    fen: "r1bq1rk1/pp3ppp/2n1pn2/3p4/1bPP4/2NB1N2/PP3PPP/R1BQK2R b KQ - 2 8",
    moves: ["d5c4", "d3c4", "f6e4", "e1g1"],
    rating: 1040,
    ratingDeviation: 48,
    themes: ["Pin", "Double Attack", "Opening Tactic"],
    description: "Liquidate the center pawn and exert dual pressure on the pinned c3 knight."
  },
  {
    id: "puz_0812",
    fen: "r2qk2r/ppp2ppp/2n1b3/2bnp3/2B5/2PP1N2/PP3PPP/RNBQ1RK1 b kq - 2 7",
    moves: ["d5f4", "c1f4", "e6c4", "f4e5"],
    rating: 1110,
    ratingDeviation: 52,
    themes: ["Zwischenzug", "Tactical Bishop Swap", "Initiative"],
    description: "Execute an intermediate exchange before recapturing on c4."
  },
  {
    id: "puz_0813",
    fen: "4r1k1/5ppp/p1q5/1p1R4/8/1QP3P1/PP3P1P/6K1 b - - 0 25",
    moves: ["e8e1", "g1g2", "e1d1", "b3d1"],
    rating: 1150,
    ratingDeviation: 54,
    themes: ["Absolute Pin", "Endgame Tactic", "Heavy Pieces"],
    description: "Pin the white rook to the king and force a decisive simplification."
  },
  {
    id: "puz_0814",
    fen: "r1b1k2r/pp2qppp/2n1pn2/3p4/2PP4/2N2N2/PP2BPPP/R2QK2R b KQkq - 1 9",
    moves: ["d5c4", "e2c4", "e8g8", "e1g1"],
    rating: 860,
    ratingDeviation: 46,
    themes: ["Development", "Castling", "Center Break"],
    description: "Release central tension and castle safely into the middlegame."
  },
  {
    id: "puz_0815",
    fen: "r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPP3PP/2KR1B1R b - - 0 9",
    moves: ["c8d7", "h2h4", "c6d4", "e3d4", "d8a5"],
    rating: 1080,
    ratingDeviation: 50,
    themes: ["Sicilian Defense", "Dragon Counter-attack", "Middlegame"],
    description: "Coordinate queen and dragon bishop for queenside counterplay."
  },
  {
    id: "puz_0816",
    fen: "3r2k1/p4ppp/1p6/8/2P5/1P3P2/P1Q3PP/4r1K1 w - - 0 27",
    moves: ["g1f2", "d8d1", "c2f5", "g7g6"],
    rating: 1180,
    ratingDeviation: 52,
    themes: ["7th Rank Infiltration", "Simplification", "Winning Endgame"],
    description: "Infiltrate with rooks along the 1st rank to dominate the board."
  },
  {
    id: "puz_0817",
    fen: "r1bqk2r/1ppp1ppp/p1n5/2b1p3/B3n3/2P2N2/PP1P1PPP/RNBQR1K1 b kq - 1 7",
    moves: ["c5f2", "g1f1", "f2e1", "d1e1"],
    rating: 920,
    ratingDeviation: 47,
    themes: ["Deflection", "Winning the Exchange", "King Exposure"],
    description: "Snatch the f2 pawn with check and win the rook on e1."
  },
  {
    id: "puz_0818",
    fen: "r1b1k2r/ppp2ppp/2n1p3/3q4/1b1P4/4PN2/PP1B1PPP/R2QKB1R b KQkq - 2 8",
    moves: ["b4d2", "d1d2", "e8g8", "f1d3"],
    rating: 890,
    ratingDeviation: 45,
    themes: ["Piece Trade", "Solidification", "Opening"],
    description: "Trade off dark-squared bishops to relieve queenside pressure."
  },
  {
    id: "puz_0819",
    fen: "4r1k1/5ppp/8/8/8/8/2r2PPP/1R4K1 b - - 0 1",
    moves: ["e8c8", "h2h3", "c2c1", "b1c1", "c8c1"],
    rating: 940,
    ratingDeviation: 46,
    themes: ["Doubled Rooks", "Trade", "Winning Endgame"],
    description: "Double rooks along the c-file to force off all remaining counterplay."
  },
  {
    id: "puz_0820",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    moves: ["f3g5", "d7d5", "e4d5", "c6a5", "c4b5"],
    rating: 1060,
    ratingDeviation: 50,
    themes: ["Fried Liver Attack", "Pressure on f7", "Opening Initiative"],
    description: "Launch the fried liver probe against f7 and maintain pin."
  }
];

// --- 1200 - 1600: Intermediate (Zwischenzug, Decoy, Clearance, Opposition) ---
const additional_1200: ChessPuzzle[] = [
  {
    id: "puz_1209",
    fen: "r1bq1rk1/1pp2ppp/p1np1n2/4p3/2B1P3/2NPPN2/PPP3PP/R2Q1RK1 b - - 0 9",
    moves: ["c8e6", "c4b3", "d6d5", "e4d5", "f6d5"],
    rating: 1290,
    ratingDeviation: 49,
    themes: ["Central Break", "Bishop Trade", "Middlegame"],
    description: "Challenging white's Spanish bishop with a well-timed d5 central break."
  },
  {
    id: "puz_1210",
    fen: "2r3k1/1p3ppp/4p3/p2p4/3P4/P3P2P/1Pr2PP1/1R1R2K1 b - - 0 21",
    moves: ["g8f8", "g1f1", "f8e7", "f1e1", "e7d6"],
    rating: 1340,
    ratingDeviation: 51,
    themes: ["King Centralization", "Rook Endgame", "Positional Mastery"],
    description: "March the king directly to d6 to support rook penetration."
  },
  {
    id: "puz_1211",
    fen: "r2qk2r/ppp1bppp/2np1n2/4p3/2B1P1b1/2NP1N2/PPP1QPPP/R1B1K2R b KQkq - 2 7",
    moves: ["c6d4", "e2d1", "g4f3", "g2f3"],
    rating: 1410,
    ratingDeviation: 48,
    themes: ["Outpost", "Shattered Kingside Pawns", "Middlegame"],
    description: "Shatter white's kingside pawns by trading into the doubled f-pawn weakness."
  },
  {
    id: "puz_1212",
    fen: "2r3k1/pp3ppp/8/3p4/3P4/1P3P2/P2r2PP/R3R1K1 b - - 0 23",
    moves: ["g8f8", "a1c1", "c8c1", "e1c1", "d2a2"],
    rating: 1260,
    ratingDeviation: 47,
    themes: ["Pawn Grab", "King Safety", "Endgame Conversion"],
    description: "Neutralize back rank threats before picking off the isolated a2 pawn."
  },
  {
    id: "puz_1213",
    fen: "r1b2rk1/pp1n1ppp/2p1pn2/q5B1/1bPP4/2N2N2/PPQ2PPP/2KR1B1R b - - 4 10",
    moves: ["b4c3", "b2c3", "c6c5", "f1d3"],
    rating: 1470,
    ratingDeviation: 53,
    themes: ["Pawn Lever", "Exploiting Weaknesses", "Flank Attack"],
    description: "Undermine white's fractured pawn center with the thematic c5 strike."
  },
  {
    id: "puz_1214",
    fen: "r2q1rk1/1pp2ppp/p1np1n2/2b1p3/2B1P1b1/2NP1N2/PPP1QPPP/R1B2RK1 b - - 3 9",
    moves: ["c6d4", "e2d1", "c7c6", "c1e3"],
    rating: 1380,
    ratingDeviation: 50,
    themes: ["Knight Dominance", "Prophylaxis", "Center Stranglehold"],
    description: "Reinforce the monster knight on d4 to choke white's coordination."
  },
  {
    id: "puz_1215",
    fen: "8/5pk1/6p1/7p/4R2P/5KP1/r4P2/8 b - - 2 34",
    moves: ["a2a3", "e4e3", "a3a2", "f3g2"],
    rating: 1520,
    ratingDeviation: 52,
    themes: ["Rook Harassment", "King Cut-off", "Endgame Precision"],
    description: "Check the white king and immediately reposition behind the advancing lines."
  },
  {
    id: "puz_1216",
    fen: "r1bq1rk1/pp1n1ppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R b KQ - 2 8",
    moves: ["d5c4", "d3c4", "b7b5", "c4d3", "c8b7"],
    rating: 1310,
    ratingDeviation: 46,
    themes: ["Queenside Expansion", "Tempo Gain", "Fianchetto"],
    description: "Expand on the queenside with tempo against the bishop and prepare Bb7."
  },
  {
    id: "puz_1217",
    fen: "3r2k1/p4ppp/8/8/8/1P3P2/P1q3PP/R4RK1 b - - 1 24",
    moves: ["d8d2", "f1c1", "d2g2", "g1h1", "g2h2", "h1g1", "c2f2"],
    rating: 1580,
    ratingDeviation: 55,
    themes: ["Mating Net", "Heavy Piece Dominance", "Blind Swine Checkmate"],
    description: "Infiltrate with queen and rook on the 2nd rank for an unstoppable checkmate."
  },
  {
    id: "puz_1218",
    fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/1bPP4/2N1PN2/PP2BPPP/R1BQK2R b KQ - 4 7",
    moves: ["d5c4", "e2c4", "e6e5", "e1g1", "e5d4"],
    rating: 1440,
    ratingDeviation: 48,
    themes: ["Isolated Queen Pawn Setup", "Central Liquidation", "Opening"],
    description: "Liquidate the center to activate piece activity against the IQP."
  }
];

// --- 1600 - 2000: Advanced Motifs (Smothered Mates, Interferences, Prophylaxis) ---
const additional_1600: ChessPuzzle[] = [
  {
    id: "puz_1609",
    fen: "r1b2rk1/pp1n1ppp/2p1pn2/q5B1/2PP4/2N2N2/PP1QBPPP/2KR3R b - - 6 11",
    moves: ["b7b5", "c4b5", "c6b5", "c3b5", "a5a2"],
    rating: 1690,
    ratingDeviation: 52,
    themes: ["Minority Attack", "King Hunt", "Queenside Sacrifice"],
    description: "Pawn sacrifice to blow open lines directly against the castled white king."
  },
  {
    id: "puz_1610",
    fen: "2r3k1/1p3ppp/4p3/p2p4/3P4/bP2P2P/P1r2PP1/1R1R2K1 b - - 0 23",
    moves: ["c2a2", "b1a1", "c8c2", "a1a2", "c2a2"],
    rating: 1780,
    ratingDeviation: 54,
    themes: ["Rook Battery", "7th Rank Squeeze", "Pawn Cleansing"],
    description: "Double on the second rank and pick off white's split queenside pawns."
  },
  {
    id: "puz_1611",
    fen: "r2q1rk1/1pp1bppp/p1np1n2/4p3/2B1P1b1/2NP1N2/PPP1QPPP/R1B2RK1 b - - 5 9",
    moves: ["c6d4", "e2d1", "d4f3", "g2f3", "g4h3"],
    rating: 1840,
    ratingDeviation: 53,
    themes: ["Kingside Ruin", "Dark-Square Domination", "Intermediate Move"],
    description: "Ruin the pawns guarding the white king and drop the bishop into the crippling h3 outpost."
  },
  {
    id: "puz_1612",
    fen: "8/5pk1/6p1/7p/4R2P/5KP1/r4P2/8 b - - 2 34",
    moves: ["a2a6", "e4e3", "a6f6", "f3e2", "g7f8"],
    rating: 1920,
    ratingDeviation: 55,
    themes: ["Triangulation", "Prophylaxis", "Lucena Prevention"],
    description: "Defend masterfully by stepping the king into position to deny white's bridge building."
  },
  {
    id: "puz_1613",
    fen: "r1bq1rk1/pp1n1ppp/2p1pn2/3p4/2PP4/2NBPN2/PP1Q1PPP/R3K2R b KQ - 2 9",
    moves: ["d5c4", "d3c4", "b7b5", "c4d3", "a7a6", "e1g1", "c6c5"],
    rating: 1720,
    ratingDeviation: 49,
    themes: ["Meran Defense Counter", "Queenside Roll", "Pawn Break"],
    description: "Execute the thematic Meran expansion with b5, a6, and c5."
  },
  {
    id: "puz_1614",
    fen: "3r2k1/p4ppp/8/8/8/1P3P2/P1r3PP/R4RK1 b - - 0 25",
    moves: ["d8d2", "f1d1", "d2g2", "g1f1", "c2f2", "f1e1", "g2h2"],
    rating: 1880,
    ratingDeviation: 51,
    themes: ["Perpetual Threat", "Mating Threat", "Seventh Rank Exploitation"],
    description: "Coordinate rooks to strip white of both kingside defensive pawns."
  },
  {
    id: "puz_1615",
    fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/1bPP4/2N1PN2/PP1BBPPP/R2QK2R b KQ - 5 7",
    moves: ["d5c4", "e2c4", "b4d6", "e1g1", "e6e5"],
    rating: 1650,
    ratingDeviation: 48,
    themes: ["Positional Retreat", "Center Liberation", "Timing"],
    description: "Retreat bishop to d6 to support immediate e5 central break."
  },
  {
    id: "puz_1616",
    fen: "8/8/4k1p1/7p/4KP1P/r5P1/8/4R3 b - - 0 45",
    moves: ["a3g3", "e4d4", "e6f5", "e1e5", "f5f4"],
    rating: 1960,
    ratingDeviation: 56,
    themes: ["Active King", "Passed Pawn Creation", "Endgame Extraction"],
    description: "Activate king decisively to scoop up white's remaining kingside pawns."
  }
];

// --- 2000 - 2400: Expert Motifs (Zugzwang, Stalemate Swindles, Quiet Traps) ---
const additional_2000: ChessPuzzle[] = [
  {
    id: "puz_2009",
    fen: "r2q1rk1/1pp1bppp/p1np1n2/4p3/2B1P1b1/2NPBN2/PPP1QPPP/R4RK1 b - - 6 9",
    moves: ["c6d4", "e3d4", "e5d4", "c3d5", "f6d7"],
    rating: 2120,
    ratingDeviation: 54,
    themes: ["Positional Exchange", "Maneuver", "Square Vacancy"],
    description: "Reroute knight to e5 via d7 to permanently seize the light squares."
  },
  {
    id: "puz_2010",
    fen: "2r3k1/1p3ppp/4p3/p2p4/3P4/bP2P1P1/P1r2P1P/1R1R2K1 b - - 0 24",
    moves: ["c2a2", "b1a1", "c8c2", "a1a2", "c2a2", "d1b1", "a3b4"],
    rating: 2240,
    ratingDeviation: 58,
    themes: ["Positional Paralysis", "Prophylaxis", "Domination"],
    description: "Lock white's rook into complete passivity with the subtle Bb4 bishop clamp."
  },
  {
    id: "puz_2011",
    fen: "8/5pk1/6p1/7p/4R2P/r4KP1/5P2/8 w - - 4 36",
    moves: ["e4e3", "a3a2", "e3c3", "g7f6", "c3c6"],
    rating: 2080,
    ratingDeviation: 52,
    themes: ["Rook Opposition", "Endgame Check", "Tempo Preservation"],
    description: "Keep checking distance while maintaining pressure on black's king."
  },
  {
    id: "puz_2012",
    fen: "r1bq1rk1/pp1n1ppp/2p1pn2/3p4/2PP4/2NBPN2/PP1Q1PPP/2KR3R b - - 3 9",
    moves: ["d5c4", "d3c4", "b7b5", "c4d3", "c8b7", "c1b1", "a7a6"],
    rating: 2310,
    ratingDeviation: 57,
    themes: ["Opposite Castling", "Grandmaster Queenside Storm", "Pawn Lever"],
    description: "Launch the queenside pawn storm while white's king is committed on the c-file."
  },
  {
    id: "puz_2013",
    fen: "8/8/4k1p1/7p/4KP1P/r5P1/8/4R3 w - - 1 46",
    moves: ["e1e3", "a3a4", "e4f3", "e6f6", "e3b3"],
    rating: 2190,
    ratingDeviation: 55,
    themes: ["Rook Cutoff", "Sheltered King", "Draw Holding"],
    description: "Shelter king behind g3 and reposition rook along the third rank."
  },
  {
    id: "puz_2014",
    fen: "3r2k1/p4ppp/8/8/8/1P3P2/P1r1q1PP/R5K1 w - - 1 26",
    moves: ["g1h1", "e2g2"],
    rating: 2050,
    ratingDeviation: 45,
    themes: ["Checkmate", "Queen & Rook Battery", "Crushing Blow"],
    description: "Deliver immediate mate on g2 utilizing coordinated heavy pieces."
  }
];

// --- 2400+: Master / Grandmaster Tactical Conversions ---
const additional_2400: ChessPuzzle[] = [
  {
    id: "puz_2409",
    fen: "r2q1rk1/1pp1bppp/p1np1n2/4p3/2B1P1b1/2NPBN2/PPP1QPPP/R3R1K1 b - - 7 9",
    moves: ["c6d4", "e3d4", "e5d4", "c3d5", "f6d5", "c4d5", "c7c6"],
    rating: 2460,
    ratingDeviation: 60,
    themes: ["Grandmaster Prophylaxis", "Structural Exploitation", "Precision"],
    description: "Force bishop away before cementing absolute control of central dark squares."
  },
  {
    id: "puz_2410",
    fen: "8/5pk1/6p1/7p/4R2P/5KP1/r4P2/8 w - - 3 35",
    moves: ["e4e3", "g7f6", "f3g2", "f6f5", "e3f3", "f5e6"],
    rating: 2540,
    ratingDeviation: 62,
    themes: ["Triangulation", "Flank Harassment", "Endgame Perfection"],
    description: "Harass the active king with precision checks to maintain defensive fortress."
  },
  {
    id: "puz_2411",
    fen: "8/8/4k1p1/7p/4KP1P/r5P1/8/3R4 b - - 2 47",
    moves: ["a3g3", "d1d8", "g3g4", "e4f3", "g4h4"],
    rating: 2620,
    ratingDeviation: 65,
    themes: ["Material Decimation", "Rook Activity", "King Cut-off"],
    description: "Sweep both white kingside pawns to promote black's h-pawn to victory."
  },
  {
    id: "puz_2412",
    fen: "r1bq1rk1/pp1n1ppp/2p1pn2/3p4/2PP4/2NBPN2/PP1Q1PPP/R3K2R b KQ - 2 9",
    moves: ["d5c4", "d3c4", "b7b5", "c4e2", "c8b7", "e1g1", "a7a6", "f1d1", "c6c5"],
    rating: 2510,
    ratingDeviation: 59,
    themes: ["Deep Opening Theory", "Delayed c5 Push", "Dynamic Equality"],
    description: "Meticulously prepare the thematic c5 break to activate both bishops."
  }
];

import { testPuzzleList } from './test_puzzles_runner';

let totalFailures = 0;
totalFailures += testPuzzleList('0400_0800', additional_0400);
totalFailures += testPuzzleList('0800_1200', additional_0800);
totalFailures += testPuzzleList('1200_1600', additional_1200);
totalFailures += testPuzzleList('1600_2000', additional_1600);
totalFailures += testPuzzleList('2000_2400', additional_2000);
totalFailures += testPuzzleList('2400_plus', additional_2400);

if (totalFailures === 0) {
  verifyAndSave('0400_0800', puz0400 as ChessPuzzle[], additional_0400);
  verifyAndSave('0800_1200', puz0800 as ChessPuzzle[], additional_0800);
  verifyAndSave('1200_1600', puz1200 as ChessPuzzle[], additional_1200);
  verifyAndSave('1600_2000', puz1600 as ChessPuzzle[], additional_1600);
  verifyAndSave('2000_2400', puz2000 as ChessPuzzle[], additional_2000);
  verifyAndSave('2400_plus', puz2400 as ChessPuzzle[], additional_2400);
  console.log("SUCCESS: All additional puzzles validated and merged into dataset buckets!");
} else {
  console.error(`Total failures to fix: ${totalFailures}`);
  process.exit(1);
}
