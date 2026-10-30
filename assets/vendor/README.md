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
7.3 MB and loads only when chess starts. This single-threaded build does not require
cross-origin isolation headers, a backend, or additional allowed network domains.

The game calls Stockfish's UCI API in a Web Worker. Level 1 uses Skill Level 0,
depth 2 and a 150 ms limit; Level 2 uses Skill Level 6, depth 6 and 500 ms;
Level 3 uses Skill Level 14, depth 12 and 1500 ms. These are relative difficulty
settings, not claimed Elo ratings. chess.js validates every player and engine move.
