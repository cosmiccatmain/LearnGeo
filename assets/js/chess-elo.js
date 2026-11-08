/* ------------------------------------------------------------------
   LearnGeo — Geo Chess Elo helper (LEA-60 / LEA-68 / LEA-76).

   One rating for Geo Chess: vs-bot games and in-game PvP (challenge by
   gamertag). Starting Elo 1000, K=32 (school-friendly). Bot nominal
   Elos match difficulty. Server RPCs in supabase/deployed/0024_chess_elo.sql
   (+ weekly ladder in 0030_chess_weekly_ladder.sql) are authoritative
   when online; this module keeps local state.games.chess.elo in sync
   for UI and offline play.

   Legacy win/draw/loss counts (pre-Elo, or older Chess Duel records)
   convert once into a starting rating so existing players are not
   zeroed at 1000. See seedFromLegacy().

   LEA-76: weekly Elo ladder (UTC ISO week, ranked by Elo gained) and
   last-opponent rematch helpers for in-game Geo Chess PvP.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var START = 1000;
  var K = 32;
  var MIN = 100;
  var MAX = 3500;
  /* Seeded ratings stay in a gentler band until real rated games move them. */
  var SEED_MAX = 2000;
  var SEED_WIN = 24;
  var SEED_LOSS = 16;
  var SEED_DRAW = 8;

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

  function duelRecord() {
    var W = global.WW;
    if (!W || !W.state) return {};
    var games = W.state.games || {};
    return games.chessduel || {};
  }

  /* Convert prior win/score tallies → starting Elo.
     Formula (documented in PR / ship notes):
       seed = clamp(1000 + 24·wins − 16·losses + 8·draws, 100, 2000)
     Wins/draws come from Geo Chess + legacy Chess Duel local records.
     Losses ≈ max(0, finished − wins − draws). Runs once per device
     while no rated Elo games have been recorded yet and Elo is still
     at the default (or unset). */
  function seedEloFromCounts(wins, draws, losses) {
    wins = Math.max(0, Math.round(Number(wins) || 0));
    draws = Math.max(0, Math.round(Number(draws) || 0));
    losses = Math.max(0, Math.round(Number(losses) || 0));
    if (wins + draws + losses === 0) return START;
    var raw = START + SEED_WIN * wins - SEED_LOSS * losses + SEED_DRAW * draws;
    if (raw > SEED_MAX) raw = SEED_MAX;
    return clamp(raw);
  }

  function seedFromLegacy(rec) {
    if (!rec || rec.eloSeeded) return;
    if ((rec.eloGames || 0) > 0) {
      rec.eloSeeded = true;
      return;
    }
    /* Already moved off the default by a prior rated path — leave it. */
    if (typeof rec.elo === 'number' && isFinite(rec.elo) && rec.elo !== START) {
      rec.eloSeeded = true;
      return;
    }
    var duel = duelRecord();
    var wins = (rec.wins || 0) + (duel.wins || 0);
    var draws = (rec.draws || 0) + (duel.draws || 0);
    var finished = (rec.completed || 0) + (duel.runs || 0);
    var losses = Math.max(0, finished - wins - draws);
    var seeded = seedEloFromCounts(wins, draws, losses);
    rec.elo = seeded;
    rec.eloSeeded = true;
    if (seeded !== START && !(rec.eloGames > 0)) {
      /* Mark as having history so leaderboard can publish the seed. */
      rec.eloGames = Math.max(1, wins + draws + losses);
      rec.eloFromLegacy = true;
    }
    if (global.WW && global.WW.save) global.WW.save();
  }

  function ensure(rec) {
    rec = rec || chessRecord();
    if (!rec) return START;
    seedFromLegacy(rec);
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

  /* Pull server rating into local state when available.
     Prefer server when it already has rated games; otherwise keep a
     local legacy seed and push it up once. */
  function applyWeekFields(rec, data) {
    if (!rec || !data) return;
    if (typeof data.week_key === 'string') rec.weekKey = data.week_key;
    if (typeof data.week_delta === 'number') rec.weekDelta = data.week_delta;
    if (typeof data.week_games === 'number') rec.weekGames = data.week_games;
  }

  function pull() {
    var c = sb(), id = deviceId(), rec = chessRecord();
    if (!c || !id || !rec) return Promise.resolve(ensure(rec));
    ensure(rec);
    return c.rpc('get_chess_elo', { p_device: id }).then(function (res) {
      var data = res && res.data;
      if (data && data.ok && typeof data.elo === 'number') {
        var serverGames = typeof data.games === 'number' ? data.games : 0;
        applyWeekFields(rec, data);
        if (serverGames > 0 || !rec.eloFromLegacy) {
          rec.elo = clamp(data.elo);
          rec.eloGames = serverGames;
          rec.eloSeeded = true;
          if (global.WW && global.WW.save) global.WW.save();
          return rec.elo;
        }
        /* Server still provisional — push legacy seed so leaderboard
           matches what the player sees locally. */
        return pushSeed(rec);
      }
      return ensure(rec);
    }, function () { return ensure(rec); });
  }

  /* ISO week label matching private.chess_week_key (UTC Monday). */
  function weekKey(d) {
    d = d ? new Date(d) : new Date();
    var utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    var y = utc.getUTCFullYear();
    return y + '-W' + (week < 10 ? '0' + week : String(week));
  }

  function fmtWeekDelta(d) {
    d = Math.round(Number(d) || 0);
    if (!d) return '±0';
    return (d > 0 ? '+' : '') + d;
  }

  function weeklyLadder(limit) {
    var c = sb(), id = deviceId();
    if (!c) {
      return Promise.resolve({ ok: false, error: 'offline', week_key: weekKey(), rows: [], me: null });
    }
    return c.rpc('chess_weekly_ladder', {
      p_device: id || null,
      p_limit: typeof limit === 'number' ? limit : 10
    }).then(function (res) {
      var data = res && res.data;
      if (data && data.ok) {
        var rec = chessRecord();
        if (rec && data.me) {
          rec.weekKey = data.week_key || rec.weekKey;
          if (typeof data.me.week_delta === 'number') rec.weekDelta = data.me.week_delta;
          if (typeof data.me.week_games === 'number') rec.weekGames = data.me.week_games;
          if (global.WW && global.WW.save) global.WW.save();
        }
        return data;
      }
      return { ok: false, error: 'offline', week_key: weekKey(), rows: [], me: null };
    }, function () {
      return { ok: false, error: 'offline', week_key: weekKey(), rows: [], me: null };
    });
  }

  function rememberLastOpponent(tag) {
    var rec = chessRecord();
    if (!rec || !tag) return;
    tag = String(tag).trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(tag)) return;
    rec.lastOpponentTag = tag;
    if (global.WW && global.WW.save) global.WW.save();
  }

  function lastOpponentLocal() {
    var rec = chessRecord();
    var tag = rec && rec.lastOpponentTag;
    return tag && /^[A-Za-z0-9_]{3,16}$/.test(tag) ? tag : null;
  }

  function lastOpponent() {
    var local = lastOpponentLocal();
    var c = sb(), id = deviceId();
    if (!c || !id || !global.Cloud || !global.Cloud.signedIn) {
      return Promise.resolve(local ? { ok: true, found: true, tag: local, local: true } : { ok: true, found: false });
    }
    return c.rpc('chess_duel_last_opponent', { p_device: id }).then(function (res) {
      var data = res && res.data;
      if (data && data.ok && data.found && data.tag) {
        rememberLastOpponent(data.tag);
        return data;
      }
      if (local) return { ok: true, found: true, tag: local, local: true };
      return data || { ok: true, found: false };
    }, function () {
      return local ? { ok: true, found: true, tag: local, local: true } : { ok: true, found: false };
    });
  }

  function pushSeed(rec) {
    var c = sb(), id = deviceId();
    if (!c || !id || !rec || !global.Cloud || !global.Cloud.signedIn) {
      return Promise.resolve(ensure(rec));
    }
    ensure(rec);
    if (!rec.eloFromLegacy || rec.eloSeedPushed) return Promise.resolve(rec.elo);
    return c.rpc('submit_chess_elo', { p_device: id, p_elo: rec.elo }).then(function (res) {
      var data = res && res.data;
      if (data && data.ok && typeof data.elo === 'number') {
        rec.elo = clamp(data.elo);
        rec.eloSeedPushed = true;
        rememberSent(rec.elo);
        if (global.WW && global.WW.save) global.WW.save();
        if (global.GameBoards && global.GameBoards.touch) global.GameBoards.touch();
      }
      return rec.elo;
    }, function () { return rec.elo; });
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
        applyWeekFields(rec, data);
        rec.eloFromLegacy = false;
        rememberSent(rec.elo);
        if (global.WW && global.WW.saveNow) global.WW.saveNow();
        return done({
          elo: rec.elo,
          delta: data.delta || 0,
          before: data.before,
          opp: opp,
          week_delta: data.week_delta,
          server: true
        });
      }
      /* Server rejected (no tag / blocked / etc.) — keep local. */
      return done(local);
    }, function () { return done(local); });
  }

  /* Geo Chess PvP: server applies both sides once; sync local from result. */
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
        applyWeekFields(rec, data);
        rec.eloFromLegacy = false;
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
    SEED_WIN: SEED_WIN,
    SEED_LOSS: SEED_LOSS,
    SEED_DRAW: SEED_DRAW,
    SEED_MAX: SEED_MAX,
    expected: expected,
    next: next,
    seedEloFromCounts: seedEloFromCounts,
    ensure: ensure,
    applyLocal: applyLocal,
    botElo: botElo,
    fmt: fmt,
    fmtDelta: fmtDelta,
    fmtWeekDelta: fmtWeekDelta,
    weekKey: weekKey,
    weeklyLadder: weeklyLadder,
    rememberLastOpponent: rememberLastOpponent,
    lastOpponentLocal: lastOpponentLocal,
    lastOpponent: lastOpponent,
    pull: pull,
    afterBot: afterBot,
    afterDuel: afterDuel,
    current: function () { return ensure(chessRecord()); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
