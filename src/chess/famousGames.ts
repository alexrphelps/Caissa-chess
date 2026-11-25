import { FamousGameEntry, FamousGameEra, ParsedPgnGame } from './pgnTypes';
import { parseSinglePgnGame } from './pgnParser';
import { MODERN_MASTERPIECES } from './games/modernMasterpieces';
import { INSTRUCTIONAL_CLASSICS } from './games/instructionalClassics';

const CORE_LANDMARK_GAMES: FamousGameEntry[] = [
  {
    id: 'carlsen-topalov-nanjing-2009',
    title: 'Carlsen vs. Topalov',
    subtitle: 'Nanjing Pearl Spring 2009 · Rd 2',
    white: 'Magnus Carlsen',
    black: 'Veselin Topalov',
    event: 'Pearl Spring Nanjing',
    year: 2009,
    result: '1-0',
    eco: 'E97',
    opening: "King's Indian Defense",
    theme: 'Positional',
    keyMove: '30. h5!',
    description:
      'From Carlsen’s historic 3002-TPR triumph in Nanjing, showcasing patient prophylaxis against the King’s Indian followed by the crushing positional squeeze 30.h5!.',
    pgn: `[Event "Pearl Spring Nanjing"]
[Site "Nanjing CHN"]
[Date "2009.09.29"]
[Round "2"]
[White "Magnus Carlsen"]
[Black "Veselin Topalov"]
[Result "1-0"]
[WhiteElo "2772"]
[BlackElo "2813"]
[ECO "E97"]
[Opening "King's Indian Defense"]

1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7
9. b4 Nh5 10. Re1 a5 11. bxa5 Rxa5 12. Nd2 Nf4 13. Bf1 c5 14. a4 Ra6 15. Ra3 g5
16. g3 Nh3+ 17. Bxh3 Bxh3 18. Qh5 Qd7 19. f3 h6 20. g4 f5 21. Qxh3 fxg4 22. Qxg4 Qxg4+
23. fxg4 Ng6 24. Nb5 Rf7 25. Nf1 Bf8 26. Ng3 Nh4 27. Nf5 Nxf5 28. exf5 Be7 29. h4 Bf6
30. h5! {Fixes Black's kingside structure permanently and secures an unassailable grip on the dark squares.}
Kf8 31. Re4 Ke7 32. Kf2 Kd7 33. Ke2 Ra8 34. a5 Ra6 35. Bd2 Rf8 36. Kd1 Rfa8
37. Kc2 Bd8 38. Kb3 Bxa5 39. Rxa5 Rxa5 40. Bxa5 Rxa5 41. Re1 Ra8 42. Kb2 Rf8
43. Ra1 e4 44. Kc3 Rf7 45. Kd2 1-0`,
  },
  {
    id: 'carlsen-leko-nanjing-2009',
    title: 'Carlsen vs. Leko',
    subtitle: 'Nanjing Pearl Spring 2009 · Rd 1',
    white: 'Magnus Carlsen',
    black: 'Peter Leko',
    event: 'Pearl Spring Nanjing',
    year: 2009,
    result: '1-0',
    eco: 'C45',
    opening: 'Scotch Game · Mieses Variation',
    theme: 'Positional',
    keyMove: '10. f4!',
    description:
      'Carlsen opened his dominant Nanjing run with the Kasparov-inspired Scotch pawn sacrifice 10.f4, seizing the open files and overwhelming Leko on both wings.',
    pgn: `[Event "Pearl Spring Nanjing"]
[Site "Nanjing CHN"]
[Date "2009.09.28"]
[Round "1"]
[White "Magnus Carlsen"]
[Black "Peter Leko"]
[Result "1-0"]
[WhiteElo "2772"]
[BlackElo "2762"]
[ECO "C45"]
[Opening "Scotch Game"]

1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6 5. Nxc6 bxc6 6. e5 Qe7 7. Qe2 Nd5
8. c4 Ba6 9. b3 g6 10. f4! {A sharp Kasparov-inspired space grab that fights for long-term kingside and central initiative.}
Bg7 11. Qf2 Nb6 12. Be2 O-O 13. O-O f6 14. Ba3 d6 15. exd6 cxd6 16. Nc3 f5
17. Rac1 Rad8 18. Rfd1 Bb7 19. Bf3 c5 20. Bxb7 Qxb7 21. Bb2 Rd7 22. Rd3 Rfd8
23. Rcd1 Qc6 24. h3 Nc8 25. Nd5 Bxb2 26. Qxb2 Rf7 27. Re1 Rdf8 28. Rde3 Qd7
29. Kh2 a5 30. Re6 a4 31. bxa4 Qxa4 32. Qe2 Qa7 33. Re3 Qd7 34. Re6 Qa7
35. h4 Qd7 36. h5 Rg7 37. hxg6 hxg6 38. Re3 Qd8 39. Rh3 Kf7 40. Qb2 Rfg8
41. Qf6+ Qxf6 42. Nxf6 Rd8 43. Nd5 Rgg8 44. Rh7+ Rg7 45. Re7+ Nxe7 46. Rxg7+ 1-0`,
  },
  {
    id: 'anderssen-kieseritzky-1851',
    title: 'The Immortal Game',
    subtitle: 'Anderssen vs. Kieseritzky · London 1851',
    white: 'Adolf Anderssen',
    black: 'Lionel Kieseritzky',
    event: 'London Casual Match',
    year: 1851,
    result: '1-0',
    eco: 'C33',
    opening: "King's Gambit Accepted",
    theme: 'Sacrifice',
    keyMove: '22. Qf6+!!',
    description:
      'The crown jewel of Romantic-era chess: Anderssen sacrifices a bishop, both rooks, and finally his queen to weave a pure minor-piece checkmate in the center of the board.',
    pgn: `[Event "London Casual Game (The Immortal Game)"]
[Site "London ENG"]
[Date "1851.06.21"]
[Round "?"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]
[ECO "C33"]
[Opening "King's Gambit Accepted"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5
8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8
15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6!! {Leaving both rooks en prise to lock the Black king into a mating net.}
Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+!! {The decisive queen sacrifice clearing e7 for the bishop.}
Nxf6 23. Be7# 1-0`,
  },
  {
    id: 'morphy-consultants-1858',
    title: 'The Opera Game',
    subtitle: 'Morphy vs. Duke Karl & Count Isouard · Paris 1858',
    white: 'Paul Morphy',
    black: 'Duke Karl / Count Isouard',
    event: 'Paris Opera House',
    year: 1858,
    result: '1-0',
    eco: 'C41',
    opening: 'Philidor Defense',
    theme: 'Attack',
    keyMove: '16. Qb8+!!',
    description:
      'Played in a private box at the Paris Opera, Morphy delivers a timeless masterclass in rapid piece development, central pins, and open-file tactics culminating in a classic queen sacrifice.',
    pgn: `[Event "Paris Opera Box (The Opera Game)"]
[Site "Paris FRA"]
[Date "1858.11.02"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[ECO "C41"]
[Opening "Philidor Defense"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5! {Breaking open the queenside while Black's king is stranded in the center.}
cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7! Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7
16. Qb8+!! {Deflecting the d7 knight to unleash a back-rank checkmate.}
Nxb8 17. Rd8# 1-0`,
  },
  {
    id: 'byrne-fischer-1956',
    title: 'The Game of the Century',
    subtitle: 'Byrne vs. Bobby Fischer · New York 1956',
    white: 'Donald Byrne',
    black: 'Bobby Fischer',
    event: 'Rosenwald Memorial',
    year: 1956,
    result: '0-1',
    eco: 'D92',
    opening: 'Grünfeld Defense',
    theme: 'Sacrifice',
    keyMove: '17... Be6!!',
    description:
      'Thirteen-year-old Bobby Fischer stunned the chess world with 11...Na4! and the thunderbolt queen sacrifice 17...Be6!!, unleashing a devastating windmill and forced checkmate.',
    pgn: `[Event "Third Rosenwald Trophy"]
[Site "New York, NY USA"]
[Date "1956.10.17"]
[Round "8"]
[White "Donald Byrne"]
[Black "Bobby Fischer"]
[Result "0-1"]
[ECO "D92"]
[Opening "Grunfeld Defense"]

1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6
8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4! {An extraordinary counter-attack ignoring the hanging e7 pawn.}
12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6!! {The iconic queen sacrifice—Black's pieces swarm White's exposed king.}
18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ 21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6
24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8
30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+
36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2# 0-1`,
  },
  {
    id: 'kasparov-topalov-1999',
    title: "Kasparov's Immortal",
    subtitle: 'Kasparov vs. Topalov · Wijk aan Zee 1999',
    white: 'Garry Kasparov',
    black: 'Veselin Topalov',
    event: 'Hoogovens Wijk aan Zee',
    year: 1999,
    result: '1-0',
    eco: 'B07',
    opening: 'Pirc Defense',
    theme: 'Sacrifice',
    keyMove: '24. Rxd4!!',
    description:
      'One of the deepest tactical combinations ever played over the board: Kasparov sacrifices both rooks starting with 24.Rxd4!! to march Topalov’s king all the way from b8 to d1.',
    pgn: `[Event "Hoogovens Group A"]
[Site "Wijk aan Zee NED"]
[Date "1999.01.20"]
[Round "4"]
[White "Garry Kasparov"]
[Black "Veselin Topalov"]
[Result "1-0"]
[WhiteElo "2812"]
[BlackElo "2700"]
[ECO "B07"]
[Opening "Pirc Defense"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7
8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O
14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5
20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4!! {A stunning rook sacrifice calculating a king hunt over 15 moves deep.}
cxd4 25. Re7+! Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7
30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2
35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3
41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`,
  },
  {
    id: 'karpov-kasparov-1985-g16',
    title: 'The Octopus Knight',
    subtitle: 'Karpov vs. Kasparov · Moscow 1985 WCh G16',
    white: 'Anatoly Karpov',
    black: 'Garry Kasparov',
    event: 'World Chess Championship',
    year: 1985,
    result: '0-1',
    eco: 'B44',
    opening: 'Sicilian Defense · Taimanov',
    theme: 'World Championship',
    keyMove: '16... Nd3!',
    description:
      'Kasparov sacrifices a central pawn with 8...d5! to plant an untouchable "octopus" knight on d3, paralyzing Karpov’s entire army before breaking through on the kingside.',
    pgn: `[Event "World Chess Championship"]
[Site "Moscow URS"]
[Date "1985.10.15"]
[Round "16"]
[White "Anatoly Karpov"]
[Black "Garry Kasparov"]
[Result "0-1"]
[WhiteElo "2720"]
[BlackElo "2700"]
[ECO "B44"]
[Opening "Sicilian Defense"]

1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nc6 5. Nb5 d6 6. c4 Nf6 7. N1c3 a6
8. Na3 d5! {A bold pawn gambit that transforms the position into an open struggle for dark-square outposts.}
9. cxd5 exd5 10. exd5 Nb4 11. Be2 Bc5 12. O-O O-O 13. Bf3 Bf5 14. Bg5 Re8
15. Qd2 b5 16. Rad1 Nd3! {The legendary Octopus Knight on d3, controlling eight vital squares in White's camp.}
17. Nab1 h6 18. Bh4 b4 19. Na4 Bd6 20. Bg3 Rc8 21. b3 g5 22. Bxd6 Qxd6
23. g3 Nd7 24. Bg2 Qf6 25. a3 a5 26. axb4 axb4 27. Qa2 Bg6 28. d6 g4
29. Qd2 Kg7 30. f3 Qxd6 31. fxg4 Qd4+ 32. Kh1 Nf6 33. Rf4 Ne4 34. Qxd3 Nf2+
35. Rxf2 Bxd3 36. Rfd2 Qe3 37. Rxd3 Rc1 38. Nb2 Qf2 39. Nd2 Rxd1+ 40. Nxd1 Re1+ 0-1`,
  },
  {
    id: 'botvinnik-tal-1960-g6',
    title: 'Tal’s Speculative Sacrifice',
    subtitle: 'Botvinnik vs. Tal · Moscow 1960 WCh G6',
    white: 'Mikhail Botvinnik',
    black: 'Mikhail Tal',
    event: 'World Chess Championship',
    year: 1960,
    result: '0-1',
    eco: 'E69',
    opening: "King's Indian · Fianchetto",
    theme: 'World Championship',
    keyMove: '21... Nf4!',
    description:
      'Mikhail Tal unleashes the audacious intuitive sacrifice 21...Nf4! against World Champion Botvinnik, trading a piece for chaos on the dark squares and a crushing passed e-pawn.',
    pgn: `[Event "World Chess Championship"]
[Site "Moscow URS"]
[Date "1960.03.26"]
[Round "6"]
[White "Mikhail Botvinnik"]
[Black "Mikhail Tal"]
[Result "0-1"]
[ECO "E69"]
[Opening "King's Indian Defense"]

1. c4 Nf6 2. Nf3 g6 3. g3 Bg7 4. Bg2 O-O 5. d4 d6 6. Nc3 Nbd7 7. O-O e5
8. e4 c6 9. h3 Qb6 10. d5 cxd5 11. cxd5 Nc5 12. Ne1 Bd7 13. Nd3 Nxd3
14. Qxd3 Rfc8 15. Rb1 Nh5 16. Be3 Qb4 17. Qe2 Rc4 18. Rfc1 Rac8 19. Kh2 f5
20. exf5 Bxf5 21. Ra1 Nf4! {Tal's iconic intuitive knight sacrifice—ripping open the e-file and lighting the board on fire.}
22. gxf4 exf4 23. Bd2 Qxb2 24. Rab1 f3! 25. Rxb2 fxe2 26. Rb3 Rd4 27. Be1 Be5+
28. Kg1 Bf4 29. Nxe2 Rxc1 30. Nxd4 Rxe1+ 31. Bf1 Be4 32. Ne2 Be5 33. f4 Bf6
34. Rxb7 Bxd5 35. Rc7 Bxa2 36. Rxa7 Bc4 37. Ra8+ Kf7 38. Ra7+ Ke6 39. Ra3 d5
40. Kf2 Bh4+ 41. Kg2 Kd6 42. Ng3 Bxg3 43. Bxc4 dxc4 44. Kxg3 Kd5 45. Ra7 c3
46. Rd7+ Kc4 0-1`,
  },
  {
    id: 'deep-blue-kasparov-1997-g6',
    title: 'Deep Blue vs. Kasparov',
    subtitle: 'New York 1997 · Decisive Game 6',
    white: 'Deep Blue',
    black: 'Garry Kasparov',
    event: 'IBM Man vs. Machine Rematch',
    year: 1997,
    result: '1-0',
    eco: 'B17',
    opening: 'Caro-Kann Defense · Steinitz',
    theme: 'Attack',
    keyMove: '8. Nxe6!',
    description:
      'In the historic deciding game of the 1997 match, Deep Blue punished Kasparov’s risky Caro-Kann setup with the shattering theoretical sacrifice 8.Nxe6!, winning in just 19 moves.',
    pgn: `[Event "IBM Man vs. Machine Match"]
[Site "New York, NY USA"]
[Date "1997.05.11"]
[Round "6"]
[White "Deep Blue"]
[Black "Garry Kasparov"]
[Result "1-0"]
[BlackElo "2795"]
[ECO "B17"]
[Opening "Caro-Kann Defense"]

1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nd7 5. Ng5 Ngf6 6. Bd3 e6 7. N1f3 h6
8. Nxe6! {Punishing 7...h6 instantly—Black's king is dragged out of castling safety and crushed on the dark squares.}
Qe7 9. O-O fxe6 10. Bg6+ Kd8 11. Bf4 b5 12. a4 Bb7 13. Re1 Nd5 14. Bg3 Kc8
15. axb5 cxb5 16. Qd3 Bc6 17. Bf5 exf5 18. Rxe7 Bxe7 19. c4 1-0`,
  },
  {
    id: 'capablanca-tartakower-1924',
    title: 'Capablanca’s Rook Endgame',
    subtitle: 'Capablanca vs. Tartakower · New York 1924',
    white: 'Jose Raul Capablanca',
    black: 'Savielly Tartakower',
    event: 'New York International',
    year: 1924,
    result: '1-0',
    eco: 'A84',
    opening: 'Dutch Defense',
    theme: 'Endgame',
    keyMove: '35. Kg3!!',
    description:
      'The ultimate textbook demonstration of rook endgame king activity: Capablanca calmly sacrifices two pawns to march his king to f6 and escort his passed g-pawn home.',
    pgn: `[Event "New York International"]
[Site "New York, NY USA"]
[Date "1924.03.23"]
[Round "5"]
[White "Jose Raul Capablanca"]
[Black "Savielly Tartakower"]
[Result "1-0"]
[ECO "A84"]
[Opening "Dutch Defense"]

1. d4 f5 2. Nf3 e6 3. c4 Nf6 4. Bg5 Be7 5. Nc3 O-O 6. e3 b6 7. Bd3 Bb7
8. O-O Qe8 9. Qe2 Ne4 10. Bxe7 Nxc3 11. bxc3 Qxe7 12. a4 Bxf3 13. Qxf3 Nc6
14. Rfb1 Rae8 15. Qh3 Rf6 16. f4 Na5 17. Qf3 d6 18. Re1 Qd7 19. e4 fxe4
20. Qxe4 g6 21. g3 Kf8 22. Kg2 Rf7 23. h4 d5 24. cxd5 exd5 25. Qxe8+ Qxe8
26. Rxe8+ Kxe8 27. h5 Rf6 28. hxg6 hxg6 29. Rh1 Kf8 30. Rh7 Rc6 31. g4 Nc4
32. g5 Ne3+ 33. Kf3 Nf5 34. Bxf5 gxf5 35. Kg3!! {Ignoring the c3 pawn completely to invade via h4-g5-f6.}
Rxc3+ 36. Kh4 Rf3 37. g6 Rxf4+ 38. Kg5 Re4 39. Kf6 Kg8 40. Rg7+ Kh8
41. Rxc7 Re8 42. Kxf5 Re4 43. Kf6 Rf4+ 44. Ke5 Rg4 45. g7+ Kg8 46. Rxa7 Rg1
47. Kxd5 Rc1 48. Kd6 Rc2 49. d5 Rc1 50. Rc7 Ra1 51. Kc6 Rxa4 52. d6 1-0`,
  },
  {
    id: 'fischer-spassky-1972-g6',
    title: 'Fischer’s Queen’s Gambit Masterpiece',
    subtitle: 'Fischer vs. Spassky · Reykjavik 1972 WCh G6',
    white: 'Bobby Fischer',
    black: 'Boris Spassky',
    event: 'World Chess Championship',
    year: 1972,
    result: '1-0',
    eco: 'D59',
    opening: "Queen's Gambit Declined · Tartakower",
    theme: 'World Championship',
    keyMove: '20. e4!',
    description:
      'Surprising the world by opening 1.c4 instead of 1.e4, Fischer crafted a symphony of central control and kingside attack so pure that Spassky joined the audience in applauding.',
    pgn: `[Event "World Chess Championship"]
[Site "Reykjavik ISL"]
[Date "1972.07.23"]
[Round "6"]
[White "Bobby Fischer"]
[Black "Boris Spassky"]
[Result "1-0"]
[WhiteElo "2785"]
[BlackElo "2660"]
[ECO "D59"]
[Opening "Queen's Gambit Declined"]

1. c4 e6 2. Nf3 d5 3. d4 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6 7. Bh4 b6
8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 12. Qa4 c5 13. Qa3 Rc8
14. Bb5 a6 15. dxc5 bxc5 16. O-O Ra7 17. Be2 Nd7 18. Nd4 Qf8 19. Nxe6 fxe6
20. e4! {Shattering Black's hanging pawns and launching an unstoppable initiative against Black's king.}
d4 21. f4 Qe7 22. e5 Rb8 23. Bc4 Kh8 24. Qh3 Nf8 25. b3 a5 26. f5 exf5
27. Rxf5 Nh7 28. Rcf1 Qd8 29. Qg3 Re7 30. h4 Rbb7 31. e6 Rbc7 32. Qe5 Qe8
33. a4 Qd8 34. R1f2 Qe8 35. R2f3 Qd8 36. Bd3 Qe8 37. Qe4 Nf6 38. Rxf6 gxf6
39. Rxf6 Kg8 40. Bc4 Kh8 41. Qf4 1-0`,
  },
  {
    id: 'anderssen-dufresne-1852',
    title: 'The Evergreen Game',
    subtitle: 'Anderssen vs. Dufresne · Berlin 1852',
    white: 'Adolf Anderssen',
    black: 'Jean Dufresne',
    event: 'Berlin Casual Game',
    year: 1852,
    result: '1-0',
    eco: 'C52',
    opening: 'Evans Gambit',
    theme: 'Sacrifice',
    keyMove: '19. Rad1!!',
    description:
      'Wilhelm Steinitz dubbed this game "evergreen in the laurel wreath of the German chess masters"—highlighted by the quiet killer 19.Rad1!! followed by a dazzling queen sacrifice.',
    pgn: `[Event "Berlin Casual Game (The Evergreen Game)"]
[Site "Berlin GER"]
[Date "1852.??.??"]
[Round "?"]
[White "Adolf Anderssen"]
[Black "Jean Dufresne"]
[Result "1-0"]
[ECO "C52"]
[Opening "Evans Gambit"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3
8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6
14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1!! {Calmly pinning the d7 square while ignoring Black's threat on g2.}
Qxf3 20. Rxe7+ Nxe7 21. Qxd7+!! Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0`,
  },
];

/**
 * Full offline Master Games Library (52 curated games across Modern 2010–2024,
 * Classic 1950–2009, and Golden Age 1851–1949 eras).
 */
export const FAMOUS_GAMES_LIBRARY: FamousGameEntry[] = [
  ...CORE_LANDMARK_GAMES,
  ...MODERN_MASTERPIECES,
  ...INSTRUCTIONAL_CLASSICS,
];

export function getGameEra(year: number): FamousGameEra {
  if (year >= 2010) return 'Modern (2010–2024)';
  if (year >= 1950) return 'Classic (1950–2009)';
  return 'Early (1851–1949)';
}

/**
 * Parses a famous game library entry into a ready-to-play `ParsedPgnGame`
 * with full pre-computed board timeline.
 */
export function loadFamousGameById(id: string): ParsedPgnGame | null {
  const entry = FAMOUS_GAMES_LIBRARY.find((g) => g.id === id);
  if (!entry) return null;
  return parseFamousGameEntry(entry);
}

export function parseFamousGameEntry(entry: FamousGameEntry): ParsedPgnGame {
  return parseSinglePgnGame(entry.pgn, {
    id: entry.id,
    description: entry.description,
    theme: entry.theme,
  });
}
