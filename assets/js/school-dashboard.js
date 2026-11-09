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
        student('s1', 'Amina Okonkwo', 'amina.okonkwo.4f2a91@students.learngeo.app', 3, 'East Africa', 7, 'Journey', '', '2 min ago'),
        student('s2', 'Leo Martins', 'leo.martins.91c0de@students.learngeo.app', 1, 'North Africa', 2, 'Learn', '', '18 min ago'),
        student('s3', 'Priya Shah', 'priya.shah.77ab10@students.learngeo.app', 6, 'Europe', 14, 'Games', '', '1 hr ago'),
        student('s4', 'Jonah Ellis', 'jonah.ellis.b31e44@students.learngeo.app', 2, 'West Africa', 4, 'Practice test', '', 'Yesterday')
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

  function student(id, name, email, level, unit, lessons, screen, seenAt, seenLabel) {
    return {
      id: id,
      name: name,
      email: email || '',
      journeyLevel: level == null ? null : level,
      journeyUnit: unit || '',
      lessonsDone: lessons == null ? null : lessons,
      screen: screen || '',
      seenAt: seenAt || '',
      seenLabel: seenLabel || ''
    };
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
      s.seenLabel || ''
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
          '</nav>' +
          '<div class="schooldash__foot">' +
            '<button type="button" data-do="close">Close</button>' +
          '</div>' +
        '</aside>' +
        '<div class="schooldash__main">' +
          '<h1>' + esc(title()) + '</h1>' +
          '<p class="schooldash__lead">' + esc(lead(seat)) + '</p>' +
          noteHtml() +
          (loading ? '<p class="schooldash__empty">Loading the school…</p>' : panel(seat, pct)) +
        '</div>' +
      '</div>';
    bind();
  }

  function navBtn(id, ic, label) {
    return '<button type="button" data-nav="' + id + '"' +
      (section === id ? ' class="is-on" aria-current="page"' : '') + '>' +
      icon(ic) + '<span>' + label + '</span></button>';
  }

  function title() {
    if (section === 'students') return 'Students';
    if (section === 'classrooms') return 'Classrooms';
    if (section === 'roster') return 'Class roster';
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
    if (section === 'students') return studentsPanel(seat);
    if (section === 'classrooms') return classPanel();
    if (section === 'roster') return rosterPanel();
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
          '<p>Student messaging is off. Schools accounts cannot use friend inbox, lobby chat, or challenges between students.</p>' +
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
      '<p class="t-sm t-muted" style="margin:-6px 0 14px">Uses one paid seat. LearnGeo shows the sign-in email here. It does not email the password. Messaging stays off for the new account.</p>' +
      '<div class="schooldash__table-wrap">' + progressTable(model.students, true) + '</div>';
  }

  function progressTable(list, withRemove) {
    if (!list || !list.length) {
      return '<div class="schooldash__empty">No student accounts yet.</div>';
    }
    var head = '<tr><th>Student</th><th>Journey</th><th>Recent activity</th>' +
      (withRemove ? '<th></th>' : '') + '</tr>';
    var rows = list.map(function (st) {
      return '<tr>' +
        '<td><b>' + esc(st.name) + '</b>' +
          (st.email ? '<div class="mono t-sm t-muted">' + esc(st.email) + '</div>' : '') +
        '</td>' +
        '<td>' + esc(journeyLine(st)) + '</td>' +
        '<td>' + esc(activityLine(st)) + '</td>' +
        (withRemove
          ? '<td><button type="button" class="btn btn--ghost btn--sm schooldash__danger" data-do="remove-account" data-id="' +
              esc(st.id) + '">Remove account</button></td>'
          : '') +
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
      if (act === 'remove-account') return askRemove(btn.getAttribute('data-id'));
      if (act === 'rename-class') return renameClass(btn.getAttribute('data-class'));
      if (act === 'class-add') return classAdd(btn.getAttribute('data-class'));
      if (act === 'class-remove') return classRemove(btn.getAttribute('data-class'), btn.getAttribute('data-id'));
    };
    root.onchange = function (e) {
      if (e.target && e.target.id === 'sd-roster') {
        rosterId = e.target.value;
        render();
      }
    };
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
      say('Account ready for ' + name.slice(0, 60) + '. Share the email and the password you set. Messaging is off.');
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

  global.SchoolDashboard = {
    open: open,
    close: close
  };
})(window);
