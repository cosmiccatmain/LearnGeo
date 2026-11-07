/* ------------------------------------------------------------------
   LearnGeo — Geo Chess Elo helper (LEA-60).

   Shared rating for vs-bot Geo Chess and Chess Duel PvP. Starting Elo
   1000, K=32 (school-friendly). Bot nominal Elos match difficulty.
   Server RPCs in supabase/deployed/0024_chess_elo.sql are authoritative
   when online; this module keeps local state.games.chess.elo in sync
   for UI and offline play.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var START = 1000;
  var K = 32;
  var MIN = 100;
  var MAX = 3500;

  /* Nominal strength for each Geo Chess level (fair vs-bot updates). */
  var BOT = {
    1: 600,
    2: 850,
    3: 1100,
    4: 1400,
    5: 1700,
    6: 3190,
    7: 3500
  };

  function clamp(n) {
    n = Math.round(Number(n) || START);
    if (n < MIN) return MIN;
    if (n > MAX) return MAX;
    return n;
  }

  function expected(me, opp) {
    return 1 / (1 + Math.pow(10, (opp - me) / 400));
  }

  function scoreOf(outcome) {
    if (outcome === 'win') return 1;
    if (outcome === 'draw') return 0.5;
    return 0;
  }

  function next(me, opp, outcome) {
    me = clamp(me);
    opp = clamp(opp);
    var neu = clamp(me + K * (scoreOf(outcome) - expected(me, opp)));
    return { elo: neu, delta: neu - me, before: me, opp: opp };
  }

  function chessRecord() {
    var W = global.WW;
    if (!W || !W.state) return null;
    var games = W.state.games || (W.state.games = {});
    return games.chess || (games.chess = {});
  }

  function ensure(rec) {
    rec = rec || chessRecord();
    if (!rec) return START;
    if (typeof rec.elo !== 'number' || !isFinite(rec.elo)) {
      rec.elo = START;
    } else {
      rec.elo = clamp(rec.elo);
    }
    if (typeof rec.eloGames !== 'number' || rec.eloGames < 0) rec.eloGames = 0;
    return rec.elo;
  }

  function applyLocal(rec, oppElo, outcome) {
    rec = rec || chessRecord();
    if (!rec) return null;
    ensure(rec);
    var r = next(rec.elo, oppElo, outcome);
    rec.elo = r.elo;
    rec.eloGames = (rec.eloGames || 0) + 1;
    rec.lastEloDelta = r.delta;
    return r;
  }

  function botElo(level) {
    return BOT[level] || BOT[1];
  }

  function fmt(n) {
    return String(clamp(n));
  }

  function fmtDelta(d) {
    if (!d) return '±0';
    return (d > 0 ? '+' : '') + d;
  }

  function sb() {
    return global.Cloud && global.Cloud.sb;
  }

  function deviceId() {
    return global.GameBoards && global.GameBoards.deviceId
      ? global.GameBoards.deviceId()
      : (global.WW && global.WW.state && global.WW.state.deviceId) || null;
  }

  /* Pull server rating into local state when available. */
  function pull() {
    var c = sb(), id = deviceId(), rec = chessRecord();
    if (!c || !id || !rec) return Promise.resolve(ensure(rec));
    return c.rpc('get_chess_elo', { p_device: id }).then(function (res) {
      var data = res && res.data;
      if (data && data.ok && typeof data.elo === 'number') {
        rec.elo = clamp(data.elo);
        if (typeof data.games === 'number') rec.eloGames = data.games;
        if (global.WW && global.WW.save) global.WW.save();
      } else {
        ensure(rec);
      }
      return rec.elo;
    }, function () { return ensure(rec); });
  }

  function rememberSent(elo) {
    var W = global.WW;
    if (!W || !W.state) return;
    (W.state.boardSent || (W.state.boardSent = {})).chess = elo;
    if (W.save) W.save();
  }

  /* Vs-bot: try server apply, fall back to local math + board touch. */
  function afterBot(level, outcome) {
    var rec = chessRecord();
    if (!rec) return Promise.resolve(null);
    var opp = botElo(level);
    var c = sb(), id = deviceId();
    var local = applyLocal(rec, opp, outcome);
    if (global.WW && global.WW.saveNow) global.WW.saveNow();
    else if (global.WW && global.WW.save) global.WW.save();

    function done(r) {
      if (global.GameBoards && global.GameBoards.touch) global.GameBoards.touch();
      return r;
    }

    if (!c || !id || !global.Cloud || !global.Cloud.signedIn) return Promise.resolve(done(local));

    return c.rpc('apply_chess_bot_elo', {
      p_device: id, p_bot_elo: opp, p_outcome: outcome
    }).then(function (res) {
      var data = res && res.data;
      if (data && data.ok && typeof data.elo === 'number') {
        rec.elo = clamp(data.elo);
        if (typeof data.games === 'number') rec.eloGames = data.games;
        if (typeof data.delta === 'number') rec.lastEloDelta = data.delta;
        rememberSent(rec.elo);
        if (global.WW && global.WW.saveNow) global.WW.saveNow();
        return done({
          elo: rec.elo,
          delta: data.delta || 0,
          before: data.before,
          opp: opp,
          server: true
        });
      }
      /* Server rejected (no tag / blocked / etc.) — keep local. */
      return done(local);
    }, function () { return done(local); });
  }

  /* Chess Duel: server applies both sides once; sync local from result. */
  function afterDuel(matchId) {
    var rec = chessRecord();
    if (!rec) return Promise.resolve(null);
    ensure(rec);
    var c = sb(), id = deviceId();
    if (!c || !id || !matchId || !global.Cloud || !global.Cloud.signedIn) {
      return Promise.resolve({ elo: rec.elo, delta: 0, offline: true });
    }
    return c.rpc('apply_chess_duel_elo', {
      p_device: id, p_match: matchId
    }).then(function (res) {
      var data = res && res.data;
      if (data && data.ok && typeof data.elo === 'number') {
        rec.elo = clamp(data.elo);
        if (typeof data.games === 'number') rec.eloGames = data.games;
        if (typeof data.delta === 'number') rec.lastEloDelta = data.delta;
        rememberSent(rec.elo);
        if (global.WW && global.WW.saveNow) global.WW.saveNow();
        else if (global.WW && global.WW.save) global.WW.save();
        if (global.GameBoards && global.GameBoards.touch) global.GameBoards.touch();
        return data;
      }
      return { elo: rec.elo, delta: 0, error: data && data.error };
    }, function () { return { elo: rec.elo, delta: 0, offline: true }; });
  }

  global.ChessElo = {
    START: START,
    K: K,
    BOT: BOT,
    expected: expected,
    next: next,
    ensure: ensure,
    applyLocal: applyLocal,
    botElo: botElo,
    fmt: fmt,
    fmtDelta: fmtDelta,
    pull: pull,
    afterBot: afterBot,
    afterDuel: afterDuel,
    current: function () { return ensure(chessRecord()); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
