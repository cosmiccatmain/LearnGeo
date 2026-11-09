/* ------------------------------------------------------------------
   LearnGeo — School dashboard (LEA-128).

   For the account that bought Schools (flags.plan === 'schools' or
   flags.school). Not UltraAdmin: the server functions only return
   that school's roster and classes.

   Journey level is the unit number already stored on
   profiles.save.roadtrip. Recent activity is account_activity
   (screen name and time). This file does not keep a second progress
   store.

   Preview opens from Administrator → Development while UltraAdmin is
   unlocked, with sample students. It is not in the public nav.

   Rules are their own section, listed under Roster. The roster view
   stays the class list.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var root = null;
  var preview = false;
  var model = null;
  var section = 'overview';
  var rosterId = '';
  var notice = '';
  var noticeBad = false;
  var busy = false;
  var loading = false;
  var query = '';
  var focusId = '';
  var ruleFocus = '';
  var searchFocus = false;
  var held = { ready: false, onRoster: false, rules: null, tags: {} };
  var ruleWatchers = [];

  var COSMETIC = ['frames', 'effects', 'nameplates', 'banners', 'themes', 'gameSkins'];
  var GAME_LIST = [
    ['duel', 'Geo Duel'],
    ['chess', 'Geo Chess'],
    ['dash', 'Geo Dash'],
    ['orbit', 'Globe Defender'],
    ['snake', 'Capital Snake'],
    ['golf', 'Geo Golf'],
    ['invaders', 'Geo Invaders'],
    ['breakout', 'Flag Breakout'],
    ['maze', 'Capital Maze'],
    ['typer', 'Capital Typer'],
    ['crossing', 'Border Crossing'],
    ['whack', 'Capital Whack'],
    ['match', 'Flag Match'],
    ['sort', 'Continent Sort'],
    ['stack', 'Capital Stack'],
    ['echo', 'Flag Echo']
  ];
  var RULE_DEFS = [
    { id: 'profile', group: 'Profile', name: 'Block profile customization',
      detail: 'Name, pronouns, about, and status.' },
    { id: 'avatar', group: 'Profile', name: 'Block avatar',
      detail: 'The student keeps the current avatar.' },
    { id: 'role', group: 'Profile', name: 'Block role change',
      detail: 'The student cannot switch between student and teacher.' },
    { id: 'skins', group: 'Customization', name: 'Block skins and effects',
      detail: 'Frames, effects, nameplates, banners, themes, and game skins.' },
    { id: 'frames', group: 'Customization', name: 'Block frames',
      detail: 'Avatar frames.' },
    { id: 'effects', group: 'Customization', name: 'Block effects',
      detail: 'Profile effects and reward animations.' },
    { id: 'nameplates', group: 'Customization', name: 'Block nameplates',
      detail: 'Nameplates under the display name.' },
    { id: 'banners', group: 'Customization', name: 'Block banners',
      detail: 'Profile banners.' },
    { id: 'themes', group: 'Customization', name: 'Block themes',
      detail: 'Profile themes.' },
    { id: 'gameSkins', group: 'Customization', name: 'Block game skins',
      detail: 'Colours and pieces inside games.' },
    { id: 'reset', group: 'Account', name: 'Block progress reset',
      detail: 'The student cannot wipe progress from Settings.' },
    { id: 'messaging', group: 'Messaging', name: 'Block all messaging',
      detail: 'Friend inbox, lobby chat, and card sharing.' },
    { id: 'outsideMessaging', group: 'Messaging', name: 'No messaging outside the school',
      detail: 'The student can message classmates only. Other accounts stay closed.' }
  ];

  function W() { return global.WW; }

  function esc(s) {
    var ww = W();
    if (ww && ww.escapeHtml) return ww.escapeHtml(String(s == null ? '' : s));
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon(name) {
    var ww = W();
    var icons = ww && ww.Icons;
    return (icons && icons[name]) || '';
  }

  function isSchool() {
    return !!(global.Premium && global.Premium.isSchool && global.Premium.isSchool());
  }

  function canPreview() {
    return !!(global.Admin && global.Admin.can && global.Admin.can('ultra'));
  }

  function schoolName() {
    var ww = W();
    var n = ww && ww.state && ww.state.profile && ww.state.profile.displayName;
    if (!n || n === 'Explorer') return 'Your school';
    return n;
  }

  function paidLocal() {
    if (global.Premium && global.Premium.studentCount) return global.Premium.studentCount();
    return 25;
  }

  function sample() {
    return {
      preview: true,
      schoolName: 'Riverside Geography',
      paid: 25,
      signedIn: true,
      migrationMissing: false,
      loadError: '',
      students: [
        withRules(student('s1', 'Amina Okonkwo', 'amina.okonkwo.4f2a91@students.learngeo.app', 3, 'East Africa', 7, 'Journey', '', '2 min ago'),
          { profile: true, avatar: true }),
        student('s2', 'Leo Martins', 'leo.martins.91c0de@students.learngeo.app', 1, 'North Africa', 2, 'Learn', '', '18 min ago'),
        withRules(student('s3', 'Priya Shah', 'priya.shah.77ab10@students.learngeo.app', 6, 'Europe', 14, 'Games', '', '1 hr ago'),
          { skins: true, frames: true, effects: true, nameplates: true, banners: true, themes: true, gameSkins: true, games: ['dash'] }),
        withRules(student('s4', 'Jonah Ellis', 'jonah.ellis.b31e44@students.learngeo.app', 2, 'West Africa', 4, 'Practice test', '', 'Yesterday'),
          { messaging: true, outsideMessaging: false })
      ],
      classes: [
        {
          id: 'c1',
          name: 'Period 1 Geography',
          code: 'RVR3K2',
          students: []
        },
        {
          id: 'c2',
          name: 'Period 2 Geography',
          code: 'RVR8Q4',
          students: []
        }
      ]
    };
  }

  function student(id, name, email, level, unit, lessons, screen, seenAt, seenLabel, rules) {
    return {
      id: id,
      name: name,
      email: email || '',
      journeyLevel: level == null ? null : level,
      journeyUnit: unit || '',
      lessonsDone: lessons == null ? null : lessons,
      screen: screen || '',
      seenAt: seenAt || '',
      seenLabel: seenLabel || '',
      rules: cleanRules(rules)
    };
  }

  function withRules(st, extra) {
    st.rules = cleanRules(Object.assign(cleanRules(null), extra || {}));
    return st;
  }

  function cleanRules(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var games = [];
    var seen = {};
    var list = Array.isArray(raw.games) ? raw.games : [];
    list.forEach(function (id) {
      id = String(id || '').toLowerCase();
      if (!/^[a-z0-9]{1,24}$/.test(id) || seen[id] || games.length >= 40) return;
      seen[id] = true;
      games.push(id);
    });
    function flag(key, fallback) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) return fallback;
      return raw[key] === true || raw[key] === 'true';
    }
    return {
      profile: flag('profile', false),
      avatar: flag('avatar', false),
      skins: flag('skins', false),
      frames: flag('frames', false),
      effects: flag('effects', false),
      nameplates: flag('nameplates', false),
      banners: flag('banners', false),
      themes: flag('themes', false),
      gameSkins: flag('gameSkins', false),
      role: flag('role', false),
      reset: flag('reset', false),
      messaging: flag('messaging', false),
      outsideMessaging: flag('outsideMessaging', true),
      games: games
    };
  }

  function ruleOn(rules, id) {
    var r = cleanRules(rules);
    if (String(id).indexOf('game:') === 0) return r.games.indexOf(String(id).slice(5)) !== -1;
    if (id === 'skins') return !!r.skins || COSMETIC.every(function (k) { return r[k]; });
    if (COSMETIC.indexOf(id) !== -1 && r.skins) return true;
    return !!r[id];
  }

  function writeRule(rules, id, on) {
    var next = cleanRules(rules);
    if (id === 'skins') {
      next.skins = !!on;
      COSMETIC.forEach(function (k) { next[k] = !!on; });
      return next;
    }
    if (String(id).indexOf('game:') === 0) {
      var gid = String(id).slice(5);
      next.games = next.games.filter(function (g) { return g !== gid; });
      if (on) next.games.push(gid);
      return next;
    }
    if (COSMETIC.indexOf(id) !== -1 && !on && next.skins) {
      COSMETIC.forEach(function (k) { next[k] = true; });
      next.skins = false;
      next[id] = false;
      return next;
    }
    next[id] = !!on;
    if (COSMETIC.indexOf(id) !== -1) {
      next.skins = COSMETIC.every(function (k) { return next[k]; });
    }
    return next;
  }

  function allRules() {
    var games = GAME_LIST.map(function (pair) {
      return {
        id: 'game:' + pair[0],
        group: 'Games',
        name: 'Block ' + pair[1],
        detail: 'The student cannot open this game.'
      };
    });
    return RULE_DEFS.concat(games);
  }

  function wireSample(m) {
    var byId = {};
    m.students.forEach(function (s) { byId[s.id] = s; });
    m.classes[0].students = [byId.s1, byId.s2];
    m.classes[1].students = [byId.s3];
    return m;
  }

  function blankLive() {
    return {
      preview: false,
      schoolName: schoolName(),
      paid: paidLocal(),
      signedIn: !!(global.Cloud && global.Cloud.signedIn),
      migrationMissing: false,
      loadError: '',
      students: [],
      classes: []
    };
  }

  function normStudent(s) {
    if (!s) return null;
    var level = s.journeyLevel;
    if (level == null && s.journey_level != null) level = s.journey_level;
    var lessons = s.lessonsDone;
    if (lessons == null && s.lessons_done != null) lessons = s.lessons_done;
    return student(
      String(s.id || ''),
      s.name || 'Student',
      s.email || '',
      level == null || level === '' ? null : Number(level),
      s.journeyUnit || s.journey_unit || '',
      lessons == null || lessons === '' ? null : Number(lessons),
      s.screen || '',
      s.seenAt || s.seen_at || '',
      s.seenLabel || '',
      s.rules
    );
  }

  function applyPayload(data) {
    var students = (data.students || []).map(normStudent).filter(Boolean);
    var classes = (data.classes || []).map(function (c) {
      return {
        id: String(c.id || ''),
        name: c.name || 'Class',
        code: c.code || '',
        students: (c.students || []).map(normStudent).filter(function (s) { return s && (s.id || s.name); })
      };
    });
    model = {
      preview: false,
      schoolName: schoolName(),
      paid: data.paid != null ? Number(data.paid) : paidLocal(),
      signedIn: true,
      migrationMissing: false,
      loadError: '',
      students: students,
      classes: classes
    };
    if (!rosterId && classes[0]) rosterId = classes[0].id;
  }

  function seats() {
    var paid = model && model.paid ? Number(model.paid) : 0;
    var listed = model && model.students ? model.students.length : 0;
    var used = listed;
    if (!preview && model && typeof model.serverUsed === 'number') {
      used = Math.max(listed, model.serverUsed);
    }
    return { paid: paid, used: used, open: Math.max(0, paid - used) };
  }

  function ago(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    var d = Math.floor(s / 86400);
    if (d === 1) return 'Yesterday';
    return d + ' days ago';
  }

  function activityLine(st) {
    if (!st) return 'No recent activity';
    var when = st.seenLabel || ago(st.seenAt);
    if (!st.screen && !when) return 'No recent activity';
    if (!st.screen) return when;
    if (!when) return st.screen;
    return st.screen + ' · ' + when;
  }

  function journeyLine(st) {
    if (!st || (st.journeyLevel == null && !st.journeyUnit)) return '—';
    var n = st.journeyLevel == null ? 1 : st.journeyLevel;
    var unit = st.journeyUnit || 'North Africa';
    var lessons = st.lessonsDone == null ? 0 : st.lessonsDone;
    return 'Level ' + n + ' · ' + unit + ' · ' +
      lessons + (lessons === 1 ? ' lesson' : ' lessons');
  }

  function proposeCode() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 6; i++) out += abc[(Math.random() * abc.length) | 0];
    return out;
  }

  function findStudent(id) {
    var list = model.students || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function findClass(id) {
    var list = model.classes || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function rpc(name, args) {
    var C = global.Cloud;
    if (!C || !C.sb || !C.signedIn) {
      return Promise.resolve({ ok: false, kind: 'signedout', message: 'Sign in on the Schools account first.' });
    }
    return C.sb.rpc(name, args || {}).then(function (res) {
      if (res && res.error) {
        var msg = String(res.error.message || res.error.details || 'That did not work.');
        var code = res.error.code || '';
        if (code === 'PGRST202' || /could not find the function/i.test(msg) || /schema cache/i.test(msg)) {
          return { ok: false, kind: 'nomigration', message: 'The school dashboard needs 0035_school_dashboard.sql on the database.' };
        }
        return { ok: false, kind: 'error', message: msg };
      }
      var data = res && res.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { data = { ok: false, message: data }; }
      }
      return data || { ok: false, message: 'Empty reply from the server.' };
    }, function () {
      return { ok: false, kind: 'error', message: 'The school dashboard could not reach the server.' };
    });
  }

  function say(text, bad) {
    notice = text || '';
    noticeBad = !!bad;
  }

  function open(opts) {
    opts = opts || {};
    var asPreview = !!opts.preview;
    if (asPreview) {
      if (!canPreview()) return;
    } else if (!isSchool()) {
      return;
    }
    preview = asPreview;
    section = opts.section || 'overview';
    query = '';
    focusId = '';
    ruleFocus = '';
    searchFocus = false;
    notice = '';
    noticeBad = false;
    busy = false;
    if (preview) {
      model = wireSample(sample());
      rosterId = model.classes[0] ? model.classes[0].id : '';
      loading = false;
      mount();
      return;
    }
    model = blankLive();
    rosterId = '';
    loading = !!(global.Cloud && global.Cloud.signedIn);
    mount();
    if (loading) refresh();
  }

  function close() {
    if (!root) return;
    root.remove();
    root = null;
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!root || e.key !== 'Escape') return;
    if (document.querySelector('.overlay')) return;
    close();
  }

  function mount() {
    if (root) root.remove();
    root = document.createElement('div');
    root.className = 'schooldash';
    root.id = 'schooldash';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'School dashboard');
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey);
    render();
  }

  function render() {
    if (!root || !model) return;
    var seat = seats();
    var pct = seat.paid ? Math.min(100, Math.round(seat.used / seat.paid * 100)) : 0;
    root.innerHTML =
      (preview
        ? '<div class="schooldash__ribbon" role="status"><b>Preview</b>' +
            '<span>Sample students. This is not a live school, and it is not shown to the public.</span></div>'
        : '') +
      '<div class="schooldash__frame">' +
        '<aside class="schooldash__side">' +
          '<div class="schooldash__who">' +
            '<div class="schooldash__mark">' + icon('users') + '</div>' +
            '<div><b>School</b><span>' + esc(model.schoolName) + '</span></div>' +
          '</div>' +
          '<nav class="schooldash__nav" aria-label="School dashboard">' +
            navBtn('overview', 'shield', 'Overview') +
            navBtn('students', 'users', 'Students') +
            navBtn('classrooms', 'layers', 'Classrooms') +
            navBtn('roster', 'clip', 'Roster') +
            navBtn('rules', 'lock', 'Rules', 'roster') +
          '</nav>' +
          '<div class="schooldash__foot">' +
            '<button type="button" data-do="close">Close</button>' +
          '</div>' +
        '</aside>' +
        '<div class="schooldash__main">' +
          '<h1>' + esc(title()) + '</h1>' +
          '<p class="schooldash__lead">' + esc(lead(seat)) + '</p>' +
          searchHtml() +
          noteHtml() +
          (loading ? '<p class="schooldash__empty">Loading the school…</p>' : panel(seat, pct)) +
        '</div>' +
      '</div>';
    bind();
    var search = document.getElementById('sd-search');
    if (search && searchFocus) {
      search.focus();
      var n = search.value.length;
      try { search.setSelectionRange(n, n); } catch (e) {}
    }
    if (ruleFocus) {
      var row = document.getElementById('sd-rule-' + ruleFocus);
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }
  }

  function navBtn(id, ic, label, under) {
    var cls = [];
    if (section === id) cls.push('is-on');
    if (under) cls.push('is-sub');
    return '<button type="button" data-nav="' + id + '"' +
      (under ? ' data-under="' + under + '"' : '') +
      (cls.length ? ' class="' + cls.join(' ') + '"' : '') +
      (section === id ? ' aria-current="page"' : '') + '>' +
      icon(ic) + '<span>' + label + '</span></button>';
  }

  function title() {
    if (query.trim()) return 'Search';
    if (section === 'students') return 'Students';
    if (section === 'classrooms') return 'Classrooms';
    if (section === 'roster') return 'Class roster';
    if (section === 'rules') return 'Rules';
    return 'School dashboard';
  }

  function lead(seat) {
    if (preview) {
      return 'A Schools buyer sees only their students. ' +
        seat.used + ' of ' + seat.paid + ' seats are in use in this sample.';
    }
    if (!model.signedIn) {
      return 'Sign in on this Schools account to create student logins. ' +
        'The plan pays for ' + seat.paid + ' seats.';
    }
    return 'Accounts, classrooms, and Journey progress for this school. ' +
      seat.used + ' of ' + seat.paid + ' seats are in use.';
  }

  function noteHtml() {
    if (model.migrationMissing) {
      return '<p class="schooldash__note is-bad" role="status">' +
        esc(model.loadError || 'The school dashboard needs 0035_school_dashboard.sql on the database.') +
        '</p>';
    }
    if (model.loadError && !notice) {
      return '<p class="schooldash__note is-bad" role="status">' + esc(model.loadError) + '</p>';
    }
    if (!notice) return '';
    return '<p class="schooldash__note ' + (noticeBad ? 'is-bad' : 'is-ok') + '" role="status">' +
      esc(notice) + '</p>';
  }

  function panel(seat, pct) {
    if (query.trim()) return hitsHtml();
    if (section === 'students') return studentsPanel(seat);
    if (section === 'classrooms') return classPanel();
    if (section === 'roster') return rosterPanel();
    if (section === 'rules') return rulesPanel();
    return overviewPanel(seat, pct);
  }

  function overviewPanel(seat, pct) {
    return '<div class="schooldash__grid">' +
        '<section class="schooldash__card">' +
          '<h2>Seats</h2>' +
          '<div class="schooldash__seats-num">' + seat.used +
            ' <span>of ' + seat.paid + ' used</span></div>' +
          '<div class="schooldash__meter" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
          '<p style="margin-top:10px">' + seat.open + (seat.open === 1 ? ' seat is open.' : ' seats are open.') +
            ' A seat is a student account. Removing someone from a class does not free a seat.</p>' +
        '</section>' +
        '<section class="schooldash__card">' +
          '<h2>Messaging</h2>' +
          '<p>Student messaging is off for accounts outside the school. Classmates can still message each other unless you block all messaging on that account. Profile, customization, skins and effects, and individual games can be blocked the same way. A blocked control shows “Managed by your school” to the student.</p>' +
        '</section>' +
      '</div>' +
      '<div class="schooldash__table-wrap">' +
        progressTable(model.students, false) +
      '</div>';
  }

  function studentsPanel(seat) {
    var full = seat.used >= seat.paid;
    return '<form class="schooldash__form" data-do="create-student">' +
        '<label>Student name<input class="input" id="sd-name" maxlength="60" autocomplete="off" ' +
          'placeholder="Amina Okonkwo"' + (busy ? ' disabled' : '') + '></label>' +
        '<label>Password<input class="input" id="sd-pass" type="text" maxlength="72" autocomplete="new-password" ' +
          'placeholder="At least 8 characters"' + (busy ? ' disabled' : '') + '></label>' +
        '<button type="submit" class="btn btn--accent btn--sm"' +
          (busy || full ? ' disabled' : '') + '>' +
          (full ? 'No seats left' : 'Create account') + '</button>' +
      '</form>' +
      '<p class="t-sm t-muted" style="margin:-6px 0 14px">Uses one paid seat. LearnGeo shows the sign-in email here. It does not email the password. Messaging outside the school starts off.</p>' +
      '<div class="schooldash__table-wrap">' + progressTable(model.students, true) + '</div>';
  }

  function progressTable(list, withRemove) {
    if (!list || !list.length) {
      return '<div class="schooldash__empty">No student accounts yet.</div>';
    }
    var head = '<tr><th>Student</th><th>Journey</th><th>Recent activity</th><th></th></tr>';
    var rows = list.map(function (st) {
      return '<tr>' +
        '<td><b>' + esc(st.name) + '</b>' +
          (st.email ? '<div class="mono t-sm t-muted">' + esc(st.email) + '</div>' : '') +
        '</td>' +
        '<td>' + esc(journeyLine(st)) + '</td>' +
        '<td>' + esc(activityLine(st)) + '</td>' +
        '<td class="schooldash__row-actions">' +
          (st.id
            ? '<button type="button" class="btn btn--ghost btn--sm" data-do="manage" data-id="' +
                esc(st.id) + '">Manage</button>'
            : '') +
          (withRemove && st.id
            ? '<button type="button" class="btn btn--ghost btn--sm schooldash__danger" data-do="remove-account" data-id="' +
                esc(st.id) + '">Remove account</button>'
            : '') +
        '</td>' +
        '</tr>';
    }).join('');
    return '<table class="schooldash__table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
  }

  function classPanel() {
    var blocks = (model.classes || []).map(classCard).join('');
    if (!blocks) blocks = '<div class="schooldash__empty">No classrooms yet.</div>';
    return '<form class="schooldash__form" data-do="create-class">' +
        '<label>New classroom<input class="input" id="sd-class" maxlength="60" autocomplete="off" ' +
          'placeholder="Period 3 Geography"' + (busy ? ' disabled' : '') + '></label>' +
        '<button type="submit" class="btn btn--accent btn--sm"' + (busy ? ' disabled' : '') +
          '>Create classroom</button>' +
      '</form>' + blocks;
  }

  function classCard(c) {
    var people = (c.students || []).map(function (st) {
      return '<span class="schooldash__chip">' + esc(st.name) +
        '<button type="button" data-do="class-remove" data-class="' + esc(c.id) +
          '" data-id="' + esc(st.id) + '" aria-label="Remove ' + esc(st.name) + '">×</button></span>';
    }).join('');
    var inClass = {};
    (c.students || []).forEach(function (st) { if (st.id) inClass[st.id] = true; });
    var options = (model.students || []).filter(function (st) { return st.id && !inClass[st.id]; })
      .map(function (st) {
        return '<option value="' + esc(st.id) + '">' + esc(st.name) + '</option>';
      }).join('');
    return '<section class="schooldash__class">' +
      '<div class="schooldash__class-head">' +
        '<input class="input" id="sd-rename-' + esc(c.id) + '" maxlength="60" value="' + esc(c.name) + '">' +
        '<span class="schooldash__code">' + esc(c.code || '—') + '</span>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-do="rename-class" data-class="' +
          esc(c.id) + '">Rename</button>' +
      '</div>' +
      (people ? '<div class="schooldash__people">' + people + '</div>' : '<p class="t-sm t-muted">No students in this class yet.</p>') +
      '<div class="schooldash__add">' +
        '<select class="input" id="sd-add-' + esc(c.id) + '" aria-label="Add a student to ' + esc(c.name) + '">' +
          (options ? '<option value="">Add a student</option>' + options : '<option value="">Every account is already in this class</option>') +
        '</select>' +
        '<button type="button" class="btn btn--sm" data-do="class-add" data-class="' + esc(c.id) + '">Add</button>' +
      '</div>' +
    '</section>';
  }

  function rosterPanel() {
    var classes = model.classes || [];
    if (!classes.length) return '<div class="schooldash__empty">Create a classroom to see its roster.</div>';
    if (!findClass(rosterId)) rosterId = classes[0].id;
    var current = findClass(rosterId) || classes[0];
    var options = classes.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === current.id ? ' selected' : '') + '>' +
        esc(c.name) + '</option>';
    }).join('');
    return '<div class="schooldash__form">' +
        '<label>Classroom<select class="input" id="sd-roster" aria-label="Classroom">' + options + '</select></label>' +
        '<span class="schooldash__code">' + esc(current.code || '—') + '</span>' +
      '</div>' +
      '<div class="schooldash__table-wrap">' +
        ((current.students && current.students.length)
          ? progressTable(current.students, false)
          : '<div class="schooldash__empty">No students on this roster yet.</div>') +
      '</div>';
  }

  function searchHtml() {
    return '<label class="schooldash__search">Search' +
      '<input class="input" id="sd-search" type="search" autocomplete="off" ' +
        'placeholder="Students, classrooms, or rules" value="' + esc(query) + '"></label>';
  }

  function hitsHtml() {
    var found = searchHits(query);
    var blocks = hitGroup('Students', found.students.map(function (st) {
      return hitBtn('student', st.id, st.name, st.email || journeyLine(st));
    })) + hitGroup('Classrooms', found.classes.map(function (c) {
      return hitBtn('class', c.id, c.name, c.code || 'Classroom');
    })) + hitGroup('Rules', found.rules.map(function (r) {
      return hitBtn('rule', r.id, r.name, r.group);
    }));
    if (!blocks) return '<div class="schooldash__empty">Nothing matches that search.</div>';
    return blocks;
  }

  function hitGroup(label, html) {
    html = Array.isArray(html) ? html.join('') : html;
    if (!html) return '';
    return '<section class="schooldash__hits"><h2>' + esc(label) + '</h2>' + html + '</section>';
  }

  function hitBtn(kind, id, name, meta) {
    return '<button type="button" class="schooldash__hit" data-do="hit" data-kind="' + esc(kind) +
      '" data-id="' + esc(id) + '"><b>' + esc(name) + '</b><span>' + esc(meta) + '</span></button>';
  }

  function searchHits(text) {
    var q = String(text || '').trim().toLowerCase();
    if (!q) return { students: [], classes: [], rules: [] };
    return {
      students: (model.students || []).filter(function (st) {
        return (st.name + ' ' + (st.email || '')).toLowerCase().indexOf(q) !== -1;
      }),
      classes: (model.classes || []).filter(function (c) {
        return (c.name + ' ' + (c.code || '')).toLowerCase().indexOf(q) !== -1;
      }),
      rules: allRules().filter(function (r) {
        return (r.name + ' ' + r.group + ' ' + (r.detail || '')).toLowerCase().indexOf(q) !== -1;
      })
    };
  }

  function rulesPanel() {
    var students = model.students || [];
    if (!students.length) {
      return '<div class="schooldash__empty">Create a student account before setting rules.</div>';
    }
    if (!findStudent(focusId)) focusId = students[0].id;
    var st = findStudent(focusId);
    var options = students.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === st.id ? ' selected' : '') + '>' +
        esc(s.name) + '</option>';
    }).join('');
    var groups = {};
    allRules().forEach(function (r) {
      if (!groups[r.group]) groups[r.group] = [];
      groups[r.group].push(r);
    });
    var order = ['Profile', 'Customization', 'Games', 'Messaging', 'Account'];
    var body = order.map(function (name) {
      var list = groups[name] || [];
      if (!list.length) return '';
      return '<section class="schooldash__rules"><h2>' + esc(name) + '</h2>' +
        list.map(function (r) { return ruleRow(st, r); }).join('') +
        '</section>';
    }).join('');
    return '<div class="schooldash__form">' +
        '<label>Student<select class="input" id="sd-rules-student" aria-label="Student">' +
          options + '</select></label>' +
      '</div>' +
      '<p class="t-sm t-muted" style="margin-top:0">Turn a rule on and that control is replaced with “Managed by your school”.</p>' +
      '<div class="schooldash__account-meta">' +
        '<div><b>' + esc(st.name) + '</b>' +
          (st.email ? '<div class="mono t-sm t-muted">' + esc(st.email) + '</div>' : '') +
        '</div>' +
        '<div>' + esc(journeyLine(st)) + '</div>' +
        '<div>' + esc(activityLine(st)) + '</div>' +
      '</div>' + body;
  }

  function ruleRow(st, rule) {
    var on = ruleOn(st.rules, rule.id);
    return '<div class="setting-row' + (ruleFocus === rule.id ? ' is-hit' : '') +
      '" id="sd-rule-' + esc(rule.id) + '">' +
      '<div class="setting-row__t"><b>' + esc(rule.name) + '</b>' +
        (rule.detail ? '<span>' + esc(rule.detail) + '</span>' : '') +
      '</div>' +
      '<button type="button" class="switch' + (on ? ' is-on' : '') + '" role="switch" ' +
        'aria-checked="' + (on ? 'true' : 'false') + '" data-do="rule" data-id="' + esc(st.id) +
        '" data-rule="' + esc(rule.id) + '" aria-label="' + esc(rule.name) + '"' +
        (busy ? ' disabled' : '') + '></button></div>';
  }

  function bind() {
    if (!root) return;
    root.onclick = function (e) {
      var nav = e.target.closest && e.target.closest('[data-nav]');
      if (nav) {
        section = nav.getAttribute('data-nav') || 'overview';
        say('');
        render();
        return;
      }
      var btn = e.target.closest && e.target.closest('[data-do]');
      if (!btn || btn.closest('form')) return;
      var act = btn.getAttribute('data-do');
      if (act === 'close') return close();
      if (act === 'manage') return openAccount(btn.getAttribute('data-id'), '');
      if (act === 'hit') return openHit(btn.getAttribute('data-kind'), btn.getAttribute('data-id'));
      if (act === 'rule') return toggleRule(btn.getAttribute('data-id'), btn.getAttribute('data-rule'));
      if (act === 'remove-account') return askRemove(btn.getAttribute('data-id'));
      if (act === 'rename-class') return renameClass(btn.getAttribute('data-class'));
      if (act === 'class-add') return classAdd(btn.getAttribute('data-class'));
      if (act === 'class-remove') return classRemove(btn.getAttribute('data-class'), btn.getAttribute('data-id'));
    };
    root.onchange = function (e) {
      if (e.target && e.target.id === 'sd-roster') {
        rosterId = e.target.value;
        render();
        return;
      }
      if (e.target && e.target.id === 'sd-rules-student') {
        focusId = e.target.value;
        ruleFocus = '';
        render();
      }
    };
    var search = document.getElementById('sd-search');
    if (search) {
      search.addEventListener('input', function () {
        query = search.value || '';
        searchFocus = true;
        render();
      });
    }
    root.onsubmit = function (e) {
      var form = e.target;
      if (!form || !form.getAttribute) return;
      var act = form.getAttribute('data-do');
      if (act !== 'create-student' && act !== 'create-class') return;
      e.preventDefault();
      if (act === 'create-student') return createStudent();
      return createClass();
    };
  }

  function needLive() {
    if (preview) return false;
    if (!model.signedIn) {
      say('Sign in on the Schools account to change the school.', true);
      render();
      return true;
    }
    return false;
  }

  function createStudent() {
    var nameEl = document.getElementById('sd-name');
    var passEl = document.getElementById('sd-pass');
    var name = nameEl ? String(nameEl.value || '').trim() : '';
    var pass = passEl ? String(passEl.value || '') : '';
    var seat = seats();
    if (!name) { say('A name is required.', true); render(); return; }
    if (pass.length < 8 || pass.length > 72) {
      say('Password must be 8 to 72 characters.', true);
      render();
      return;
    }
    if (seat.used >= seat.paid) {
      say('All ' + seat.paid + ' seats are in use.', true);
      render();
      return;
    }
    if (preview) {
      var id = 's' + Date.now();
      var local = name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'student';
      model.students.push(student(
        id,
        name.slice(0, 60),
        local.slice(0, 24) + '.' + id.slice(-6) + '@students.learngeo.app',
        1, 'North Africa', 0, '', '', ''
      ));
      say('Account ready for ' + name.slice(0, 60) + '. Share the email and the password you set. Messaging outside the school is off.');
      render();
      return;
    }
    if (needLive()) return;
    busy = true;
    render();
    rpc('school_create_student', { p_name: name.slice(0, 60), p_password: pass }).then(function (res) {
      busy = false;
      if (!res || res.ok === false) {
        say((res && res.message) || 'Could not create that account.', true);
        render();
        return;
      }
      say('Account ready for ' + (res.name || name) + '. Sign-in email: ' + (res.email || '') +
        '. Share the password you set. Messaging is off.');
      refresh();
    });
  }

  function askRemove(id) {
    var st = findStudent(id);
    if (!st) return;
    var ui = global.UI;
    var go = function () { removeAccount(st); };
    if (!ui || !ui.modal) { go(); return; }
    ui.modal({
      title: 'Remove student account',
      icon: icon('users'),
      body: '<p class="t-muted" style="margin:0">This removes <b>' + esc(st.name) +
        '</b> from the school and frees one seat. Their sign-in stops working.</p>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Remove account', cls: 'btn--ghost schooldash__danger', close: true, onClick: function () {
            go();
            return true;
          } }
      ]
    });
  }

  function removeAccount(st) {
    if (preview) {
      model.students = model.students.filter(function (s) { return s.id !== st.id; });
      model.classes.forEach(function (c) {
        c.students = (c.students || []).filter(function (s) { return s.id !== st.id; });
      });
      say(st.name + ' was removed. One seat is open.');
      render();
      return;
    }
    if (needLive()) return;
    busy = true;
    render();
    rpc('school_remove_account', { p_student: st.id }).then(function (res) {
      busy = false;
      if (!res || res.ok === false) {
        say((res && res.message) || 'Could not remove that account.', true);
        render();
        return;
      }
      say(st.name + ' was removed. One seat is open.');
      refresh();
    });
  }

  function createClass() {
    var el = document.getElementById('sd-class');
    var name = el ? String(el.value || '').trim() : '';
    if (!name) { say('A class name is required.', true); render(); return; }
    name = name.slice(0, 60);
    if (preview) {
      var row = { id: 'c' + Date.now(), name: name, code: proposeCode(), students: [] };
      model.classes.push(row);
      rosterId = row.id;
      say(name + ' is ready. Code ' + row.code + '.');
      section = 'classrooms';
      render();
      return;
    }
    if (needLive()) return;
    busy = true;
    render();
    rpc('school_create_class', { p_name: name }).then(function (res) {
      busy = false;
      if (!res || res.ok === false) {
        say((res && res.message) || 'Could not create that class.', true);
        render();
        return;
      }
      mirrorClass(res);
      say((res.name || name) + ' is ready. Code ' + (res.code || '') + '.');
      if (res.id) rosterId = String(res.id);
      refresh();
    });
  }

  function renameClass(id) {
    var input = document.getElementById('sd-rename-' + id);
    var name = input ? String(input.value || '').trim() : '';
    if (!name) { say('A class name is required.', true); render(); return; }
    name = name.slice(0, 60);
    if (preview) {
      var c = findClass(id);
      if (!c) return;
      c.name = name;
      say('Renamed to ' + name + '.');
      render();
      return;
    }
    if (needLive()) return;
    busy = true;
    render();
    rpc('school_rename_class', { p_class: id, p_name: name }).then(function (res) {
      busy = false;
      if (!res || res.ok === false) {
        say((res && res.message) || 'Could not rename that class.', true);
        render();
        return;
      }
      mirrorRename(id, name);
      say('Renamed to ' + name + '.');
      refresh();
    });
  }

  function classAdd(classId) {
    var sel = document.getElementById('sd-add-' + classId);
    var sid = sel ? sel.value : '';
    if (!sid) { say('Choose a student to add.', true); render(); return; }
    var st = findStudent(sid);
    if (!st) return;
    if (preview) {
      var c = findClass(classId);
      if (!c) return;
      if (!c.students.some(function (s) { return s.id === sid; })) c.students.push(st);
      say(st.name + ' is on ' + c.name + '.');
      render();
      return;
    }
    if (needLive()) return;
    busy = true;
    render();
    rpc('school_class_add', { p_class: classId, p_student: sid }).then(function (res) {
      busy = false;
      if (!res || res.ok === false) {
        say((res && res.message) || 'Could not add that student.', true);
        render();
        return;
      }
      say((st.name) + ' was added to the class. Messaging stays off.');
      refresh();
    });
  }

  function classRemove(classId, sid) {
    var st = findStudent(sid);
    var name = st ? st.name : 'That student';
    if (preview) {
      var c = findClass(classId);
      if (!c) return;
      c.students = (c.students || []).filter(function (s) { return s.id !== sid; });
      say(name + ' was removed from ' + c.name + '. The seat is still in use.');
      render();
      return;
    }
    if (needLive()) return;
    busy = true;
    render();
    rpc('school_class_remove', { p_class: classId, p_student: sid }).then(function (res) {
      busy = false;
      if (!res || res.ok === false) {
        say((res && res.message) || 'Could not remove that student.', true);
        render();
        return;
      }
      say(name + ' was removed from the class. The seat is still in use.');
      refresh();
    });
  }

  function mirrorClass(row) {
    var CL = global.Classes;
    var ww = W();
    if (!CL || !CL.addFromCloud || !row || !row.id) return;
    var rec = CL.addFromCloud({ id: row.id, name: row.name, code: row.code });
    if (!rec) return;
    rec.shared = false;
    rec.code = row.code || rec.code;
    rec.name = row.name || rec.name;
    rec.schoolPlan = true;
    if (ww && ww.saveNow) ww.saveNow();
  }

  function mirrorRename(id, name) {
    var ww = W();
    if (!ww || !ww.state) return;
    (ww.state.classes || []).forEach(function (c) {
      if (c && c.cloudId === id) c.name = name;
    });
    if (ww.state.classroom && ww.state.classroom.cloudId === id) ww.state.classroom.name = name;
    if (ww.saveNow) ww.saveNow();
  }

  function refresh() {
    if (preview) { render(); return; }
    loading = true;
    rpc('school_dashboard').then(function (res) {
      loading = false;
      if (!res || res.ok === false) {
        model = blankLive();
        model.migrationMissing = !!(res && res.kind === 'nomigration');
        model.loadError = (res && res.message) || 'Could not load the school.';
        if (res && res.kind === 'signedout') model.signedIn = false;
        render();
        return;
      }
      applyPayload(res);
      if (typeof res.used === 'number') model.serverUsed = res.used;
      render();
    });
  }

  function openAccount(id, ruleId) {
    var st = findStudent(id);
    if (!st) {
      say('Choose a student first.', true);
      render();
      return;
    }
    focusId = st.id;
    ruleFocus = ruleId || '';
    section = 'rules';
    query = '';
    searchFocus = false;
    say(ruleId ? 'Showing ' + (ruleById(ruleId) || {}).name + ' for ' + st.name + '.' : '');
    render();
  }

  function ruleById(id) {
    var list = allRules();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function openHit(kind, id) {
    if (kind === 'student') return openAccount(id, '');
    if (kind === 'class') {
      var c = findClass(id);
      if (!c) return;
      rosterId = c.id;
      section = 'roster';
      query = '';
      searchFocus = false;
      ruleFocus = '';
      say(c.name);
      render();
      return;
    }
    if (kind === 'rule') {
      var st = findStudent(focusId) || (model.students || [])[0];
      if (!st) {
        say('Create a student account before setting rules.', true);
        query = '';
        render();
        return;
      }
      return openAccount(st.id, id);
    }
  }

  function toggleRule(id, ruleId) {
    var st = findStudent(id);
    if (!st || !ruleId) return;
    var next = writeRule(st.rules, ruleId, !ruleOn(st.rules, ruleId));
    st.rules = next;
    if (preview) {
      say((ruleOn(next, ruleId) ? 'On: ' : 'Off: ') + ((ruleById(ruleId) || {}).name || 'Rule') + ' for ' + st.name);
      render();
      return;
    }
    if (needLive()) return;
    busy = true;
    render();
    rpc('school_set_rules', { p_student: id, p_rules: next }).then(function (res) {
      busy = false;
      if (!res || res.ok === false) {
        say((res && res.message) || 'Could not save that rule.', true);
        render();
        return;
      }
      if (res.rules) st.rules = cleanRules(res.rules);
      say('Saved for ' + st.name);
      render();
    });
  }

  function tell() {
    ruleWatchers.slice().forEach(function (fn) {
      try { fn(); } catch (e) {}
    });
  }

  function clearHeld() {
    held.ready = false;
    held.onRoster = false;
    held.rules = cleanRules(null);
    held.tags = {};
    tell();
  }

  function loadHeld() {
    var C = global.Cloud;
    if (!C || !C.signedIn || !C.sb || !C.sb.rpc) {
      clearHeld();
      return Promise.resolve();
    }
    return C.sb.rpc('my_school_rules').then(function (res) {
      var data = res && res.data;
      if (res && res.error) data = null;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { data = null; }
      }
      held.ready = true;
      if (!data || data.onRoster !== true) {
        held.onRoster = false;
        held.rules = cleanRules(null);
        held.tags = {};
        tell();
        return;
      }
      held.onRoster = true;
      held.rules = cleanRules(data.rules);
      held.tags = {};
      (data.classmates || []).forEach(function (tag) {
        if (tag) held.tags[String(tag).toLowerCase()] = true;
      });
      tell();
    }, function () {
      held.ready = true;
      held.onRoster = false;
      tell();
    });
  }

  function featureBlocked(id) {
    if (!held.ready || !held.onRoster) return false;
    return ruleOn(held.rules, id);
  }

  function gameBlocked(id) {
    if (!held.ready || !held.onRoster || !id) return false;
    return ruleOn(held.rules, 'game:' + id);
  }

  function messagingOpen(tag) {
    if (!held.ready || !held.onRoster) return false;
    if (held.rules.messaging) return false;
    if (held.rules.outsideMessaging) {
      if (tag == null || tag === '') return false;
      return !!held.tags[String(tag).toLowerCase()];
    }
    return true;
  }

  function outsideOnly() {
    return !!(held.ready && held.onRoster && held.rules &&
      !held.rules.messaging && held.rules.outsideMessaging);
  }

  function confirmMessage(tag) {
    var C = global.Cloud;
    if (!held.ready || !held.onRoster) return Promise.resolve(true);
    if (!messagingOpen(tag)) return Promise.resolve(false);
    if (!C || !C.sb || !C.sb.rpc) return Promise.resolve(messagingOpen(tag));
    return C.sb.rpc('school_may_message', { p_tag: tag || '' }).then(function (res) {
      var data = res && res.data;
      if (res && res.error) return messagingOpen(tag);
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { data = null; }
      }
      if (!data || data.allowed == null) return messagingOpen(tag);
      return data.allowed === true;
    }, function () { return messagingOpen(tag); });
  }

  if (global.Cloud && global.Cloud.signedIn) loadHeld();

  global.SchoolDashboard = {
    open: open,
    close: close,
    loadRules: loadHeld,
    clearRules: clearHeld,
    rulesReady: function () { return held.ready; },
    featureBlocked: featureBlocked,
    gameBlocked: gameBlocked,
    customizationBlocked: function () {
      return featureBlocked('profile') && featureBlocked('avatar') && featureBlocked('skins');
    },
    messagingOpen: messagingOpen,
    outsideOnly: outsideOnly,
    confirmMessage: confirmMessage,
    onRules: function (fn) {
      ruleWatchers.push(fn);
      return function () { ruleWatchers = ruleWatchers.filter(function (w) { return w !== fn; }); };
    }
  };
})(window);
