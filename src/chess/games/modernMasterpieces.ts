import { FamousGameEntry } from '../pgnTypes';

export const MODERN_MASTERPIECES: FamousGameEntry[] = [
  {
    id: 'gukesh-ding-2024-g11',
    title: 'Gukesh Strikes in Singapore',
    subtitle: 'Gukesh D vs. Ding Liren · Singapore 2024 WCh G11',
    white: 'Gukesh Dommaraju',
    black: 'Ding Liren',
    event: 'FIDE World Chess Championship',
    year: 2024,
    result: '1-0',
    eco: 'A09',
    opening: 'Réti Opening · Reversed Blumenfeld',
    theme: 'World Championship',
    keyMove: '29. Qxc6!',
    description:
      'Eighteen-year-old Gukesh seized the lead in the 2024 World Championship after an ultra-creative queenside pawn storm, punishing Ding’s time-trouble slip with the instant tactic 29.Qxc6!.',
    pgn: `[Event "FIDE World Chess Championship"]
[Site "Singapore SGP"]
[Date "2024.12.08"]
[Round "11"]
[White "Gukesh Dommaraju"]
[Black "Ding Liren"]
[Result "1-0"]
[WhiteElo "2783"]
[BlackElo "2728"]
[ECO "A09"]
[Opening "Reti Opening"]

1. Nf3 d5 2. c4 d4 3. b4 c5 4. e3 Nf6 5. a3 Bg4 6. exd4 cxd4 7. h3 Bxf3
8. Qxf3 Qc7 9. d3 a5 10. b5 Nbd7 11. g3 Nc5 12. Bg2 Nfd7 13. O-O Ne5
14. Qf4 Rd8 15. Rd1 g6 16. a4 h5 17. b6! {A bold queenside space sacrifice to disrupt Black's coordination.}
Qd6 18. Ba3 Bh6 19. Bxc5 Qxc5 20. Qe4 Nc6 21. Na3 Rd7 22. Nc2 Qxb6
23. Rab1 Qc7 24. Rb5 O-O 25. Na1 Rb8 26. Nb3 e6 27. Nc5 Re7 28. Rdb1 Qc8
29. Qxc6! {Winning a full piece on the spot because 29...bxc6 allows 30.Rxb8+!} 1-0`,
  },
  {
    id: 'gukesh-wei-yi-2024',
    title: 'Gukesh’s Olympiad Gold Masterpiece',
    subtitle: 'Gukesh D vs. Wei Yi · Budapest Olympiad 2024 Rd 7',
    white: 'Gukesh Dommaraju',
    black: 'Wei Yi',
    event: '45th FIDE Chess Olympiad',
    year: 2024,
    result: '1-0',
    eco: 'B50',
    opening: 'Sicilian Defense · Closed',
    theme: 'Endgame',
    keyMove: '69. Ne4+!',
    description:
      'A breathtaking 80-move modern classic where Gukesh converted a razor-thin two-knights-versus-rook endgame against China’s Wei Yi to propel India toward historic Olympiad gold.',
    pgn: `[Event "45th FIDE Chess Olympiad"]
[Site "Budapest HUN"]
[Date "2024.09.18"]
[Round "7"]
[White "Gukesh Dommaraju"]
[Black "Wei Yi"]
[Result "1-0"]
[WhiteElo "2764"]
[BlackElo "2762"]
[ECO "B50"]
[Opening "Sicilian Defense"]

1. e4 c5 2. Nf3 d6 3. Nc3 Nf6 4. Be2 e5 5. Bc4 Be7 6. d3 Nc6 7. Bg5 O-O
8. Bxf6 Bxf6 9. Nd5 Be6 10. Qd2 a6 11. O-O b5 12. Bb3 Kh8 13. a3 Rb8
14. h3 g6 15. c3 Bg7 16. Ba2 f5 17. Ng5 Bg8 18. exf5 gxf5 19. f4 c4
20. dxc4 bxc4 21. Bxc4 exf4 22. Nf3 Na5 23. Ba2 Nb3 24. Bxb3 Rxb3
25. Nxf4 Qb6+ 26. Rf2 Rb8 27. Rd1 Rxb2 28. Qxb2 Qxb2 29. Rxb2 Rxb2
30. Rxd6 a5 31. Rd8 Bxc3 32. Nd5 Rb1+ 33. Kf2 Rd1 34. Rxg8+ Kxg8
35. Nxc3 Rc1 36. Nb5 Rc2+ 37. Kf1 Kf7 38. Nfd4 Rc1+ 39. Ke2 Kf6
40. Nd6 Rc3 41. N6b5 Rc1 42. Ke3 Rg1 43. Kf2 Rc1 44. Ne2 Rb1
45. Nbc3 Rb3 46. a4 Ke5 47. g3 Rb6 48. Ke3 Rb4 49. Kd3 h6 50. Ke3 Rb3
51. Kd3 Rb4 52. Ng1 Rb8 53. Nf3+ Kf6 54. Nd4 Rd8 55. Ke3 Rc8
56. Kd3 Rd8 57. Ne2 Rb8 58. Nf4 Rb1 59. Nd5+ Ke5 60. Nc3 Rh1
61. Nf3+ Kd6 62. h4 Rh3 63. Ne2 f4 64. Nfg1 Rh1 65. gxf4 Rxh4
66. Nf3 Rh1 67. f5 h5 68. Nc3 h4 69. Ne4+! {Coordinating both knights with laser precision to escort the f-pawn.}
Kd7 70. Ne5+ Kd8 71. f6 h3 72. f7 Rf1 73. Ng5 h2 74. Ngf3 Ke7
75. Nxh2 Ra1 76. Nhg4 Ra3+ 77. Kd2 Rxa4 78. Nh6 Ra2+ 79. Ke3 Ra3+
80. Ke4 1-0`,
  },
  {
    id: 'ding-praggnanandhaa-2024',
    title: 'Praggnanandhaa Defeats the World Champion',
    subtitle: 'Ding Liren vs. R. Praggnanandhaa · Tata Steel 2024',
    white: 'Ding Liren',
    black: 'R. Praggnanandhaa',
    event: 'Tata Steel Masters',
    year: 2024,
    result: '0-1',
    eco: 'C77',
    opening: 'Ruy Lopez · Anderssen Variation',
    theme: 'Positional',
    keyMove: '42... f5!',
    description:
      'Eighteen-year-old Praggnanandhaa outplayed reigning World Champion Ding Liren with Black in Wijk aan Zee, seizing the queenside before engineering a surgical knight endgame breakthrough.',
    pgn: `[Event "Tata Steel Masters 2024"]
[Site "Wijk aan Zee NED"]
[Date "2024.01.16"]
[Round "4"]
[White "Ding Liren"]
[Black "R. Praggnanandhaa"]
[Result "0-1"]
[WhiteElo "2780"]
[BlackElo "2743"]
[ECO "C77"]
[Opening "Ruy Lopez"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. d3 Bc5 6. O-O b5 7. Bb3 d6 8. c3 h6
9. Re1 O-O 10. Nbd2 Bb6 11. Nf1 Ne7 12. a4 Rb8 13. h3 Ng6 14. Ng3 c5 15. Be3 c4
16. Bxb6 Rxb6 17. Ba2 Qc7 18. axb5 axb5 19. Bb1 cxd3 20. Bxd3 Nf4 21. Ne2 Nxd3
22. Qxd3 Be6 23. Ng3 b4 24. cxb4 Rxb4 25. Rad1 Rb6 26. Qa3 Rfb8 27. Rd2 Ne8
28. Nh2 Rb3 29. Qa1 Qb6 30. Nhf1 Rxb2 31. Rxb2 Qxb2 32. Qxb2 Rxb2 33. Ne3 g6
34. Ra1 Ba2 35. h4 h5 36. f3 Rb1+ 37. Rxb1 Bxb1 38. Ne2 Ba2 39. Kf2 Kf8 40. Nc3 Bb3
41. Ned5 Bxd5 42. Nxd5 f5! {Creating an outside passed pawn and mobilizing Black's king for the decisive infiltration.}
43. f4 Kf7 44. exf5 gxf5 45. fxe5 dxe5 46. g3 Ke6 47. Ne3 Nf6 48. Ke2 Ne4
49. Nf1 f4 50. gxf4 exf4 51. Kf3 Kf5 52. Kg2 Nd6 53. Nd2 Nf7 54. Nc4 Kg4
55. Kf2 Kxh4 56. Kf3 Kg5 57. Nb2 Kf5 58. Nd1 Ng5+ 59. Kg2 h4 60. Nf2 f3+
61. Kg1 Kf4 62. Kf1 Ne4 0-1`,
  },
  {
    id: 'firouzja-nakamura-2024',
    title: 'Nakamura’s Scandinavian Blitz Storm',
    subtitle: 'Firouzja vs. Nakamura · Bullet Championship 2024',
    white: 'Alireza Firouzja',
    black: 'Hikaru Nakamura',
    event: 'Bullet Chess Championship',
    year: 2024,
    result: '0-1',
    eco: 'B01',
    opening: 'Scandinavian Defense',
    theme: 'Attack',
    keyMove: '30... Nxf2+!',
    description:
      'In a wild modern speed-chess clash, Hikaru Nakamura unleashes a kingside pawn avalanche against Firouzja, culminating in the knight sacrifice 30...Nxf2+! and a forced promotion.',
    pgn: `[Event "Bullet Chess Championship"]
[Site "Online"]
[Date "2024.06.13"]
[Round "5"]
[White "Alireza Firouzja"]
[Black "Hikaru Nakamura"]
[Result "0-1"]
[ECO "B01"]
[Opening "Scandinavian Defense"]

1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 c6 5. Bd2 Bf5 6. Bc4 e6 7. Nf3 Nf6
8. Nd5 Qd8 9. Nxf6+ gxf6 10. c3 Nd7 11. Qe2 Nb6 12. Bd3 Bxd3 13. Qxd3 Qd5
14. Qe2 O-O-O 15. O-O Qc4 16. Qxc4 Nxc4 17. Bc1 Bd6 18. b3 Nb6 19. c4 Bc7
20. Be3 Rhg8 21. Rad1 f5 22. g3 f4 23. Bc1 Nd7 24. Rfe1 Nf6 25. Kf1 fxg3
26. Kg2 gxh2+ 27. Kh1 Ng4 28. Re2 Rg6 29. Rde1 Rf6 30. Ne5 Nxf2+! {Ripping open the back rank so the h-pawn queens with check.}
31. Kg2 h1=Q+ 32. Rxh1 Rg8+ 0-1`,
  },
  {
    id: 'caruana-firouzja-2024-miniature',
    title: 'Caruana’s 9-Move Opening Trap',
    subtitle: 'Caruana vs. Firouzja · CrunchLabs Masters 2024',
    white: 'Fabiano Caruana',
    black: 'Alireza Firouzja',
    event: 'CrunchLabs Masters',
    year: 2024,
    result: '1-0',
    eco: 'A13',
    opening: 'English Opening · Slav Setup',
    theme: 'Instructional',
    keyMove: '9. Rxa7!',
    description:
      'A jaw-dropping super-GM miniature demonstrating why greedy bishop captures on the queenside can backfire instantly—Firouzja resigned on move 9 after 9.Rxa7!.',
    pgn: `[Event "CrunchLabs Masters"]
[Site "Online"]
[Date "2024.07.20"]
[Round "1"]
[White "Fabiano Caruana"]
[Black "Alireza Firouzja"]
[Result "1-0"]
[ECO "A13"]
[Opening "English Opening"]

1. c4 c6 2. Nf3 d5 3. g3 Bg4 4. Ne5 Bf5 5. Qb3 Qb6 6. cxd5 Qxb3
7. axb3 Be4? {Walking straight into a devastating tactical refutation along the a-file and c-pawn.}
8. dxc6! Bxh1 9. Rxa7! {If 9...Rxa7 then 10.c7! promotes, and otherwise the b7 pawn falls with a crushing attack.} 1-0`,
  },
  {
    id: 'nepomniachtchi-ding-2023-tb4',
    title: 'Ding’s Fearless Self-Pin for the Crown',
    subtitle: 'Nepomniachtchi vs. Ding Liren · Astana 2023 WCh TB4',
    white: 'Ian Nepomniachtchi',
    black: 'Ding Liren',
    event: 'FIDE World Chess Championship Tiebreaks',
    year: 2023,
    result: '0-1',
    eco: 'C84',
    opening: 'Ruy Lopez · Closed',
    theme: 'World Championship',
    keyMove: '46... Rg6!!',
    description:
      'With a threefold repetition draw on the board in the deciding rapid tiebreak, Ding Liren played the immortal self-pin 46...Rg6!! to keep playing for a win and became the 17th World Champion.',
    pgn: `[Event "FIDE World Chess Championship Tiebreaks"]
[Site "Astana KAZ"]
[Date "2023.04.30"]
[Round "4"]
[White "Ian Nepomniachtchi"]
[Black "Ding Liren"]
[Result "0-1"]
[WhiteElo "2795"]
[BlackElo "2788"]
[ECO "C84"]
[Opening "Ruy Lopez"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. d3 b5 7. Bb3 d6 8. a4 Bd7
9. h3 O-O 10. Be3 Na5 11. Ba2 bxa4 12. Nc3 Rb8 13. Bb1 Qe8 14. b3 c5 15. Nxa4 Nc6
16. Nc3 a5 17. Nd2 Be6 18. Nc4 d5 19. exd5 Nxd5 20. Bd2 Nxc3 21. Bxc3 Bxc4 22. bxc4 Bd8
23. Bd2 Bc7 24. c3 f5 25. Re1 Rd8 26. Ra2 Qg6 27. Qe2 Qd6 28. g3 Rde8 29. Qf3 e4
30. dxe4 Ne5 31. Qg2 Nd3 32. Bxd3 Qxd3 33. exf5 Rxe1+ 34. Bxe1 Qxc4 35. Ra1 Rxf5
36. Bd2 h6 37. Qc6 Rf7 38. Re1 Kh7 39. Be3 Be5 40. Qe8 Bxc3 41. Rc1 Rf6 42. Qd7 Qe2
43. Qd5 Bb4 44. Qe4+ Kg8 45. Qd5+ Kh7 46. Qe4+ Rg6!! {Rejecting a repetition draw in a World Championship decider—pinning his own rook to play for victory!}
47. Qf5 c4 48. h4 Qd3 49. Qf3 Rf6 50. Qg4 c3 51. Rd1 Qg6 52. Qc8 Rc6 53. Qa8 Rd6
54. Rxd6 Qxd6 55. Qe4+ Qg6 56. Qc4 Qb1+ 57. Kh2 a4 58. Bd4 a3 59. Qc7 Qg6
60. Qc4 c2 61. Be3 Bd6 62. Kg2 h5 63. Kf1 Be5 64. g4 hxg4 65. h5 Qf5
66. Qd5 g3 67. f4 a2 68. Qxa2 Bxf4 0-1`,
  },
  {
    id: 'ding-nepomniachtchi-2023-g6',
    title: 'Ding’s World Championship London Mate',
    subtitle: 'Ding Liren vs. Nepomniachtchi · Astana 2023 WCh G6',
    white: 'Ding Liren',
    black: 'Ian Nepomniachtchi',
    event: 'FIDE World Chess Championship',
    year: 2023,
    result: '1-0',
    eco: 'D02',
    opening: 'London System',
    theme: 'World Championship',
    keyMove: '41. d5!',
    description:
      'In the first London System ever played in a World Chess Championship match, Ding Liren built an unstoppable mating net with the calm geometric thunderbolt 41.d5!.',
    pgn: `[Event "FIDE World Chess Championship"]
[Site "Astana KAZ"]
[Date "2023.04.16"]
[Round "6"]
[White "Ding Liren"]
[Black "Ian Nepomniachtchi"]
[Result "1-0"]
[WhiteElo "2788"]
[BlackElo "2795"]
[ECO "D02"]
[Opening "London System"]

1. d4 Nf6 2. Nf3 d5 3. Bf4 c5 4. e3 Nc6 5. Nbd2 cxd4 6. exd4 Bf5 7. c3 e6
8. Bb5 Bd6 9. Bxd6 Qxd6 10. O-O O-O 11. Re1 h6 12. Ne5 Ne7 13. a4 a6
14. Bf1 Nd7 15. Nxd7 Qxd7 16. a5 Qc7 17. Qf3 Rfc8 18. Ra3 Bg6 19. Nb3 Nc6
20. Qg3 Qe7 21. h4 Re8 22. Nc5 e5 23. Rb3 Nxa5 24. Rxe5 Qf6 25. Ra3 Nc4
26. Bxc4 dxc4 27. h5 Bc2 28. Nxb7 Qb6 29. Nd6 Rxe5 30. Qxe5 Qxb2
31. Ra5 Kh7 32. Rc5 Qc1+ 33. Kh2 f6 34. Qg3 a5 35. Nxc4 a4 36. Ne3 Bb1
37. Rc7 Rg8 38. Nd5 Kh8 39. Ra7 a3 40. Ne7 Rf8 41. d5! {Ignoring Black's a-pawn completely to clear the b1-h7 diagonal and lock in forced checkmate.}
a2 42. Qc7 Kh7 43. Ng6 Rg8 44. Qf7 1-0`,
  },
  {
    id: 'carlsen-nepomniachtchi-2021-g8',
    title: 'Carlsen’s Petroff Queen Endgame Precision',
    subtitle: 'Carlsen vs. Nepomniachtchi · Dubai 2021 WCh G8',
    white: 'Magnus Carlsen',
    black: 'Ian Nepomniachtchi',
    event: 'FIDE World Chess Championship',
    year: 2021,
    result: '1-0',
    eco: 'C43',
    opening: 'Petroff Defense · Modern Attack',
    theme: 'World Championship',
    keyMove: '22. Qa3+!',
    description:
      'In Game 8 of the Dubai World Championship, Magnus Carlsen punished Nepomniachtchi’s reckless 21...b5? with 22.Qa3+!, winning the a7 pawn and converting a razor-sharp queen endgame.',
    pgn: `[Event "FIDE World Chess Championship"]
[Site "Dubai UAE"]
[Date "2021.12.05"]
[Round "8"]
[White "Magnus Carlsen"]
[Black "Ian Nepomniachtchi"]
[Result "1-0"]
[WhiteElo "2856"]
[BlackElo "2782"]
[ECO "C43"]
[Opening "Petroff Defense"]

1. e4 e5 2. Nf3 Nf6 3. d4 Nxe4 4. Bd3 d5 5. Nxe5 Nd7 6. Nxd7 Bxd7 7. Nd2 Nxd2
8. Bxd2 Bd6 9. O-O h5 10. Qe1+ Kf8 11. Bb4 Qe7 12. Bxd6 Qxd6 13. Qd2 Re8
14. Rae1 Rh6 15. Qg5 c6 16. Rxe8+ Bxe8 17. Re1 Qf6 18. Qe3 Bd7 19. h3 h4
20. c4 dxc4 21. Bxc4 b5? 22. Qa3+! {Immediate double attack winning the a7 pawn and seizing total control.}
Kg8 23. Qxa7 Qd8 24. Bb3 Rd6 25. Re4 Be6 26. Bxe6 Rxe6 27. Rxe6 fxe6
28. Qc5 Qa5 29. Qxc6 Qe1+ 30. Kh2 Qxf2 31. Qxe6+ Kh7 32. Qe4+ Kg8 33. b3 Qxa2
34. Qe8+ Kh7 35. Qxb5 Qf2 36. Qe5 Qb2 37. Qe4+ Kg8 38. Qd3 Qf2 39. Qc3 Qf4+
40. Kg1 Kh7 41. Qd3+ g6 42. Qd1 Qe3+ 43. Kh1 g5 44. d5! {Advancing the passed d-pawn decisively while neutralizing Black's counterplay.}
g4 45. hxg4 h3 46. Qf3 1-0`,
  },
  {
    id: 'giri-carlsen-2023',
    title: 'Giri’s Precision Break Against Carlsen',
    subtitle: 'Giri vs. Carlsen · Tata Steel 2023 Rd 4',
    white: 'Anish Giri',
    black: 'Magnus Carlsen',
    event: 'Tata Steel Masters',
    year: 2023,
    result: '1-0',
    eco: 'E15',
    opening: "Queen's Indian Defense",
    theme: 'Positional',
    keyMove: '21. d7!',
    description:
      'Anish Giri ended a twelve-year classical drought against Magnus Carlsen with razor-sharp preparation, driving a monster passed d-pawn to the seventh rank before winning material.',
    pgn: `[Event "Tata Steel Masters 2023"]
[Site "Wijk aan Zee NED"]
[Date "2023.01.17"]
[Round "4"]
[White "Anish Giri"]
[Black "Magnus Carlsen"]
[Result "1-0"]
[WhiteElo "2764"]
[BlackElo "2859"]
[ECO "E15"]
[Opening "Queen's Indian Defense"]

1. d4 Nf6 2. c4 e6 3. Nf3 b6 4. g3 Ba6 5. Qc2 Bb7 6. Bg2 c5 7. d5 exd5
8. cxd5 Nxd5 9. O-O Be7 10. Rd1 Nc6 11. Qf5 Nf6 12. e4 d6 13. e5 Qd7
14. Qxd7+ Nxd7 15. exd6 Bf6 16. Re1+ Kf8 17. Nc3 Nb4 18. Ne5 Nxe5
19. Bxb7 Rd8 20. Rd1 Nc4 21. d7! {Tying down Black's rook and creating unstoppable queenside pressure.}
Nc2 22. Rb1 Nd4 23. b4 Rxd7 24. Bd5 Nd6 25. bxc5 bxc5 26. Ba3 Ke7
27. Bxc5 Ne6 28. Bb4 a5 29. Bxa5 Rc8 30. Na4 Nc4 31. Rbc1 Be5
32. Bb4+ Kf6 33. Nc5 Nxc5 34. Rxc4 Rdc7 35. Ba5 1-0`,
  },
  {
    id: 'carlsen-firouzja-2021',
    title: 'Carlsen’s Ruy Lopez Endgame Clinic',
    subtitle: 'Carlsen vs. Firouzja · Norway Chess 2021 Rd 6',
    white: 'Magnus Carlsen',
    black: 'Alireza Firouzja',
    event: 'Norway Chess',
    year: 2021,
    result: '1-0',
    eco: 'C78',
    opening: 'Ruy Lopez · Morphy Defense',
    theme: 'Endgame',
    keyMove: '42. b5!',
    description:
      'A quintessential Magnus Carlsen endgame lesson: trading down to an opposite-wings minor-piece ending, activating his king to d4, and creating an unstoppable queenside breakthrough.',
    pgn: `[Event "Norway Chess 2021"]
[Site "Stavanger NOR"]
[Date "2021.09.13"]
[Round "6"]
[White "Magnus Carlsen"]
[Black "Alireza Firouzja"]
[Result "1-0"]
[WhiteElo "2855"]
[BlackElo "2754"]
[ECO "C78"]
[Opening "Ruy Lopez"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O b5 6. Bb3 Bc5 7. a4 Rb8 8. c3 d6
9. d4 Bb6 10. a5 Ba7 11. h3 Bb7 12. Be3 Nxe4 13. Nbd2 Nxd2 14. Qxd2 O-O
15. dxe5 dxe5 16. Qxd8 Rbxd8 17. Bxa7 Nxa7 18. Nxe5 Bd5 19. Bc2 f6 20. Ng4 Rfe8
21. Ne3 Bf7 22. Rfd1 Nc6 23. Rxd8 Rxd8 24. Be4 Ne5 25. Bb7 Rd6 26. Rd1 Nd3
27. Rd2 Kf8 28. b4 g6 29. Be4 Ne5 30. Rxd6 cxd6 31. f4 Nc4 32. Kf2 f5
33. Bb7 Ke7 34. Bxa6 Be8 35. Nxc4 bxc4 36. Bxc4 Bc6 37. g3 h6 38. h4 d5
39. Bd3 Kd6 40. Ke3 Bd7 41. Kd4 Bc6 42. b5! {Liquidating cleanly into a winning king-and-pawn race.}
Bb7 43. a6 Ba8 44. b6 Kc6 45. b7 Bxb7 46. axb7 Kxb7 47. Kxd5 Kc7 48. c4 Kd7
49. c5 Kc7 50. c6 g5 51. hxg5 hxg5 52. fxg5 1-0`,
  },
  {
    id: 'dubov-karjakin-2020',
    title: 'Dubov’s Italian Queen Sacrifice',
    subtitle: 'Dubov vs. Karjakin · Russian Superfinal 2020',
    white: 'Daniil Dubov',
    black: 'Sergey Karjakin',
    event: 'Russian Championship Superfinal',
    year: 2020,
    result: '1-0',
    eco: 'C53',
    opening: 'Italian Game · Giuoco Piano',
    theme: 'Sacrifice',
    keyMove: '19. Qxg6!!',
    description:
      'Known as "Dubov’s Immortal", Daniil Dubov stunned Sergey Karjakin with an imaginative modern gambit and the audacious positional queen sacrifice 19.Qxg6!! in the Russian Superfinal.',
    pgn: `[Event "Russian Championship Superfinal"]
[Site "Moscow RUS"]
[Date "2020.12.16"]
[Round "11"]
[White "Daniil Dubov"]
[Black "Sergey Karjakin"]
[Result "1-0"]
[WhiteElo "2702"]
[BlackElo "2752"]
[ECO "C53"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. b4 Bb6 7. e5 Ne4
8. Bd5 Nxc3 9. Nxc3 dxc3 10. Bg5 Ne7 11. O-O h6 12. Bh4 O-O 13. Re1 Qe8
14. Bb3 a5 15. Bf6 a4 16. Bc4 Ng6 17. Qd3 d5 18. exd6 Be6
19. Qxg6!! {A breathtaking queen sacrifice—White's bishop pair, passed pawn, and rook domination completely paralyze Black.}
fxg6 20. Rxe6 Qf7 21. Bxc3 Kh8 22. Re4 Qf5 23. Re7 Rg8 24. Bxg8 Rxg8
25. dxc7 Qc2 26. Be5 Bxf2+ 27. Kh1 Bb6 28. h3 Kh7 29. Re1 a3 30. Kh2 g5
31. Nd4 Qc4 32. Nf5 Qxb4 33. Rc1 Kg6 34. Rxg7+ Kxf5 35. Rxg8 Bxc7
36. Bxc7 Qb2 37. Rc5+ Ke4 38. Rd8 1-0`,
  },
  {
    id: 'alphazero-stockfish-2017-g3',
    title: 'AlphaZero’s Kingside Pawn Storm',
    subtitle: 'AlphaZero vs. Stockfish 8 · London 2017',
    white: 'AlphaZero',
    black: 'Stockfish 8',
    event: 'AlphaZero vs. Stockfish 8 Match',
    year: 2017,
    result: '1-0',
    eco: 'E16',
    opening: "Queen's Indian Defense",
    theme: 'Attack',
    keyMove: '19. Bh3!',
    description:
      'One of the landmark neural-network games that reshaped modern opening theory: AlphaZero storms forward with h4, castles queenside, sacrifices a knight on g5, and crushes Stockfish 8.',
    pgn: `[Event "AlphaZero vs. Stockfish 8"]
[Site "London ENG"]
[Date "2017.12.04"]
[Round "3"]
[White "AlphaZero"]
[Black "Stockfish 8"]
[Result "1-0"]
[ECO "E16"]
[Opening "Queen's Indian Defense"]

1. d4 Nf6 2. c4 e6 3. Nf3 b6 4. g3 Bb7 5. Bg2 Bb4+ 6. Bd2 Be7 7. Nc3 O-O
8. Qc2 Na6 9. a3 c5 10. d5 exd5 11. Ng5 Nc7 12. h4 h6 13. Nxd5 Ncxd5
14. cxd5 d6 15. a4 Qd7 16. Bc3 Rfe8 17. O-O-O Bd8 18. e4 Ng4
19. Bh3! {Leaving the g5 knight en prise to rip open the h-file and dominate every diagonal.}
hxg5 20. f3 f5 21. fxg4 fxg4 22. Bf1 gxh4 23. Bb5 Qf7 24. gxh4 Bf6
25. Rhf1 Rf8 26. Bxf6 gxf6 27. Rf4 Qg7 28. Be2 Qh6 29. Rdf1 g3
30. Qd3 Kh8 31. Qxg3 Rae8 32. Bd3 Bc8 33. Kb1 Rf7 34. Qf2 Bd7
35. h5 Ref8 36. Bc2 Be8 37. Rf3 Re7 38. Rxf6 Qxf6 39. Qxf6+ Rxf6
40. Rxf6 Kg7 41. Rxd6 Bxh5 42. Kc1 Re5 43. a5 bxa5 44. Kd2 Be8
45. Ra6 Rh5 46. Bd3 a4 47. d6 Bf7 48. d7 Rh8 49. e5 1-0`,
  },
  {
    id: 'bai-ding-2017',
    title: 'Ding Liren’s Immortal',
    subtitle: 'Bai Jinshi vs. Ding Liren · Chinese League 2017',
    white: 'Bai Jinshi',
    black: 'Ding Liren',
    event: 'Chinese Chess League',
    year: 2017,
    result: '0-1',
    eco: 'E21',
    opening: 'Nimzo-Indian Defense',
    theme: 'Sacrifice',
    keyMove: '20... Rd4!!',
    description:
      'A modern attacking legend: Ding Liren sacrifices his queen on move 16 and launches his rook to d4, hunting Bai Jinshi’s king all the way up the h-file to a stunning 35...Ng3# checkmate.',
    pgn: `[Event "Chinese Chess League"]
[Site "China CHN"]
[Date "2017.11.04"]
[Round "18"]
[White "Bai Jinshi"]
[Black "Ding Liren"]
[Result "0-1"]
[WhiteElo "2550"]
[BlackElo "2774"]
[ECO "E21"]
[Opening "Nimzo-Indian Defense"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Nf3 O-O 5. Bg5 c5 6. e3 cxd4 7. Qxd4 Nc6
8. Qd3 h6 9. Bh4 d5 10. Rd1 g5 11. Bg3 Ne4 12. Nd2 Nc5 13. Qc2 d4 14. Nf3 e5
15. Nxe5 dxc3 16. Rxd8 cxb2+ 17. Ke2 Rxd8 18. Qxb2 Na4 19. Qc2 Nc3+ 20. Kf3 Rd4!! {Cutting off the white king and preparing a ruthless mating swarm.}
21. h3 h5 22. Bh2 g4+ 23. Kg3 Rd2 24. Qb3 Ne4+ 25. Kh4 Be7+ 26. Kxh5 Kg7
27. Bf4 Bf5 28. Bh6+ Kh7 29. Qb7 Rf2 30. Bg5 Rh8 31. Nf7 Bg6+ 32. Kg4 Ne5+
33. Nxe5 Bf5+ 34. Kh5 Kg8+ 35. Bh6 Ng3# 0-1`,
  },
  {
    id: 'carlsen-karjakin-2016-tb4',
    title: 'Carlsen’s Championship Queen Sacrifice',
    subtitle: 'Carlsen vs. Karjakin · New York 2016 WCh TB4',
    white: 'Magnus Carlsen',
    black: 'Sergey Karjakin',
    event: 'FIDE World Chess Championship Tiebreaks',
    year: 2016,
    result: '1-0',
    eco: 'B54',
    opening: 'Sicilian Defense · Prins Variation',
    theme: 'World Championship',
    keyMove: '50. Qh6+!!',
    description:
      'On his 26th birthday, Magnus Carlsen closed out the 2016 World Championship rapid tiebreaks in dramatic style with the unforgettable queen sacrifice 50.Qh6+!! forcing instant mate.',
    pgn: `[Event "FIDE World Chess Championship Tiebreaks"]
[Site "New York, NY USA"]
[Date "2016.11.30"]
[Round "4"]
[White "Magnus Carlsen"]
[Black "Sergey Karjakin"]
[Result "1-0"]
[WhiteElo "2853"]
[BlackElo "2772"]
[ECO "B54"]
[Opening "Sicilian Defense"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. f3 e5 6. Nb3 Be7 7. c4 a5 8. Be3 a4
9. Nc1 O-O 10. Nc3 Qa5 11. Qd2 Na6 12. Be2 Nc5 13. O-O Bd7 14. Rb1 Rfc8
15. b4 axb3 16. axb3 Qd8 17. Nd3 Ne6 18. Nb4 Bc6 19. Rfd1 h5 20. Bf1 h4
21. Qf2 Nd7 22. g3 Ra3 23. Bh3 Rca8 24. Nc2 R3a6 25. Nb4 Ra5 26. Nc2 b6
27. Rd2 Qc7 28. Rbd1 Bf8 29. gxh4 Nf4 30. Bxf4 exf4 31. Bxd7 Qxd7 32. Nb4 Ra3
33. Nxc6 Qxc6 34. Nb5 Rxb3 35. Nd4 Qxc4 36. Nxb3 Qxb3 37. Qe2 Be7 38. Kg2 Qe6
39. h5 Ra3 40. Rd3 Ra2 41. R3d2 Ra3 42. Rd3 Ra7 43. Rd5 Rc7 44. Qd2 Qf6
45. Rf5 Qh4 46. Rc1 Ra7 47. Qxf4 Ra2+ 48. Kh1 Qf2 49. Rc8+ Kh7
50. Qh6+!! {Iconic championship finish: 50...Kxh6 51.Rh8# or 50...gxh6 51.Rxf7#!} 1-0`,
  },
  {
    id: 'wei-yi-bruzon-2015',
    title: 'The Chinese Immortal',
    subtitle: 'Wei Yi vs. Lazaro Bruzon · Danzhou 2015',
    white: 'Wei Yi',
    black: 'Lazaro Bruzon Batista',
    event: '6th Hainan Danzhou GM',
    year: 2015,
    result: '1-0',
    eco: 'B40',
    opening: 'Sicilian Defense · Kan/Taimanov',
    theme: 'Sacrifice',
    keyMove: '22. Rxf7!!',
    description:
      'Sixteen-year-old prodigy Wei Yi stunned the chess world with 22.Rxf7!!, sacrificing a rook and bishop to drag Bruzon’s king across the entire board before calmly sealing the net with 36.Be1!.',
    pgn: `[Event "6th Hainan Danzhou GM"]
[Site "Danzhou CHN"]
[Date "2015.07.03"]
[Round "2"]
[White "Wei Yi"]
[Black "Lazaro Bruzon Batista"]
[Result "1-0"]
[WhiteElo "2724"]
[BlackElo "2669"]
[ECO "B40"]
[Opening "Sicilian Defense"]

1. e4 c5 2. Nf3 e6 3. Nc3 a6 4. Be2 Nc6 5. d4 cxd4 6. Nxd4 Qc7 7. O-O Nf6
8. Be3 Be7 9. f4 d6 10. Kh1 O-O 11. Qe1 Nxd4 12. Bxd4 b5 13. Qg3 Bb7
14. a3 Rad8 15. Rae1 Rd7 16. Bd3 Qd8 17. Qh3 g6 18. f5 e5 19. Be3 Re8
20. fxg6 hxg6 21. Nd5 Nxd5 22. Rxf7!! {Launching a breathtaking modern king hunt across the open board.}
Kxf7 23. Qh7+ Ke6 24. exd5+ Kxd5 25. Be4+! Kxe4 26. Qf7 Bf6 27. Bd2+ Kd4
28. Be3+ Ke4 29. Qb3 Kf5 30. Rf1+ Kg4 31. Qd3 Bxg2+ 32. Kxg2 Qa8+
33. Kg1 Bg5 34. Qe2+ Kh4 35. Bf2+ Kh3 36. Be1! {Quiet killer threatening 37.Rf3+ and mate.} 1-0`,
  },
  {
    id: 'carlsen-caruana-2014-sinquefield',
    title: 'Caruana’s Sinquefield Streak Upset',
    subtitle: 'Carlsen vs. Caruana · Sinquefield Cup 2014 Rd 3',
    white: 'Magnus Carlsen',
    black: 'Fabiano Caruana',
    event: 'Sinquefield Cup',
    year: 2014,
    result: '0-1',
    eco: 'C24',
    opening: "Bishop's Opening",
    theme: 'Attack',
    keyMove: '19... Bg4!',
    description:
      'During his historic 7/7 start at the 2014 Sinquefield Cup, Fabiano Caruana refuted Magnus Carlsen’s sharp kingside sacrifice with cool tactical precision and a decisive counter-attack.',
    pgn: `[Event "Sinquefield Cup"]
[Site "Saint Louis, MO USA"]
[Date "2014.08.29"]
[Round "3"]
[White "Magnus Carlsen"]
[Black "Fabiano Caruana"]
[Result "0-1"]
[WhiteElo "2877"]
[BlackElo "2801"]
[ECO "C24"]
[Opening "Bishop's Opening"]

1. e4 e5 2. Bc4 Nf6 3. d3 c6 4. Nf3 d5 5. Bb3 Bb4+ 6. c3 Bd6 7. Bg5 dxe4
8. dxe4 h6 9. Bh4 Qe7 10. Nbd2 Nbd7 11. Bg3 Bc7 12. O-O Nh5 13. h3 Nxg3
14. fxg3 Nc5 15. Bxf7+ Kxf7 16. Nxe5+ Kg8 17. Ng6 Qg5 18. Rf8+ Kh7
19. Nxh8 Bg4! {Calmly activating the last piece while White's knight is trapped on h8.}
20. Qf1 Nd3 21. Qxd3 Rxf8 22. hxg4 Qxg4 23. Nf3 Qxg3 24. e5+ Kxh8
25. e6 Bb6+ 26. Kh1 Qg4 27. Qd6 Rd8 28. Qe5 Rd5 29. Qb8+ Kh7
30. e7 Qh5+ 31. Nh2 Rd1+ 32. Rxd1 Qxd1+ 33. Nf1 Qxf1+ 34. Kh2 Qg1+ 0-1`,
  },
  {
    id: 'carlsen-nakamura-2011-tatasteel',
    title: 'Carlsen’s Opposite-Side Castling Storm',
    subtitle: 'Carlsen vs. Nakamura · Tata Steel 2011 Rd 8',
    white: 'Magnus Carlsen',
    black: 'Hikaru Nakamura',
    event: 'Tata Steel Group A',
    year: 2011,
    result: '1-0',
    eco: 'D35',
    opening: "Queen's Gambit Declined · Exchange",
    theme: 'Attack',
    keyMove: '17. h4!',
    description:
      'In an electrifying opposite-side castling clash in Wijk aan Zee, Magnus Carlsen launched an all-out kingside pawn storm with 17.h4! to shatter Hikaru Nakamura’s fortress along the g-file.',
    pgn: `[Event "Tata Steel Group A"]
[Site "Wijk aan Zee NED"]
[Date "2011.01.23"]
[Round "8"]
[White "Magnus Carlsen"]
[Black "Hikaru Nakamura"]
[Result "1-0"]
[WhiteElo "2814"]
[BlackElo "2751"]
[ECO "D35"]
[Opening "Queen's Gambit Declined"]

1. d4 d5 2. c4 e6 3. Nc3 Be7 4. cxd5 exd5 5. Bf4 c6 6. Qc2 Bg4 7. e3 Bh5
8. Bd3 Bg6 9. Bxg6 hxg6 10. O-O-O Nf6 11. f3 Nbd7 12. Nge2 b5 13. e4 b4
14. Na4 dxe4 15. fxe4 Qa5 16. Kb1 O-O 17. h4! {Launching the signature opposite-side castling pawn storm straight at Black's king.}
Rfe8 18. e5 Nd5 19. h5 g5 20. h6 g6 21. Bc1 N7b6 22. Nc5 Bxc5 23. dxc5 b3
24. Qxb3 Qxc5 25. Nd4 Rxe5 26. Nf3 Re2 27. Nxg5 Qe7 28. Qd3 Rf8 29. Rdf1 f5
30. g4 Na4 31. Qd4 Qe5 32. Qxe5 Rxe5 33. gxf5 gxf5 34. Nf3 Re7 35. Rfg1+ Kh7
36. Rg7+ Kh8 37. Rhg1 Rfe8 38. Nh4 Rxg7 1-0`,
  },
  {
    id: 'anand-carlsen-2013-g9',
    title: 'Carlsen’s Ice-Cold Promotion Defense',
    subtitle: 'Anand vs. Carlsen · Chennai 2013 WCh G9',
    white: 'Viswanathan Anand',
    black: 'Magnus Carlsen',
    event: 'FIDE World Chess Championship',
    year: 2013,
    result: '0-1',
    eco: 'E25',
    opening: 'Nimzo-Indian · Sämisch Variation',
    theme: 'World Championship',
    keyMove: '27... b1=Q+!',
    description:
      'With Anand throwing everything at the Black king in a must-win Sämisch Nimzo-Indian, Carlsen kept nerves of steel, promoted on b1 with check, and clinched the match with 28...Qe1!.',
    pgn: `[Event "FIDE World Chess Championship"]
[Site "Chennai IND"]
[Date "2013.11.21"]
[Round "9"]
[White "Viswanathan Anand"]
[Black "Magnus Carlsen"]
[Result "0-1"]
[WhiteElo "2775"]
[BlackElo "2870"]
[ECO "E25"]
[Opening "Nimzo-Indian Defense"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. f3 d5 5. a3 Bxc3+ 6. bxc3 c5 7. cxd5 exd5
8. e3 c4 9. Ne2 Nc6 10. g4 O-O 11. Bg2 Na5 12. O-O Nb3 13. Ra2 b5
14. Ng3 a5 15. g5 Ne8 16. e4 Nxc1 17. Qxc1 Ra6 18. e5 Nc7 19. f4 b4
20. axb4 axb4 21. Rxa6 Nxa6 22. f5 b3 23. Qf4 Nc7 24. f6 g6 25. Qh4 Ne8
26. Qh6 b2 27. Rf4 b1=Q+! {Defending h7 by promoting with check and seizing control of the e1-h4 diagonal.}
28. Nf1 Qe1! {Halting Rh4 cold—White resigned immediately.} 0-1`,
  },
  {
    id: 'carlsen-anand-2013-g5',
    title: 'Carlsen’s First World Championship Win',
    subtitle: 'Carlsen vs. Anand · Chennai 2013 WCh G5',
    white: 'Magnus Carlsen',
    black: 'Viswanathan Anand',
    event: 'FIDE World Chess Championship',
    year: 2013,
    result: '1-0',
    eco: 'D31',
    opening: 'Semi-Slav Defense · Marshall Gambit',
    theme: 'Endgame',
    keyMove: '34. R1f2!',
    description:
      'Carlsen’s breakthrough first victory in a World Championship match: a textbook display of patient rook-and-bishop maneuvering that wore down Anand’s kingside pawns.',
    pgn: `[Event "FIDE World Chess Championship"]
[Site "Chennai IND"]
[Date "2013.11.15"]
[Round "5"]
[White "Magnus Carlsen"]
[Black "Viswanathan Anand"]
[Result "1-0"]
[WhiteElo "2870"]
[BlackElo "2775"]
[ECO "D31"]
[Opening "Semi-Slav Defense"]

1. c4 e6 2. d4 d5 3. Nc3 c6 4. e4 dxe4 5. Nxe4 Bb4+ 6. Nc3 c5 7. a3 Ba5
8. Nf3 Nf6 9. Be3 Nc6 10. Qd3 cxd4 11. Nxd4 Ng4 12. O-O-O Nxe3 13. fxe3 Bc7
14. Nxc6 bxc6 15. Qxd8+ Bxd8 16. Be2 Ke7 17. Bf3 Bd7 18. Ne4 Bb6 19. c5 f5
20. cxb6 fxe4 21. b7 Rab8 22. Bxe4 Rxb7 23. Rhf1 Rb5 24. Rf4 g5 25. Rf3 h5
26. Rdf1 Be8 27. Bc2 Rc5 28. Rf6 h4 29. e4 a5 30. Kd2 Rb5 31. b3 Bh5
32. Kc3 Rc5+ 33. Kb2 Rd8 34. R1f2! {Neutralizing Black's counterplay along the d-file while preparing Rh6.}
Rd4 35. Rh6 Bd1 36. Bb1 Rb5 37. Kc3 c5 38. Rb2 e5 39. Rg6 a4 40. Rg5 Rxb3+
41. Rxb3 Bxb3 42. Rxe5+ Kd6 43. Rh5 Rd1 44. e5+ Kd5 45. Bh7 Rc1+ 46. Kb2 Rg1
47. Bg8+ Kxc6 48. Rxh6+ Kd7 49. Bxb3 axb3 50. Kxb3 Rxg2 51. Rxh4 Ke6
52. a4 Kxe5 53. a5 Kd6 54. Rh7 Kd5 55. a6 c4+ 56. Kc3 Ra2 57. a7 Kc5 58. h4 1-0`,
  },
  {
    id: 'aronian-anand-2013',
    title: 'Anand’s Immortal',
    subtitle: 'Aronian vs. Anand · Wijk aan Zee 2013 Rd 4',
    white: 'Levon Aronian',
    black: 'Viswanathan Anand',
    event: 'Tata Steel Group A',
    year: 2013,
    result: '0-1',
    eco: 'D47',
    opening: 'Semi-Slav Defense · Meran',
    theme: 'Sacrifice',
    keyMove: '16... Nde5!!',
    description:
      'Viswanathan Anand played the finest game of his career in Wijk aan Zee, unleashing 15...Bc5! and 16...Nde5!! to dismantle Levon Aronian’s kingside in just 23 sparkling moves.',
    pgn: `[Event "Tata Steel Group A"]
[Site "Wijk aan Zee NED"]
[Date "2013.01.15"]
[Round "4"]
[White "Levon Aronian"]
[Black "Viswanathan Anand"]
[Result "0-1"]
[WhiteElo "2802"]
[BlackElo "2772"]
[ECO "D47"]
[Opening "Semi-Slav Defense"]

1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3 Nbd7 6. Bd3 dxc4 7. Bxc4 b5
8. Bd3 Bd6 9. O-O O-O 10. Qc2 Bb7 11. a3 Rc8 12. Ng5 c5 13. Nxh7 Ng4
14. f4 cxd4 15. exd4 Bc5! {A shocking tactical blow exploiting the pin along the a7-g1 diagonal.}
16. Be2 Nde5!! {Leaving both the bishop on c5 and rook on f8 hanging to unleash an unstoppable kingside attack.}
17. Bxg4 Bxd4+ 18. Kh1 Nxg4 19. Nxf8 f5! {Cutting off the white queen and preparing ...Qh4.}
20. Ng6 Qf6 21. h3 Qxg6 22. Qe2 Qh5 23. Qd3 Be3! {Blocking the defense of h3 and forcing immediate resignation.} 0-1`,
  },
  {
    id: 'nepomniachtchi-carlsen-2021-g9',
    title: 'Carlsen Traps the Bishop in Dubai',
    subtitle: 'Nepomniachtchi vs. Carlsen · Dubai 2021 WCh G9',
    white: 'Ian Nepomniachtchi',
    black: 'Magnus Carlsen',
    event: 'FIDE World Chess Championship',
    year: 2021,
    result: '0-1',
    eco: 'A13',
    opening: 'English Opening · Agincourt',
    theme: 'World Championship',
    keyMove: '27... c6!',
    description:
      'In Game 9 of the Dubai World Championship, Magnus Carlsen seized on 27.c5? with the instant bishop trap 27...c6!, winning a full piece and sealing a commanding match lead.',
    pgn: `[Event "FIDE World Chess Championship"]
[Site "Dubai UAE"]
[Date "2021.12.07"]
[Round "9"]
[White "Ian Nepomniachtchi"]
[Black "Magnus Carlsen"]
[Result "0-1"]
[WhiteElo "2782"]
[BlackElo "2856"]
[ECO "A13"]
[Opening "English Opening"]

1. c4 e6 2. g3 d5 3. Bg2 d4 4. Nf3 Nc6 5. O-O Bc5 6. d3 Nf6 7. Nbd2 a5
8. Nb3 Be7 9. e3 dxe3 10. Bxe3 Ng4 11. Bc5 O-O 12. d4 a4 13. Bxe7 Qxe7
14. Nc5 a3 15. bxa3 Rd8 16. Nb3 Nf6 17. Re1 Qxa3 18. Qe2 h6 19. h4 Bd7
20. Ne5 Be8 21. Qe3 Qb4 22. Reb1 Nxe5 23. dxe5 Ng4 24. Qe1 Qxe1+
25. Rxe1 h5 26. Bxb7 Ra4 27. c5? c6! {Trapping White's bishop completely on b7—Black wins a full piece.}
28. f3 Nh6 29. Re4 Ra7 30. Rb4 Rb8 31. a4 Raxb7 32. Rb6 Rxb6 33. cxb6 Rxb6
34. Nc5 Nf5 35. a5 Rb8 36. a6 Nxg3 37. Na4 c5 38. a7 Rd8 39. Nxc5 Ra8 0-1`,
  },
  {
    id: 'carlsen-anand-2014-g2',
    title: 'Carlsen’s Sochi Rook-Lift Attack',
    subtitle: 'Carlsen vs. Anand · Sochi 2014 WCh G2',
    white: 'Magnus Carlsen',
    black: 'Viswanathan Anand',
    event: 'FIDE World Chess Championship',
    year: 2014,
    result: '1-0',
    eco: 'C65',
    opening: 'Ruy Lopez · Berlin Defense',
    theme: 'Attack',
    keyMove: '14. Ra3!',
    description:
      'Carlsen demonstrated modern Berlin-crushing technique in Sochi with the imaginative rook lift 14.Ra3! and 19.Rg3!, building relentless pressure along the e-file and seventh rank.',
    pgn: `[Event "FIDE World Chess Championship"]
[Site "Sochi RUS"]
[Date "2014.11.09"]
[Round "2"]
[White "Magnus Carlsen"]
[Black "Viswanathan Anand"]
[Result "1-0"]
[WhiteElo "2863"]
[BlackElo "2792"]
[ECO "C65"]
[Opening "Ruy Lopez, Berlin Defense"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. d3 Bc5 5. O-O d6 6. Re1 O-O 7. Bxc6 bxc6
8. h3 Re8 9. Nbd2 Nd7 10. Nc4 Bb6 11. a4 a5 12. Nxb6 cxb6 13. d4 Qc7
14. Ra3! {A creative third-rank rook lift swinging directly toward Black's kingside.}
Nf8 15. dxe5 dxe5 16. Nh4 Rd8 17. Qh5 f6 18. Nf5 Be6 19. Rg3 Ng6 20. h4 Bxf5
21. exf5 Nf4 22. Bxf4 exf4 23. Rc3 c5 24. Re6 Rab8 25. Rc4 Qd7 26. Kh2 Rf8
27. Rce4 Rb7 28. Qe2 b5 29. b3 bxa4 30. bxa4 Rb4 31. Re7 Qd6 32. Qf3 Rxe4
33. Qxe4 f3+ 34. g3 h5 35. Qb7! {Infiltrating the seventh rank with lethal mating threats.} 1-0`,
  },
];
