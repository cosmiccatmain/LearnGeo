# Chess dependencies

Geo Chess uses two established projects locally, without a remote service or API key:

- **chess.js 1.4.0**, the legal-move and game-state API by Jeff Hlywa and contributors.
  Upstream: https://github.com/jhlywa/chess.js/tree/v1.4.0
  Unmodified `dist/esm/chess.js` from npm `chess.js@1.4.0`; BSD-2-Clause, license in `chess.js/LICENSE`.
- **Stockfish.js 17.1.0**, the Stockfish WebAssembly port by Nathan Rugg for Chess.com.
  Upstream and corresponding source/build instructions: https://github.com/nmrugg/stockfish.js/tree/602fd7e1a571a2be71f242942db90483731f2a1f
  Package/source release: https://registry.npmjs.org/stockfish/-/stockfish-17.1.0.tgz
  Unmodified lite single-thread worker and matching WASM from npm `stockfish@17.1.0`.
  GPL-3.0, full license in `stockfish/COPYING`, upstream documentation in `stockfish/UPSTREAM.md`.
  Original engine: https://github.com/official-stockfish/Stockfish

Both npm archives were checked against their published SHA-512 integrity before extraction.
Keep the Stockfish JavaScript and WASM filenames together and unchanged. The WASM is about
7.3 MB and loads only when chess starts at Level 2 or above. Level 1 uses the chess.js
legal-move API without loading Stockfish. This single-threaded build does not require
cross-origin isolation headers, a backend, or additional allowed network domains.

The game calls Stockfish's UCI API in a Web Worker. Level 1 chooses uniformly among
legal moves, without searching ahead. Level 2 chooses a random legal move about 40% of
the time; otherwise it uses Skill Level 3, depth 3 and a 250 ms limit. Level 3 uses
Skill Level 8, depth 7 and 700 ms; Level 4 uses Skill Level 15, depth 13 and 1800 ms;
Level 5 uses Skill Level 20, depth 18 and 3200 ms. Level 6 (Grandmaster) enables
`UCI_LimitStrength` with `UCI_Elo` 3190 (Stockfish’s rated ceiling, labelled ~3200) plus
deeper search (depth 22 / 5000 ms). Level 7 (Engine Max) disables strength limiting, keeps
Skill Level 20, and uses depth 28 / 9000 ms for the practical lite-engine ceiling on-device.
Levels 1–5 keep their hardened LEA-35 levers. chess.js validates every player and engine move, including
castling, en passant, promotion, check/checkmate/stalemate, threefold repetition and the
fifty-move rule. Opening names come from the local ECO book in `assets/js/chess-openings.js`.
