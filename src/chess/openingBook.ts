import {
  applyMoveToBoard,
  BOARD_SIZE,
  createInitialBoard,
  FILES,
  findKingSquare,
  oppositeColor,
  squareToCoords,
} from './engine';
import { Board, Color, GameState, Move, PromotionPieceType, Square } from './types';

export type OpeningPhase =
  | 'standby'
  | 'opening_book'
  | 'opening_sideline'
  | 'middlegame_plan';

export interface OpeningBookEntry {
  eco: string;
  family: string;
  variation: string;
  uciMoves: string; // Space-separated coordinate moves e.g. "e2e4 e7e5 g1f3"
  archetype: string; // Unboxed metadata tags separated by '·'
  strengths: string; // Concise strengths for White & Black
  commentary: string; // Educational explanation of why the opening works and its key plan
}

export interface OpeningAnalysisResult {
  phase: OpeningPhase;
  eco: string;
  family: string;
  variation: string;
  fullTitle: string;
  moveProgressLabel: string; // e.g. "Book Line · Move 4/15" or "Transposed · Move 3/15"
  isTransposition: boolean;
  archetype: string;
  strengths: string;
  commentary: string;
}

interface CompiledBookNode {
  entry: OpeningBookEntry;
  plyCount: number;
  canonicalUciPrefix: string;
  positionKey: string;
}

/**
 * Computes a normalized position signature (piece placement + active turn)
 * used for O(1) transposition detection across different move orders.
 */
export function computePositionSignature(board: Board, turn: Color): string {
  const rows: string[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let empty = 0;
    let rowStr = '';
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          rowStr += empty.toString();
          empty = 0;
        }
        rowStr += p.color === 'w' ? p.type.toUpperCase() : p.type;
      }
    }
    if (empty > 0) rowStr += empty.toString();
    rows.push(rowStr);
  }
  return `${rows.join('/')} ${turn}`;
}

/**
 * Helper to convert a GameState's moveHistory into a space-separated UCI coordinate string.
 */
export function getGameUciHistory(state: GameState): string {
  return state.moveHistory
    .map(
      (rec) =>
        `${rec.move.from}${rec.move.to}${rec.move.promotion ?? ''}`
    )
    .join(' ');
}

/**
 * Applies a space-separated list of coordinate moves ("e2e4 e7e5 ...") to a fresh board
 * to generate the exact resulting board for transposition indexing.
 */
function replayUciMoves(uciMoves: string): { board: Board; turn: Color; plyCount: number } {
  let board = createInitialBoard();
  let turn: Color = 'w';
  const tokens = uciMoves.trim().split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const from = token.slice(0, 2) as Square;
    const to = token.slice(2, 4) as Square;
    const promotion =
      token.length === 5 ? (token[4] as PromotionPieceType) : undefined;
    const fromCoords = squareToCoords(from);
    const toCoords = squareToCoords(to);
    const piece = board[fromCoords.row]?.[fromCoords.col];
    if (!piece) break;

    let isCastle: 'K' | 'Q' | undefined;
    if (piece.type === 'k' && Math.abs(toCoords.col - fromCoords.col) === 2) {
      isCastle = toCoords.col > fromCoords.col ? 'K' : 'Q';
    }

    let isEnPassant = false;
    if (
      piece.type === 'p' &&
      fromCoords.col !== toCoords.col &&
      !board[toCoords.row]?.[toCoords.col]
    ) {
      isEnPassant = true;
    }

    const move: Move = {
      from,
      to,
      piece,
      promotion,
      isCastle,
      isEnPassant,
    };
    board = applyMoveToBoard(board, move);
    turn = oppositeColor(turn);
  }

  return { board, turn, plyCount: tokens.length };
}

/**
 * Comprehensive FIDE / ECO Tournament Opening Repertoire (Moves 1 to 15).
 * Ordered from general 1-ply roots to deep 10–15 move tournament mainlines.
 */
const RAW_OPENING_BOOK: OpeningBookEntry[] = [
  // ================= 1. FIRST-MOVE ROOTS =================
  {
    eco: 'B00',
    family: "King's Pawn Opening",
    variation: '1. e4 Open Center',
    uciMoves: 'e2e4',
    archetype: 'Direct Central Control · Rapid Bishop & Queen Diagonal Access',
    strengths: 'Claims d5/f5 immediately and frees both the f1-Bishop and d1-Queen for active tactical play.',
    commentary: 'The most classical attacking first move—White stakes an immediate claim in the center and invites sharp, open tactical lines.',
  },
  {
    eco: 'A40',
    family: "Queen's Pawn Opening",
    variation: '1. d4 Protected Center',
    uciMoves: 'd2d4',
    archetype: 'Protected Central Pawn · Long-Term Positional Pressure',
    strengths: 'The d4 pawn is immediately defended by the Queen, preventing early cheap counter-attacks.',
    commentary: 'Establishes a durable central foothold on d4 and e5 while preparing c4 to fight for queenside space.',
  },
  {
    eco: 'A10',
    family: 'English Opening',
    variation: '1. c4 Flank Control',
    uciMoves: 'c2c4',
    archetype: 'Hypermodern Flank Strike · d5 Square Control · Flexible Transpositions',
    strengths: 'Controls the critical d5 square from the wing while keeping central pawns flexible.',
    commentary: 'Fights for the center from the c-file, often steering the game into reversed Sicilian positions or transposing into 1.d4 mainlines.',
  },
  {
    eco: 'A04',
    family: 'Réti Opening',
    variation: '1. Nf3 Flexible Development',
    uciMoves: 'g1f3',
    archetype: 'Hypermodern Piece Control · Prevents 1...e5 · High Transposition Value',
    strengths: 'Develops a Knight to its best square immediately while keeping White’s pawn structure concealed.',
    commentary: 'Controls d4 and e5 with a piece before committing central pawns, frequently transposing into Queen’s Gambit, English, or King’s Indian setups.',
  },

  // ================= 2. OPEN GAMES (1. e4 e5) =================
  {
    eco: 'C20',
    family: "King's Pawn Game",
    variation: 'Symmetrical Open Game (1. e4 e5)',
    uciMoves: 'e2e4 e7e5',
    archetype: 'Classical Symmetry · Central Tension · Fast Minor-Piece Development',
    strengths: 'Both sides hold equal central space; White uses the first-move initiative to target e5 and f7.',
    commentary: 'Black meets White head-on in the center, blocking e4-e5 advances and setting up classical open-board tactics.',
  },
  {
    eco: 'C40',
    family: "King's Knight Opening",
    variation: '2. Nf3 Attacking e5',
    uciMoves: 'e2e4 e7e5 g1f3',
    archetype: 'Tempo Development · Direct e5 Pressure · Kingside Castling Prep',
    strengths: 'Develops with tempo by attacking Black’s undefended e5 pawn while controlling d4.',
    commentary: 'Forces Black to defend e5 immediately (via 2...Nc6, 2...Nf6 Petrov, or 2...d6 Philidor) while clearing the kingside for castling.',
  },
  {
    eco: 'C44',
    family: 'Open Game',
    variation: 'Mainline Knight Defense (2...Nc6)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6',
    archetype: 'Natural Development · Central Equilibrium · Major Crossroads',
    strengths: 'Black defends e5 naturally while contesting d4; White chooses between Ruy Lopez, Italian, or Scotch.',
    commentary: 'The primary crossroads of classical chess: White can now pressure the defender with 3.Bb5, eye f7 with 3.Bc4, or strike the center with 3.d4.',
  },

  // --- RUY LOPEZ (SPANISH GAME) UP TO 12 MOVES ---
  {
    eco: 'C60',
    family: 'Ruy Lopez',
    variation: 'Spanish Game (3. Bb5)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1b5',
    archetype: 'Indirect e5 Pressure · Rapid Castling · Rich Strategic Depth',
    strengths: 'Pressures the Knight defending e5 while clearing the back rank for immediate kingside castling.',
    commentary: 'A cornerstone of grandmaster play: White undermines Black’s control of d4 and e5 while maintaining long-term positional pressure.',
  },
  {
    eco: 'C65',
    family: 'Ruy Lopez',
    variation: 'Berlin Defense (3...Nf6)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6',
    archetype: 'Solid Counterattack · Endgame Resilience · Immediate e4 Pressure',
    strengths: 'Black counterattacks e4 immediately instead of weakening the queenside pawns with ...a6.',
    commentary: 'Renowned at World Championship level for its rock-solid structure; Black invites White to castle or enter a complex tactical battle.',
  },
  {
    eco: 'C67',
    family: 'Ruy Lopez',
    variation: 'Berlin Defense: Rio de Janeiro / Open Berlin',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 f8e7',
    archetype: 'Open e-File · King Safety Lead · Central Pawn Recovery',
    strengths: 'White uses the open e-file and castled King to recover the e4 pawn with active piece play.',
    commentary: 'After castling, White strikes with d4 to open lines against Black’s uncastled King and regain central control.',
  },
  {
    eco: 'C70',
    family: 'Ruy Lopez',
    variation: 'Morphy Defense (3...a6)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6',
    archetype: 'Putting the Question to the Bishop · Queenside Expansion',
    strengths: 'Forces the White Bishop to declare its intentions early and prepares a future ...b5 break.',
    commentary: 'Black gains queenside space with tempo, allowing the option to break the pin with ...b5 whenever needed.',
  },
  {
    eco: 'C68',
    family: 'Ruy Lopez',
    variation: 'Exchange Variation (4. Bxc6)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6 d7c6',
    archetype: 'Asymmetric Pawn Structure · Kingside 4-vs-3 Majority vs Bishop Pair',
    strengths: 'White Inflicts doubled c-pawns and obtains a clean 4-vs-3 kingside pawn majority for the endgame; Black gets the Bishop pair.',
    commentary: 'Trades the Bishop to permanently damage Black’s queenside pawn structure; White plans d4 to exchangeQueens and exploit the kingside majority.',
  },
  {
    eco: 'C78',
    family: 'Ruy Lopez',
    variation: 'Morphy Defense: Columbus / Archangelsk Prep',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1',
    archetype: 'Castled King Safety · e5/e4 Tension · Flexible c3/d4 Plan',
    strengths: 'White secures the King and threatens Re1 followed by c3 and d4 to dominate the center.',
    commentary: 'With the King safely castled, White’s e4 pawn is indirectly protected because 5...Nxe4 runs into Re1 or d4 counter-strikes.',
  },
  {
    eco: 'C84',
    family: 'Ruy Lopez',
    variation: 'Closed Defense (5...Be7)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7',
    archetype: 'Closed Strategic Maneuvering · e1/d4 Build-Up · Solid Black Citadel',
    strengths: 'Black shields the e-file and prepares castling; White builds an ideal c3-d4 pawn center.',
    commentary: 'Enters the main Closed Ruy Lopez: White defends e4 with 6.Re1, Threatening to win the e5 pawn once the e-file pin is gone.',
  },
  {
    eco: 'C89',
    family: 'Ruy Lopez',
    variation: 'Marshall Attack Stem (6. Re1 b5 7. Bb3 O-O 8. c3)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 e8g8 c2c3',
    archetype: 'c3-d4 Central Battery · Marshall Counter-Gambit Alert',
    strengths: 'White prepares the thematic d4 break; Black can play solidly with 8...d6 or sacrifice a pawn with 8...d5.',
    commentary: 'A famous tournament tabiya at move 8: White has completed ideal preparation for d4 while keeping the b3-Bishop eyeing f7.',
  },
  {
    eco: 'C92',
    family: 'Ruy Lopez',
    variation: 'Closed Chigorin / Zaitsev Tabiya (Moves 9–12)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3',
    archetype: 'Full Central Mobilization · Maneuvering Nb1-d2-f1-g3 · Deep Strategic Tension',
    strengths: '9.h3 prevents ...Bg4 pins so White can play d4 unhindered and maneuver the b1-Knight to g3 via d2-f1.',
    commentary: 'The classic Grandmaster Ruy Lopez tabiya: White next strikes with 10.d4 and routes Nb1-d2-f1-g3 for a powerful kingside build-up.',
  },

  // --- ITALIAN GAME (GIUOCO PIANO & TWO KNIGHTS) UP TO 12 MOVES ---
  {
    eco: 'C50',
    family: 'Italian Game',
    variation: '3. Bc4 Targeting f7',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1c4',
    archetype: 'Direct f7 Diagonal Battery · Fast Castling · d4 Control',
    strengths: 'Places the Bishop on the active a2-g8 diagonal targeting Black’s weakest square (f7) while controlling d5.',
    commentary: 'One of the oldest and most instructive openings: White develops rapidly toward the center and targets f7 before Black can castle.',
  },
  {
    eco: 'C53',
    family: 'Italian Game',
    variation: 'Giuoco Piano (3...Bc5)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5',
    archetype: 'Active Diagonal Symmetry · c3-d4 Center Plan vs Giuco Pianissimo',
    strengths: 'Both sides post Bishops on their most active diagonals, controlling d4 and d5 respectively.',
    commentary: 'In the Giuoco Piano ("Quiet Game"), White either blasts open the center with 4.c3 and 5.d4 or builds patiently with 4.d3 (Giuoco Pianissimo).',
  },
  {
    eco: 'C51',
    family: 'Italian Game',
    variation: 'Evans Gambit (4. b4)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4',
    archetype: 'Romantic Wing Gambit · Tempo for c3/d4 · Open Diagonal Lines',
    strengths: 'Sacrifices the b4 pawn to deflect Black’s c5-Bishop and seize the center with c3 and d4 at high speed.',
    commentary: 'A swashbuckling attacking gambit: White trades a flank pawn for two tempi, rapid central domination, and lethal diagonals against f7.',
  },
  {
    eco: 'C54',
    family: 'Italian Game',
    variation: 'Giuoco Piano Mainline (4. c3 Nf6 5. d3 d6 6. O-O O-O)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1 e8g8',
    archetype: 'Modern Giuoco Pianissimo · Flexible d3-d4 Push · Maneuvering Richness',
    strengths: 'White keeps the center solid with c3/d3, prepares Re1 and Nbd2-f1-g3, and retains the option of d4 at the right moment.',
    commentary: 'Today’s elite tournament favorite: both Kings are castled, and White prepares to expand on the queenside with a4/b4 or centralize via Re1 and d4.',
  },
  {
    eco: 'C54',
    family: 'Italian Game',
    variation: 'Classical Center Attack (4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4 c3d4 c5b4',
    archetype: 'Ideal e4/d4 Pawn Duo · Tactical Open Files · Sharp Counterplay',
    strengths: 'White achieves the ideal e4+d4 central pawn duo; Black uses checks on b4 and pressure on e4 to disrupt White’s center.',
    commentary: 'Sharp tactical warfare: White’s central pawns sweep away Black’s pieces, while Black counter-strikes against e4 with ...Nxe4.',
  },
  {
    eco: 'C55',
    family: 'Italian Game',
    variation: 'Two Knights Defense (3...Nf6)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6',
    archetype: 'Immediate Counterattack on e4 · Sharp Tactical Complications',
    strengths: 'Black develops the Knight with tempo against e4, challenging White to play 4.Ng5 (Fried Liver / Polerio) or 4.d3/4.d4.',
    commentary: 'Black refuses passive play and attacks e4 immediately; 4.d3 leads to solid positional play while 4.Ng5 provokes immediate f7 fireworks.',
  },
  {
    eco: 'C57',
    family: 'Italian Game',
    variation: 'Two Knights: Knight Attack (4. Ng5 d5 5. exd5)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5',
    archetype: 'Direct f7 Assault · Polerio Defense (5...Na5) vs Fried Liver (5...Nxd5)',
    strengths: 'White wins a pawn or forces Black into razor-sharp defensive lines; Black must play 5...Na5 to gain piece activity for the pawn.',
    commentary: 'White’s Knight and Bishop converge on f7; Black’s best master reply is 5...Na5 (Polerio Defense), as 5...Nxd5 allows the famous 6.Nxf7 Fried Liver sacrifice.',
  },

  // --- SCOTCH, PETROV, FOUR KNIGHTS, KING'S GAMBIT ---
  {
    eco: 'C45',
    family: 'Scotch Game',
    variation: 'Open Center Strike (3. d4 exd4 4. Nxd4)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4',
    archetype: 'Immediate Central Resolution · Open d-File · Space Advantage',
    strengths: 'Eliminates Black’s e5 strongpoint on move 3, giving White an open d-file, central Knight on d4, and free piece development.',
    commentary: 'Favored by Kasparov to bypass Ruy Lopez defenses: White opens the center immediately and challenges Black to equalize against White’s spatial lead.',
  },
  {
    eco: 'C42',
    family: "Petrov's Defense",
    variation: 'Russian Game (2...Nf6)',
    uciMoves: 'e2e4 e7e5 g1f3 g8f6',
    archetype: 'Symmetrical Counterattack · Ultra-Solid Structure · Drawish Resilience',
    strengths: 'Black counterattacks e4 immediately, avoiding Ruy Lopez/Italian pins and steering toward balanced, symmetrical structures.',
    commentary: 'Note the tactical trap after 3.Nxe5: Black must play 3...d6 first to kick the Knight before capturing 4...Nxe4 (since immediate 3...Nxe4? 4.Qe2 loses for Black).',
  },
  {
    eco: 'C47',
    family: 'Four Knights Game',
    variation: 'Symmetrical Knights (3. Nc3 Nf6)',
    uciMoves: 'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6',
    archetype: 'Harmonious Development · Solid Center · Spanish or Scotch Four Knights',
    strengths: 'All four Knights develop to their natural central squares before Bishops are committed, ensuring sound piece coordination.',
    commentary: 'A classical, fundamentally sound structure: White typically continues with 4.Bb5 (Spanish Four Knights) or 4.d4 (Scotch Four Knights).',
  },
  {
    eco: 'C30',
    family: "King's Gambit",
    variation: '2. f4 Romantic Attack',
    uciMoves: 'e2e4 e7e5 f2f4',
    archetype: 'f-File Opening · Deflecting e5 · Aggressive Kingside Initiative',
    strengths: 'Sacrifices the f4 pawn to deflect Black’s e5 pawn, seize the center with d4, and open the half-open f-file for White’s Rook after castling.',
    commentary: 'The signature opening of the Romantic era: White trades king-safety risk for a fierce central and f-file initiative.',
  },

  // ================= 3. SEMI-OPEN GAMES (1. e4 c5 / e6 / c6 / d5) =================
  // --- SICILIAN DEFENSE UP TO 12 MOVES ---
  {
    eco: 'B20',
    family: 'Sicilian Defense',
    variation: '1...c5 Asymmetric Counterattack',
    uciMoves: 'e2e4 c7c5',
    archetype: 'Asymmetric Pawn Structure · d4 Control · Queenside Counterplay',
    strengths: 'Fights for d4 from the flank without allowing a symmetrical game, creating unbalanced winning chances for both sides.',
    commentary: 'The highest-scoring response to 1.e4: Black trades a flank c-pawn for White’s central d-pawn in the Open Sicilian, gaining a 2-vs-1 central pawn majority.',
  },
  {
    eco: 'B23',
    family: 'Sicilian Defense',
    variation: 'Closed Sicilian / Alapin Prep (2. Nc3)',
    uciMoves: 'e2e4 c7c5 b1c3',
    archetype: 'Controlled Center · Kingside Pawn Storm or Fianchetto (g3/Bg2)',
    strengths: 'Avoids heavy Open Sicilian theory while keeping d4/d5 under firm control and preparing a kingside build-up.',
    commentary: 'White develops the c3-Knight first to control d5 and e4, retaining the option to transpose into the Open Sicilian or play a Closed g3/Bg2 system.',
  },
  {
    eco: 'B22',
    family: 'Sicilian Defense',
    variation: 'Alapin Variation (2. c3)',
    uciMoves: 'e2e4 c7c5 c2c3',
    archetype: 'Direct d4 Pawn Support · Anti-Sicilian Structure',
    strengths: 'Prepares an immediate d4 supported by the c3 pawn so White maintains a full pawn center if Black captures cxd4.',
    commentary: 'A practical anti-Sicilian weapon: Black usually counters immediately with 2...Nf6 (attacking e4) or 2...d5 (striking the center).',
  },
  {
    eco: 'B50',
    family: 'Sicilian Defense',
    variation: 'Open Sicilian Prep (2. Nf3 d6 3. d4 cxd4 4. Nxd4)',
    uciMoves: 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4',
    archetype: 'Centralized d4 Knight · Open c-File for Black vs White Space & Development',
    strengths: 'White gains a centralized Knight on d4, open diagonals, and kingside attacking potential; Black gets the half-open c-file and extra central e-pawn.',
    commentary: 'The fundamental bargain of the Open Sicilian: White leads in development and kingside space, while Black has superior long-term pawn structure and c-file pressure.',
  },
  {
    eco: 'B90',
    family: 'Sicilian Defense',
    variation: 'Najdorf Variation (5. Nc3 a6)',
    uciMoves: 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
    archetype: 'b4 Square Denial · ...e5 / ...b5 Flexibility · Elite Dynamic Balance',
    strengths: '5...a6 keeps White pieces out of b5, prepares queenside expansion with ...b5, and supports a central ...e5 break.',
    commentary: 'Champion choice of Fischer and Kasparov: White often replies with 6.Be3 (English Attack), 6.Bg5, or 6.Bc4 for sharp opposite-side attacks.',
  },
  {
    eco: 'B70',
    family: 'Sicilian Defense',
    variation: 'Dragon Variation (5. Nc3 g6)',
    uciMoves: 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6',
    archetype: 'Dark-Square g7 Dragon Bishop · Yugoslav Attack Race',
    strengths: 'Black fianchettoes the Bishop onto g7 to rake across the entire h8-a1 diagonal toward White’s queenside.',
    commentary: 'Sets up one of chess’s sharpest races: White often castles queenside (Be3, f3, Qd2, O-O-O) to storm Black’s kingside while Black counterattacks down the c-file.',
  },
  {
    eco: 'B33',
    family: 'Sicilian Defense',
    variation: 'Sveshnikov / Classical Stem (2. Nf3 Nc6 3. d4 cxd4 4. Nxd4)',
    uciMoves: 'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4',
    archetype: 'Active c6 Knight · Dynamic Central Struggle',
    strengths: 'Black develops the c6-Knight early to pressure d4 and prepare ...Nf6 or ...g6 (Accelerated Dragon).',
    commentary: 'White dominates the d4 square with the Knight; after 5.Nc3, Black can enter the dynamic Sveshnikov (4...Nf6 5.Nc3 e5) or Classical (5...d6).',
  },

  // --- FRENCH DEFENSE ---
  {
    eco: 'C00',
    family: 'French Defense',
    variation: '1...e6 Preparing ...d5',
    uciMoves: 'e2e4 e7e6',
    archetype: 'Solid d5 Counter-Thrust · Resilient Pawn Chain · Queenside Counterplay',
    strengths: 'Prepares to challenge White’s e4 pawn immediately with 2...d5 supported by the e6 pawn.',
    commentary: 'A deeply strategic defense: Black accepts a temporarily hemmed-in c8-Bishop in exchange for a rock-solid kingside and powerful pressure against White’s d4/e5 chain.',
  },
  {
    eco: 'C02',
    family: 'French Defense',
    variation: 'Advance Variation (2. d4 d5 3. e5)',
    uciMoves: 'e2e4 e7e6 d2d4 d7d5 e4e5',
    archetype: 'Locked Pawn Chain · White Kingside Space vs Black ...c5/...Qb6 Pressure',
    strengths: 'White wedges e5 in to cramp Black’s kingside and deny the f6 square to Black’s Knight; Black immediately attacks the d4 base with ...c5.',
    commentary: 'Defines a crystal-clear strategic battle: White defends the d4-e5 chain with c3 and Nf3 while Black piles pressure on d4 with ...c5, ...Nc6, and ...Qb6.',
  },
  {
    eco: 'C11',
    family: 'French Defense',
    variation: 'Classical / Winawer Stem (2. d4 d5 3. Nc3)',
    uciMoves: 'e2e4 e7e6 d2d4 d7d5 b1c3',
    archetype: 'Maximum Central Tension · 3...Nf6 Classical vs 3...Bb4 Winawer',
    strengths: 'White develops the Knight to defend e4 without releasing central tension, forcing Black to commit with 3...Nf6, 3...Bb4, or 3...dxe4.',
    commentary: 'The sharpest mainline of the French: White maintains full central flexibility while challenging Black to solve the problem of the e4-d5 tension.',
  },

  // --- CARO-KANN & SCANDINAVIAN ---
  {
    eco: 'B10',
    family: 'Caro-Kann Defense',
    variation: '1...c6 Solid Central Challenge',
    uciMoves: 'e2e4 c7c6',
    archetype: 'Structural Integrity · Unblocked Light-Squared Bishop · Solid Endgame',
    strengths: 'Prepares ...d5 with pawn support while keeping the c8-h3 diagonal open so Black’s light-squared Bishop is never trapped inside the pawn chain.',
    commentary: 'Combines the solidity of the French Defense with free development for Black’s c8-Bishop, making it a favorite of positional masters.',
  },
  {
    eco: 'B12',
    family: 'Caro-Kann Defense',
    variation: 'Mainline / Advance Crossroads (2. d4 d5)',
    uciMoves: 'e2e4 c7c6 d2d4 d7d5',
    archetype: 'Direct e4 Challenge · Classical (3.Nc3), Advance (3.e5), or Exchange (3.exd5)',
    strengths: 'Black strikes at e4 on move 2 with full c6 support, ready to recapture on d5 with a healthy pawn structure.',
    commentary: 'White has three strong plans: 3.e5 (Advance, gaining space), 3.Nc3 (Classical, inviting 3...dxe4 4.Nxe4 Bf5), or 3.exd5 cxd5 (Exchange / Panov).',
  },
  {
    eco: 'B01',
    family: 'Scandinavian Defense',
    variation: 'Center Counter (1...d5)',
    uciMoves: 'e2e4 d7d5',
    archetype: 'Immediate Central Liquidation · Open Lines · Solid c6-e6 Pyramid',
    strengths: 'Forces an immediate resolution of the center on move 1, steering the game into clear, well-defined pawn structures for Black.',
    commentary: 'Black challenges e4 immediately; after 2.exd5 Qxd5 3.Nc3 Qa5 (or Qd6), White gains a development tempo while Black sets up an ultra-solid c6+e6 wall.',
  },
  {
    eco: 'B01',
    family: 'Scandinavian Defense',
    variation: 'Mainline Queen Recapture (2. exd5 Qxd5 3. Nc3 Qa5)',
    uciMoves: 'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5',
    archetype: 'White Lead in Development vs Black Solid Caro-Slav Pawn Structure',
    strengths: 'White develops Nc3 with tempo and enjoys open central lines; Black places the Queen safely on a5 and develops Bf5/Nf6 smoothly.',
    commentary: 'White should use the tempo lead to develop d4, Nf3, and Bc4/Bd2 rapidly before Black consolidates with ...c6, ...Bf5, and ...e6.',
  },

  // ================= 4. CLOSED & QUEEN'S PAWN GAMES (1. d4) =================
  {
    eco: 'D00',
    family: "Queen's Pawn Game",
    variation: 'Classical Symmetry (1. d4 d5)',
    uciMoves: 'd2d4 d7d5',
    archetype: 'Closed Central Anchor · Strategic Space & Outpost Control',
    strengths: 'Both d-pawns are protected by their Queens, preventing early tactical knockouts and emphasizing strategic planning.',
    commentary: 'Black prevents White from playing e4 unhindered; White typically follows up with 2.c4 (Queen’s Gambit) or 2.Bf4 (London System).',
  },
  {
    eco: 'D02',
    family: 'London System',
    variation: 'Solid Pyramid Setup (1. d4 d5 2. Bf4 / 2. Nf3 Nf6 3. Bf4)',
    uciMoves: 'd2d4 d7d5 c1f4',
    archetype: 'Active Dark-Squared Bishop Outside Pawn Chain · e3-c3-d4 Pyramid',
    strengths: 'Deploys the c1-Bishop to an active diagonal before playing e3, guaranteeing harmonious development and strong e5 control.',
    commentary: 'A universal, low-theory system: White builds a rock-solid c3-d4-e3 triangle, controls e5 with Nf3+Bf4, and attacks on the kingside.',
  },
  {
    eco: 'D02',
    family: 'London System',
    variation: 'Classical London Tabiya (Nf3 + Bf4 + e3)',
    uciMoves: 'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3',
    archetype: 'Unbreakable d4 Fortress · Outpost Control on e5 · Kingside Initiative',
    strengths: 'White’s d4 pawn is doubly fortified while every minor piece has a clear, natural square (Bd3, Nbd2, Ne5).',
    commentary: 'Reached via either 2.Bf4 or 2.Nf3 transposition: White plans Nbd2, c3, Bd3, and planting a dominant Knight on the e5 outpost.',
  },

  // --- QUEEN'S GAMBIT (QGD, QGA, SLAV) UP TO 12 MOVES ---
  {
    eco: 'D06',
    family: "Queen's Gambit",
    variation: '2. c4 Challenging d5',
    uciMoves: 'd2d4 d7d5 c2c4',
    archetype: 'Flank Strike on Central d5 · c-File & e4 Central Expansion',
    strengths: 'Offers a wing pawn to deflect Black’s central d5 pawn; if Black accepts (2...dxc4), White dominates the center with e4 and Bxc4.',
    commentary: 'Not a true gambit since Black cannot hold the c4 pawn profitably—White undermines d5 to open the c-file and seize central space.',
  },
  {
    eco: 'D20',
    family: "Queen's Gambit Accepted",
    variation: 'Open QGA (2...dxc4)',
    uciMoves: 'd2d4 d7d5 c2c4 d5c4',
    archetype: 'Free Piece Play · White Central Space vs Black Active Counter-Strikes',
    strengths: 'White gets a free hand in the center (Nf3, e3/e4, Bxc4); Black avoids cramped QGD lines and prepares a timely ...c5 break.',
    commentary: 'Black surrenders the center temporarily to gain open diagonals and hit White’s center back with ...Nf6, ...e6, and ...c5.',
  },
  {
    eco: 'D10',
    family: 'Slav Defense',
    variation: '2...c6 Solid d5 Support',
    uciMoves: 'd2d4 d7d5 c2c4 c7c6',
    archetype: 'Symmetrical Pawn Support · Open c8-Bishop Diagonal · b5 Threat',
    strengths: 'Supports d5 with a pawn so Black can recapture ...cxd5 while keeping the light-squared c8-Bishop free to develop to f5 or g4.',
    commentary: 'One of the most reliable defenses to 1.d4: Black maintains central parity without locking in the queen’s Bishop.',
  },
  {
    eco: 'D30',
    family: "Queen's Gambit Declined",
    variation: '2...e6 Orthodox Foundation',
    uciMoves: 'd2d4 d7d5 c2c4 e7e6',
    archetype: 'Rock-Solid Central Point d5 · Classical Strategic Maneuvering',
    strengths: 'Fortifies d5 firmly and opens the f8-a3 diagonal for Black’s dark-squared Bishop, guaranteeing rapid kingside castling.',
    commentary: 'The gold standard of classical solidity: White builds pressure on d5 with Nc3 and Nf3, while Black prepares ...Nf6, ...Be7, ...O-O, and liberating ...c5 or ...dxc4 breaks.',
  },
  {
    eco: 'D35',
    family: "Queen's Gambit Declined",
    variation: 'Three Knights / Exchange Crossroads (3. Nc3 Nf6)',
    uciMoves: 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6',
    archetype: 'Canonical QGD Tabiya · Carlsbad Exchange (4.cxd5) vs Bg5/Nf3 Mainlines',
    strengths: 'Frequently reached by transposition (1.d4 Nf6 2.c4 e6 3.Nc3 d5); White can lock in the Carlsbad structure with cxd5 or pin with Bg5.',
    commentary: 'A pivotal tournament tabiya: White’s 4.cxd5 exd5 creates the famous Carlsbad pawn structure (minority attack b4-b5), while 4.Bg5 pins the f6 defender.',
  },
  {
    eco: 'D37',
    family: "Queen's Gambit Declined",
    variation: 'Classical Four Knights QGD (3. Nc3 Nf6 4. Nf3 Be7 5. Bf4 O-O 6. e3)',
    uciMoves: 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 g1f3 f8e7 c1f4 e8g8 e2e3',
    archetype: 'Harmonious Minor-Piece Development · Carlsbad / Lasker / Tartakower Options',
    strengths: 'White develops all minor pieces actively before committing e3, keeping maximum pressure on d5 and c7.',
    commentary: 'Modern QGD mainline: White’s f4-Bishop eyes c7, while Black prepares ...c5 or ...Nbd7 to challenge White’s central grip.',
  },

  // --- INDIAN DEFENSES (1. d4 Nf6) ---
  {
    eco: 'A45',
    family: 'Indian Defense',
    variation: '1...Nf6 Hypermodern Control',
    uciMoves: 'd2d4 g8f6',
    archetype: 'Flexible Piece Control of e4 · Transposition Hub (KID, Nimzo, QGD)',
    strengths: 'Prevents White from playing 2.e4 immediately while keeping Black’s central pawns completely flexible.',
    commentary: 'Instead of placing a static target on d5, Black controls e4 with a Knight and waits to see how White deploys c4 and Nc3.',
  },
  {
    eco: 'E60',
    family: "King's Indian Defense",
    variation: 'Fianchetto Counterattack (2. c4 g6 3. Nc3 Bg7 4. e4 d6)',
    uciMoves: 'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6',
    archetype: 'White 3-Pawn Center vs Black Dynamic ...e5/...c5 Strike & Kingside Storm',
    strengths: 'White commands a massive c4-d4-e4 center; Black coils like a spring behind d6/Bg7 to strike the center with ...e5 and attack White’s King.',
    commentary: 'The ultimate clash of space versus dynamics: White presses on the queenside while Black prepares ...O-O and a direct ...e5 counter-punch.',
  },
  {
    eco: 'E20',
    family: 'Nimzo-Indian Defense',
    variation: 'Pinning the c3 Knight (2. c4 e6 3. Nc3 Bb4)',
    uciMoves: 'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4',
    archetype: 'Indirect e4 Control · Doubled c-Pawn Threat · Rapid Black Castling',
    strengths: 'Black pins the c3-Knight to neutralize White’s e4 push and threatens ...Bxc3 to saddle White with doubled c-pawns.',
    commentary: 'A masterpiece of hypermodern strategy: Black controls the center with pieces rather than pawns and castles on move 4.',
  },
];

// Build compiled lookup maps once at module initialization
const POSITION_MAP = new Map<string, CompiledBookNode>();
const UCI_PREFIX_MAP = new Map<string, CompiledBookNode>();

for (const entry of RAW_OPENING_BOOK) {
  const { board, turn, plyCount } = replayUciMoves(entry.uciMoves);
  const positionKey = computePositionSignature(board, turn);
  const normalizedUci = entry.uciMoves.trim().replace(/\s+/g, ' ');
  const node: CompiledBookNode = {
    entry,
    plyCount,
    canonicalUciPrefix: normalizedUci,
    positionKey,
  };
  POSITION_MAP.set(positionKey, node);
  UCI_PREFIX_MAP.set(normalizedUci, node);
}

/**
 * Looks up whether a given board and active turn match a canonical FIDE ECO book position.
 */
export function lookupBookPosition(
  board: Board,
  turn: Color
): OpeningBookEntry | null {
  const sig = computePositionSignature(board, turn);
  return POSITION_MAP.get(sig)?.entry ?? null;
}

/**
 * Probes the opening book for canonical legal book moves for the current GameState.
 * Supports direct line matches as well as transpositions.
 */
export function getBookMoveCandidates(
  state: GameState,
  legalMoves: Move[]
): { move: Move; title: string; eco: string }[] {
  if (state.moveHistory.length > 20 || legalMoves.length === 0) {
    return [];
  }

  const historyUciTokens = state.moveHistory.map(
    (rec) => `${rec.move.from}${rec.move.to}${rec.move.promotion ?? ''}`
  );
  const currentPly = historyUciTokens.length;

  const candidates: { move: Move; title: string; eco: string }[] = [];
  const seenMoves = new Set<string>();

  // 1. Direct UCI prefix matching
  for (const entry of RAW_OPENING_BOOK) {
    const entryTokens = entry.uciMoves.trim().split(/\s+/).filter(Boolean);
    if (entryTokens.length <= currentPly) continue;

    let matchesPrefix = true;
    for (let i = 0; i < currentPly; i++) {
      if (entryTokens[i] !== historyUciTokens[i]) {
        matchesPrefix = false;
        break;
      }
    }

    if (matchesPrefix) {
      const nextUci = entryTokens[currentPly];
      if (seenMoves.has(nextUci)) continue;

      const from = nextUci.slice(0, 2);
      const to = nextUci.slice(2, 4);
      const promo = nextUci.length === 5 ? nextUci[4] : undefined;

      const matchedLegal = legalMoves.find(
        (m) =>
          m.from === from &&
          m.to === to &&
          (m.promotion ?? undefined) === promo
      );

      if (matchedLegal) {
        seenMoves.add(nextUci);
        candidates.push({
          move: matchedLegal,
          title: `${entry.family} (${entry.variation})`,
          eco: entry.eco,
        });
      }
    }
  }

  // 2. Transposition match: test if executing a legal move leads to a known book signature
  if (candidates.length === 0) {
    for (const move of legalMoves) {
      const nextBoard = applyMoveToBoard(state.board, move);
      const nextSig = computePositionSignature(
        nextBoard,
        oppositeColor(state.turn)
      );
      const matchedNode = POSITION_MAP.get(nextSig);
      if (matchedNode) {
        const uciKey = `${move.from}${move.to}${move.promotion ?? ''}`;
        if (!seenMoves.has(uciKey)) {
          seenMoves.add(uciKey);
          candidates.push({
            move,
            title: `${matchedNode.entry.family} (${matchedNode.entry.variation})`,
            eco: matchedNode.entry.eco,
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Evaluates live board structure (pawn chains, open files, king safety, development)
 * to generate accurate strategic commentary during early sidelines (Moves 2–15)
 * or the Middlegame Strategic Plan transition (Moves 11–15+).
 */
function synthesizeLiveStructuralPlan(
  state: GameState,
  inheritedEntry: OpeningBookEntry | null
): {
  archetype: string;
  strengths: string;
  commentary: string;
} {
  const { board, turn } = state;
  const sideName = turn === 'w' ? 'White' : 'Black';

  // 1. Check castling & king safety
  const whiteKingSq = findKingSquare(board, 'w') ?? 'e1';
  const blackKingSq = findKingSquare(board, 'b') ?? 'e8';

  const whiteCastled = whiteKingSq === 'g1' || whiteKingSq === 'c1';
  const blackCastled = blackKingSq === 'g8' || blackKingSq === 'c8';

  // 2. Identify open and half-open files (c, d, e, f)
  const openFiles: string[] = [];
  for (let c = 2; c <= 5; c++) {
    let hasWhitePawn = false;
    let hasBlackPawn = false;
    for (let r = 0; r < BOARD_SIZE; r++) {
      const p = board[r][c];
      if (p?.type === 'p') {
        if (p.color === 'w') hasWhitePawn = true;
        else hasBlackPawn = true;
      }
    }
    if (!hasWhitePawn && !hasBlackPawn) {
      openFiles.push(`${FILES[c]}-file`);
    }
  }

  // 3. Count developed minor pieces off back rank
  let whiteMinorDev = 0;
  let blackMinorDev = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (p.type === 'n' || p.type === 'b') {
        if (p.color === 'w' && r < BOARD_SIZE - 1) whiteMinorDev++;
        if (p.color === 'b' && r > 0) blackMinorDev++;
      }
    }
  }

  const tags: string[] = [];
  if (openFiles.length > 0) {
    tags.push(`Open ${openFiles.join(' & ')}`);
  } else {
    tags.push('Closed/Semi-Open Center');
  }
  tags.push(
    whiteCastled && blackCastled
      ? 'Both Kings Castled'
      : !whiteCastled || !blackCastled
      ? 'Castling & King Safety Priority'
      : 'Central Maneuvering'
  );
  tags.push(`Development ${whiteMinorDev}–${blackMinorDev}`);

  const familyContext = inheritedEntry
    ? `From the ${inheritedEntry.family}`
    : 'In this structure';

  const planSteps: string[] = [];
  if ((turn === 'w' && !whiteCastled) || (turn === 'b' && !blackCastled)) {
    planSteps.push(`complete minor-piece development and castle the ${sideName} King`);
  }
  if (openFiles.length > 0) {
    planSteps.push(`contest the open ${openFiles[0]} with Rooks`);
  } else {
    planSteps.push('prepare a central pawn break (d4/d5 or c4/c5) to open lines');
  }
  planSteps.push('anchor Knights on protected central outposts');

  return {
    archetype: tags.join(' · '),
    strengths: inheritedEntry
      ? inheritedEntry.strengths
      : 'Active minor-piece coordination, safe King shelter, and firm control of the four central squares (d4, d5, e4, e5).',
    commentary: `${familyContext}, ${sideName} should ${planSteps.slice(0, 2).join(', then ')}.`,
  };
}

/**
 * Analyzes the current game state and returns the Opening Coach & Middlegame Strategic Study data.
 * - Pre-Move (0 plies): Returns `'standby'` state.
 * - Moves 1–15 (1 to 30 plies): Detects exact book openings, transpositions across move orders,
 *   or retained parent opening sidelines with opening strengths and commentary.
 * - After Move 15 (or out-of-book after Move 10): Transitions smoothly into `'middlegame_plan'`.
 */
export function analyzeOpeningAndStrategy(state: GameState): OpeningAnalysisResult {
  const plies = state.moveHistory.length;

  // 1. Pre-Move Zero State (0 plies)
  if (plies === 0) {
    return {
      phase: 'standby',
      eco: 'ECO',
      family: 'Opening Book Ready',
      variation: 'Make Move 1 to Begin Opening Study (Moves 1–15)',
      fullTitle: 'ECO · Opening Book Ready',
      moveProgressLabel: 'Book Window · Moves 1–15',
      isTransposition: false,
      archetype: 'FIDE ECO Encyclopedia (A00–E99) · Automatic Transposition Detection',
      strengths: 'Play 1.e4, 1.d4, 1.c4, or 1.Nf3 to explore opening strengths, pawn structures, and strategic plans.',
      commentary: 'After the first move, this section displays the active opening, its structural strengths, and how to transition into the middlegame.',
    };
  }

  // 2. Scan history from current state backward to find:
  //    a) Whether the current board matches a canonical book position (exact or transposed)
  //    b) The deepest matched book opening in the game so far (for parent opening inheritance)
  const currentSig = computePositionSignature(state.board, state.turn);
  const fullUci = getGameUciHistory(state);

  const exactCurrentMatch = POSITION_MAP.get(currentSig);

  let deepestHistoricalMatch: {
    node: CompiledBookNode;
    wasTransposed: boolean;
  } | null = null;

  if (exactCurrentMatch) {
    const isTransposed = fullUci !== exactCurrentMatch.canonicalUciPrefix;
    deepestHistoricalMatch = {
      node: exactCurrentMatch,
      wasTransposed: isTransposed,
    };
  } else {
    // Check prefix history for the deepest matched book ancestor
    const uciTokens = state.moveHistory.map(
      (rec) => `${rec.move.from}${rec.move.to}`
    );
    let boardCursor = createInitialBoard();
    let turnCursor: Color = 'w';
    const prefixTokens: string[] = [];

    for (let i = 0; i < Math.min(uciTokens.length, 30); i++) {
      const rec = state.moveHistory[i];
      prefixTokens.push(uciTokens[i]);
      boardCursor = applyMoveToBoard(boardCursor, rec.move);
      turnCursor = oppositeColor(turnCursor);

      const sig = computePositionSignature(boardCursor, turnCursor);
      const matchedNode = POSITION_MAP.get(sig);
      if (matchedNode) {
        const prefixStr = prefixTokens.join(' ');
        deepestHistoricalMatch = {
          node: matchedNode,
          wasTransposed: prefixStr !== matchedNode.canonicalUciPrefix,
        };
      }
    }
  }

  const displayMoveNum = Math.min(
    15,
    Math.max(1, Math.ceil(plies / 2))
  );

  // 3. Determine whether we are in the Opening Phase (Moves 1–15) or Middlegame Transition
  // Transition to Middlegame Plan when:
  // - Move > 15 (plies > 30), OR
  // - Move > 10 (plies > 20) and no longer on an exact book position
  const isMiddlegameTransition =
    plies > 30 || (plies > 20 && !exactCurrentMatch);

  if (isMiddlegameTransition) {
    const inheritedEntry = deepestHistoricalMatch?.node.entry ?? null;
    const livePlan = synthesizeLiveStructuralPlan(state, inheritedEntry);
    const ecoCode = inheritedEntry ? inheritedEntry.eco : 'MID';

    return {
      phase: 'middlegame_plan',
      eco: ecoCode,
      family: 'Middlegame Strategic Plan',
      variation: inheritedEntry
        ? `Transition from ${inheritedEntry.family} · ${livePlan.archetype}`
        : `Active Structure · ${livePlan.archetype}`,
      fullTitle: `${ecoCode} · Middlegame Strategic Plan`,
      moveProgressLabel: `Middlegame Phase · Move ${state.fullMoveNumber}`,
      isTransposition: false,
      archetype: livePlan.archetype,
      strengths: livePlan.strengths,
      commentary: livePlan.commentary,
    };
  }

  // 4. Active Opening Book Match (Exact or Transposed on current board)
  if (exactCurrentMatch) {
    const { entry } = exactCurrentMatch;
    const isTransposed = fullUci !== exactCurrentMatch.canonicalUciPrefix;
    return {
      phase: 'opening_book',
      eco: entry.eco,
      family: entry.family,
      variation: entry.variation,
      fullTitle: `${entry.eco} · ${entry.family}`,
      moveProgressLabel: isTransposed
        ? `Transposed Book · Move ${displayMoveNum}/15`
        : `Book Line · Move ${displayMoveNum}/15`,
      isTransposition: isTransposed,
      archetype: entry.archetype,
      strengths: entry.strengths,
      commentary: entry.commentary,
    };
  }

  // 5. Opening Sideline within Moves 1–15 (inherits parent ECO opening + live structural strengths)
  const parentEntry = deepestHistoricalMatch?.node.entry ?? null;
  const liveStruct = synthesizeLiveStructuralPlan(state, parentEntry);

  if (parentEntry) {
    return {
      phase: 'opening_sideline',
      eco: parentEntry.eco,
      family: parentEntry.family,
      variation: `${parentEntry.variation} · Practical Sideline`,
      fullTitle: `${parentEntry.eco} · ${parentEntry.family}`,
      moveProgressLabel: deepestHistoricalMatch?.wasTransposed
        ? `Transposed Sideline · Move ${displayMoveNum}/15`
        : `Opening Phase · Move ${displayMoveNum}/15`,
      isTransposition: Boolean(deepestHistoricalMatch?.wasTransposed),
      archetype: parentEntry.archetype,
      strengths: parentEntry.strengths,
      commentary: liveStruct.commentary,
    };
  }

  // Fallback for uncommon first moves (e.g. 1. b3, 1. g3, 1. f4)
  return {
    phase: 'opening_sideline',
    eco: 'A00',
    family: 'Flank / Hypermodern Opening',
    variation: 'Flexible Fianchetto Setup',
    fullTitle: 'A00 · Flank / Hypermodern Opening',
    moveProgressLabel: `Opening Phase · Move ${displayMoveNum}/15`,
    isTransposition: false,
    archetype: liveStruct.archetype,
    strengths: 'Avoids mainstream book preparation and fights for central squares from the flanks with fianchettoed Bishops.',
    commentary: liveStruct.commentary,
  };
}
