/* Geo Chess: chess.js rules and Stockfish's UCI API in a dedicated worker.
   Dependencies are pinned and served locally; see assets/vendor/README.md. */
import { Chess } from '../vendor/chess.js/chess.js';

const LEVELS = {
  1: { random: 1 },
  2: { random: 0.75, skill: 0, depth: 1, time: 100 },
  3: { random: 0, skill: 0, depth: 2, time: 150 },
  4: { random: 0, skill: 6, depth: 6, time: 500 },
  5: { random: 0, skill: 14, depth: 12, time: 1500 }
};
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const ENGINE = new URL('../vendor/stockfish/stockfish-17.1-lite-single-03e3232.js', import.meta.url);

function mount(host, opts) {
  const W = window.WW, esc = W.escapeHtml;
  const level = LEVELS[opts.level] ? Number(opts.level) : 1;
  const opponent = level === 1 ? 'Computer' : 'Stockfish';
  const record = W.state.games.chess || (W.state.games.chess = {});
  let chess = new Chess(), worker = null, timer = null, disposed = false;
  let ready = false, engineError = '', thinking = false, ended = false;
  let selected = null, promotion = null, lastMove = null, unlocked = false;
  let question = null, feedback = null, answered = false, recent = [];
  let result = '', correctCount = 0, askedCount = 0;

  host.innerHTML = '<section class="chess-game" aria-label="Geo Chess">' +
    '<div class="chess-main"><div class="chess-heading"><div><span class="eyebrow">You play White</span>' +
    '<h2>Geo Chess</h2></div><span class="chip">Level ' + level + '</span></div>' +
    '<p class="chess-status" role="status" aria-live="polite"></p>' +
    '<div class="chess-board" role="group" aria-label="Chessboard, White at the bottom"></div>' +
    '<div class="chess-promotion"></div>' +
    '<div class="chess-actions"><button class="btn btn--ghost" data-new>New game</button>' +
    '<button class="btn btn--ghost" data-resign>Resign</button></div>' +
    '<details class="chess-history"><summary>Move history</summary><p data-moves>No moves yet.</p></details></div>' +
    '<aside class="chess-side"><div class="panel chess-question"></div>' +
    '<div class="panel chess-help"><h3>Plan your next move</h3>' +
    '<p>Answer a geography question, then select a white piece and a highlighted destination. Wrong answers give you another question without changing the board.</p>' +
    '<p>Use the arrow keys to explore the board and Enter or Space to select. Choose a piece when a pawn promotes.</p>' +
    '<p class="t-sm t-muted">' + (level === 1 ? 'Level 1 plays random legal moves for beginners. Higher levels use ' : level === 2 ? 'Level 2 plays mostly random moves, with occasional moves from ' : 'Opponent: ') +
    '<a href="https://stockfishchess.org/" target="_blank" rel="noopener noreferrer">Stockfish 17.1</a>. ' +
    'Rules: <a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noopener noreferrer">chess.js</a>. Runs on your device.</p></div></aside></section>';
  const root = host.querySelector('.chess-game');
  const board = root.querySelector('.chess-board');
  const panel = root.querySelector('.chess-question');
  const status = root.querySelector('.chess-status');

  function canMove() { return ready && !engineError && !thinking && !ended && unlocked && chess.turn() === 'w'; }

  function draw() {
    if (disposed) return;
    status.textContent = engineError ? 'Opponent unavailable. Retry to continue this position.' :
      ended ? result : !ready ? 'Loading Stockfish…' : thinking ? opponent + ' is thinking…' :
      (chess.isCheck() ? 'You are in check. ' : '') + (unlocked ? 'Your move. Select a white piece.' : 'Answer a question to unlock your move.');
    const focused = board.contains(document.activeElement) ? document.activeElement.dataset.square : null;
    const legal = selected && canMove() ? chess.moves({ square: selected, verbose: true }) : [];
    board.innerHTML = chess.board().map(function (row, rank) {
      return row.map(function (piece, file) {
        const square = 'abcdefgh'[file] + (8 - rank);
        const destination = legal.some(m => m.to === square);
        const label = square + ': ' + (piece ? (piece.color === 'w' ? 'White ' : 'Black ') + NAMES[piece.type] : 'empty') +
          (destination ? ', legal destination' : '');
        return '<button type="button" class="chess-square ' + ((rank + file) % 2 ? 'chess-square--dark' : 'chess-square--light') +
          (piece ? ' chess-piece--' + piece.color : '') + (selected === square ? ' is-selected' : '') +
          (destination ? ' is-legal' : '') + (lastMove && (lastMove.from === square || lastMove.to === square) ? ' is-last' : '') +
          '" data-square="' + square + '" aria-label="' + label + '" aria-pressed="' + (selected === square) +
          '" aria-disabled="' + (!canMove() || !!promotion) + '" tabindex="' + (square === (focused || 'e2') ? 0 : -1) + '">' +
          '<span class="chess-piece" aria-hidden="true">' + (piece ? GLYPHS[piece.type] : '') + '</span>' +
          '<span class="chess-coordinate" aria-hidden="true">' + square + '</span></button>';
      }).join('');
    }).join('');
    if (focused) board.querySelector('[data-square="' + focused + '"]').focus({ preventScroll: true });
    root.querySelector('[data-moves]').textContent = chess.history().map(function (move, i) {
      return (i % 2 === 0 ? (Math.floor(i / 2) + 1) + '. ' : '') + move;
    }).join(' ') || 'No moves yet.';
    root.querySelector('[data-resign]').disabled = ended || !chess.history().length;
    drawPromotion();
    drawQuestion();
  }

  function drawPromotion() {
    const box = root.querySelector('.chess-promotion');
    box.innerHTML = promotion ? '<div class="panel" role="group" aria-label="Pawn promotion"><h3>Promote your pawn</h3>' +
      ['q', 'r', 'b', 'n'].map(p => '<button class="btn btn--ghost" data-promote="' + p + '">' + NAMES[p] + '</button>').join('') +
      '<button class="btn btn--ghost" data-cancel-promotion>Cancel</button></div>' : '';
    box.querySelectorAll('[data-promote]').forEach(b => b.addEventListener('click', function () {
      const move = { from: promotion.from, to: promotion.to, promotion: b.dataset.promote };
      promotion = null; playMove(move);
    }));
    const cancel = box.querySelector('[data-cancel-promotion]');
    if (cancel) cancel.onclick = function () { promotion = null; draw(); };
  }

  function ask() {
    unlocked = false; answered = false; feedback = null; selected = null; promotion = null;
    const cfg = opts.cfg();
    const pool = window.StudyFilters.pool(cfg);
    if (!pool.length) { question = null; return; }
    let type = opts.kind === 'capitals' ? 'capital' : opts.kind === 'mix' ? W.pick(['capital', 'flag']) : 'flag';
    let candidates = pool.filter(c => window.Quiz.fits(type, c));
    // Never widen the learner's selected set when it cannot support this question type.
    if (!candidates.length) { type = 'country'; candidates = pool; }
    const fresh = candidates.filter(c => recent.indexOf(c.name) === -1);
    if (fresh.length) candidates = fresh;
    const head = cfg.weakFirst ? candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 3))) : candidates;
    const target = W.pick(head);
    recent.push(target.name); if (recent.length > 8) recent.shift();
    const field = pool.length >= 5 ? pool : window.Quiz.pool({ scope: 'all' });
    question = window.Quiz.make(type, target, field, { typed: !!cfg.typed });
  }

  function drawQuestion() {
    if (engineError) {
      panel.innerHTML = '<h3>Reconnect your opponent</h3><p>Stockfish could not finish loading or choose a move. Your position is safe.</p>' +
        '<button class="btn btn--accent" data-retry>Retry Stockfish</button>';
      panel.querySelector('[data-retry]').onclick = startEngine;
      return;
    }
    if (ended) {
      panel.innerHTML = '<span class="eyebrow">Game over</span><h3>' + esc(result) + '</h3><p>' + correctCount + '/' + askedCount +
        ' geography answers correct.</p><button class="btn btn--accent" data-again>Play again</button>';
      panel.querySelector('[data-again]').onclick = reset;
      return;
    }
    if (thinking) { panel.innerHTML = '<h3>Over to ' + opponent + '</h3><p>Look for threats and plan your next move.</p>'; return; }
    if (!question) { panel.innerHTML = '<h3>No countries in this set</h3><p>Return to setup and choose at least one country.</p>'; return; }
    const q = question;
    panel.innerHTML = '<span class="eyebrow">Move question · ' + correctCount + '/' + askedCount + ' correct</span>' +
      '<h3>' + esc(q.prompt) + '</h3>' +
      (q.flag ? '<img class="chess-question__flag" src="' + esc(q.flag) + '" alt="Flag to identify">' : '<p class="chess-question__subject">' + esc(q.subject) + '</p>') +
      (!answered ? (q.typed ? '<form data-answer-form><label for="chess-answer">Your answer</label><input id="chess-answer" class="answer-input" autocomplete="off" maxlength="120" required' + (!ready ? ' disabled' : '') + '>' +
        '<button class="btn btn--accent" type="submit"' + (!ready ? ' disabled' : '') + '>Check answer</button></form>' :
        '<div class="chess-answers">' + q.choices.map((c, i) => '<button class="btn btn--ghost" data-answer="' + i + '"' + (!ready ? ' disabled' : '') + '>' + esc(c.text) + '</button>').join('') + '</div>') : '') +
      (feedback ? '<div class="chess-feedback" role="status"><b>' + (feedback.correct ? 'Correct! Your move is unlocked.' : 'The answer is ' + esc(q.answerText) + '.') +
        '</b><p>' + (feedback.correct ? '+' + feedback.xp + ' XP · Select a white piece to move.' : 'Take a moment to remember it, then try another question.') + '</p>' +
        (!feedback.correct ? '<button class="btn btn--accent" data-next-question>Next question</button>' : '') + '</div>' : '');
    panel.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => answer(q.choices[Number(b.dataset.answer)].text));
    const form = panel.querySelector('[data-answer-form]');
    if (form) form.onsubmit = function (e) { e.preventDefault(); answer(form.querySelector('input').value); };
    const next = panel.querySelector('[data-next-question]');
    if (next) next.onclick = function () { ask(); draw(); };
  }

  function answer(given) {
    if (disposed || !ready || engineError || thinking || ended || answered || !question || !given.trim()) return;
    answered = true; askedCount++;
    const correct = window.Quiz.grade(question, given);
    const gains = W.award(correct, { country: question.country.name });
    unlocked = correct; if (correct) correctCount++;
    feedback = { correct: correct, xp: gains.xp || 0 };
    W.save(); window.UI.refreshHud(true);
    W.announceAchievements(W.checkAchievements());
    draw();
    if (correct) board.querySelector('[data-square="e2"]').focus({ preventScroll: true });
    else panel.querySelector('[data-next-question]').focus({ preventScroll: true });
  }

  function choose(square) {
    if (!canMove() || promotion) return;
    const piece = chess.get(square);
    if (piece && piece.color === 'w') { selected = selected === square ? null : square; draw(); return; }
    if (!selected) return;
    const legal = chess.moves({ square: selected, verbose: true }).filter(m => m.to === square);
    if (!legal.length) return;
    if (legal.some(m => m.promotion)) {
      promotion = { from: selected, to: square }; draw();
      root.querySelector('[data-promote]').focus(); return;
    }
    playMove({ from: selected, to: square });
  }

  function playMove(move) {
    lastMove = chess.move(move);
    selected = null; unlocked = false;
    if (!checkEnd()) search();
    draw();
  }

  function checkEnd() {
    if (!chess.isGameOver()) return false;
    if (chess.isCheckmate()) finish(chess.turn() === 'b' ? 'You win by checkmate!' : opponent + ' wins by checkmate.', chess.turn() === 'b' ? 'win' : 'loss');
    else finish(chess.isStalemate() ? 'Draw by stalemate.' : chess.isThreefoldRepetition() ? 'Draw by repetition.' :
      chess.isInsufficientMaterial() ? 'Draw by insufficient material.' : 'Draw by the fifty-move rule.', 'draw');
    return true;
  }

  function finish(message, outcome) {
    if (ended) return;
    ended = true; thinking = false; unlocked = false; result = message;
    clearTimeout(timer);
    record.completed = (record.completed || 0) + 1;
    if (outcome === 'win') record.wins = (record.wins || 0) + 1;
    if (outcome === 'draw') record.draws = (record.draws || 0) + 1;
    W.saveNow(); draw();
  }

  function fail() {
    if (disposed) return;
    clearTimeout(timer); ready = false; thinking = false; engineError = 'Stockfish unavailable';
    if (worker) worker.terminate(); worker = null;
    draw();
  }

  function search() {
    if (!ready || disposed || ended || chess.turn() !== 'b') return;
    thinking = true;
    clearTimeout(timer);
    const strength = LEVELS[level];
    if (strength.random === 1 || (strength.random > 0 && Math.random() < strength.random)) {
      const move = W.pick(chess.moves({ verbose: true }));
      timer = setTimeout(function () {
        applyOpponentMove({ from: move.from, to: move.to, promotion: move.promotion });
      }, 450);
      return;
    }
    if (!worker) { fail(); return; }
    // Send full history, preserving repetition context in the engine as well as the rules API.
    const moves = chess.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')).join(' ');
    worker.postMessage('position startpos moves ' + moves);
    worker.postMessage('go depth ' + strength.depth + ' movetime ' + strength.time);
    timer = setTimeout(fail, 15000);
  }

  function applyOpponentMove(move) {
    if (disposed || ended || !thinking || chess.turn() !== 'b') return;
    clearTimeout(timer); thinking = false;
    try {
      lastMove = chess.move(move);
      if (!checkEnd()) ask();
      draw();
    } catch (_) { fail(); }
  }

  function startEngine() {
    if (disposed) return;
    clearTimeout(timer); if (worker) worker.terminate(); worker = null;
    engineError = ''; ready = false; thinking = false;
    if (level === 1) { ready = true; draw(); return; }
    try {
      const current = new Worker(ENGINE); worker = current;
      current.onerror = function (e) { e.preventDefault(); if (worker === current) fail(); };
      current.onmessage = function (event) {
        if (disposed || worker !== current) return;
        String(event.data).split('\n').forEach(function (line) {
          line = line.trim();
          if (line === 'uciok') {
            current.postMessage('setoption name Hash value 16');
            current.postMessage('setoption name Skill Level value ' + LEVELS[level].skill);
            current.postMessage('ucinewgame'); current.postMessage('isready');
          } else if (line === 'readyok' && !ready) {
            clearTimeout(timer); ready = true;
            if (chess.turn() === 'b' && !ended) search();
            draw();
          } else if (line.indexOf('bestmove ') === 0 && thinking) {
            const match = /^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?(?:\s|$)/.exec(line);
            if (!match) { fail(); return; }
            applyOpponentMove({ from: match[1], to: match[2], promotion: match[3] || 'q' });
          }
        });
      };
      current.postMessage('uci');
      timer = setTimeout(fail, 25000);
    } catch (_) { fail(); }
    draw();
  }

  function reset() {
    if (disposed) return;
    chess = new Chess(); ended = false; result = ''; lastMove = null;
    correctCount = 0; askedCount = 0; recent = [];
    ask(); startEngine();
  }

  board.addEventListener('click', function (e) {
    const square = e.target.closest('[data-square]');
    if (square) choose(square.dataset.square);
  });
  board.addEventListener('keydown', function (e) {
    const cell = e.target.closest('[data-square]'); if (!cell) return;
    const cells = Array.from(board.querySelectorAll('[data-square]'));
    const i = cells.indexOf(cell);
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[e.key];
    if (delta === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? Math.floor(i / 8) * 8 : e.key === 'End' ? Math.floor(i / 8) * 8 + 7 : Math.max(0, Math.min(63, i + delta));
    cells.forEach(c => c.tabIndex = -1); cells[next].tabIndex = 0; cells[next].focus();
  });
  root.querySelector('[data-new]').onclick = function () {
    if (!ended && chess.history().length && !window.confirm('Start a new game? This board will be cleared.')) return;
    reset();
  };
  root.querySelector('[data-resign]').onclick = function () {
    if (ended || !window.confirm('Resign this game?')) return;
    if (worker) worker.terminate(); worker = null;
    finish('You resigned. ' + opponent + ' wins.', 'loss');
  };
  ask(); startEngine();
  return {
    get fen() { return chess.fen(); },
    destroy: function () {
      disposed = true; clearTimeout(timer);
      if (worker) worker.terminate(); worker = null;
      host.innerHTML = '';
    }
  };
}

window.GeoChess = { mount: mount };
