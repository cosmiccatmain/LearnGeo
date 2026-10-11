/* ------------------------------------------------------------------
   LearnGeo — the parts of a class that 0010 makes possible.

     People         everybody in the class, each with the profile they
                    designed — not the name they typed into a join box
     Admin classes  joined with the UltraAdmin code, dressed differently,
                    and everybody in one wears the LearnGeo Staff effect
     Co-teachers    more than one teacher on a class
     Assign         "Assign to class" from a teacher browsing the modes

   Kept out of classroom.js and teacher.js, which call in here through
   a handful of mount points, so the class views stay readable and a
   database without 0010 costs them nothing: every call here treats a
   missing function as "not yet" and goes quiet.

   Nothing here decides who may see what. class_roster, the admin join
   and the co-teacher calls each check membership on the server.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var GAP = 30e3;               /* the most often the background checks run */
  var lastAdmin = 0, lastTeach = 0;
  var dead = {};                /* functions the database does not have yet */
  var rosters = {};             /* classId -> last class_roster answer */

  function C() { return global.Cloud; }
  function ready() { var c = C(); return !!(c && c.ready && c.sb); }
  function me() { var c = C(); return (c && c.user && c.user.id) || ''; }
  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }

  /* Same rule as admin-ops.js: missing means the function itself, by
     code — not any error whose text happens to say "does not exist". */
  function missing(err, fn) {
    if (!err) return false;
    var msg = String(err.message || '');
    if (err.code === 'PGRST202') return true;
    if (err.code === '42883') return !!fn && msg.indexOf(fn) !== -1 && /function/i.test(msg);
    if (err.code) return false;
    return /could not find the function/i.test(msg);
  }

  function rpc(fn, args) {
    if (dead[fn]) return Promise.resolve({ ok: false, kind: 'nomigration' });
    if (!ready()) return Promise.resolve({ ok: false, kind: 'notready' });
    return C().sb.rpc(fn, args || {}).then(function (res) {
      if (!res.error) return { ok: true, data: res.data };
      if (missing(res.error, fn)) { dead[fn] = true; return { ok: false, kind: 'nomigration' }; }
      return { ok: false, kind: 'error', message: res.error.message || 'That did not work.' };
    }, function (e) {
      return { ok: false, kind: 'error', message: String((e && e.message) || e) };
    });
  }

  function redraw() {
    var view = (document.body.className.match(/\bview-(\w+)\b/) || [])[1];
    if (view === 'classroom' && global.Classroom && global.Classroom.render) global.Classroom.render(true);
    if (view === 'teacher' && global.Teacher && global.Teacher.render) global.Teacher.render();
    if (global.UI && global.UI.refreshHud) global.UI.refreshHud();
  }

  /* ========================= admin classrooms =======================
     Which of my classes are admin ones. Kept in the save so a reload
     draws the right banner before the network answers. It decides only
     what this screen looks like and whether this device shows the Staff
     effect as owned; editing it opens nothing on the server.
  ------------------------------------------------------------------ */
  function adminIds() {
    var f = W.state.flags;
    return (f && Array.isArray(f.adminClassIds)) ? f.adminClassIds : [];
  }
  function isAdmin(id) { return !!id && adminIds().indexOf(id) !== -1; }
  function inAdminClass() { return adminIds().length > 0; }

  function setAdminIds(ids) {
    ids = (ids || []).filter(Boolean).map(String).sort();
    if (ids.join(',') === adminIds().slice().sort().join(',')) return false;
    if (!W.state.flags || typeof W.state.flags !== 'object') W.state.flags = {};
    var wasIn = inAdminClass();
    W.state.flags.adminClassIds = ids;
    /* Leaving the last admin class takes the Staff effect off, unless it
       was granted on its own; wearing what you no longer hold leaves it
       on show with no way to choose it again. */
    if (wasIn && !ids.length && !W.state.flags.staff && W.state.profile.effect === 'staff') {
      W.state.profile.effect = 'none';
    }
    W.saveNow();
    return true;
  }

  function refreshAdminIds(force) {
    if (!ready() || (!force && Date.now() - lastAdmin < GAP)) return Promise.resolve();
    lastAdmin = Date.now();
    var who = me();
    return rpc('my_admin_class_ids').then(function (r) {
      if (!r.ok || me() !== who) return;
      if (setAdminIds(r.data || [])) redraw();
    });
  }

  /* ============================ co-teachers =========================
     A class another teacher added me to. Added to my list with its id
     already set, so the sync finds it by id and pulls their work in. A
     shared class I have been taken off comes off my list, rather than
     the sync turning it into a new empty class of its own.
  ------------------------------------------------------------------ */
  function syncTeaching(force) {
    if (!ready() || W.state.role !== 'teacher' || !global.Classes) return Promise.resolve();
    if (!force && Date.now() - lastTeach < GAP) return Promise.resolve();
    lastTeach = Date.now();
    var who = me();
    return rpc('my_teaching_classes').then(function (r) {
      if (!r.ok || me() !== who) return;
      var CL = global.Classes;
      var live = {};
      (r.data || []).forEach(function (row) { live[row.id] = row; });

      var added = [];
      (r.data || []).forEach(function (row) {
        if (row.owned !== false) return;
        var had = (W.state.classes || []).some(function (c) { return c.cloudId === row.id; });
        if (!had && CL.addFromCloud(row)) added.push(row.name || 'a class');
      });

      var removed = [];
      (W.state.classes || []).slice().forEach(function (c) {
        if (c.shared && c.cloudId && !live[c.cloudId] && CL.remove(c.lid)) removed.push(c.name || 'a class');
      });

      if (added.length) {
        W.toast('Added as a teacher', 'You now teach ' + added.join(', ') + '. Switch to it from your class list.',
          I.users, 5200);
      }
      if (removed.length) {
        W.toast('No longer teaching', removed.join(', ') + ' is off your list.', I.info, 5200);
      }
      if (added.length || removed.length) redraw();
    });
  }

  /* ============================== people ============================ */
  function roster(classId) {
    return rpc('class_roster', { p_class: classId }).then(function (r) {
      if (r.ok && r.data) rosters[classId] = r.data;
      return r;
    });
  }

  /* A person's real profile, for person.js: from any roster already
     fetched, or by fetching the class in front of me. */
  function profileFor(id) {
    if (!id) return Promise.resolve(null);
    function look() {
      for (var k in rosters) {
        var r = rosters[k];
        var all = (r.teachers || []).concat(r.students || []);
        for (var i = 0; i < all.length; i++) if (all[i] && all[i].id === id) return all[i];
      }
      return null;
    }
    var hit = look();
    if (hit) return Promise.resolve(hit);
    var cid = currentClassId();
    if (!cid) return Promise.resolve(null);
    return roster(cid).then(function () { return look(); });
  }

  function currentClassId() {
    if (W.state.role === 'teacher') {
      var c = global.Classes && global.Classes.active && global.Classes.active();
      return (c && c.cloudId) || '';
    }
    return (W.state.enrolled && W.state.enrolled.classId) || '';
  }

  function mountPeople(host, classId) {
    if (!host) return;
    if (!classId) {
      host.innerHTML = empty('Your class is not online yet, so there is nobody to show.');
      return;
    }
    if (!ready()) {
      host.innerHTML = empty('Sign in to see who is in your class.');
      return;
    }
    var have = rosters[classId];
    host.innerHTML = have ? peopleHtml(have) : empty('Loading the class…');
    if (have) wirePeople(host, have);

    roster(classId).then(function (r) {
      if (!document.body.contains(host)) return;
      if (!r.ok) {
        host.innerHTML = empty(r.kind === 'nomigration'
          ? 'Seeing who is in the class needs 0010 on the database.'
          : 'Could not load the class just now.');
        return;
      }
      if (!r.data) { host.innerHTML = empty('You are not in this class any more.'); return; }
      if (r.data.is_admin) setAdminIds(adminIds().concat([classId]));
      host.innerHTML = peopleHtml(r.data);
      wirePeople(host, r.data);
    });
  }

  function empty(t) { return '<div class="pp-empty">' + esc(t) + '</div>'; }

  function peopleHtml(r) {
    var teachers = r.teachers || [], students = r.students || [];
    var i = 0;
    function tiles(list) {
      return '<div class="pp-grid">' + list.map(function (who) { return tile(who, i++, r.is_admin); }).join('') + '</div>';
    }
    return '<div class="pp' + (r.is_admin ? ' pp--admin' : '') + '">' +
      (r.is_admin
        ? '<div class="pp-adminbar">' + I.shield +
            '<div class="grow"><b>Admin classroom</b><span>Everybody here is on the admin list, and wears ' +
            'the LearnGeo Staff effect while they are in it.</span></div>' +
            '<button class="btn btn--sm" data-pp-admin>Open Administrator</button></div>'
        : '') +
      '<div class="pp-h">Teachers <span>' + teachers.length + '</span></div>' + tiles(teachers) +
      '<div class="pp-h">Students <span>' + students.length + '</span></div>' +
      (students.length ? tiles(students) : empty('Nobody has joined yet.')) +
    '</div>';
  }

  /* A small version of the profile card: their banner, their avatar and
     decoration, their name on their nameplate. Opens the full card. */
  function tile(who, i, adminClass) {
    var Cos = global.Cosmetics, p = who.profile || {};
    var banner = Cos.find(Cos.banners, p.banner);
    var plate = Cos.find(Cos.nameplates, p.nameplate);
    var name = p.displayName || who.name || 'Explorer';
    var mine = who.id && who.id === me();
    return '<button class="pp-tile" data-pp="' + i + '">' +
      '<span class="pp-tile__banner" style="background:' + banner.css + '"></span>' +
      '<span class="pp-tile__av">' + W.avatarHtml(p) + '</span>' +
      '<span class="pp-tile__name" style="background:' + plate.css + ';color:' + plate.text + '">' +
        esc(name) + W.verifiedMark(p, 12) + '</span>' +
      '<span class="pp-tile__meta">Level ' + (who.level || 1) +
        (who.owner ? ' · owner' : '') + (mine ? ' · you' : '') +
        (adminClass && who.admin ? ' · <i class="pp-tile__admin">' + I.shield + 'admin</i>' : '') +
      '</span>' +
    '</button>';
  }

  function wirePeople(host, r) {
    var all = (r.teachers || []).concat(r.students || []);
    W.$$('[data-pp]', host).forEach(function (b) {
      b.addEventListener('click', function () { openProfile(all[+b.dataset.pp]); });
    });
    var adm = W.$('[data-pp-admin]', host);
    if (adm) adm.addEventListener('click', function () {
      if (global.Administrator && global.Admin && global.Admin.unlock) {
        /* Still the whole gate: the admin list, then the code or a
           Private Password. Being in this class is not a pass. */
        global.Admin.unlock('ultra', function () { global.Administrator.open(); });
      }
    });
  }

  function openProfile(who) {
    if (!who || !global.UI || !global.UI.profileCard) return;
    global.UI.modal({
      title: (who.profile && who.profile.displayName) || who.name || 'Profile',
      icon: I.user,
      body: '<div class="pp-full">' + global.UI.profileCard(null, who) + '</div>',
      actions: [{ label: 'Close', cls: 'btn--ghost', close: true }],
      onMount: function (root) { if (global.UI.runEffect) global.UI.runEffect(root); }
    });
  }

  /* ============================ admin join ========================== */
  function mountAdminJoin(host) {
    if (!host || !ready()) return;
    var email = C().user && C().user.email;
    var P = global.AdminPin;
    if (!email || !P || !P.mayOpen) return;
    P.mayOpen(email).then(function (ok) {
      if (ok !== true || !document.body.contains(host)) return;
      host.innerHTML =
        '<div class="adm-join">' +
          '<div class="adm-join__t">' + I.shield + '<b>Admin classroom</b></div>' +
          '<p>You are on the admin list. Admin classrooms have no class code; they are joined with the ' +
            'UltraAdmin code.</p>' +
          '<button class="btn btn--ghost btn--block" data-adm-join>Join an admin classroom</button>' +
        '</div>';
      W.$('[data-adm-join]', host).addEventListener('click', openAdminJoin);
    });
  }

  function openAdminJoin() {
    global.UI.modal({
      title: 'Join an admin classroom', icon: I.shield,
      body: '<p class="t-sm t-muted" style="margin:-4px 0 14px">Type the UltraAdmin code. Your Private ' +
              'Password does not work here; the code is the classroom&rsquo;s key.</p>' +
            '<input class="input code-field" id="aj-code" type="password" autocomplete="off" ' +
              'autocapitalize="off" spellcheck="false" maxlength="64" placeholder="UltraAdmin code">' +
            '<div class="pad-err" id="aj-err"></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Join', cls: 'btn--accent', onClick: function (root, close) { go(root, close); return false; } }
      ],
      onMount: function (root, close) {
        var box = W.$('#aj-code', root);
        setTimeout(function () { box.focus(); }, 60);
        box.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(root, close); } });
      }
    });

    function go(root, close) {
      var box = W.$('#aj-code', root), err = W.$('#aj-err', root);
      var code = box.value;
      if (!code) { err.textContent = 'Type the code first.'; return; }
      err.textContent = 'Checking…';
      var name = (W.state.profile && W.state.profile.displayName) || 'Explorer';
      rpc('join_admin_class', { p_code: code, p_name: name }).then(function (r) {
        if (!document.body.contains(root)) return;
        box.value = '';
        if (!r.ok) {
          var m = String(r.message || '');
          err.textContent = r.kind === 'nomigration' ? 'Admin classrooms need 0010 on the database.'
            : /no admin classroom/i.test(m) ? 'There is no admin classroom yet. Mark one in UltraAdmin first.'
            : /no class has that code/i.test(m) ? 'That code does not open an admin classroom.'
            : m || 'That did not work.';
          W.Sound.wrong();
          return;
        }
        var klass = r.data;
        if (!klass || !klass.id) { err.textContent = 'There is no admin classroom yet.'; return; }
        /* Marked admin BEFORE it is drawn, so its code never flashes up. */
        setAdminIds(adminIds().concat([klass.id]));
        close();
        if (global.Classroom && global.Classroom.joinedElsewhere) {
          global.Classroom.joinedElsewhere(klass, name, 'Welcome to the admin classroom');
        }
        refreshAdminIds(true);
      });
    }
  }

  /* ========================= the teachers card ====================== */
  function mountTeachers(host, cls) {
    if (!host) return;
    var cid = cls && cls.cloudId;
    var head = '<div class="cr-card__head"><h3>Teachers</h3></div>';
    if (!cid || !ready()) {
      host.innerHTML = head + '<p class="t-sm t-muted">Sign in so this class is online, and then you can ' +
        'add other teachers to it.</p>';
      return;
    }
    host.innerHTML = head +
      '<div class="tch-list" data-tch-list><div class="t-sm t-muted">Loading…</div></div>' +
      '<div class="row" style="gap:8px;margin-top:10px">' +
        '<input class="input" data-tch-email type="email" placeholder="Another teacher&rsquo;s email" ' +
          'autocapitalize="off" spellcheck="false" style="flex:1;min-width:0">' +
        '<button class="btn btn--accent btn--sm" data-tch-add>Add</button>' +
      '</div>' +
      '<div class="field__hint" style="margin-top:8px">They need a LearnGeo account. The class shows up ' +
        'for them the next time they use LearnGeo as a teacher, and they can do everything you can.</div>' +
      '<div class="t-sm" data-tch-msg style="margin-top:6px"></div>';

    var list = W.$('[data-tch-list]', host), msg = W.$('[data-tch-msg]', host);
    function tell(t, bad) { msg.textContent = t; msg.style.color = bad ? 'var(--danger)' : 'var(--muted)'; }

    function load() {
      rpc('class_teachers_list', { p_class: cid }).then(function (r) {
        if (!document.body.contains(list)) return;
        if (!r.ok) {
          list.innerHTML = '<div class="t-sm t-muted">' + esc(r.kind === 'nomigration'
            ? 'More than one teacher needs 0010 on the database.' : (r.message || 'Could not load.')) + '</div>';
          return;
        }
        var rows = r.data || [];
        var iOwn = rows.some(function (t) { return t.owner && t.id === me(); });
        list.innerHTML = rows.map(function (t) {
          var self = t.id === me();
          var can = !t.owner && (iOwn || self);
          return '<div class="tch-row">' +
            '<div class="grow"><b>' + esc(t.name || t.email) + '</b>' + (self ? ' <span class="t-muted">(you)</span>' : '') +
              '<div class="t-sm t-muted">' + esc(t.email || '') + (t.owner ? ' · owner' : '') + '</div></div>' +
            (can ? '<button class="btn btn--ghost btn--sm" data-tch-drop="' + esc(t.id) + '">' +
                     (self ? 'Leave' : 'Remove') + '</button>' : '') +
          '</div>';
        }).join('');
        W.$$('[data-tch-drop]', list).forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-tch-drop');
            rpc('class_remove_teacher', { p_class: cid, p_teacher: id }).then(function (x) {
              if (!x.ok) return tell(x.message || 'That did not work.', true);
              if (id === me()) {
                tell('You left this class.');
                syncTeaching(true);
              } else {
                tell('Removed.');
                load();
              }
            });
          });
        });
      });
    }

    W.$('[data-tch-add]', host).addEventListener('click', function () {
      var box = W.$('[data-tch-email]', host);
      var email = String(box.value || '').trim();
      if (!email) return;
      rpc('class_add_teacher', { p_class: cid, p_email: email }).then(function (r) {
        if (!r.ok) return tell(r.kind === 'nomigration' ? 'Needs 0010 on the database.' : (r.message || 'That did not work.'), true);
        box.value = '';
        tell(email + ' can now teach this class.');
        load();
      });
    });
    load();
  }

  /* ===================== UltraAdmin: admin classrooms =============== */
  function mountAdminClasses(host) {
    if (!host) return;
    var O = global.AdminOps;
    host.innerHTML =
      '<div class="row" style="gap:8px;margin-bottom:10px">' +
        '<input class="input" data-ac-q placeholder="class name, code or teacher email" ' +
          'style="flex:1;min-width:0" autocapitalize="off" spellcheck="false">' +
        '<button class="btn btn--sm" data-ac-go>Search</button>' +
      '</div>' +
      '<div data-ac-list><div class="t-sm t-muted">Loading…</div></div>' +
      '<div class="t-sm" data-ac-msg style="margin-top:8px"></div>';
    var listEl = W.$('[data-ac-list]', host), msg = W.$('[data-ac-msg]', host), q = W.$('[data-ac-q]', host);
    function tell(t, bad) { msg.textContent = t; msg.style.color = bad ? 'var(--danger)' : 'var(--muted)'; }

    function load() {
      if (!O || !O.classes) { listEl.innerHTML = '<div class="t-sm t-muted">admin-ops.js did not load.</div>'; return; }
      O.classes(q.value).then(function (r) {
        if (!document.body.contains(listEl)) return;
        if (!r.ok) {
          listEl.innerHTML = '<div class="t-sm t-muted">' + esc(r.kind === 'nomigration'
            ? 'Admin classrooms need 0010 on the database.' : (r.message || 'Could not load the classes.')) + '</div>';
          return;
        }
        var rows = r.data || [];
        listEl.innerHTML = rows.length ? rows.map(function (c) {
          return '<div class="ac-row' + (c.is_admin ? ' is-admin' : '') + '">' +
            '<div class="grow"><b>' + esc(c.name || 'Unnamed class') + '</b>' +
              '<div class="t-sm t-muted">' + esc(c.teacher_email || 'no teacher') + ' · ' + (c.members || 0) +
                ' student' + (c.members === 1 ? '' : 's') + '</div></div>' +
            '<button class="btn btn--sm' + (c.is_admin ? ' btn--primary' : '') + '" data-ac-set="' + esc(c.id) +
              '" data-on="' + (c.is_admin ? '0' : '1') + '">' + (c.is_admin ? 'Admin classroom' : 'Make admin') + '</button>' +
          '</div>';
        }).join('') : '<div class="t-sm t-muted">No classes matched.</div>';
        W.$$('[data-ac-set]', listEl).forEach(function (b) {
          b.addEventListener('click', function () {
            var on = b.dataset.on === '1';
            b.disabled = true;
            O.setAdminClass(b.getAttribute('data-ac-set'), on).then(function (x) {
              b.disabled = false;
              if (!x.ok) return tell(x.message || 'That did not work.', true);
              tell(on ? 'That class is now an admin classroom. Its own code no longer lets anybody in.'
                      : 'That class is an ordinary class again; its code works as before.');
              load();
              refreshAdminIds(true);
            });
          });
        });
      });
    }
    W.$('[data-ac-go]', host).addEventListener('click', load);
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(); });
    load();
  }

  /* ========================== assign to class ======================= */
  var MODES = { learn: 1, test: 1, quiz: 1, cards: 1 };

  function assignFromBrowse() {
    var T = global.Teacher, CL = global.Classes;
    if (!T || !T.openBuilder) return;
    var view = (document.body.className.match(/\bview-(\w+)\b/) || [])[1];
    var seed = { mode: MODES[view] ? view : 'test' };
    var list = CL && CL.all ? CL.all() : [];
    if (list.length < 2) return T.openBuilder(null, seed);

    var here = CL.activeId && CL.activeId();
    global.UI.modal({
      title: 'Assign to which class?', icon: I.clip,
      body: '<div class="as-list">' + list.map(function (c) {
        return '<button class="as-row' + (c.lid === here ? ' is-on' : '') + '" data-as="' + esc(c.lid) + '">' +
          '<b>' + esc(c.name || 'Unnamed class') + '</b>' +
          '<span>' + ((c.assignments || []).length) + ' set' + (c.shared ? ' · shared' : '') + '</span></button>';
      }).join('') + '</div>',
      actions: [{ label: 'Cancel', cls: 'btn--ghost', close: true }],
      onMount: function (root, close) {
        W.$$('[data-as]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            close();
            CL.switchTo(b.getAttribute('data-as'));
            T.openBuilder(null, seed);
          });
        });
      }
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('#preview-assign')) assignFromBrowse();
  });

  /* ============================== timing ============================ */
  function tick(force) {
    refreshAdminIds(force);
    syncTeaching(force);
  }
  if (C() && C().onChange) {
    C().onChange(function (status) { if (status === 'synced') tick(false); });
  }
  global.addEventListener('focus', function () { tick(false); });

  global.ClassExtras = {
    isAdmin: isAdmin,
    inAdminClass: inAdminClass,
    mountPeople: mountPeople,
    mountAdminJoin: mountAdminJoin,
    mountTeachers: mountTeachers,
    mountAdminClasses: mountAdminClasses,
    profileFor: profileFor,
    openProfile: openProfile,
    assign: assignFromBrowse,
    refresh: function () { tick(true); }
  };
})(window);
