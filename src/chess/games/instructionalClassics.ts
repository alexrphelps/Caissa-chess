import { FamousGameEntry } from '../pgnTypes';

export const INSTRUCTIONAL_CLASSICS: FamousGameEntry[] = [
  {
    id: 'polgar-kasparov-2002',
    title: 'Judit Polgar Defeats World #1 Kasparov',
    subtitle: 'Judit Polgar vs. Kasparov · Moscow 2002',
    white: 'Judit Polgar',
    black: 'Garry Kasparov',
    event: 'Russia vs. Rest of the World',
    year: 2002,
    result: '1-0',
    eco: 'C67',
    opening: 'Ruy Lopez · Berlin Defense',
    theme: 'Endgame',
    keyMove: '30. Re6!',
    description:
      'A historic milestone in chess history: Judit Polgar outplayed Garry Kasparov cleanly in the Berlin Endgame, seizing the open files and invading the seventh rank with both rooks.',
    pgn: `[Event "Russia vs. Rest of the World"]
[Site "Moscow RUS"]
[Date "2002.09.09"]
[Round "5"]
[White "Judit Polgar"]
[Black "Garry Kasparov"]
[Result "1-0"]
[WhiteElo "2681"]
[BlackElo "2838"]
[ECO "C67"]
[Opening "Ruy Lopez, Berlin Defense"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6
7. dxe5 Nf5 8. Qxd8+ Kxd8 9. Nc3 h6 10. Rd1+ Ke8 11. h3 Be7 12. Ne2 Nh4
13. Nxh4 Bxh4 14. Be3 Bf5 15. Nd4 Bh7 16. g4 Be7 17. Kg2 h5 18. Nf5 Bf8
19. Kf3 Bg6 20. Rd2 hxg4+ 21. hxg4 Rh3+ 22. Kg2 Rh7 23. Kg3 f6 24. Bf4 Bxf5
25. gxf5 fxe5 26. Re1 Bd6 27. Bxe5 Kd7 28. c4 c5 29. Bxd6 cxd6
30. Re6! {Seizing the sixth rank and tying down Black's king and rooks.}
Rah8 31. Rexd6+ Kc8 32. R2d5 Rh3+ 33. Kg2 Rh2+ 34. Kf3 R2h3+ 35. Ke4 b6
36. Rc6+ Kb8 37. Rd7 Rh2 38. Ke3 Rf8 39. Rcc7 Rxf5 40. Rb7+ Kc8
41. Rdc7+ Kd8 42. Rxg7 Kc8 1-0`,
  },
  {
    id: 'kramnik-kasparov-2000-g2',
    title: 'Kramnik’s Breakthrough Against Kasparov',
    subtitle: 'Kramnik vs. Kasparov · London 2000 WCh G2',
    white: 'Vladimir Kramnik',
    black: 'Garry Kasparov',
    event: 'Classical World Chess Championship',
    year: 2000,
    result: '1-0',
    eco: 'D85',
    opening: 'Grünfeld Defense · Exchange',
    theme: 'World Championship',
    keyMove: '27. e6!',
    description:
      'In the pivotal victory of the 2000 World Championship match, Vladimir Kramnik dismantled Kasparov’s trusted Grünfeld Defense with deep positional clarity and a clinical rook-and-bishop ending.',
    pgn: `[Event "Classical World Chess Championship"]
[Site "London ENG"]
[Date "2000.10.10"]
[Round "2"]
[White "Vladimir Kramnik"]
[Black "Garry Kasparov"]
[Result "1-0"]
[WhiteElo "2770"]
[BlackElo "2849"]
[ECO "D85"]
[Opening "Grunfeld Defense"]

1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 5. e4 Nxc3 6. bxc3 Bg7 7. Nf3 c5
8. Be3 Qa5 9. Qd2 Bg4 10. Rb1 a6 11. Rxb7 Bxf3 12. gxf3 Nc6 13. Bc4 O-O
14. O-O cxd4 15. cxd4 Bxd4 16. Bd5 Bc3 17. Qc1 Nd4 18. Bxd4 Bxd4 19. Rxe7 Ra7
20. Rxa7 Bxa7 21. f4 Qd8 22. Qc3 Bb8 23. Qf3 Qh4 24. e5 g5 25. Re1 Qxf4
26. Qxf4 gxf4 27. e6! {Shattering Black's pawn shield and activating the rook to e6.}
fxe6 28. Rxe6 Kg7 29. Rxa6 Rf5 30. Be4 Re5 31. f3 Re7 32. a4 Ra7 33. Rb6 Be5
34. Rb4 Rd7 35. Kg2 Rd2+ 36. Kh3 h5 37. Rb5 Kf6 38. a5 Ra2 39. Rb6+ Ke7
40. Bd5 1-0`,
  },
  {
    id: 'kasparov-anand-1995-g10',
    title: 'Kasparov’s Open Ruy Lopez Rook Sacrifice',
    subtitle: 'Kasparov vs. Anand · New York 1995 WCh G10',
    white: 'Garry Kasparov',
    black: 'Viswanathan Anand',
    event: 'PCA World Chess Championship',
    year: 1995,
    result: '1-0',
    eco: 'C80',
    opening: 'Ruy Lopez · Open Variation',
    theme: 'World Championship',
    keyMove: '17. Qg4!',
    description:
      'Played atop the World Trade Center, Kasparov unleashed lethal opening preparation featuring the full rook sacrifice 17.Qg4 Qxa1! to crush Anand’s uncastled king.',
    pgn: `[Event "PCA World Chess Championship"]
[Site "New York, NY USA"]
[Date "1995.09.26"]
[Round "10"]
[White "Garry Kasparov"]
[Black "Viswanathan Anand"]
[Result "1-0"]
[WhiteElo "2795"]
[BlackElo "2725"]
[ECO "C80"]
[Opening "Ruy Lopez, Open Variation"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Nxe4 6. d4 b5
7. Bb3 d5 8. dxe5 Be6 9. Nbd2 Nc5 10. c3 d4 11. Ng5 dxc3 12. Nxe6 fxe6
13. bxc3 Qd3 14. Bc2 Qxc3 15. Nb3 Nxb3 16. Bxb3 Nd4
17. Qg4! {Deep home preparation—offering the a1 rook to shatter Black's kingside and central shelter.}
Qxa1 18. Bxe6 Rd8 19. Bh6 Qc3 20. Bxg7 Qd3 21. Bxh8 Qg6 22. Bf6 Be7
23. Bxe7 Qxg4 24. Bxg4 Kxe7 25. Rc1 c6 26. f4 a5 27. Kf2 a4 28. Ke3 b4
29. Bd1 a3 30. g4 Rd5 31. Rc4 c5 32. Ke4 Rd8 33. Rxc5 Ne6 34. Rd5 Rc8
35. f5 Rc4+ 36. Ke3 Nc5 37. g5 Rc1 38. Rd6 1-0`,
  },
  {
    id: 'ivanchuk-yusupov-1991',
    title: 'Yusupov’s Immortal',
    subtitle: 'Ivanchuk vs. Yusupov · Brussels 1991 Candidates',
    white: 'Vassily Ivanchuk',
    black: 'Artur Yusupov',
    event: 'Brussels Candidates Quarterfinal',
    year: 1991,
    result: '0-1',
    eco: 'E67',
    opening: "King's Indian Defense · Fianchetto",
    theme: 'Sacrifice',
    keyMove: '23... Nxh4!!',
    description:
      'Voted one of the greatest tactical games of the 1990s: Yusupov tears open White’s castled fortress with 23...Nxh4!! and lets his queen fall on the back rank to weave an unstoppable mating web.',
    pgn: `[Event "Brussels Candidates Quarterfinal"]
[Site "Brussels BEL"]
[Date "1991.08.24"]
[Round "9"]
[White "Vassily Ivanchuk"]
[Black "Artur Yusupov"]
[Result "0-1"]
[WhiteElo "2735"]
[BlackElo "2625"]
[ECO "E67"]
[Opening "King's Indian Defense"]

1. c4 e5 2. g3 d6 3. Bg2 g6 4. d4 Nd7 5. Nc3 Bg7 6. Nf3 Ngf6 7. O-O O-O
8. Qc2 Re8 9. Rd1 c6 10. b3 Qe7 11. Ba3 e4 12. Ng5 e3 13. f4 Nf8 14. b4 Bf5
15. Qb3 h6 16. Nf3 Ng4 17. b5 g5 18. bxc6 bxc6 19. Ne5 gxf4 20. Nxc6 Qg5
21. Bxd6 Ng6 22. Nd5 Qh5 23. h4 Nxh4!! {Igniting an unforgettable all-out assault against White's kingside.}
24. gxh4 Qxh4 25. Nde7+ Kh8 26. Nxf5 Qh2+ 27. Kf1 Re6 28. Qb7 Rg6
29. Qxa8+ Kh7 30. Qg8+ Kxg8 31. Nce7+ Kh7 32. Nxg6 fxg6 33. Nxg7 Nf2
34. Bf4 Qxf4 35. Ne6 Qh2 36. Rdb1 Nh3 37. Rb7+ Kh8 38. Rb8+ Qxb8 39. Bh3 Qg3 0-1`,
  },
  {
    id: 'karpov-unzicker-1974',
    title: 'Karpov’s Masterclass in Prophylaxis',
    subtitle: 'Karpov vs. Unzicker · Nice Olympiad 1974',
    white: 'Anatoly Karpov',
    black: 'Wolfgang Unzicker',
    event: 'Nice Chess Olympiad',
    year: 1974,
    result: '1-0',
    eco: 'C98',
    opening: 'Ruy Lopez · Chigorin Variation',
    theme: 'Instructional',
    keyMove: '24. Ba7!!',
    description:
      'Every chess coach’s favorite lesson in positional domination: with 24.Ba7!!, Karpov corks the a-file, locks both of Black’s rooks out of the game, and patiently conquers the kingside.',
    pgn: `[Event "Nice Chess Olympiad"]
[Site "Nice FRA"]
[Date "1974.06.18"]
[Round "4"]
[White "Anatoly Karpov"]
[Black "Wolfgang Unzicker"]
[Result "1-0"]
[WhiteElo "2700"]
[BlackElo "2535"]
[ECO "C98"]
[Opening "Ruy Lopez, Chigorin"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6
8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 Nc6 13. d5 Nd8
14. a4 Rb8 15. axb5 axb5 16. b4 Nb7 17. Nf1 Bd7 18. Be3 Ra8 19. Qd2 Rfc8
20. Bd3 g6 21. Ng3 Bf8 22. Ra2 c4 23. Bb1 Qd8
24. Ba7!! {A legendary prophylactic block—Black can never contest the a-file while White prepares a kingside storm at leisure.}
Ne8 25. Bc2 Nc7 26. Rea1 Qe7 27. Bb1 Be8 28. Ne2 Nd8 29. Nh2 Bg7 30. f4 f6
31. f5 g5 32. Bc2 Bf7 33. Ng3 Nb7 34. Bd1 h6 35. Bh5 Qe8 36. Qd1 Nd8
37. Ra3 Kf8 38. R1a2 Kg8 39. Ng4 Kf8 40. Ne3 Kg8 41. Bxf7+ Nxf7
42. Qh5 Nd8 43. Qg6 Kf8 44. Nh5 1-0`,
  },
  {
    id: 'petrosian-spassky-1966-g10',
    title: 'Petrosian’s Exchange Sacrifice & Queen Mate',
    subtitle: 'Petrosian vs. Spassky · Moscow 1966 WCh G10',
    white: 'Tigran Petrosian',
    black: 'Boris Spassky',
    event: 'World Chess Championship',
    year: 1966,
    result: '1-0',
    eco: 'E63',
    opening: "King's Indian Defense",
    theme: 'World Championship',
    keyMove: '30. Qh8+!!',
    description:
      'Iron Tigran proves his defensive mastery doubles as lethal attacking vision: sacrificing the exchange twice on f1 and f4 before delivering the knockout queen sacrifice 30.Qh8+!!.',
    pgn: `[Event "World Chess Championship"]
[Site "Moscow URS"]
[Date "1966.05.02"]
[Round "10"]
[White "Tigran Petrosian"]
[Black "Boris Spassky"]
[Result "1-0"]
[ECO "E63"]
[Opening "King's Indian Defense"]

1. Nf3 Nf6 2. g3 g6 3. c4 Bg7 4. Bg2 O-O 5. O-O Nc6 6. Nc3 d6 7. d4 a6
8. d5 Na5 9. Nd2 c5 10. Qc2 e5 11. b3 Ng4 12. e4 f5 13. exf5 gxf5 14. Nd1 b5
15. f3 e4 16. Bb2 exf3 17. Bxf3 Bxb2 18. Qxb2 Ne5 19. Be2 f4 20. gxf4 Bh3
21. Ne3! {Petrosian's signature positional exchange sacrifice—keeping a fortress while seizing the light squares.}
Bxf1 22. Rxf1 Ng6 23. Bg4 Nxf4 24. Rxf4! Rxf4 25. Be6+ Rf7 26. Ne4 Qh4
27. Nxd6 Qg5+ 28. Kh1 Raa7 29. Bxf7+ Rxf7
30. Qh8+!! {Deflecting the king into a lethal royal knight fork on f7.} 1-0`,
  },
  {
    id: 'tal-larsen-1965-g10',
    title: 'Tal’s Sicilian Fireworks',
    subtitle: 'Tal vs. Larsen · Bled 1965 Candidates G10',
    white: 'Mikhail Tal',
    black: 'Bent Larsen',
    event: 'Bled Candidates Semifinal',
    year: 1965,
    result: '1-0',
    eco: 'B82',
    opening: 'Sicilian Defense · Scheveningen',
    theme: 'Sacrifice',
    keyMove: '16. Nd5!!',
    description:
      'In the decisive 10th game of their Candidates semifinal, the Magician from Riga stunned Bent Larsen with the thunderbolt 16.Nd5!! to blast open the e-file against Black’s king.',
    pgn: `[Event "Bled Candidates Semifinal"]
[Site "Bled YUG"]
[Date "1965.08.08"]
[Round "10"]
[White "Mikhail Tal"]
[Black "Bent Larsen"]
[Result "1-0"]
[ECO "B82"]
[Opening "Sicilian Defense"]

1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 e6 5. Nc3 d6 6. Be3 Nf6 7. f4 Be7
8. Qf3 O-O 9. O-O-O Qc7 10. Ndb5 Qb8 11. g4 a6 12. Nd4 Nxd4 13. Bxd4 b5
14. g5 Nd7 15. Bd3 b4 16. Nd5!! {A classic Sicilian central sacrifice ripping open the e-file and dark squares.}
exd5 17. exd5 f5 18. Rde1 Rf7 19. h4 Bb7 20. Bxf5! Rxf5 21. Rxe7 Ne5
22. Qe4 Qf8 23. fxe5 Rf4 24. Qe3 Rf3 25. Qe2 Qxe7 26. Qxf3 dxe5 27. Re1 Rd8
28. Rxe5 Qd6 29. Qf4! Rf8 30. Qe4 b3 31. axb3 Rf1+ 32. Kd2 Qb4+
33. c3 Qd6 34. Bc5 Qxc5 35. Re8+ Rf8 36. Qe6+ Kh8 37. Qf7 1-0`,
  },
  {
    id: 'rbyrne-fischer-1963',
    title: 'Fischer’s Invisible Combination',
    subtitle: 'Robert Byrne vs. Bobby Fischer · US Ch 1963',
    white: 'Robert Byrne',
    black: 'Bobby Fischer',
    event: 'U.S. Chess Championship',
    year: 1963,
    result: '0-1',
    eco: 'E60',
    opening: 'Grünfeld / Neo-Grünfeld',
    theme: 'Sacrifice',
    keyMove: '15... Nxf2!',
    description:
      'During Fischer’s legendary 11/11 sweep of the U.S. Championship, grandmaster commentators thought Black was losing right before Byrne resigned on move 21 against unstoppable mate.',
    pgn: `[Event "U.S. Chess Championship"]
[Site "New York, NY USA"]
[Date "1963.12.18"]
[Round "3"]
[White "Robert Byrne"]
[Black "Bobby Fischer"]
[Result "0-1"]
[ECO "E60"]
[Opening "Neo-Grunfeld Defense"]

1. d4 Nf6 2. c4 g6 3. g3 c6 4. Bg2 d5 5. cxd5 cxd5 6. Nc3 Bg7 7. e3 O-O
8. Nge2 Nc6 9. O-O b6 10. b3 Ba6 11. Ba3 Re8 12. Qd2 e5 13. dxe5 Nxe5
14. Rfd1 Nd3 15. Qc2 Nxf2! {Destroying White's king shelter and exposing the fragile light squares.}
16. Kxf2 Ng4+ 17. Kg1 Nxe3 18. Qd2 Nxg2 19. Kxg2 d4! {Opening the long a8-h1 diagonal for the decisive bishop check.}
20. Nxd4 Bb7+ 21. Kf1 Qd7! {Threatening 22...Qh3+ and mate—Byrne resigned immediately.} 0-1`,
  },
  {
    id: 'spassky-bronstein-1960',
    title: 'The "From Russia With Love" King’s Gambit',
    subtitle: 'Spassky vs. Bronstein · Leningrad 1960',
    white: 'Boris Spassky',
    black: 'David Bronstein',
    event: 'USSR Championship',
    year: 1960,
    result: '1-0',
    eco: 'C36',
    opening: "King's Gambit Accepted",
    theme: 'Attack',
    keyMove: '15. Nd6!',
    description:
      'Immortalized in the James Bond film From Russia With Love, young Boris Spassky sacrificed a rook with 15.Nd6! and 16.Nxf7! to unleash a ferocious tactical storm against Bronstein.',
    pgn: `[Event "27th USSR Championship"]
[Site "Leningrad URS"]
[Date "1960.02.18"]
[Round "12"]
[White "Boris Spassky"]
[Black "David Bronstein"]
[Result "1-0"]
[ECO "C36"]
[Opening "King's Gambit Accepted"]

1. e4 e5 2. f4 exf4 3. Nf3 d5 4. exd5 Bd6 5. Nc3 Ne7 6. d4 O-O 7. Bd3 Nd7
8. O-O h6 9. Ne4 Nxd5 10. c4 Ne3 11. Bxe3 fxe3 12. c5 Be7 13. Bc2 Re8
14. Qd3 e2 15. Nd6! {Ignoring the rook on f1 completely to target h7 and f7.}
Nf8 16. Nxf7! exf1=Q+ 17. Rxf1 Bf5 18. Qxf5 Qd7 19. Qf4 Bf6 20. N3e5 Qe7
21. Bb3 Bxe5 22. Nxe5+ Kh7 23. Qe4+ 1-0`,
  },
  {
    id: 'polugaevsky-nezhmetdinov-1958',
    title: 'Nezhmetdinov’s Immortal',
    subtitle: 'Polugaevsky vs. Nezhmetdinov · Sochi 1958',
    white: 'Lev Polugaevsky',
    black: 'Rashid Nezhmetdinov',
    event: 'RSFSR Championship',
    year: 1958,
    result: '0-1',
    eco: 'A54',
    opening: 'Old Indian Defense',
    theme: 'Sacrifice',
    keyMove: '24... Rxf4!!',
    description:
      'Tactical genius Rashid Nezhmetdinov played one of the wildest queen sacrifices of all time—24...Rxf4!!—marrying sheer imagination with a forced king hunt across the entire board.',
    pgn: `[Event "RSFSR Championship"]
[Site "Sochi URS"]
[Date "1958.05.12"]
[Round "1"]
[White "Lev Polugaevsky"]
[Black "Rashid Nezhmetdinov"]
[Result "0-1"]
[ECO "A54"]
[Opening "Old Indian Defense"]

1. d4 Nf6 2. c4 d6 3. Nc3 e5 4. e4 exd4 5. Qxd4 Nc6 6. Qd2 g6 7. b3 Bg7
8. Bb2 O-O 9. Bd3 Ng4 10. Nge2 Qh4 11. Ng3 Nge5 12. O-O f5 13. f3 Bh6
14. Qd1 f4 15. Nge2 g5 16. Nd5 g4 17. g3 fxg3 18. hxg3 Qh3 19. f4 Be6
20. Bc2 Rf7 21. Kf2 Qh2+ 22. Ke3 Bxd5 23. cxd5 Nb4 24. Rh1 Rxf4!! {Offering the queen on h2 to rip open every line around White's stranded king.}
25. Rxh2 Rf3+ 26. Kd4 Bg7 27. a4 c5+ 28. dxc6 bxc6 29. Bd3 Nexd3+
30. Kc4 d5+ 31. exd5 cxd5+ 32. Kb5 Rb8+ 33. Ka5 Nc6+ 0-1`,
  },
  {
    id: 'botvinnik-capablanca-1938',
    title: 'The Greatest Positional Combination',
    subtitle: 'Botvinnik vs. Capablanca · AVRO 1938',
    white: 'Mikhail Botvinnik',
    black: 'Jose Raul Capablanca',
    event: 'AVRO Tournament',
    year: 1938,
    result: '1-0',
    eco: 'E40',
    opening: 'Nimzo-Indian Defense',
    theme: 'Instructional',
    keyMove: '30. Ba3!!',
    description:
      'Mikhail Botvinnik crowned his methodical Nimzo-Indian squeeze against former World Champion Capablanca with the legendary double sacrifice 30.Ba3!! and 31.Nh5+!, queening the e-pawn.',
    pgn: `[Event "AVRO Tournament"]
[Site "Rotterdam NED"]
[Date "1938.11.22"]
[Round "11"]
[White "Mikhail Botvinnik"]
[Black "Jose Raul Capablanca"]
[Result "1-0"]
[ECO "E40"]
[Opening "Nimzo-Indian Defense"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 d5 5. a3 Bxc3+ 6. bxc3 c5 7. cxd5 exd5
8. Bd3 O-O 9. Ne2 b6 10. O-O Ba6 11. Bxa6 Nxa6 12. Bb2 Qd7 13. a4 Rfe8
14. Qd3 c4 15. Qc2 Nb8 16. Rae1 Nc6 17. Ng3 Na5 18. f3 Nb3 19. e4 Qxa4
20. e5 Nd7 21. Qf2 g6 22. f4 f5 23. exf6 Nxf6 24. f5 Rxe1 25. Rxe1 Re8
26. Re6 Rxe6 27. fxe6 Kg7 28. Qf4 Qe8 29. Qe5 Qe7
30. Ba3!! {A bolt from the blue—deflecting Black's queen away from the kingside and the e7 blockade.}
Qxa3 31. Nh5+! gxh5 32. Qg5+ Kf8 33. Qxf6+ Kg8 34. e7 Qc1+ 35. Kf2 Qc2+
36. Kg3 Qd3+ 37. Kh4 Qe4+ 38. Kxh5 Qe2+ 39. Kh4 Qe4+ 40. g4 Qe1+ 41. Kh5 1-0`,
  },
  {
    id: 'reti-alekhine-1925',
    title: 'Alekhine’s Immortal',
    subtitle: 'Reti vs. Alekhine · Baden-Baden 1925',
    white: 'Richard Reti',
    black: 'Alexander Alekhine',
    event: 'Baden-Baden International',
    year: 1925,
    result: '0-1',
    eco: 'A00',
    opening: "King's Fianchetto Opening",
    theme: 'Sacrifice',
    keyMove: '26... Re3!!',
    description:
      'Alexander Alekhine considered this his finest masterpiece: starting with the quiet rook sacrifice 26...Re3!!, Black launches a 15-move geometric calculation ending in a trapped white knight.',
    pgn: `[Event "Baden-Baden International"]
[Site "Baden-Baden GER"]
[Date "1925.04.25"]
[Round "8"]
[White "Richard Reti"]
[Black "Alexander Alekhine"]
[Result "0-1"]
[ECO "A00"]
[Opening "King's Fianchetto Opening"]

1. g3 e5 2. Nf3 e4 3. Nd4 d5 4. d3 exd3 5. Qxd3 Nf6 6. Bg2 Bb4+ 7. Bd2 Bxd2+
8. Nxd2 O-O 9. c4 Na6 10. cxd5 Nb4 11. Qc4 Nbxd5 12. N2b3 c6 13. O-O Re8
14. Rfd1 Bg4 15. Rd2 Qc8 16. Nc5 Bh3 17. Bf3 Bg4 18. Bg2 Bh3 19. Bf3 Bg4
20. Bh1 h5 21. b4 a6 22. Rc1 h4 23. a4 hxg3 24. hxg3 Qc7 25. b5 axb5
26. axb5 Re3!! {Initiating a breathtaking tactical cascade across the entire board.}
27. Nf3 cxb5 28. Qxb5 Nc3 29. Qxb7 Qxb7 30. Nxb7 Nxe2+ 31. Kh2 Ne4
32. Rc4 Nxf2 33. Bg2 Be6 34. Rcc2 Ng4+ 35. Kh3 Ne5+ 36. Kh2 Rxf3
37. Rxe2 Ng4+ 38. Kh3 Ne3+ 39. Kh2 Nxc2 40. Bxf3 Nd4 0-1`,
  },
  {
    id: 'saemisch-nimzowitsch-1923',
    title: 'The Immortal Zugzwang Game',
    subtitle: 'Saemisch vs. Nimzowitsch · Copenhagen 1923',
    white: 'Friedrich Saemisch',
    black: 'Aron Nimzowitsch',
    event: 'Copenhagen International',
    year: 1923,
    result: '0-1',
    eco: 'E18',
    opening: "Queen's Indian Defense",
    theme: 'Instructional',
    keyMove: '25... h6!!',
    description:
      'A classic lesson in total piece paralysis: after sacrificing a piece to trap White’s army, Nimzowitsch played the quiet waiting move 25...h6!!—leaving White with not a single safe move on the board.',
    pgn: `[Event "Copenhagen International"]
[Site "Copenhagen DEN"]
[Date "1923.03.09"]
[Round "6"]
[White "Friedrich Saemisch"]
[Black "Aron Nimzowitsch"]
[Result "0-1"]
[ECO "E18"]
[Opening "Queen's Indian Defense"]

1. d4 Nf6 2. c4 e6 3. Nf3 b6 4. g3 Bb7 5. Bg2 Be7 6. Nc3 O-O 7. O-O d5
8. Ne5 c6 9. cxd5 cxd5 10. Bf4 a6 11. Rc1 b5 12. Qb3 Nc6 13. Nxc6 Bxc6
14. h3 Qd7 15. Kh2 Nh5 16. Bd2 f5 17. Qd1 b4 18. Nb1 Bb5 19. Rg1 Bd6
20. e4 fxe4 21. Qxh5 Rxf2 22. Qg4 Raf8 23. Be3 Rxb2 24. Nd2 Rxa2 25. Kh1
h6!! {Pure middlegame zugzwang—every single white piece is paralyzed and any move loses material on the spot.} 0-1`,
  },
  {
    id: 'capablanca-marshall-1918',
    title: 'Birth of the Marshall Attack',
    subtitle: 'Capablanca vs. Marshall · New York 1918',
    white: 'Jose Raul Capablanca',
    black: 'Frank Marshall',
    event: 'Manhattan Chess Club Masters',
    year: 1918,
    result: '1-0',
    eco: 'C89',
    opening: 'Ruy Lopez · Marshall Attack',
    theme: 'Instructional',
    keyMove: '8... d5!',
    description:
      'Frank Marshall kept the ferocious 8...d5! pawn sacrifice secret for a decade to spring on Capablanca—who calmly absorbed the entire attack over the board and won a classic defensive masterclass.',
    pgn: `[Event "Manhattan Chess Club Masters"]
[Site "New York, NY USA"]
[Date "1918.10.23"]
[Round "1"]
[White "Jose Raul Capablanca"]
[Black "Frank Marshall"]
[Result "1-0"]
[ECO "C89"]
[Opening "Ruy Lopez, Marshall Attack"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O
8. c3 d5! {Unveiling the Marshall Attack for the first time in master play.}
9. exd5 Nxd5 10. Nxe5 Nxe5 11. Rxe5 Nf6 12. Re1 Bd6 13. h3 Ng4 14. Qf3 Qh4
15. d4 Nxf2 16. Re2! {Cool-headed defense—Capablanca refuses to panic and prepares to return material at the right moment.}
Bg4 17. hxg4 Bh2+ 18. Kf1 Bg3 19. Rxf2 Qh1+ 20. Ke2 Bxf2 21. Bd2 Bh4
22. Qh3 Rae8+ 23. Kd3 Qf1+ 24. Kc2 Bf2 25. Qf3 Qg1 26. Bd5 c5 27. dxc5 Bxc5
28. b4 Bd6 29. a4 a5 30. axb5 axb4 31. Ra6 bxc3 32. Nxc3 Bb4 33. b6 Bxc3
34. Bxc3 h6 35. b7 Re3 36. Bxf7+ 1-0`,
  },
  {
    id: 'elasker-thomas-1912',
    title: 'The King Walk Checkmate',
    subtitle: 'Edward Lasker vs. George Thomas · London 1912',
    white: 'Edward Lasker',
    black: 'Sir George Alan Thomas',
    event: 'City of London Chess Club',
    year: 1912,
    result: '1-0',
    eco: 'A40',
    opening: 'Dutch Defense',
    theme: 'Instructional',
    keyMove: '11. Qxh7+!!',
    description:
      'One of the most unforgettable mating patterns ever played: Edward Lasker sacrifices his queen on h7 and marches the Black king across all eight ranks from g8 to g1 before delivering 18.Kd2#.',
    pgn: `[Event "City of London Chess Club"]
[Site "London ENG"]
[Date "1912.10.29"]
[Round "1"]
[White "Edward Lasker"]
[Black "Sir George Alan Thomas"]
[Result "1-0"]
[ECO "A40"]
[Opening "Dutch Defense"]

1. d4 e6 2. Nf3 f5 3. Nc3 Nf6 4. Bg5 Be7 5. Bxf6 Bxf6 6. e4 fxe4 7. Nxe4 b6
8. Ne5 O-O 9. Bd3 Bb7 10. Qh5 Qe7
11. Qxh7+!! {Beginning an 8-move forced king walk from one end of the board to the other!}
Kxh7 12. Nxf6+ Kh6 13. Neg4+ Kg5 14. h4+ Kf4 15. g3+ Kf3 16. Be2+ Kg2
17. Rh2+ Kg1 18. Kd2# {Checkmate with a king move—discovered check from the a1 rook!} 1-0`,
  },
  {
    id: 'reti-tartakower-1910',
    title: 'Réti’s 11-Move Double-Check Mate',
    subtitle: 'Reti vs. Tartakower · Vienna 1910',
    white: 'Richard Reti',
    black: 'Savielly Tartakower',
    event: 'Vienna Casual Game',
    year: 1910,
    result: '1-0',
    eco: 'B15',
    opening: 'Caro-Kann Defense',
    theme: 'Instructional',
    keyMove: '9. Qd8+!!',
    description:
      'Every improving player learns this 11-move tactical gem: Richard Réti sacrifices his queen on d8 to lure the Black king into a devastating discovered double-check checkmate.',
    pgn: `[Event "Vienna Casual Game"]
[Site "Vienna AUT"]
[Date "1910.05.01"]
[Round "1"]
[White "Richard Reti"]
[Black "Savielly Tartakower"]
[Result "1-0"]
[ECO "B15"]
[Opening "Caro-Kann Defense"]

1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5
8. O-O-O Nxe4? {Falling straight into one of chess history's sharpest tactical traps.}
9. Qd8+!! {Deflecting the king into a lethal bishop-and-rook double check.}
Kxd8 10. Bg5+ Kc7 11. Bd8# 1-0`,
  },
  {
    id: 'rubinstein-lasker-1909',
    title: 'Rubinstein’s Endgame Precision vs. Lasker',
    subtitle: 'Rubinstein vs. Emanuel Lasker · St. Petersburg 1909',
    white: 'Akiba Rubinstein',
    black: 'Emanuel Lasker',
    event: 'St. Petersburg International',
    year: 1909,
    result: '1-0',
    eco: 'D32',
    opening: "Queen's Gambit Declined · Tarrasch",
    theme: 'Endgame',
    keyMove: '16. Rc1!',
    description:
      'Akiba Rubinstein defeats reigning World Champion Emanuel Lasker with a crystal-clear tactical transition into a winning rook endgame, concluding with the quiet zugzwang stroke 40.a3!.',
    pgn: `[Event "St. Petersburg International"]
[Site "St. Petersburg RUS"]
[Date "1909.02.18"]
[Round "3"]
[White "Akiba Rubinstein"]
[Black "Emanuel Lasker"]
[Result "1-0"]
[ECO "D32"]
[Opening "Queen's Gambit Declined"]

1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Bg5 c5 5. cxd5 exd5 6. Nc3 cxd4 7. Nxd4 Nc6
8. e3 Be7 9. Bb5 Bd7 10. Bxf6 Bxf6 11. Nxd5 Bxd4 12. exd4 Qg5 13. Bxc6 Bxc6
14. Ne3 O-O-O 15. O-O Rhe8 16. Rc1! {Inviting a dazzling simplification that leaves White an extra pawn in a textbook rook ending.}
Rxe3 17. Rxc6+ bxc6 18. Qc1 Rxd4 19. fxe3 Rd7 20. Qxc6+ Kd8 21. Rf4 f5
22. Qc5 Qe7 23. Qxe7+ Kxe7 24. Rxf5 Rd1+ 25. Kf2 Rd2+ 26. Kf3 Rxb2 27. Ra5 Rb7
28. Ra6 Kf8 29. e4 Rc7 30. h4 Kf7 31. g4 Kf8 32. Kf4 Ke7 33. h5 h6
34. Kf5 Kf7 35. e5 Rb7 36. Rd6 Ke7 37. Ra6 Kf7 38. Rd6 Kf8 39. Rc6 Kf7
40. a3! {Classic triangulation and zugzwang—forcing Black's king away from the winning e-pawn.} 1-0`,
  },
  {
    id: 'rotlewi-rubinstein-1907',
    title: 'Rubinstein’s Immortal',
    subtitle: 'Rotlewi vs. Rubinstein · Lodz 1907',
    white: 'Georg Rotlewi',
    black: 'Akiba Rubinstein',
    event: 'Lodz Tournament',
    year: 1907,
    result: '0-1',
    eco: 'D32',
    opening: 'Tarrasch Defense · Symmetrical',
    theme: 'Sacrifice',
    keyMove: '22... Rxc3!!',
    description:
      'One of the purest masterpieces of piece coordination ever played: Akiba Rubinstein aims both bishops and rooks at the White king and crashes through with the iconic sacrifice 22...Rxc3!!.',
    pgn: `[Event "Lodz Tournament"]
[Site "Lodz POL"]
[Date "1907.12.26"]
[Round "6"]
[White "Georg Rotlewi"]
[Black "Akiba Rubinstein"]
[Result "0-1"]
[ECO "D32"]
[Opening "Tarrasch Defense"]

1. d4 d5 2. Nf3 e6 3. e3 c5 4. c4 Nc6 5. Nc3 Nf6 6. dxc5 Bxc5 7. a3 a6
8. b4 Bd6 9. Bb2 O-O 10. Qd2 Qe7 11. Bd3 dxc4 12. Bxc4 b5 13. Bd3 Rd8
14. Qe2 Bb7 15. O-O Ne5 16. Nxe5 Bxe5 17. f4 Bc7 18. e4 Rac8 19. e5 Bb6+
20. Kh1 Ng4 21. Be4 Qh4 22. g3 Rxc3!! {Eliminating the defender of the e4 bishop and opening the long diagonal for forced mate.}
23. Bxc3 Bxe4+ 24. Qxe4 Qxh2# 0-1`,
  },
  {
    id: 'lasker-bauer-1889',
    title: 'The Original Double Bishop Sacrifice',
    subtitle: 'Emanuel Lasker vs. Johann Bauer · Amsterdam 1889',
    white: 'Emanuel Lasker',
    black: 'Johann Bauer',
    event: 'Amsterdam International',
    year: 1889,
    result: '1-0',
    eco: 'A03',
    opening: "Bird's Opening",
    theme: 'Instructional',
    keyMove: '15. Bxh7+!!',
    description:
      'The blueprint for the classic Double Bishop Sacrifice every chess student must master: Emanuel Lasker demolishes Black’s castled king with 15.Bxh7+! and 17.Bxg7!, followed by a decisive rook lift.',
    pgn: `[Event "Amsterdam International"]
[Site "Amsterdam NED"]
[Date "1889.08.26"]
[Round "1"]
[White "Emanuel Lasker"]
[Black "Johann Bauer"]
[Result "1-0"]
[ECO "A03"]
[Opening "Bird's Opening"]

1. f4 d5 2. e3 Nf6 3. b3 e6 4. Bb2 Be7 5. Bd3 b6 6. Nf3 Bb7 7. Nc3 Nbd7
8. O-O O-O 9. Ne2 c5 10. Ng3 Qc7 11. Ne5 Nxe5 12. Bxe5 Qc6 13. Qe2 a6
14. Nh5 Nxh5 15. Bxh7+!! {First bishop sacrifice—ripping away the h7 shelter.}
Kxh7 16. Qxh5+ Kg8 17. Bxg7!! {Second bishop sacrifice—exposing the king to a lethal rook lift.}
Kxg7 18. Qg4+ Kh7 19. Rf3 e5 20. Rh3+ Qh6 21. Rxh6+ Kxh6 22. Qd7! {Forking both bishops to emerge decisively ahead in material.}
Bf6 23. Qxb7 Kg7 24. Rf1 Rab8 25. Qd7 Rfd8 26. Qg4+ Kf8 27. fxe5 Bg7
28. e6 Rb7 29. Qg6 f6 30. Rxf6+ Bxf6 31. Qxf6+ Ke8 32. Qh8+ Ke7
33. Qg7+ Kxe6 34. Qxb7 Rd6 35. Qxa6 d4 36. exd4 cxd4 37. h4 d3 38. Qxd3 1-0`,
  },
  {
    id: 'paulsen-morphy-1857',
    title: 'Morphy’s Queen Sacrifice',
    subtitle: 'Paulsen vs. Morphy · New York 1857',
    white: 'Louis Paulsen',
    black: 'Paul Morphy',
    event: '1st American Chess Congress',
    year: 1857,
    result: '0-1',
    eco: 'C48',
    opening: 'Four Knights Game',
    theme: 'Sacrifice',
    keyMove: '17... Qxf3!!',
    description:
      'At the First American Chess Congress, Paul Morphy punished slow development with the electrifying queen sacrifice 17...Qxf3!!, tearing open the g-file for a ruthless rook-and-bishop mating attack.',
    pgn: `[Event "1st American Chess Congress"]
[Site "New York, NY USA"]
[Date "1857.11.08"]
[Round "6"]
[White "Louis Paulsen"]
[Black "Paul Morphy"]
[Result "0-1"]
[ECO "C48"]
[Opening "Four Knights Game"]

1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Bb5 Bc5 5. O-O O-O 6. Nxe5 Re8 7. Nxc6 dxc6
8. Bc4 b5 9. Be2 Nxe4 10. Nxe4 Rxe4 11. Bf3 Re6 12. c3 Qd3 13. b4 Bb6
14. a4 bxa4 15. Qxa4 Bd7 16. Ra2 Rae8 17. Qa6 Qxf3!! {A stunning queen sacrifice exposing White's king to Black's coordinated rooks and bishops.}
18. gxf3 Rg6+ 19. Kh1 Bh3 20. Rd1 Bg2+ 21. Kg1 Bxf3+ 22. Kf1 Bg2+
23. Kg1 Bh3+ 24. Kh1 Bxf2 25. Qf1 Bxf1 26. Rxf1 Re2 27. Ra1 Rg5
28. d4 Be3 29. Bxe3 Rgg2 30. Bf4 Rxh2+ 31. Bxh2 Rxh2+ 0-1`,
  },
];
