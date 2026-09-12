/* ------------------------------------------------------------------
   LearnGeo — accounts and sync (Supabase)

   Signing in is optional. A guest keeps everything in this browser, as
   before. An account mirrors the whole save to Supabase so progress
   follows you between devices, and makes the classroom live: students
   join with just the class code, and their scores land in the teacher's
   gradebook on their own instead of being pasted back as codes.

   The publishable key is meant to ship in the page. What anyone can read
   or write is decided by row-level security in the database.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  var SUPABASE_URL = 'https://envecwhnnktltfoypekk.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_QJp1Im_8x6vHe_p6CCIbSA_xahlwe7O';

  var sb = null;
  var user = null;
  var reconciled = false;   /* nothing uploads until device and account have been compared */
  var applying = false;     /* true while the save is being replaced from the account */
  var pushTimer = null, pushing = null, pushAgain = false;
  var status = 'off';       /* off | syncing | synced | offline */
  var listeners = [];

  function client() {
    if (sb) return sb;
    if (!global.supabase || !global.supabase.createClient) return null;
    sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        /* passkey sign-in (assets/js/passkey.js); opt-in while it is experimental */
        experimental: { passkey: true }
      }
    });
    return sb;
  }

  function ready() { return !!(user && reconciled && client()); }

  function setStatus(s) {
    status = s;
    listeners.forEach(function (f) { try { f(s); } catch (e) {} });
  }
  function onChange(fn) { listeners.push(fn); }

  function refreshUi() {
    if (global.UI && global.UI.afterAccountChange) global.UI.afterAccountChange();
  }

  function check(res) {
    if (res && res.error) throw res.error;
    return res ? res.data : null;
  }

  /* Turn server errors into something a student can act on. */
  function friendly(err) {
    var m = (err && (err.message || err.error_description)) || String(err || '');
    if (/Invalid login credentials/i.test(m)) return "That email and password don't match any account.";
    if (/Email not confirmed/i.test(m)) return "You need to confirm your email first. Check your inbox for the link.";
    if (/already registered|already been registered/i.test(m)) return "There's already an account with that email. Try signing in.";
    if (/Password should be/i.test(m)) return m;
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Give it a minute and try again.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach the server. Check your internet connection.";
    return m || 'Something went wrong. Please try again.';
  }

  function redirectUrl() {
    var o = global.location;
    return /^https?:$/.test(o.protocol) ? o.origin + o.pathname : undefined;
  }

  /* ============================ save sync ============================ */
  function payload() {
    var s = W.state;
    var name = String(s.profile.displayName || '').trim().slice(0, 40) || 'Explorer';
    return { id: user.id, display_name: name, role: s.role === 'teacher' ? 'teacher' : 'student', save: s };
  }

  W.onSave(function () {
    if (!ready() || applying) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  });

  function push() {
    clearTimeout(pushTimer); pushTimer = null;
    if (!ready()) return Promise.resolve();
    if (pushing) { pushAgain = true; return pushing; }
    setStatus('syncing');
    pushing = sb.from('profiles').upsert(payload()).select('updated_at').single()
      .then(function (res) {
        var row = check(res);
        W.state.meta.syncedAt = row.updated_at;
        W.saveLocal();
        setStatus('synced');
      })
      .catch(function () { setStatus('offline'); })
      .then(function () {
        pushing = null;
        if (pushAgain) { pushAgain = false; return push(); }
      });
    return pushing;
  }

  /* ============================= accounts ============================
     Whose save wins when someone signs in:
       - the account has nothing yet  -> this device's copy moves up
         (a brand-new account keeps what was just played as a guest)
       - the account changed since this device last synced -> account
       - otherwise -> this device, which has changes not uploaded yet */
  function adopt(u) {
    var switching = !user || user.id !== u.id;
    user = u;
    if (!switching && reconciled) return Promise.resolve();
    reconciled = false;

    var guestCopy = null;
    if (W.accountId() !== u.id) {
      if (!W.accountId()) guestCopy = JSON.parse(JSON.stringify(W.state));
      W.useAccount(u.id);
    }
    var cached = W.readSaved(W.userKey(u.id));
    setStatus('syncing');

    return sb.from('profiles').select('display_name, role, save, updated_at').eq('id', u.id).maybeSingle()
      .then(function (res) {
        var row = check(res);
        var cloud = row && row.save && Object.keys(row.save).length ? row.save : null;
        var chosen;
        if (cloud && cached) {
          var seen = cached.meta && cached.meta.syncedAt;
          chosen = (!seen || Date.parse(row.updated_at) > Date.parse(seen)) ? cloud : cached;
        } else {
          chosen = cloud || cached || guestCopy || W.defaultState();
        }

        applying = true;
        W.replaceState(chosen);
        if (!cloud && row) {
          /* first sign-in: the name and role given at sign-up are deliberate
             choices, so they win over whatever the guest profile said */
          if (row.display_name && row.display_name !== 'Explorer') W.state.profile.displayName = row.display_name;
          W.state.role = row.role;
          W.state.roleChosen = true;
        }
        if (chosen === cloud) W.state.meta.syncedAt = row.updated_at;
        applying = false;

        W.saveLocal();
        reconciled = true;
        setStatus('synced');
        if (chosen !== cloud) push();
        refreshUi();
      })
      .catch(function () {
        applying = false;
        /* keep working from this device's copy; try again when back online */
        applying = true; W.replaceState(cached || guestCopy); applying = false;
        setStatus('offline');
        refreshUi();
      });
  }

  function toGuest(forget) {
    var uid = user ? user.id : W.accountId();
    user = null; reconciled = false;
    clearTimeout(pushTimer); pushTimer = null;
    W.useAccount(null);
    /* on a shared computer the next person should not find your copy lying around */
    if (forget && uid) { try { localStorage.removeItem(W.userKey(uid)); } catch (e) {} }
    applying = true; W.replaceState(W.readSaved(W.GUEST_KEY)); applying = false;
    setStatus('off');
    refreshUi();
  }

  function init() {
    if (!client()) return;
    sb.auth.onAuthStateChange(function (event, session) {
      /* deferred: calling back into supabase inside this callback can deadlock */
      setTimeout(function () {
        if (session && session.user) adopt(session.user);
        else if (event === 'SIGNED_OUT' || W.accountId()) { if (user || W.accountId()) toGuest(false); }
        if (event === 'PASSWORD_RECOVERY' && global.UI && global.UI.openNewPassword) global.UI.openNewPassword();
      }, 0);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && pushTimer) push();
      if (document.visibilityState === 'visible' && user && !reconciled) adopt(user);
    });
    global.addEventListener('online', function () { if (user && !reconciled) adopt(user); });
  }

  function signUp(email, password, name, role) {
    if (!client()) return Promise.reject(new Error("Accounts aren't working right now. You can keep playing as a guest."));
    return sb.auth.signUp({
      email: email, password: password,
      options: { data: { display_name: name, role: role }, emailRedirectTo: redirectUrl() }
    }).then(function (res) {
      if (res.error) throw res.error;
      var u = res.data.user;
      /* an existing address comes back as a user with no identities */
      if (u && u.identities && !u.identities.length) throw new Error('already registered');
      return { needsConfirm: !res.data.session };
    });
  }

  function signIn(email, password) {
    if (!client()) return Promise.reject(new Error("Accounts aren't working right now. You can keep playing as a guest."));
    return sb.auth.signInWithPassword({ email: email, password: password }).then(check);
  }

  function signOut() {
    var flush = ready() ? push() : Promise.resolve();
    var synced = true;
    return flush
      .then(function () { synced = status !== 'offline'; return client() ? sb.auth.signOut() : null; })
      .catch(function () {})
      .then(function () { toGuest(synced); });
  }

  function resetPassword(email) {
    if (!client()) return Promise.reject(new Error("Accounts aren't working right now. Try again later."));
    return sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }).then(check);
  }

  function updatePassword(password) {
    return sb.auth.updateUser({ password: password }).then(check);
  }

  /* ============================ classroom ============================ */
  var MODES = ['learn', 'test', 'quiz', 'cards'];

  function clampInt(v, lo, hi) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return null;
    return Math.max(lo, Math.min(hi, n));
  }

  function assignmentRow(a, classId) {
    return {
      id: String(a.id).slice(0, 40), class_id: classId,
      title: String(a.title || 'Untitled assignment').slice(0, 80) || 'Untitled assignment',
      mode: MODES.indexOf(a.mode) !== -1 ? a.mode : 'test',
      config: a.config || {}
    };
  }

  function resultRow(r, classId) {
    var row = {
      class_id: classId,
      assignment_id: String(r.assignmentId || 'unknown').slice(0, 40),
      student_name: String(r.name || 'Student').slice(0, 40) || 'Student',
      title: String(r.title || '').slice(0, 80),
      pct: clampInt(r.pct, 0, 100) || 0,
      correct: clampInt(r.correct, 0, 100000),
      total: clampInt(r.total, 0, 100000),
      missed: (r.missed || []).filter(function (n) { return typeof n === 'string'; }).slice(0, 60),
      manual: !!r.manual
    };
    if (r.at && isFinite(r.at)) row.created_at = new Date(r.at).toISOString();
    return row;
  }

  /* The id is left to the server: announcements are the one classroom row
     the client does not name, so a post written offline comes back with a
     real uuid the moment it lands. */
  function announcementRow(p, classId) {
    return {
      class_id: classId,
      body: String(p.body || '').slice(0, 2000),
      pinned: !!p.pinned
    };
  }

  function rowToPost(row) {
    return { id: row.id, body: row.body, pinned: !!row.pinned, at: Date.parse(row.created_at) };
  }

  function rowToResult(row) {
    return {
      id: row.id, assignmentId: row.assignment_id, title: row.title, name: row.student_name,
      pct: row.pct, correct: row.correct, total: row.total,
      at: Date.parse(row.created_at), missed: row.missed || [], manual: row.manual
    };
  }

  function cls() { return W.state.classroom; }
  function teacherReady() { return ready() && W.state.role === 'teacher' && !!cls().cloudId; }

  /* Six characters with no I, O, zero or one, so nothing in a code can be
     misread off a whiteboard. This only ever proposes: the code is not
     real until the insert below succeeds, and the unique constraint on
     the table is what settles a clash. Nothing anywhere else in the app
     invents a code, because a code the server has not issued is one that
     cannot be joined. */
  function proposeCode() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 6; i++) out += abc[(Math.random() * abc.length) | 0];
    return out;
  }

  function createClass(code, name, tries) {
    return sb.from('classes').insert({ code: code, name: String(name).slice(0, 60), teacher_id: user.id })
      .select('id, code, name').single()
      .then(function (res) {
        if (!res.error) return { row: res.data, created: true, wanted: code };
        if (res.error.code === '23505' && tries < 5) {
          return createClass(proposeCode(), name, tries + 1);
        }
        throw res.error;
      });
  }

  function teacherClass() {
    var c = cls();
    return sb.from('classes').select('id, code, name').eq('teacher_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
      .then(function (res) {
        var rows = check(res);
        if (rows.length) return { row: rows[0], created: false };
        return createClass(c.code || proposeCode(), c.name || 'Your class', 0);
      });
  }

  /* A teacher's first sign-in carries the class they built as a guest up
     with them, results included. */
  function uploadLocal(classId) {
    var c = cls();
    var as = (c.assignments || []).map(function (a) { return assignmentRow(a, classId); });
    var rs = (c.results || []).map(function (r) { return resultRow(r, classId); });
    var ps = (c.posts || []).filter(function (x) { return String(x.body || '').trim(); })
      .map(function (x) { return announcementRow(x, classId); });
    return (as.length ? sb.from('assignments').upsert(as) : Promise.resolve(null))
      .then(check)
      .then(function () { return rs.length ? sb.from('results').insert(rs) : null; })
      .then(check)
      .then(function () { return ps.length ? sb.from('announcements').insert(ps) : null; })
      .then(check);
  }

  var teacherBusy = null;
  function teacherSync() {
    if (!ready() || W.state.role !== 'teacher') return Promise.resolve(false);
    if (teacherBusy) return teacherBusy;
    var c = cls();
    setStatus('syncing');
    teacherBusy = teacherClass()
      .then(function (got) {
        c.cloudId = got.row.id;
        /* A teacher who built a class offline may already have written a
           code on the board. We try to claim exactly that one, but if
           another class got there first the server hands back a different
           one — and saying nothing would leave a room full of students
           typing a code that is now somebody else's. */
        if (got.created && got.wanted && got.wanted !== got.row.code) {
          W.toast('Your class code changed',
                  got.wanted + ' was taken, so your class is ' + got.row.code +
                  '. Give students the new one.', W.Icons.info, 7000);
        }
        c.code = got.row.code;
        if (got.created) return uploadLocal(got.row.id).then(function () { return got.row; });
        c.name = got.row.name;
        return got.row;
      })
      .then(function (row) {
        return Promise.all([
          sb.from('assignments').select('id, title, mode, config, created_at').eq('class_id', row.id).order('created_at'),
          sb.from('results').select('id, assignment_id, student_id, student_name, title, pct, correct, total, missed, manual, created_at')
            .eq('class_id', row.id).order('created_at'),
          sb.from('class_members').select('student_id, display_name, joined_at').eq('class_id', row.id).order('joined_at'),
          sb.from('announcements').select('id, body, pinned, created_at').eq('class_id', row.id)
            .order('pinned', { ascending: false }).order('created_at', { ascending: false })
        ]);
      })
      .then(function (all) {
        var as = check(all[0]), rs = check(all[1]), ms = check(all[2]), ps = check(all[3]);
        c.assignments = as.map(function (a) {
          return { id: a.id, title: a.title, mode: a.mode, config: a.config || {},
                   from: c.name || 'Your teacher', classCode: c.code };
        });
        c.results = rs.map(rowToResult);
        c.members = ms.map(function (m) { return { id: m.student_id, name: m.display_name }; });
        c.posts = ps.map(rowToPost);
        c.members.forEach(function (m) { if (c.roster.indexOf(m.name) === -1) c.roster.push(m.name); });
        W.save();
        setStatus('synced');
        return true;
      })
      .then(function (v) { teacherBusy = null; return v; },
            function (e) { teacherBusy = null; setStatus('offline'); throw e; });
    return teacherBusy;
  }

  function saveAssignment(a) {
    if (!teacherReady()) return Promise.resolve();
    return sb.from('assignments').upsert(assignmentRow(a, cls().cloudId)).then(check);
  }
  function deleteAssignment(id) {
    if (!teacherReady()) return Promise.resolve();
    return sb.from('assignments').delete().eq('class_id', cls().cloudId).eq('id', id).then(check);
  }
  /* Returns the saved row, so the caller can swap the id it invented
     locally for the one the table actually issued. */
  function postAnnouncement(p) {
    if (!teacherReady()) return Promise.resolve(null);
    return sb.from('announcements').insert(announcementRow(p, cls().cloudId))
      .select('id, body, pinned, created_at').single().then(check).then(rowToPost);
  }
  function deleteAnnouncement(id) {
    if (!teacherReady()) return Promise.resolve();
    return sb.from('announcements').delete().eq('class_id', cls().cloudId).eq('id', id).then(check);
  }
  function pinAnnouncement(id, pinned) {
    if (!teacherReady()) return Promise.resolve();
    return sb.from('announcements').update({ pinned: !!pinned })
      .eq('class_id', cls().cloudId).eq('id', id).then(check);
  }

  function renameClass(name) {
    if (!teacherReady()) return Promise.resolve();
    return sb.from('classes').update({ name: String(name || 'Your class').slice(0, 60) || 'Your class' })
      .eq('id', cls().cloudId).then(check);
  }
  function recordResults(list) {
    if (!teacherReady() || !list.length) return Promise.resolve();
    var id = cls().cloudId;
    return sb.from('results').insert(list.map(function (r) { return resultRow(r, id); })).then(check);
  }
  function clearResult(name, assignmentId) {
    if (!teacherReady()) return Promise.resolve();
    return sb.from('results').delete().eq('class_id', cls().cloudId)
      .eq('student_name', name).eq('assignment_id', assignmentId).then(check);
  }
  function setManualScore(r) {
    if (!teacherReady()) return Promise.resolve();
    return clearResult(r.name, r.assignmentId).then(function () { return recordResults([r]); });
  }
  function removePerson(name) {
    if (!teacherReady()) return Promise.resolve();
    var id = cls().cloudId;
    return Promise.all([
      sb.from('class_members').delete().eq('class_id', id).eq('display_name', name),
      sb.from('results').delete().eq('class_id', id).eq('student_name', name)
    ]).then(function (all) { all.forEach(check); });
  }

  /* ----------------------------- students ---------------------------- */
  function joinClass(code, name) {
    if (!ready()) return Promise.reject(new Error('You need to sign in first.'));
    return sb.rpc('join_class', { p_code: code, p_name: name }).then(check);
  }

  function leaveClass() {
    var e = W.state.enrolled;
    if (!ready() || !e || !e.classId) return Promise.resolve();
    return sb.from('class_members').delete().eq('class_id', e.classId).eq('student_id', user.id).then(check);
  }

  function mergeInbox(rows, e) {
    var box = W.state.inbox || [];
    var byId = {}, live = {};
    box.forEach(function (a) { byId[a.id] = a; });
    rows.forEach(function (r) {
      live[r.id] = 1;
      var fresh = global.Assignments.sanitize({ id: r.id, title: r.title, mode: r.mode, config: r.config });
      if (!fresh) return;
      var cur = byId[r.id];
      if (cur) {
        cur.title = fresh.title; cur.mode = fresh.mode; cur.config = fresh.config;
        cur.from = e.className; cur.classCode = e.code;
      } else {
        fresh.from = e.className; fresh.classCode = e.code; fresh.added = Date.now();
        box.push(fresh);
      }
    });
    /* work the teacher withdrew disappears unless it was already handed in */
    W.state.inbox = box.filter(function (a) { return live[a.id] || a.done || a.classCode !== e.code; });
  }

  var studentBusy = null;
  function studentSync() {
    var e = W.state.enrolled;
    if (!ready() || !e) return Promise.resolve(false);
    if (studentBusy) return studentBusy;

    /* joined with codes as a guest: try to move into the teacher's online class */
    var upgrade = e.classId ? Promise.resolve() :
      joinClass(e.code, e.name || W.state.profile.displayName)
        .then(function (c) { e.classId = c.id; e.className = c.name; })
        .catch(function () {});

    studentBusy = upgrade.then(function () {
      if (!e.classId) return false;
      return Promise.all([
        sb.from('classes').select('id, code, name').eq('id', e.classId).maybeSingle(),
        sb.from('assignments').select('id, title, mode, config, created_at').eq('class_id', e.classId).order('created_at'),
        sb.from('announcements').select('id, body, pinned, created_at').eq('class_id', e.classId)
          .order('pinned', { ascending: false }).order('created_at', { ascending: false })
      ]).then(function (all) {
        var klass = check(all[0]), rows = check(all[1]), posts = check(all[2]);
        if (!klass) {
          W.state.enrolled = null;
          W.state.stream = [];
          W.save();
          W.toast("You're not in " + (e.className || 'that class') + ' anymore',
                  'Ask your teacher for the class code if you want to rejoin', W.Icons.info, 4200);
          return true;
        }
        e.className = klass.name;
        mergeInbox(rows, e);
        W.state.stream = posts.map(rowToPost);
        W.save();
        return true;
      });
    }).then(function (v) { studentBusy = null; return v; },
            function (err) { studentBusy = null; throw err; });
    return studentBusy;
  }

  /* True when this assignment's score can go straight to the teacher. */
  function canSubmit(a) {
    var e = W.state.enrolled;
    return !!(ready() && e && e.classId && a && a.id && a.classCode === e.code);
  }

  function submitResult(a, pct, correct, total, missed) {
    if (!canSubmit(a)) return Promise.reject(new Error('not online'));
    return sb.rpc('submit_result', {
      p_assignment_id: a.id, p_pct: pct, p_correct: correct, p_total: total, p_missed: missed || []
    }).then(check);
  }

  global.Cloud = {
    init: init,
    signUp: signUp, signIn: signIn, signOut: signOut,
    resetPassword: resetPassword, updatePassword: updatePassword,
    push: push, onChange: onChange, friendly: friendly,
    teacherSync: teacherSync, saveAssignment: saveAssignment, deleteAssignment: deleteAssignment,
    renameClass: renameClass, recordResults: recordResults, clearResult: clearResult,
    postAnnouncement: postAnnouncement, deleteAnnouncement: deleteAnnouncement,
    pinAnnouncement: pinAnnouncement,
    setManualScore: setManualScore, removePerson: removePerson,
    joinClass: joinClass, leaveClass: leaveClass, studentSync: studentSync,
    canSubmit: canSubmit, submitResult: submitResult,
    get available() { return !!client(); },
    get sb() { return client(); },
    get user() { return user; },
    get signedIn() { return !!user; },
    get ready() { return ready(); },
    get status() { return status; }
  };
})(window);
