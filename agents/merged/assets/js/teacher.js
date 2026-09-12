/* ------------------------------------------------------------------
   LearnGeo — teacher workspace.

   Laid out like a classroom app: a banner with the class code, then
   Stream, Classwork, People and Analytics.

   The class lives on the server. Its code is issued when the class is
   created, assignments go out the moment they are saved, and scores come
   back on their own. Any score can still be typed straight into the
   gradebook, for the student who did it on paper.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, A = global.Assignments;

  var tab = 'stream';
  var draftPicker = null;
  var lastSync = 0;
  var featuresFor = null;      /* class whose switches we have already asked for */
  var featuresWatched = false;

  /* The two switches. on() is synchronous on purpose, and answers from the
     module's own defaults until the class has been read: live quiz on,
     leaderboard off. If the script never loaded we answer the same way, so a
     failed load can never switch the leaderboard ON for a class that never
     asked for it. Wrong in that direction is the one that shows every student
     their rank in front of the room. */
  function featureOn(key) {
    var F = global.ClassFeatures;
    if (F && typeof F.on === 'function') return F.on(key, cls().cloudId || '');
    return key === 'geolive';
  }

  /* load() is what turns those defaults into the class's real answer, and
     nothing else calls it until the teacher opens Settings. Without this, a
     teacher who switched the live quiz off would keep seeing the tab until
     they went back to look at the setting. Re-render on change so flipping a
     switch adds or removes the tab there and then. */
  function wireFeatures() {
    var F = global.ClassFeatures, id = cls().cloudId || '';
    if (!F || !id || featuresFor === id) return;
    featuresFor = id;
    if (!featuresWatched && typeof F.onChange === 'function') {
      featuresWatched = true;
      F.onChange(function () { render(true); });
    }
    if (typeof F.load === 'function') F.load(id);
  }

  /* ============================ going online ======================== */
  function online() { return !!(global.Cloud && global.Cloud.ready); }

  function cloudErr(e) {
    W.toast('Not saved online', global.Cloud ? global.Cloud.friendly(e) : 'Try again', I.info, 4200);
  }

  /* Pull the class down from the account: who joined, what is set, what
     came back. Throttled, since every tab switch redraws. */
  function syncSoon(force) {
    if (!online()) return;
    if (!force && Date.now() - lastSync < 15000) return;
    lastSync = Date.now();
    global.Cloud.teacherSync().then(function (changed) {
      var v = document.getElementById('view-teacher');
      if (changed && v && !v.classList.contains('hidden') && !document.querySelector('.overlay')) render(true);
    }, cloudErr);
  }

  function syncLine() {
    var C = global.Cloud;
    if (!C || !C.signedIn) return '';
    var label = { synced: 'Online. Students can join with the class code', syncing: 'Syncing…',
                  offline: 'Offline. Changes are saved on this device', off: '' }[C.status] || '';
    return '<div class="cr-banner__sync"><span class="sync-dot sync-dot--' + C.status + '" data-sync-dot></span>' +
      label + '</div>';
  }

  function signinHint() {
    if (global.Cloud && global.Cloud.signedIn) return '';
    return '<div class="signin-hint">' + I.info +
      '<span>Sign in to put your class online. Students can join with just the class code, ' +
      'and their scores come in automatically.</span>' +
      '<button class="btn btn--accent btn--sm" id="tm-signin">Sign in</button></div>';
  }

  function cls() {
    var c = W.state.classroom;
    if (!c.roster) c.roster = [];
    if (!c.assignments) c.assignments = [];
    if (!c.results) c.results = [];
    if (!c.posts) c.posts = [];
    return c;
  }

  /* A class code is issued by the server when the class is created, and it
     is the only kind that works: a student types it, the server looks it
     up, and either the class is there or it is not. The old behaviour —
     inventing six characters locally and printing them as if they meant
     something — is what made every join fail. If there is no code yet,
     there is no code, and the banner says so instead of making one up. */
  function classCode() { return cls().code || ''; }

  function joinLink() {
    var c = classCode();
    if (!c) return '';
    var o = global.location;
    var base = o.origin + o.pathname.replace(/[^/]*$/, '') + 'index.html';
    return base + '?join=' + c;
  }

  /* ============================== helpers =========================== */
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  function scoreClass(pct) {
    if (pct === null || pct === undefined) return 'gb__score--none';
    return pct >= 80 ? 'gb__score--hi' : pct >= 50 ? 'gb__score--mid' : 'gb__score--lo';
  }

  /* Who a score belongs to. The account is the real answer; a name is only
     a label and two students can share one. Scores sent with a code, or
     typed in by hand, have no account behind them and keep the name. */
  function ownerKey(r) { return r.studentId || ('name:' + r.name); }

  function isTheirs(r, p) { return !!(p && p.keys.indexOf(ownerKey(r)) !== -1); }

  /* Latest result per (student, assignment). The last attempt is the one
     that was handed in, so it is the one that counts here and on the
     student's own Grades panel. */
  function resultFor(p, assignmentId) {
    var found = null;
    cls().results.forEach(function (r) {
      if (r.assignmentId !== assignmentId || !isTheirs(r, p)) return;
      if (!found || r.at > found.at) found = r;
    });
    return found;
  }

  /* One score per student per assignment, so somebody who tried five times
     does not count five times towards an average. */
  function latest() {
    var by = {}, out = [];
    cls().results.forEach(function (r) {
      var k = ownerKey(r) + '|' + r.assignmentId;
      if (!by[k] || r.at > by[k].at) by[k] = r;
    });
    Object.keys(by).forEach(function (k) { out.push(by[k]); });
    return out;
  }

  /* Everyone the class knows about: whoever joined online, the names the
     teacher typed in, and anyone who sent a result. */
  function people() {
    var byKey = {}, byName = {}, out = [];
    var c = cls();

    function add(id, name) {
      var key = id || ('name:' + name);
      if (byKey[key]) return byKey[key];
      /* the prefix keeps a student called "constructor" out of the lookup's
         own workings */
      var p = byName['n:' + name];
      /* a name the teacher typed and the account that joined under it are
         one student. Two accounts with the same name are not. */
      if (p && (!p.id || !id)) {
        p.keys.push(key);
        if (id && !p.id) p.id = id;
        byKey[key] = p;
        return p;
      }
      p = { id: id || '', name: name, keys: [key] };
      byKey[key] = p;
      if (!byName['n:' + name]) byName['n:' + name] = p;
      out.push(p);
      return p;
    }

    (c.members || []).forEach(function (m) { if (m && m.name) add(m.id || '', m.name); });
    c.roster.forEach(function (n) { if (n) add('', n); });
    c.results.forEach(function (r) { if (r && r.name) add(r.studentId || '', r.name); });
    return out.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  }

  /* A sync can redraw the class between a click and the row that was
     clicked, so buttons carry who they belong to and look them up again. */
  function findPerson(id, name) {
    var key = id || ('name:' + name);
    var list = people();
    for (var i = 0; i < list.length; i++) {
      if (list[i].keys.indexOf(key) !== -1) return list[i];
    }
    return null;
  }

  /* Two attributes rather than one string with a separator in it: a name
     can contain anything, the separator included. */
  function who(p) {
    return 'data-student-id="' + W.escapeHtml(p.id || '') + '" ' +
           'data-student-name="' + W.escapeHtml(p.name) + '"';
  }

  function assignmentById(id) {
    var list = cls().assignments;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  /* It was on screen when the page drew and it is not in the class now. */
  function gone() {
    W.toast('That is not here any more', 'Your class changed while this page was open', I.info, 4200);
    render();
  }

  /* Pinned first, then newest: the same order the server hands them back
     in, so a local post and a synced one sit where you would expect. */
  function sortedPosts() {
    return cls().posts.slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.at || 0) - (a.at || 0);
    });
  }

  function shortDate(ms) {
    if (!ms || !isFinite(ms)) return '';
    try { return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
    catch (e) { return ''; }
  }

  function agoLabel(ms) {
    if (!ms || !isFinite(ms)) return '';
    var secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (secs < 60) return 'just now';
    var mins = Math.round(secs / 60);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.round(hrs / 24);
    if (days < 7) return days + 'd ago';
    return shortDate(ms);
  }

  function avg(nums) {
    if (!nums.length) return null;
    return Math.round(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length);
  }

  /* ============================== shell ============================= */
  function render(fromSync) {
    var host = document.getElementById('view-teacher');
    if (!host) return;
    if (fromSync !== true) syncSoon(false);

    wireFeatures();
    /* a switch can be turned off while its own tab is the open one */
    if ((tab === 'geolive' && !featureOn('geolive')) ||
        (tab === 'leaderboard' && !featureOn('leaderboard'))) tab = 'stream';
    var c = cls();
    var roster = people();

    var counts = {
      stream: c.posts.length,
      classwork: c.assignments.length,
      people: roster.length,
      analytics: c.results.length
    };

    host.innerHTML =
      '<div class="cr">' +
        '<div class="cr-banner">' +
          '<div>' +
            '<h1>' + W.escapeHtml(c.name || 'Your class') + '</h1>' +
            '<p>' + c.assignments.length + ' assignment' + (c.assignments.length === 1 ? '' : 's') +
              ' · ' + roster.length + ' student' + (roster.length === 1 ? '' : 's') +
              ' · ' + c.results.length + ' result' + (c.results.length === 1 ? '' : 's') + ' in</p>' +
            syncLine() +
          '</div>' +
          (classCode()
            ? '<button class="cr-banner__code" id="tm-copycode" title="Copy class code">' +
                '<span>Class code</span><b>' + classCode() + '</b>' +
              '</button>'
            : '<button class="cr-banner__code cr-banner__code--none" id="tm-getcode" ' +
                'title="Set your class up online">' +
                '<span>Class code</span><b>Get one</b>' +
              '</button>') +
        '</div>' +

        '<div class="cr-tabs">' +
          crTab('stream', I.layers, 'Stream', counts.stream) +
          crTab('classwork', I.clip, 'Classwork', counts.classwork) +
          crTab('people', I.users, 'People', counts.people) +
          crTab('analytics', I.chart, 'Analytics', counts.analytics) +
          (featureOn('geolive') ? crTab('geolive', I.bolt, 'GeoLive') : '') +
          (featureOn('leaderboard') ? crTab('leaderboard', I.trophy, 'Leaderboard') : '') +
          crTab('settings', I.gear, 'Settings') +
        '</div>' +

        '<div id="cr-body">' + panel() + '</div>' +
      '</div>';

    W.$$('.cr-tab', host).forEach(function (b) {
      b.addEventListener('click', function () { tab = b.dataset.t; render(); });
    });
    var copyBtn = document.getElementById('tm-copycode');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      copy(classCode(), 'Class code copied');
    });
    var getBtn = document.getElementById('tm-getcode');
    if (getBtn) getBtn.addEventListener('click', shareInvite);
    wirePanel();

    function crTab(id, icon, label, n) {
      return '<button class="cr-tab' + (tab === id ? ' is-active' : '') + '" data-t="' + id + '">' +
        icon + label + (n ? '<span class="cr-tab__n">' + n + '</span>' : '') + '</button>';
    }
  }

  /* GeoLive is all network: a game with no server is not a degraded game,
     it is no game. So the signed-out and not-yet-online cases are answered
     here, once, instead of each screen growing its own. The button below is
     the one wirePanel already binds. */
  function geolivePanel() {
    if (!global.Cloud || !global.Cloud.signedIn) return signinHint();
    if (!cls().cloudId) {
      return '<div class="empty">Put your class online first, then you can run ' +
        'a GeoLive. Use the class code button at the top.</div>';
    }
    return '<div id="cr-geolive"></div>';
  }

  function panel() {
    if (tab === 'classwork') return classworkPanel();
    if (tab === 'people') return peoplePanel();
    if (tab === 'analytics') return analyticsPanel();
    if (tab === 'settings') return settingsPanel();
    if (tab === 'geolive') return geolivePanel();
    if (tab === 'leaderboard') return '<div id="cr-leaderboard"></div>';
    return streamPanel();
  }

  function wirePanel() {
    var host = document.getElementById('cr-body');
    if (!host) return;

    /* GeoLive holds a live subscription and an interval. Leaving the tab
       throws the markup away but neither of those, so close it here.
       Nothing below awaits a GeoLive call and none of it shares a batch with
       the class sync: a missing live_ table must never be able to take the
       Classwork or People panels down with it. */
    var GT = global.GeoLiveTeacher;
    if (tab !== 'geolive' && GT && GT.unmount) { try { GT.unmount(); } catch (e) {} }

    var glHost = document.getElementById('cr-geolive');
    if (glHost && GT && GT.mount) {
      GT.mount(glHost, {
        classId: cls().cloudId || '',
        /* roster is everyone, so a teacher who added nine names sees nine.
           members is who can actually play: a hand-typed name has no account
           and no device, and people() gives it an empty id, so two of them
           would otherwise collapse into a single player. */
        roster: people(),
        members: (cls().members || []).slice()
      });
    }

    var fxHost = document.getElementById('cr-features');
    if (fxHost && global.ClassFeatures && global.ClassFeatures.mount) {
      global.ClassFeatures.mount(fxHost, { classId: cls().cloudId || '' });
    }

    var lbHost = document.getElementById('cr-leaderboard');
    if (lbHost && global.ClassLeaderboard && global.ClassLeaderboard.mount) {
      global.ClassLeaderboard.mount(lbHost, {
        classId: cls().cloudId || '', classroom: cls(), people: people(),
        /* the leaderboard does not read the switch itself: its contract is
           that the caller passes it. GeoLive reads ClassFeatures directly.
           Two different contracts, so wiring one is not wiring both. */
        enabled: featureOn('leaderboard')
      });
    }

    bind('#tm-new', function () { openBuilder(); });
    bind('#tm-postgo', submitPost);
    var ta = W.$('#tm-post', host);
    if (ta) ta.addEventListener('keydown', function (e) {
      /* the shortcut every message box has */
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitPost(); }
    });
    W.$$('[data-pin]', host).forEach(function (b) {
      b.addEventListener('click', function () { togglePin(b.dataset.pin); });
    });
    W.$$('[data-delpost]', host).forEach(function (b) {
      b.addEventListener('click', function () { removePost(b.dataset.delpost); });
    });
    bind('#tm-invite', shareInvite);
    bind('#tm-addperson', openAddPerson);
    bind('#tm-export', exportCsv);

    /* Rows carry the id of what they are about rather than their position
       in the list: a sync can reorder or shorten that list between the
       render and the click, and then the wrong row gets deleted. */
    W.$$('[data-edit]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = assignmentById(b.dataset.edit);
        if (a) openBuilder(a); else gone();
      });
    });
    W.$$('[data-try]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = assignmentById(b.dataset.try);
        if (!a) return gone();
        global.UI.startPreview('Previewing "' + a.title + '"');
        A.run(a);
      });
    });
    W.$$('[data-del]', host).forEach(function (b) {
      b.addEventListener('click', function () { removeAssignment(b.dataset.del); });
    });
    W.$$('[data-cell]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = findPerson(b.dataset.studentId, b.dataset.studentName);
        if (p) openScoreEntry(p, b.dataset.cell); else gone();
      });
    });
    W.$$('[data-rmperson]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = findPerson(b.dataset.studentId, b.dataset.studentName);
        if (p) removePerson(p); else gone();
      });
    });
    W.$$('[data-copycode]', host).forEach(function (b) {
      b.addEventListener('click', function () { copy(classCode(), 'Class code copied'); });
    });

    bind('#tm-leave', leaveTeacher);
    bind('#tm-signin', function () { global.UI.openAuth('signin'); });
    var nameEl = W.$('#tm-name', host);
    if (nameEl) nameEl.addEventListener('change', function () {
      cls().name = nameEl.value.trim().slice(0, 40); W.saveNow(); render();
      if (online()) global.Cloud.renameClass(cls().name).catch(cloudErr);
    });

    function bind(sel, fn) { var el = W.$(sel, host); if (el) el.addEventListener('click', fn); }
  }

  /* ============================== stream ============================
     The Stream is the teacher talking to the class: notes about Friday's
     quiz, a reminder, a well done. Posts go out the same way assignments
     do and turn up in every student's Classroom. */
  function postRow(p) {
    return '<div class="st-post' + (p.pinned ? ' st-post--pinned' : '') + '">' +
      '<div class="st-post__body">' +
        W.escapeHtml(String(p.body || '')).replace(/\n/g, '<br>') + '</div>' +
      '<div class="st-post__foot">' +
        '<span class="st-post__when">' +
          (p.pinned ? I.flag + 'Pinned · ' : '') + agoLabel(p.at) + '</span>' +
        '<button class="icon-btn" data-pin="' + W.escapeHtml(String(p.id)) + '" title="' +
          (p.pinned ? 'Unpin' : 'Pin to the top') + '">' + I.flag + '</button>' +
        '<button class="icon-btn" data-delpost="' + W.escapeHtml(String(p.id)) + '" ' +
          'title="Delete">' + I.close + '</button>' +
      '</div>' +
    '</div>';
  }

  function composer() {
    return '<div class="cr-card" style="margin-bottom:14px">' +
      '<div class="cr-card__head"><h3>Say something to the class</h3></div>' +
      '<textarea class="input st-compose" id="tm-post" maxlength="2000" rows="3" ' +
        'placeholder="Map quiz on Friday — learn the South American capitals."></textarea>' +
      '<div class="row row--between" style="margin-top:10px;gap:12px">' +
        '<span class="t-sm t-muted">' + (online()
          ? 'Everyone in your class sees this in their Classroom.'
          : 'Saved here for now. Sign in and your class sees these as you post them.') + '</span>' +
        '<button class="btn btn--accent btn--sm" id="tm-postgo">Post</button>' +
      '</div>' +
    '</div>';
  }

  function streamPanel() {
    var c = cls();
    var recent = c.results.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 8);
    var list = sortedPosts();

    return signinHint() +
      '<div class="cr-grid">' +
      '<div>' +
        '<div class="cr-card" style="margin-bottom:14px">' +
          '<div class="cr-card__head"><h3>Hand out work</h3></div>' +
          '<button class="btn btn--accent btn--block" id="tm-new">' + I.plus + ' New assignment</button>' +
          '<button class="btn btn--primary btn--block" id="tm-invite" style="margin-top:8px">' +
            I.key + ' Invite your class</button>' +
        '</div>' +
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Class stats</h3></div>' +
          miniStat('Assignments', c.assignments.length) +
          miniStat('Students', people().length) +
          miniStat('Results in', c.results.length) +
          miniStat('Class average', classAverage() === null ? '—' : classAverage() + '%') +
        '</div>' +
      '</div>' +

      '<div>' +
        composer() +
        (c.assignments.length ? '' :
          '<div class="cr-card" style="margin-bottom:14px">' + emptyCta(I.clip, 'No classwork yet',
            'Make your first assignment and you’ll get a code to give your class.') + '</div>') +
        (list.length
          ? '<div class="cr-card" style="margin-bottom:14px">' +
              '<div class="cr-card__head"><h3>Announcements</h3>' +
                '<span class="eyebrow">' + list.length +
                  (list.length === 1 ? ' post' : ' posts') + '</span></div>' +
              list.map(postRow).join('') +
            '</div>'
          : '') +
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Recent activity</h3>' +
            '<span class="eyebrow">' + c.results.length + ' total</span></div>' +
          (recent.length
            ? recent.map(function (r) {
                return '<div class="person">' +
                  '<div class="person__av">' + W.escapeHtml(initials(r.name)) + '</div>' +
                  '<div class="person__t"><b>' + W.escapeHtml(r.name) + '</b>' +
                    '<span>handed in ' + W.escapeHtml(r.title) + '</span></div>' +
                  '<span class="gb__score ' + scoreClass(r.pct) + '">' + r.pct + '%</span>' +
                '</div>';
              }).join('')
            : '<div class="empty" style="padding:22px 0">Nothing handed in yet.</div>') +
        '</div>' +
      '</div>' +
    '</div>';

    function miniStat(l, v) {
      return '<div class="row row--between" style="padding:8px 0;border-bottom:1px solid var(--line-soft)">' +
        '<span class="t-sm t-muted">' + l + '</span>' +
        '<b class="mono" style="font-size:15px">' + v + '</b></div>';
    }
  }

  /* Shown straight away and sent in the background: a post the teacher can
     see is a post they can stop worrying about. The id is swapped for the
     real one once the insert lands, since pinning and deleting need it. */
  function submitPost() {
    var ta = W.$('#tm-post', document.getElementById('cr-body'));
    if (!ta) return;
    var body = ta.value.trim();
    if (!body) { ta.focus(); return; }

    var p = { id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
              body: body.slice(0, 2000), pinned: false, at: Date.now() };
    cls().posts.unshift(p);
    W.saveNow();
    render();
    W.toast('Posted to the class',
            online() ? 'Your students can see it now' : 'Saved on this device', I.check);

    if (!online()) return;
    global.Cloud.postAnnouncement(p).then(function (saved) {
      if (!saved) return;
      cls().posts.forEach(function (x) {
        if (x.id === p.id) { x.id = saved.id; x.at = saved.at; }
      });
      W.saveNow();
    }, cloudErr);
  }

  function togglePin(id) {
    var p = cls().posts.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    p.pinned = !p.pinned;
    W.saveNow();
    render();
    if (online()) global.Cloud.pinAnnouncement(p.id, p.pinned).catch(cloudErr);
  }

  function removePost(id) {
    var p = cls().posts.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    global.UI.modal({
      title: 'Delete this post', icon: I.close,
      body: '<p class="t-muted">Take it off the class stream?' +
        (online() ? ' It disappears from your students’ Classroom too.' : '') + '</p>' +
        '<div class="st-post" style="margin-top:12px"><div class="st-post__body">' +
          W.escapeHtml(String(p.body || '')).replace(/\n/g, '<br>') + '</div></div>',
      actions: [
        { label: 'Keep it', cls: 'btn--ghost', close: true },
        { label: 'Delete', cls: 'btn--primary', close: true, onClick: function () {
            cls().posts = cls().posts.filter(function (x) { return String(x.id) !== String(id); });
            W.saveNow(); render();
            if (online()) global.Cloud.deleteAnnouncement(p.id).catch(cloudErr);
          } }
      ]
    });
  }

  function emptyCta(icon, title, body) {
    return '<div class="empty-cta"><div class="empty-cta__i">' + icon + '</div>' +
      '<b>' + title + '</b><p>' + body + '</p></div>';
  }

  /* ============================ classwork =========================== */
  function classworkPanel() {
    var list = cls().assignments;
    var classSize = people().length;
    var all = cls().results;
    return '<div class="row row--between" style="margin-bottom:16px">' +
        '<div><h3 style="font-size:18px">Classwork</h3>' +
        '<div class="t-sm t-muted">Saved work goes to your class straight away.</div></div>' +
        '<button class="btn btn--accent" id="tm-new">' + I.plus + ' New assignment</button>' +
      '</div>' +
      (list.length
        ? list.map(function (a) {
            /* one score each, the last one they handed in */
            var done = latest().filter(function (r) { return r.assignmentId === a.id; });
            var handedIn = done.length;
            var mean = avg(done.map(function (r) { return r.pct; }));
            var n = (a.config.countries && a.config.countries.length) || a.config.count || 0;
            return '<div class="cw-row">' +
              '<div class="cw-row__i">' + (a.mode === 'cards' ? I.cards : a.mode === 'learn' ? I.book : I.clip) + '</div>' +
              '<div class="cw-row__t"><b>' + W.escapeHtml(a.title) + '</b>' +
                '<span>' + modeLabel(a.mode) + ' · ' + n + ' items' +
                (a.config.timed ? ' · timed' : '') + (a.config.instant === false ? ' · exam mode' : '') + '</span></div>' +
              '<div class="cw-row__meta"><b>' + handedIn + '/' + Math.max(handedIn, classSize) + '</b>' +
                'handed in' + (mean !== null ? ' · avg ' + mean + '%' : '') + '</div>' +
              '<div class="row" style="gap:4px">' +
                '<button class="icon-btn" data-try="' + W.escapeHtml(a.id) + '" title="Try it yourself">' +
                  I.arrowR + '</button>' +
                '<button class="icon-btn" data-edit="' + W.escapeHtml(a.id) + '" title="Edit">' +
                  I.gear + '</button>' +
                '<button class="icon-btn" data-del="' + W.escapeHtml(a.id) + '" title="Delete">' +
                  I.close + '</button>' +
              '</div></div>';
          }).join('')
        : '<div class="cr-card">' + emptyCta(I.clip, 'No assignments yet',
            'Choose the countries and settings, then give your class the code.') + '</div>');
  }

  /* ============================== people ============================ */
  function peoplePanel() {
    var roster = people();
    var list = cls().assignments;
    return '<div class="row row--between" style="margin-bottom:16px">' +
        '<div><h3 style="font-size:18px">People</h3>' +
        '<div class="t-sm t-muted">Students get added here automatically when they hand in work.</div></div>' +
        '<div class="row" style="gap:8px">' +
          '<button class="btn btn--accent" id="tm-addperson">' + I.plus + ' Add student</button>' +
        '</div>' +
      '</div>' +
      '<div class="cr-card">' +
        (roster.length
          ? roster.map(function (p) {
              var done = list.filter(function (a) { return !!resultFor(p, a.id); }).length;
              var mine = latest().filter(function (r) { return isTheirs(r, p); });
              var mean = avg(mine.map(function (r) { return r.pct; }));
              return '<div class="person">' +
                '<div class="person__av">' + W.escapeHtml(initials(p.name)) + '</div>' +
                '<div class="person__t"><b>' + W.escapeHtml(p.name) + '</b>' +
                  '<span>' + done + ' of ' + list.length + ' handed in' +
                  (mean !== null ? ' · average ' + mean + '%' : '') + '</span></div>' +
                '<span class="pill-tag ' + (list.length && done === list.length ? 'pill-tag--done' : '') + '">' +
                  (list.length ? Math.round((done / list.length) * 100) + '%' : '—') + '</span>' +
                '<button class="icon-btn" data-rmperson="1" ' + who(p) + ' title="Remove">' +
                  I.close + '</button>' +
              '</div>';
            }).join('')
          : emptyCta(I.users, 'No students yet',
              'Add students by name, or they’ll show up here once they send in results.')) +
      '</div>';
  }

  /* ============================ analytics =========================== */
  /* Averages run over one score per student per assignment. Counting every
     retry would let one keen student pull the whole class average around. */
  function classAverage() {
    return avg(latest().map(function (r) { return r.pct; }));
  }

  function analyticsPanel() {
    var c = cls();
    var roster = people();
    var list = c.assignments;

    if (!c.results.length) {
      return '<div class="cr-card">' + emptyCta(I.chart, 'No data yet',
        'Once students start handing in work, you’ll see the class average here, plus who ' +
        'needs help and which countries the class gets wrong most.') +
'</div>';
    }

    /* everything below is the last attempt at each assignment, one per
       student, which is the score the student sees too */
    var scores = latest();

    /* which countries the class as a whole keeps missing */
    var missCount = {};
    scores.forEach(function (r) {
      (r.missed || []).forEach(function (n) { missCount[n] = (missCount[n] || 0) + 1; });
    });
    var hardest = Object.keys(missCount)
      .sort(function (a, b) { return missCount[b] - missCount[a]; })
      .slice(0, 8);

    /* score distribution in ten-point bands */
    var bands = new Array(10).fill(0);
    scores.forEach(function (r) {
      bands[Math.min(9, Math.floor(r.pct / 10))] += 1;
    });
    var peak = Math.max.apply(null, bands) || 1;

    /* per-student averages, weakest first */
    var byStudent = roster.map(function (p) {
      var mine = scores.filter(function (r) { return isTheirs(r, p); });
      return { name: p.name, mean: avg(mine.map(function (r) { return r.pct; })), n: mine.length };
    }).filter(function (s) { return s.mean !== null; })
      .sort(function (a, b) { return a.mean - b.mean; });

    /* only work that is still set, from people still in the class, or a
       deleted assignment could push this past 100% */
    var live = {};
    list.forEach(function (a) { live[a.id] = 1; });
    var inClass = {};
    roster.forEach(function (p) { p.keys.forEach(function (k) { inClass[k] = 1; }); });
    var handedIn = {};
    scores.forEach(function (r) {
      if (live[r.assignmentId] && inClass[ownerKey(r)]) handedIn[ownerKey(r) + '|' + r.assignmentId] = 1;
    });
    var expected = roster.length * list.length;
    var completion = expected ? Math.round((Object.keys(handedIn).length / expected) * 100) : 0;

    return '<h3 style="font-size:18px;margin-bottom:4px">Analytics</h3>' +
      '<div class="t-sm t-muted" style="margin-bottom:16px">Based on ' + scores.length +
        ' score' + (scores.length === 1 ? '' : 's') + ', the latest from each student.</div>' +

      '<div class="an-grid" style="margin-bottom:20px">' +
        anStat(classAverage() + '%', 'class average', bandLabel(classAverage())) +
        anStat(completion + '%', 'handed in', Object.keys(handedIn).length + ' of ' + expected + ' expected') +
        anStat(byStudent.length ? byStudent[byStudent.length - 1].mean + '%' : '—', 'top average',
               byStudent.length ? byStudent[byStudent.length - 1].name : '') +
        anStat(byStudent.length ? byStudent[0].mean + '%' : '—', 'needs help most',
               byStudent.length ? byStudent[0].name : '') +
      '</div>' +

      '<div class="cr-grid" style="grid-template-columns:1fr 1fr">' +
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Average by assignment</h3></div>' +
          (list.length ? list.map(function (a) {
            var mine = scores.filter(function (r) { return r.assignmentId === a.id; });
            var m = avg(mine.map(function (r) { return r.pct; }));
            return bar(a.title, m === null ? 0 : m, m === null ? 'no results' : m + '%',
                       m === null ? 'var(--line)' : barColour(m));
          }).join('') : '<div class="empty">No assignments yet.</div>') +
        '</div>' +

        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Hardest for the class</h3>' +
            '<span class="eyebrow">most missed</span></div>' +
          (hardest.length ? hardest.map(function (n) {
            var cty = global.GeoData.countries.filter(function (x) { return x.name === n; })[0];
            /* out of every submission, not out of the worst country: scaling
               to the worst made the top row a full bar even at one miss */
            return bar(n + (cty ? ' · ' + cty.capital : ''),
                       Math.round((missCount[n] / c.results.length) * 100),
                       missCount[n] + ' of ' + c.results.length, 'var(--danger)');
          }).join('') : '<div class="empty">Nothing missed yet.</div>') +
        '</div>' +
      '</div>' +

      '<div class="cr-card" style="margin-top:14px">' +
        '<div class="cr-card__head"><h3>Score spread</h3>' +
          '<span class="eyebrow">' + scores.length + ' latest scores</span></div>' +
        '<div class="hist">' +
          bands.map(function (v, i) {
            return '<div class="hist__col"><div class="hist__bar" style="height:' +
              Math.round((v / peak) * 100) + '%;background:' + barColour((i + 0.5) * 10) + '"></div></div>';
          }).join('') +
        '</div>' +
        '<div class="row" style="gap:6px">' +
          bands.map(function (v, i) {
            return '<div class="hist__lab" style="flex:1">' + (i * 10) + '</div>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="row row--between" style="margin:22px 0 12px">' +
        '<h3 style="font-size:16px">Gradebook</h3>' +
        '<button class="btn btn--ghost btn--sm" id="tm-export">Export CSV</button>' +
      '</div>' +
      gradebook(roster, list);

    function anStat(n, l, sub) {
      return '<div class="an-stat"><div class="an-stat__n">' + n + '</div>' +
        '<div class="an-stat__l">' + l + '</div>' +
        (sub ? '<div class="an-stat__sub">' + W.escapeHtml(sub) + '</div>' : '') + '</div>';
    }
    function bar(label, pct, right, colour) {
      return '<div class="an-bar"><div class="an-bar__label"><span>' + W.escapeHtml(label) + '</span></div>' +
        '<div class="an-bar__n">' + right + '</div>' +
        '<div class="an-bar__track" style="grid-column:1/-1"><div class="an-bar__fill" style="width:' +
        pct + '%;background:' + colour + '"></div></div></div>';
    }
  }

  function bandLabel(p) {
    if (p === null) return '';
    return p >= 80 ? 'looking good' : p >= 60 ? 'getting there' : 'needs more practice';
  }
  function barColour(p) {
    return p >= 80 ? 'var(--success)' : p >= 50 ? 'var(--gold)' : 'var(--danger)';
  }

  function gradebook(roster, list) {
    if (!roster.length || !list.length) {
      return '<div class="cr-card"><div class="empty" style="padding:20px 0">' +
        'Add students and assignments to see the gradebook.</div></div>';
    }
    return '<div class="gb-wrap"><table class="gb"><thead><tr>' +
      '<th>Student</th>' +
      list.map(function (a) { return '<th>' + W.escapeHtml(a.title) + '</th>'; }).join('') +
      '<th>Average</th></tr></thead><tbody>' +
      roster.map(function (p) {
        var scores = [];
        var cells = list.map(function (a) {
          var r = resultFor(p, a.id);
          if (r) scores.push(r.pct);
          return '<td><button class="gb__cell-btn" data-cell="' + W.escapeHtml(a.id) + '" ' + who(p) + ' ' +
            'title="Click to set a score"><span class="gb__score ' + scoreClass(r ? r.pct : null) + '">' +
            (r ? r.pct + '%' : '–') + '</span></button></td>';
        }).join('');
        var m = avg(scores);
        return '<tr><td class="gb__name">' + W.escapeHtml(p.name) + '</td>' + cells +
          '<td><span class="gb__score ' + scoreClass(m) + '">' + (m === null ? '–' : m + '%') + '</span></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* ============================= settings =========================== */
  function settingsPanel() {
    var c = cls();
    return '<div class="cr-grid cr-grid--even">' +
      '<div class="cr-card">' +
        '<div class="cr-card__head"><h3>Class</h3></div>' +
        '<div class="field"><label class="field__label">Class name</label>' +
          '<input class="input" id="tm-name" maxlength="40" placeholder="e.g. Period 3 Geography" ' +
            'value="' + W.escapeHtml(c.name) + '"></div>' +
        '<div class="field"><label class="field__label">Class code</label>' +
          (classCode()
            ? '<div class="code-chip">' + classCode() +
                '<button data-copycode title="Copy class code">' + I.clip + '</button></div>' +
              '<div class="field__hint">Students type this once. It was issued when your class ' +
                'was created and it never changes.</div>'
            : '<div class="field__hint">You do not have one yet. Sign in and your class gets a ' +
              'code that students can actually use.</div>') + '</div>' +
      '</div>' +
      '<div class="cr-card">' +
        '<div class="cr-card__head"><h3>Data</h3></div>' +
        '<p class="t-sm t-muted" style="margin-bottom:14px">' + (online()
          ? 'Your class is on your account, so it follows you to any computer you sign in on. ' +
            'Export the gradebook if you want a copy of the marks somewhere else.'
          : 'Everything is saved in this browser only. Export the gradebook if you want a copy ' +
            'somewhere else — or sign in, and your class follows you between computers.') + '</p>' +
        '<button class="btn btn--ghost btn--block" id="tm-export">Export gradebook CSV</button>' +
        '<button class="btn btn--ghost btn--block" id="tm-leave" style="margin-top:8px">' +
          'Switch to a student account</button>' +
        '<div class="field__hint" style="margin-top:8px">Your class, assignments and results will still be ' +
          'saved. To come back, go to the For teachers page on the home site.</div>' +
      '</div>' +
      /* somewhere to actually flip them. Without this the gates above are a
         one-way door: the leaderboard defaults off and nothing could turn it
         on. ClassFeatures.mount adds its own clf class and loads the row. */
      '<div class="cr-card"><div id="cr-features"></div></div>' +
    '</div>';
  }

  /* ============================= actions ============================ */
  function openAddPerson() {
    global.UI.modal({
      title: 'Add students', icon: I.users,
      body: '<div class="field"><label class="field__label">One name per line</label>' +
        '<textarea class="input" id="ap-names" style="min-height:150px" ' +
        'placeholder="Ada Lovelace&#10;Sam Okafor&#10;Yuki Tanaka"></textarea>' +
        '<div class="field__hint">Just names. This is only so you can see who hasn’t handed in yet.</div></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Add', cls: 'btn--accent', close: true, onClick: function (root) {
            var names = W.$('#ap-names', root).value.split('\n')
              .map(function (n) { return n.trim(); }).filter(Boolean);
            names.forEach(function (n) {
              if (cls().roster.indexOf(n) === -1) cls().roster.push(n);
            });
            W.saveNow(); render();
            W.toast(names.length + ' added', 'They’ll show up in People and the gradebook', I.check);
          } }
      ]
    });
  }

  /* Taking someone off the class takes their results with them; otherwise
     they would reappear the moment the gradebook redrew. */
  function removePerson(p) {
    var theirs = cls().results.filter(function (r) { return isTheirs(r, p); }).length;
    global.UI.modal({
      title: 'Remove ' + p.name, icon: I.users,
      body: '<p class="t-muted">Remove <b>' + W.escapeHtml(p.name) + '</b> from the class?' +
        (theirs ? ' Their ' + theirs + ' result' + (theirs === 1 ? '' : 's') + ' will be deleted too.' : '') +
        (online() ? ' If they joined online, they’ll be taken out of the online class too.' : '') + '</p>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Remove', cls: 'btn--primary', close: true, onClick: function () {
            var c = cls();
            c.roster = c.roster.filter(function (n) { return n !== p.name; });
            c.results = c.results.filter(function (r) { return !isTheirs(r, p); });
            if (c.members) {
              c.members = c.members.filter(function (m) {
                return p.id ? m.id !== p.id : m.name !== p.name;
              });
            }
            W.saveNow(); render();
            if (online()) global.Cloud.removePerson({ id: p.id, name: p.name }).catch(cloudErr);
          } }
      ]
    });
  }

  /* Returning false keeps the dialog open, so the teacher can see what was
     wrong with what they typed and fix it in place. */
  function scoreError(root, msg) {
    var box = W.$('#se-err', root);
    if (box) {
      box.textContent = msg;
      box.style.color = 'var(--danger)';
    }
    var input = W.$('#se-pct', root);
    if (input) input.focus();
    return false;
  }

  function openScoreEntry(p, assignmentId) {
    var a = assignmentById(assignmentId);
    var existing = resultFor(p, assignmentId);
    global.UI.modal({
      title: p.name,
      icon: I.chart,
      body: '<p class="t-muted" style="margin-bottom:14px">' + W.escapeHtml(a ? a.title : 'Assignment') + '</p>' +
        '<div class="field"><label class="field__label">Score, as a percentage</label>' +
        '<input class="input mono" id="se-pct" type="number" min="0" max="100" ' +
          'value="' + (existing ? existing.pct : '') + '" placeholder="0 to 100">' +
        '<div class="field__hint" id="se-err">Anything from 0 to 100.</div></div>',
      actions: [
        (existing ? { label: 'Clear', cls: 'btn--ghost', close: true, onClick: function () {
            cls().results = cls().results.filter(function (r) {
              return !(isTheirs(r, p) && r.assignmentId === assignmentId);
            });
            W.saveNow(); render();
            if (online()) {
              global.Cloud.clearResult({ id: p.id, name: p.name }, assignmentId).catch(cloudErr);
            }
          } } : { label: 'Cancel', cls: 'btn--ghost', close: true }),
        { label: 'Save', cls: 'btn--accent', close: true, onClick: function (root) {
            var raw = W.$('#se-pct', root).value.trim();
            var v = parseInt(raw, 10);
            /* say so rather than closing on a blank or a typo and saving nothing */
            if (raw === '' || isNaN(v)) return scoreError(root, 'Type a number from 0 to 100.');
            if (v < 0 || v > 100) return scoreError(root, 'A percentage has to be between 0 and 100.');
            cls().results = cls().results.filter(function (r) {
              return !(isTheirs(r, p) && r.assignmentId === assignmentId);
            });
            var entry = { assignmentId: assignmentId, title: a ? a.title : '',
                          studentId: p.id || null, name: p.name,
                          pct: v, correct: null, total: null, at: Date.now(), missed: [], manual: true };
            cls().results.push(entry);
            if (!p.id && cls().roster.indexOf(p.name) === -1) cls().roster.push(p.name);
            W.saveNow(); render();
            if (online()) global.Cloud.setManualScore(entry).catch(cloudErr);
          } }
      ],
      onMount: function (root) { setTimeout(function () { W.$('#se-pct', root).focus(); }, 60); }
    });
  }

  /* Student names come from students, so a name beginning with =, +, - or @
     would be read as a formula the moment the file opened. Excel and Sheets
     both treat a leading apostrophe as "this is text". */
  function csvCell(cell) {
    var s = String(cell === null || cell === undefined ? '' : cell);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function gradebookCsv() {
    var roster = people(), list = cls().assignments;
    var rows = [['Student'].concat(list.map(function (a) { return a.title; })).concat(['Average'])];
    roster.forEach(function (p) {
      var scores = [];
      var line = [p.name].concat(list.map(function (a) {
        var r = resultFor(p, a.id);
        if (r) scores.push(r.pct);
        return r ? r.pct : '';
      }));
      var mean = avg(scores);
      line.push(mean === null ? '' : mean);
      rows.push(line);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
  }

  function csvName() {
    var slug = String(cls().name || 'class').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class';
    return 'learngeo-' + slug + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  }

  /* The BOM is what makes Excel open a UTF-8 CSV without mangling accents. */
  function downloadCsv(csv, filename) {
    try {
      var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) { return false; }
  }

  /* Downloading is what a teacher means by export, so that is the main
     button. The text is still there to copy, for a paste straight into a
     sheet and for the case where the download is blocked. */
  function exportCsv() {
    var csv = gradebookCsv();
    var file = csvName();

    global.UI.modal({
      title: 'Export the gradebook', icon: I.chart, wide: true,
      body: '<p class="t-muted" style="margin-bottom:12px">Download it as ' +
          '<b class="mono">' + W.escapeHtml(file) + '</b>, or copy the text and paste it ' +
          'straight into a spreadsheet.</p>' +
        '<textarea class="input mono" style="min-height:200px" readonly id="ex-csv">' +
        W.escapeHtml(csv) + '</textarea>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'Copy', cls: 'btn--ghost', onClick: function () { copy(csv, 'CSV copied'); return false; } },
        { label: 'Download', cls: 'btn--accent', onClick: function () {
            if (downloadCsv(csv, file)) W.toast('Gradebook downloaded', file, I.check);
            else W.toast('Couldn’t download', 'Your browser blocked it, so copy the text instead', I.info, 4200);
            return false;
          } }
      ],
      onMount: function (root) { setTimeout(function () { W.$('#ex-csv', root).select(); }, 60); }
    });
  }

  function modeLabel(m) {
    return { learn: 'Learn', test: 'Practice test', cards: 'Flashcards', quiz: 'Class quiz' }[m] || W.escapeHtml(m);
  }

  function removeAssignment(id) {
    var a = assignmentById(id);
    if (!a) return gone();
    global.UI.modal({
      title: 'Delete assignment', icon: I.close,
      body: '<p class="t-muted">Delete <b>' + W.escapeHtml(a.title) + '</b>? ' +
        'Any results you’ve already collected will stay in the gradebook.</p>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Delete', cls: 'btn--primary', close: true, onClick: function () {
            cls().assignments = cls().assignments.filter(function (x) { return x.id !== a.id; });
            W.saveNow(); render();
            if (online()) global.Cloud.deleteAssignment(a.id).catch(cloudErr);
          } }
      ]
    });
  }

  /* ============================= builder ============================ */
  function openBuilder(existing) {
    var a = existing || {
      id: 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      title: '', mode: 'test',
      config: { countries: [], count: 20, types: ['capital', 'country'],
                timed: false, instant: true, typed: false, fill: false }
    };
    var cfg = a.config;

    var body =
      '<div class="field"><label class="field__label">Title</label>' +
        '<input class="input" id="ab-title" maxlength="60" placeholder="e.g. South America capitals" ' +
          'value="' + W.escapeHtml(a.title) + '"></div>' +
      '<div class="field"><label class="field__label">What they do</label>' +
        '<div class="seg" id="ab-mode">' +
          seg('test', 'Practice test', a.mode) + seg('learn', 'Learn', a.mode) +
          seg('cards', 'Flashcards', a.mode) + seg('quiz', 'Class quiz', a.mode) +
        '</div></div>' +
      '<div class="field"><label class="field__label">Countries</label>' +
        '<div id="ab-picker"></div>' +
        '<div class="field__hint">Leave this empty to include every UN member state.</div></div>' +
      '<div class="field"><label class="field__label">Length</label>' +
        '<div class="seg" id="ab-count">' +
          ['10', '20', '30', '50'].map(function (n) { return seg(n, n, String(cfg.count || 20)); }).join('') +
        '</div></div>' +
      '<div class="field"><label class="field__label">Question types</label>' +
        '<div class="check-grid" id="ab-types">' +
          Object.keys(global.Quiz.types).map(function (t) {
            return ck(t, global.Quiz.types[t].label, (cfg.types || []).indexOf(t) !== -1);
          }).join('') + '</div></div>' +
      '<div class="field"><label class="field__label">Conditions</label>' +
        '<div class="seg" id="ab-timed">' +
          seg('untimed', 'Untimed', cfg.timed ? 'timed' : 'untimed') +
          seg('timed', 'Timed', cfg.timed ? 'timed' : 'untimed') + '</div>' +
        '<div class="seg" style="margin-top:8px" id="ab-instant">' +
          seg('instant', 'Feedback after each', cfg.instant === false ? 'end' : 'instant') +
          seg('end', 'Exam mode', cfg.instant === false ? 'end' : 'instant') + '</div>' +
        '<div class="seg" style="margin-top:8px" id="ab-typed">' +
          seg('choice', 'Multiple choice', cfg.typed ? 'typed' : 'choice') +
          seg('typed', 'Type the answer', cfg.typed ? 'typed' : 'choice') + '</div></div>';

    global.UI.modal({
      title: existing ? 'Edit assignment' : 'New assignment',
      icon: I.clip, wide: true, body: body,
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: existing ? 'Save' : 'Create', cls: 'btn--accent', close: true,
          onClick: function (root) { saveAssignment(root, a); } }
      ],
      onMount: function (root) {
        global.UI.wireSeg(root); global.UI.wireCheck(root);
        draftPicker = A.picker(W.$('#ab-picker', root), { initial: cfg.countries || [] });
      }
    });

    function seg(v, l, cur) {
      return '<button data-v="' + v + '" class="' + (cur === v ? 'is-active' : '') + '">' + l + '</button>';
    }
    function ck(v, l, on) {
      return '<button class="check ' + (on ? 'is-on' : '') + '" data-v="' + v + '">' +
        '<span class="check__box">' + I.check + '</span>' + W.escapeHtml(l) + '</button>';
    }
  }

  function saveAssignment(root, a) {
    var v = function (sel) { var n = W.$(sel + ' .is-active', root); return n ? n.dataset.v : null; };
    var picked = draftPicker ? draftPicker.value : [];
    var types = W.$$('#ab-types .check.is-on', root).map(function (n) { return n.dataset.v; });

    a.title = W.$('#ab-title', root).value.trim() || 'Untitled assignment';
    a.mode = v('#ab-mode') || 'test';
    a.config = {
      countries: picked,
      count: parseInt(v('#ab-count') || '20', 10),
      types: types.length ? types : ['capital'],
      timed: v('#ab-timed') === 'timed',
      instant: v('#ab-instant') !== 'end',
      typed: v('#ab-typed') === 'typed',
      fill: !picked.length
    };
    /* no countries picked means every UN member, spelled out so a student's
       own study filters can never narrow it */
    if (!picked.length) { a.config.scope = 'un'; a.config.regions = []; }
    a.from = cls().name || 'Your teacher';
    a.classCode = classCode();

    /* found by id, not by where it sat in the list when the builder opened */
    var list = cls().assignments;
    var at = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === a.id) at = i;
    if (at === -1) list.push(a); else list[at] = a;
    W.saveNow();
    tab = 'classwork';
    render();
    W.toast('Assignment saved', a.title, I.check);
    if (online()) global.Cloud.saveAssignment(a).catch(cloudErr);
  }

  /* ============================== sharing =========================== */
  /* Two ways into the class and nothing to paste: six characters for the
     board, or a link that fills them in. Both point at the same class row,
     which is the only thing that makes either of them work. */
  function shareInvite() {
    var c = cls();
    var code = classCode();

    if (!code) {
      global.UI.modal({
        title: 'Your class needs a code', icon: I.key,
        body: '<p class="t-muted">A class code has to exist somewhere both you and your students ' +
              'can reach, or it is just six characters that do not work. Sign in and your class ' +
              'gets a real one, along with a link you can paste into Google Classroom.</p>',
        actions: [
          { label: 'Not now', cls: 'btn--ghost', close: true },
          { label: 'Sign in', cls: 'btn--accent', close: true,
            onClick: function () { global.UI.openAuth('signup', function () { syncSoon(true); }); } }
        ]
      });
      return;
    }

    var link = joinLink();
    global.UI.modal({
      title: 'Invite your class', icon: I.key, wide: true,
      body: '<p class="t-muted" style="margin-bottom:18px">Two ways in, and they both do the same ' +
              'thing. Write the code on the board, or send the link and nobody types anything.</p>' +

            '<div class="field"><label class="field__label">Class code</label>' +
              '<div class="code-chip">' + W.escapeHtml(code) + '</div>' +
              '<div class="field__hint">Students enter this once, under Classroom.</div></div>' +

            '<div class="field"><label class="field__label">Join link</label>' +
              '<div class="share-box">' + W.escapeHtml(link) + '</div>' +
              '<div class="field__hint">Opens LearnGeo with the code already filled in.</div></div>' +

            '<div class="feedback" style="background:var(--accent-soft);margin:4px 0 0">' + I.info +
              '<div><b style="color:var(--accent-ink)">Work goes out on its own</b>' +
              '<p>Every assignment you save reaches the class straight away. There is nothing to ' +
              'send afterwards and nothing for them to paste.</p></div></div>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'Copy code', cls: 'btn--ghost', onClick: function () {
            copy(code, 'Class code copied'); return false; } },
        { label: 'Copy link', cls: 'btn--accent', onClick: function () {
            copy(link, 'Join link copied'); return false; } }
      ]
    });
  }

  
  function copy(text, msg) {
    var done = function () { W.toast(msg, '', I.check); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { W.toast('Couldn’t copy', 'Your browser blocked it, so copy it by hand', I.info); }
      ta.remove();
    }
  }

  function becomeTeacher() {
    W.state.role = 'teacher';
    W.state.roleChosen = true;
    W.saveNow();
    global.UI.refreshTabs();
    global.UI.go('teacher');
  }

  function leaveTeacher() {
    W.state.role = 'student';
    W.saveNow();
    global.UI.refreshTabs();
    global.UI.go('portal');
  }

  global.Teacher = {
    render: render, openBuilder: openBuilder,
    becomeTeacher: becomeTeacher,
    leaveTeacher: leaveTeacher, classCode: classCode, joinLink: joinLink, copy: copy,
    forget: function () { lastSync = 0; },
    /* Exported so the leaderboard can ask who is in the class instead of
       keeping its own copy of the rule that a typed name and the account
       that joined under it are one student. */
    people: people, ownerKey: ownerKey,
    get tab() { return tab; }, set tab(v) { tab = v; }
  };
})(window);
