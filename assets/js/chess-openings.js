/* Compact ECO / common-name opening book for Geo Chess.
   Keys are space-separated SAN (no move numbers). Lookup prefers the
   longest matching prefix so later moves refine the name. */
(function (global) {
  'use strict';

  /* Curated classroom-safe set: main lines students meet early. */
  var BOOK = {
    'e4': { eco: 'B00', name: "King's Pawn Opening" },
    'e4 e5': { eco: 'C20', name: 'Open Game' },
    'e4 e5 Nf3': { eco: 'C40', name: "King's Knight Opening" },
    'e4 e5 Nf3 Nc6': { eco: 'C50', name: 'Italian / Spanish family' },
    'e4 e5 Nf3 Nc6 Bb5': { eco: 'C60', name: 'Ruy Lopez' },
    'e4 e5 Nf3 Nc6 Bb5 a6': { eco: 'C70', name: 'Ruy Lopez' },
    'e4 e5 Nf3 Nc6 Bb5 a6 Ba4': { eco: 'C70', name: 'Ruy Lopez' },
    'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6': { eco: 'C78', name: 'Ruy Lopez: Morphy Defence' },
    'e4 e5 Nf3 Nc6 Bc4': { eco: 'C50', name: 'Italian Game' },
    'e4 e5 Nf3 Nc6 Bc4 Bc5': { eco: 'C50', name: 'Giuoco Piano' },
    'e4 e5 Nf3 Nc6 Bc4 Nf6': { eco: 'C55', name: 'Two Knights Defence' },
    'e4 e5 Nf3 Nc6 d4': { eco: 'C44', name: 'Scotch Game' },
    'e4 e5 Nf3 Nc6 Nc3': { eco: 'C46', name: 'Three Knights Opening' },
    'e4 e5 Nf3 Nc6 Nc3 Nf6': { eco: 'C46', name: 'Four Knights Game' },
    'e4 e5 Nf3 Nf6': { eco: 'C42', name: 'Petrov Defence' },
    'e4 e5 Nf3 d6': { eco: 'C41', name: 'Philidor Defence' },
    'e4 e5 f4': { eco: 'C30', name: "King's Gambit" },
    'e4 e5 Nc3': { eco: 'C25', name: 'Vienna Game' },
    'e4 c5': { eco: 'B20', name: 'Sicilian Defence' },
    'e4 c5 Nf3': { eco: 'B27', name: 'Sicilian Defence' },
    'e4 c5 Nf3 d6': { eco: 'B50', name: 'Sicilian Defence' },
    'e4 c5 Nf3 d6 d4': { eco: 'B54', name: 'Sicilian Defence: Open' },
    'e4 c5 Nf3 d6 d4 cxd4': { eco: 'B54', name: 'Sicilian Defence: Open' },
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4': { eco: 'B54', name: 'Sicilian Defence: Open' },
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6': { eco: 'B54', name: 'Sicilian Defence' },
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3': { eco: 'B56', name: 'Sicilian Defence' },
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6': { eco: 'B90', name: 'Sicilian: Najdorf' },
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6': { eco: 'B70', name: 'Sicilian: Dragon' },
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6': { eco: 'B80', name: 'Sicilian: Scheveningen' },
    'e4 c5 Nf3 Nc6': { eco: 'B30', name: 'Sicilian Defence' },
    'e4 c5 Nf3 Nc6 d4': { eco: 'B32', name: 'Sicilian Defence: Open' },
    'e4 c5 Nf3 e6': { eco: 'B40', name: 'Sicilian: French Variation' },
    'e4 c5 c3': { eco: 'B22', name: 'Sicilian: Alapin' },
    'e4 c5 Nc3': { eco: 'B23', name: 'Sicilian: Closed' },
    'e4 e6': { eco: 'C00', name: 'French Defence' },
    'e4 e6 d4': { eco: 'C00', name: 'French Defence' },
    'e4 e6 d4 d5': { eco: 'C00', name: 'French Defence' },
    'e4 e6 d4 d5 Nc3': { eco: 'C10', name: 'French Defence' },
    'e4 e6 d4 d5 Nc3 Bb4': { eco: 'C15', name: 'French: Winawer' },
    'e4 e6 d4 d5 Nc3 Nf6': { eco: 'C11', name: 'French: Classical' },
    'e4 e6 d4 d5 Nd2': { eco: 'C03', name: 'French: Tarrasch' },
    'e4 e6 d4 d5 e5': { eco: 'C02', name: 'French: Advance' },
    'e4 e6 d4 d5 exd5': { eco: 'C01', name: 'French: Exchange' },
    'e4 c6': { eco: 'B10', name: 'Caro-Kann Defence' },
    'e4 c6 d4': { eco: 'B12', name: 'Caro-Kann Defence' },
    'e4 c6 d4 d5': { eco: 'B12', name: 'Caro-Kann Defence' },
    'e4 c6 d4 d5 Nc3': { eco: 'B15', name: 'Caro-Kann Defence' },
    'e4 c6 d4 d5 Nd2': { eco: 'B12', name: 'Caro-Kann Defence' },
    'e4 c6 d4 d5 e5': { eco: 'B12', name: 'Caro-Kann: Advance' },
    'e4 c6 d4 d5 exd5': { eco: 'B13', name: 'Caro-Kann: Exchange' },
    'e4 d5': { eco: 'B01', name: 'Scandinavian Defence' },
    'e4 d5 exd5': { eco: 'B01', name: 'Scandinavian Defence' },
    'e4 d5 exd5 Qxd5': { eco: 'B01', name: 'Scandinavian Defence' },
    'e4 d5 exd5 Nf6': { eco: 'B01', name: 'Scandinavian: Modern' },
    'e4 d6': { eco: 'B07', name: "Pirc Defence" },
    'e4 d6 d4': { eco: 'B07', name: "Pirc Defence" },
    'e4 d6 d4 Nf6': { eco: 'B07', name: "Pirc Defence" },
    'e4 d6 d4 Nf6 Nc3': { eco: 'B07', name: "Pirc Defence" },
    'e4 d6 d4 Nf6 Nc3 g6': { eco: 'B07', name: "Pirc Defence" },
    'e4 g6': { eco: 'B06', name: 'Modern Defence' },
    'e4 Nf6': { eco: 'A00', name: "Alekhine's Defence" },
    'e4 Nf6 e5': { eco: 'B02', name: "Alekhine's Defence" },
    'e4 Nf6 e5 Nd5': { eco: 'B02', name: "Alekhine's Defence" },
    'd4': { eco: 'A40', name: "Queen's Pawn Opening" },
    'd4 d5': { eco: 'D00', name: "Queen's Pawn Game" },
    'd4 d5 c4': { eco: 'D06', name: "Queen's Gambit" },
    'd4 d5 c4 e6': { eco: 'D30', name: "Queen's Gambit Declined" },
    'd4 d5 c4 e6 Nc3': { eco: 'D35', name: "Queen's Gambit Declined" },
    'd4 d5 c4 e6 Nc3 Nf6': { eco: 'D35', name: "Queen's Gambit Declined" },
    'd4 d5 c4 c6': { eco: 'D10', name: 'Slav Defence' },
    'd4 d5 c4 c6 Nc3': { eco: 'D10', name: 'Slav Defence' },
    'd4 d5 c4 c6 Nf3': { eco: 'D11', name: 'Slav Defence' },
    'd4 d5 c4 dxc4': { eco: 'D20', name: "Queen's Gambit Accepted" },
    'd4 d5 Nf3': { eco: 'D02', name: "Queen's Pawn Game" },
    'd4 d5 Nf3 Nf6': { eco: 'D02', name: "Queen's Pawn Game" },
    'd4 d5 Nf3 Nf6 c4': { eco: 'D06', name: "Queen's Gambit" },
    'd4 d5 Bf4': { eco: 'D00', name: 'London System' },
    'd4 d5 Nf3 Nf6 Bf4': { eco: 'D02', name: 'London System' },
    'd4 Nf6': { eco: 'A45', name: 'Indian Defence' },
    'd4 Nf6 c4': { eco: 'A50', name: 'Indian Defence' },
    'd4 Nf6 c4 e6': { eco: 'E00', name: "Queen's Indian / Nimzo family" },
    'd4 Nf6 c4 e6 Nc3': { eco: 'E20', name: 'Nimzo-Indian family' },
    'd4 Nf6 c4 e6 Nc3 Bb4': { eco: 'E20', name: 'Nimzo-Indian Defence' },
    'd4 Nf6 c4 e6 Nf3': { eco: 'E10', name: "Queen's Indian family" },
    'd4 Nf6 c4 e6 Nf3 b6': { eco: 'E12', name: "Queen's Indian Defence" },
    'd4 Nf6 c4 g6': { eco: 'E60', name: "King's Indian Defence" },
    'd4 Nf6 c4 g6 Nc3': { eco: 'E61', name: "King's Indian Defence" },
    'd4 Nf6 c4 g6 Nc3 Bg7': { eco: 'E61', name: "King's Indian Defence" },
    'd4 Nf6 c4 g6 Nc3 Bg7 e4': { eco: 'E70', name: "King's Indian Defence" },
    'd4 Nf6 c4 g6 Nc3 d5': { eco: 'D80', name: 'Grünfeld Defence' },
    'd4 Nf6 c4 c5': { eco: 'A56', name: 'Benoni Defence' },
    'd4 Nf6 c4 e5': { eco: 'A51', name: 'Budapest Gambit' },
    'd4 Nf6 Nf3': { eco: 'A46', name: 'Indian Defence' },
    'd4 Nf6 Nf3 e6': { eco: 'A46', name: 'Indian Defence' },
    'd4 Nf6 Nf3 g6': { eco: 'A49', name: "King's Indian family" },
    'd4 Nf6 Nf3 g6 Bf4': { eco: 'A48', name: 'London System vs Kingside Fianchetto' },
    'd4 f5': { eco: 'A80', name: 'Dutch Defence' },
    'd4 e6': { eco: 'A40', name: "Queen's Pawn Opening" },
    'd4 e6 c4': { eco: 'A40', name: "Queen's Pawn Opening" },
    'd4 e6 c4 Bb4+': { eco: 'A40', name: 'Keres Defence' },
    'c4': { eco: 'A10', name: 'English Opening' },
    'c4 e5': { eco: 'A20', name: 'English Opening' },
    'c4 e5 Nc3': { eco: 'A25', name: 'English Opening' },
    'c4 c5': { eco: 'A30', name: 'English: Symmetrical' },
    'c4 Nf6': { eco: 'A15', name: 'English Opening' },
    'c4 e6': { eco: 'A13', name: 'English Opening' },
    'Nf3': { eco: 'A04', name: 'Réti Opening' },
    'Nf3 d5': { eco: 'A06', name: 'Réti Opening' },
    'Nf3 Nf6': { eco: 'A05', name: 'Réti Opening' },
    'Nf3 c5': { eco: 'A04', name: 'Réti Opening' },
    'g3': { eco: 'A00', name: "Benko's Opening" },
    'b3': { eco: 'A01', name: "Nimzo-Larsen Attack" },
    'f4': { eco: 'A02', name: "Bird's Opening" },
    'Nc3': { eco: 'A00', name: 'Van Geet Opening' },
    'b4': { eco: 'A00', name: 'Polish Opening' }
  };

  /* Show a named opening once a few plies are on the board. */
  var MIN_PLIES = 3;

  function lookup(historySan) {
    if (!historySan || !historySan.length) return null;
    var moves = historySan.slice();
    while (moves.length >= MIN_PLIES) {
      var key = moves.join(' ');
      if (BOOK[key]) {
        var hit = BOOK[key];
        return { eco: hit.eco, name: hit.name, plies: moves.length };
      }
      moves.pop();
    }
    /* Fall back to a 2-ply name when that is all we have matched later. */
    if (historySan.length >= MIN_PLIES) {
      var short = historySan.slice(0, 2).join(' ');
      if (BOOK[short]) {
        return { eco: BOOK[short].eco, name: BOOK[short].name, plies: 2 };
      }
    }
    return null;
  }

  function label(hit) {
    if (!hit) return '';
    return hit.eco ? (hit.eco + ' · ' + hit.name) : hit.name;
  }

  global.ChessOpenings = {
    lookup: lookup,
    label: label,
    minPlies: MIN_PLIES,
    book: BOOK
  };
})(window);
