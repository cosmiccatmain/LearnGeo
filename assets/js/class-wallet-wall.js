/* ------------------------------------------------------------------
   LearnGeo — Class wallet wall (LEA-75).

   Teacher-only view of students’ unlocked achievement wallets and a
   recent-unlocks feed. Data RPC only — no screen mirroring, no Daily,
   no Stripe.

   ClassWalletWall.mount(el, { classId })
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var POLL_MS = 45e3;
  var hostEl = null;
  var opts = null;
  var timer = null;
  var last = null;
  var loading = false;
  var dead = false;

  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }

  function catalog() {
    var C = global.Cosmetics && global.Cosmetics.achievements;
    return Array.isArray(C) ? C : [];
  }

  function achMeta(id) {
    var list = catalog();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return { id: id, name: id, desc: '' };
  }

  function missing(err) {
    if (!err) return false;
    var msg = String(err.message || '');
    if (err.code === 'PGRST202') return true;
    if (err.code === '42883') return /function/i.test(msg);
    if (err.code) return false;
    return /could not find the function/i.test(msg);
  }

  function rpc(fn, args) {
    var C = global.Cloud;
    if (dead) return Promise.resolve({ ok: false, kind: 'nomigration' });
    if (!C || !C.ready || !C.sb) return Promise.resolve({ ok: false, kind: 'notready' });
    return C.sb.rpc(fn, args || {}).then(function (res) {
      if (!res.error) return { ok: true, data: res.data };
      if (missing(res.error)) { dead = true; return { ok: false, kind: 'nomigration' }; }
      return { ok: false, kind: 'error', message: res.error.message || 'That did not work.' };
    }, function (e) {
      return { ok: false, kind: 'error', message: String((e && e.message) || e) };
    });
  }

  function fmtWhen(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    var sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 60) return 'just now';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    if (sec < 86400 * 7) return Math.floor(sec / 86400) + 'd ago';
    try {
      return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  function chip(id) {
    var a = achMeta(id);
    return '<span class="cww-chip" title="' + esc(a.desc || a.name) + '">' +
      esc(a.name) + '</span>';
  }

  function emptyState(title, body) {
    return '<div class="cww-empty">' +
      '<b>' + esc(title) + '</b>' +
      '<p>' + esc(body) + '</p>' +
      '</div>';
  }

  function paint() {
    if (!hostEl) return;
    var C = global.Cloud;
    var classId = opts && opts.classId;

    if (!C || !C.signedIn) {
      hostEl.innerHTML =
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Wallet wall</h3></div>' +
          emptyState('Sign in to see wallets',
            'Student achievement wallets sync with their accounts. Sign in, then put the class online.') +
        '</div>';
      return;
    }
    if (!classId) {
      hostEl.innerHTML =
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Wallet wall</h3></div>' +
          emptyState('Put the class online',
            'Use the class code button at the top so student wallets can reach this wall.') +
        '</div>';
      return;
    }
    if (dead) {
      hostEl.innerHTML =
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Wallet wall</h3></div>' +
          emptyState('Almost ready',
            'The class wallet wall needs a short database update. It will light up here once that lands.') +
        '</div>';
      return;
    }

    var students = (last && last.students) || [];
    var feed = (last && last.feed) || [];
    var totalUnlocked = 0;
    students.forEach(function (s) {
      totalUnlocked += (s && s.unlocked_count) | 0;
    });

    var head =
      '<div class="cr-card cww-head">' +
        '<div class="cr-card__head">' +
          '<h3>Wallet wall</h3>' +
          '<button type="button" class="btn btn--ghost btn--sm" id="cww-refresh" ' +
            (loading ? 'disabled' : '') + '>' +
            I.refresh + (loading ? ' Refreshing…' : ' Refresh') +
          '</button>' +
        '</div>' +
        '<p class="t-sm t-muted cww-lead">' +
          'Unlocked achievement cards across the class — not a live screen share. ' +
          'Students keep earning on their own devices; this wall only reads what they have unlocked.' +
        '</p>' +
        '<div class="cww-stats">' +
          '<div class="cww-stat"><b>' + students.length + '</b><span>students</span></div>' +
          '<div class="cww-stat"><b>' + totalUnlocked + '</b><span>unlocks on wall</span></div>' +
          '<div class="cww-stat"><b>' + feed.length + '</b><span>recent events</span></div>' +
        '</div>' +
      '</div>';

    var feedHtml = '<div class="cr-card cww-feed">' +
      '<div class="cr-card__head"><h3>Recent unlocks</h3></div>';
    if (!feed.length) {
      feedHtml += emptyState('No recent unlocks yet',
        'When a signed-in student unlocks an achievement, it shows up here for the class.');
    } else {
      feedHtml += '<ul class="cww-feed__list">';
      feed.forEach(function (row) {
        var meta = achMeta(row.achievement_id);
        feedHtml +=
          '<li class="cww-feed__row">' +
            '<span class="cww-feed__who">' + esc(row.name || 'Explorer') + '</span>' +
            '<span class="cww-feed__got">unlocked <b>' + esc(meta.name) + '</b></span>' +
            '<span class="cww-feed__when">' + esc(fmtWhen(row.unlocked_at)) + '</span>' +
          '</li>';
      });
      feedHtml += '</ul>';
    }
    feedHtml += '</div>';

    var wallHtml = '<div class="cr-card cww-wall">' +
      '<div class="cr-card__head"><h3>Student wallets</h3></div>';
    if (!students.length) {
      wallHtml += emptyState('Nobody on the roster yet',
        'Once students join with the class code, their unlocked cards appear here.');
    } else {
      wallHtml += '<div class="cww-grid">';
      students.forEach(function (s) {
        var ids = Array.isArray(s.achievements) ? s.achievements : [];
        var n = (s.unlocked_count | 0) || ids.length;
        var chips = ids.length
          ? ids.map(chip).join('')
          : '<span class="cww-none">No cards unlocked yet</span>';
        wallHtml +=
          '<article class="cww-tile">' +
            '<header class="cww-tile__h">' +
              '<b>' + esc(s.name || 'Explorer') + '</b>' +
              '<span class="cww-tile__n">' + n + ' unlocked</span>' +
            '</header>' +
            '<div class="cww-tile__chips">' + chips + '</div>' +
          '</article>';
      });
      wallHtml += '</div>';
    }
    wallHtml += '</div>';

    hostEl.innerHTML = head + feedHtml + wallHtml;

    var btn = document.getElementById('cww-refresh');
    if (btn) btn.addEventListener('click', function () { refresh(true); });
  }

  function refresh(force) {
    if (!hostEl) return Promise.resolve();
    if (loading && !force) return Promise.resolve();
    var classId = opts && opts.classId;
    if (!classId || dead) { paint(); return Promise.resolve(); }
    loading = true;
    paint();
    return rpc('class_wallet_wall', { p_class: classId }).then(function (r) {
      loading = false;
      if (r.kind === 'nomigration') { paint(); return; }
      if (!r.ok) {
        last = last || { students: [], feed: [] };
        paint();
        if (r.message && W.toast) {
          W.toast('Wallet wall', r.message, I.info, 3200);
        }
        return;
      }
      var data = r.data || {};
      if (data && data.ok === false) {
        if (data.error === 'forbidden') {
          hostEl.innerHTML =
            '<div class="cr-card">' +
              emptyState('Not your class', 'Only teachers on this class can open the wallet wall.') +
            '</div>';
          return;
        }
        last = { students: [], feed: [] };
        paint();
        return;
      }
      last = {
        students: Array.isArray(data.students) ? data.students : [],
        feed: Array.isArray(data.feed) ? data.feed : []
      };
      paint();
    });
  }

  function stopPoll() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function startPoll() {
    stopPoll();
    timer = setInterval(function () {
      if (!hostEl || !document.body.contains(hostEl)) { unmount(); return; }
      refresh(false);
    }, POLL_MS);
  }

  function mount(el, next) {
    unmount();
    hostEl = el;
    opts = next || {};
    last = null;
    loading = false;
    paint();
    refresh(true);
    startPoll();
  }

  function unmount() {
    stopPoll();
    hostEl = null;
    opts = null;
  }

  global.ClassWalletWall = {
    mount: mount,
    unmount: unmount,
    refresh: function () { return refresh(true); }
  };
})(window);
