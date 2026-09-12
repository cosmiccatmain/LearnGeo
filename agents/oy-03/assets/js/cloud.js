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
  var gen = 0;              /* bumped whenever the account changes, so a request that
                               started under the old one cannot write into the new save */
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

  /* Resolves true when this call actually got the save onto the server. */
  function push() {
    clearTimeout(pushTimer); pushTimer = null;
    if (!ready()) return Promise.resolve(false);
    if (pushing) { pushAgain = true; return pushing; }
    var mine = gen, ok = false;
    setStatus('syncing');
    pushing = sb.from('profiles').upsert(payload()).select('updated_at').single()
      .then(function (res) {
        var row = check(res);
        /* someone signed out or swapped accounts while this was in the air:
           the save on screen is not the one this answer belongs to */
        if (mine !== gen) return;
        W.state.meta.syncedAt = row.updated_at;
        W.saveLocal();
        ok = true;
        setStatus('synced');
      })
      .catch(function () { if (mine === gen) setStatus('offline'); })
      .then(function () {
        pushing = null;
        var again = pushAgain;
        pushAgain = false;
        if (again && mine === gen) return push();
        return ok;
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
    if (switching) gen++;
    reconciled = false;

    var mine = gen;
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
        if (mine !== gen) return;
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
          /* first sign-in: the name given at sign-up is a deliberate choice,
             so it wins over whatever the guest profile said. The role only
             comes down when this device has not picked one, because the
             account starts out as a student for everybody and taking that
             would quietly demote a teacher. What is on the device goes up
             on the next push instead. */
          if (row.display_name && row.display_name !== 'Explorer') W.state.profile.displayName = row.display_name;
          if (!W.state.roleChosen) {
            W.state.role = row.role;
            W.state.roleChosen = true;
          }
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
        if (mine !== gen) return;
        /* keep working from this device's copy; try again when back online */
        applying = true; W.replaceState(cached || guestCopy); applying = false;
        setStatus('offline');
        refreshUi();
      });
  }

  function toGuest(forget) {
    var uid = user ? user.id : W.accountId();
    user = null; reconciled = false; gen++;
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

  /* The copy on this device is only forgotten when the save definitely went
     up just now. Part way through signing in there is nothing to flush yet,
     and a copy that was never uploaded is the only one there is. */
  function signOut() {
    var flush = ready() ? push() : Promise.resolve(false);
    var synced = false;
    return flush
      .then(function (ok) { synced = ok === true; return client() ? sb.auth.signOut() : null; })
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

  /* A name is a label, not a person: two students called Sam are two
     students. The account id is what the row is really filed under, and
     scores that came from a code or were typed in by hand have none, so
     those still fall back to the name. */
  var RESULT_COLS = 'id, assignment_id, student_id, student_name, title, pct, correct, ' +
                    'total, missed, manual, created_at';

  function resultRow(r, classId) {
    var row = {
      class_id: classId,
      assignment_id: String(r.assignmentId || 'unknown').slice(0, 40),
      student_id: r.studentId || null,
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

  function rowToResult(row) {
    return {
      id: row.id, assignmentId: row.assignment_id, title: row.title,
      studentId: row.student_id || null, name: row.student_name,
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

  /* results has no natural key, so the same score sent twice becomes two
     rows in the gradebook. One score per student, assignment and moment is
     all that can be meant. */
  function resultKey(r) {
    return (r.studentId || r.name) + '|' + r.assignmentId + '|' + (r.at || 0);
  }

  function dedupe(rows) {
    var seen = {};
    return rows.filter(function (r) {
      var k = (r.student_id || r.student_name) + '|' + r.assignment_id + '|' + (r.created_at || '');
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }

  /* Send up rows this device made while it was on its own. What comes back
     carries the server's id, which is how the next pull knows not to send
     them again. */
  function sendResults(list, classId) {
    var rows = dedupe(list.map(function (r) { return resultRow(r, classId); }));
    if (!rows.length) return Promise.resolve([]);
    return sb.from('results').insert(rows).select(RESULT_COLS).then(check)
      .then(function (back) { return (back || []).map(rowToResult); });
  }

  /* A teacher's first sign-in carries the class they built as a guest up
     with them, results included. */
  function uploadLocal(classId) {
    var c = cls();
    var as = (c.assignments || []).map(function (a) { return assignmentRow(a, classId); });
    var rs = (c.results || []).slice();
    return (as.length ? sb.from('assignments').upsert(as) : Promise.resolve(null))
      .then(check)
      .then(function () { return sendResults(rs, classId); })
      .then(function (back) {
        /* keep the copies that came back, not the ones that went up: they
           have ids now, so nothing here looks unsent afterwards */
        if (back.length) c.results = back;
      });
  }

  /* The offline pile, sent again now there is a connection. Anything that
     will not go stays where it is and waits for the next sync. */
  function retryLocal(as, rs, classId) {
    var c = cls();
    var jobs = [];
    if (as.length) {
      jobs.push(sb.from('assignments')
        .upsert(as.map(function (a) { return assignmentRow(a, classId); })).then(check));
    }
    if (rs.length) {
      jobs.push(sendResults(rs, classId).then(function (back) {
        /* keep the server's copies instead of the local ones, or the next
           sync would send the same scores up all over again */
        c.results = c.results.filter(function (r) { return rs.indexOf(r) === -1; }).concat(back);
        W.save();
      }));
    }
    if (!jobs.length) return Promise.resolve();
    return Promise.all(jobs);
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
          sb.from('results').select(RESULT_COLS).eq('class_id', row.id).order('created_at'),
          sb.from('class_members').select('student_id, display_name, joined_at').eq('class_id', row.id).order('joined_at')
        ]).then(function (all) { return { id: row.id, all: all }; });
      })
      .then(function (got) {
        var all = got.all;
        var as = check(all[0]), rs = check(all[1]), ms = check(all[2]);
        /* Anything made while this device was offline has never reached the
           server, so the pull is merged in rather than laid over the top.
           Wiping it would take work the teacher was told had been saved. */
        var live = {}, filed = {};
        as.forEach(function (a) { live[a.id] = 1; });
        var fresh = rs.map(rowToResult);
        fresh.forEach(function (r) { filed[resultKey(r)] = 1; });
        var keptA = (c.assignments || []).filter(function (a) { return a && a.id && !live[a.id]; });
        var keptR = (c.results || []).filter(function (r) {
          return r && !r.id && !filed[resultKey(r)];
        });

        c.assignments = as.map(function (a) {
          return { id: a.id, title: a.title, mode: a.mode, config: a.config || {},
                   from: c.name || 'Your teacher', classCode: c.code };
        }).concat(keptA);
        c.results = fresh.concat(keptR);
        c.members = ms.map(function (m) { return { id: m.student_id, name: m.display_name }; });
        c.members.forEach(function (m) { if (c.roster.indexOf(m.name) === -1) c.roster.push(m.name); });
        W.save();
        setStatus('synced');
        return retryLocal(keptA, keptR, got.id).then(function () { return true; }, function () { return true; });
      })
      .then(function (v) { teacherBusy = null; return v; },
            function (e) { teacherBusy = null; setStatus('offline'); throw e; });
    return teacherBusy;
  }

  /* Nothing was written, so say so. Resolving here reads as a save that
     worked, and the teacher only finds out at the next sync, when the
     server's copy replaces what they made. */
  function notReady() {
    return Promise.reject(new Error(ready()
      ? 'Your class is not online yet. This is saved on this device and goes up when it is.'
      : 'You are offline. This is saved on this device and goes up when you are back.'));
  }

  function saveAssignment(a) {
    if (!teacherReady()) return notReady();
    return sb.from('assignments').upsert(assignmentRow(a, cls().cloudId)).then(check);
  }
  function deleteAssignment(id) {
    if (!teacherReady()) return notReady();
    return sb.from('assignments').delete().eq('class_id', cls().cloudId).eq('id', id).then(check);
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
  /* who is { id, name }: the account when the score came from one, and the
     name on its own for a score typed in by hand or sent with a code. */
  function whoFilter(q, who) {
    var name = (who && who.name) || who;
    if (who && who.id) return q.eq('student_id', who.id);
    return q.is('student_id', null).eq('student_name', name);
  }
  function clearResult(who, assignmentId) {
    if (!teacherReady()) return notReady();
    return whoFilter(sb.from('results').delete().eq('class_id', cls().cloudId)
      .eq('assignment_id', assignmentId), who).then(check);
  }
  function setManualScore(r) {
    if (!teacherReady()) return notReady();
    return clearResult({ id: r.studentId || null, name: r.name }, r.assignmentId)
      .then(function () { return recordResults([r]); });
  }
  function removePerson(who) {
    if (!teacherReady()) return Promise.resolve();
    var id = cls().cloudId;
    var name = (who && who.name) || who;
    var jobs = [];
    if (who && who.id) {
      jobs.push(sb.from('class_members').delete().eq('class_id', id).eq('student_id', who.id));
      jobs.push(sb.from('results').delete().eq('class_id', id).eq('student_id', who.id));
    } else if (name) {
      jobs.push(sb.from('class_members').delete().eq('class_id', id).eq('display_name', name));
    }
    /* whatever was typed in under that name before they had an account */
    if (name) {
      jobs.push(sb.from('results').delete().eq('class_id', id)
        .is('student_id', null).eq('student_name', name));
    }
    return Promise.all(jobs).then(function (all) { all.forEach(check); });
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

  /* What the last merge did, so "Check for new work" can say what actually
     happened instead of counting the list before and after: one piece of
     work arriving while another is taken back leaves the same total. */
  var lastMerge = { added: 0, removed: 0 };

  function mergeInbox(rows, e) {
    var box = W.state.inbox || [];
    var byId = {}, live = {};
    lastMerge = { added: 0, removed: 0 };
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
        lastMerge.added++;
      }
    });
    /* work the teacher withdrew disappears unless it was already handed in */
    W.state.inbox = box.filter(function (a) {
      var keep = live[a.id] || a.done || a.classCode !== e.code;
      if (!keep) lastMerge.removed++;
      return keep;
    });
  }

  var studentBusy = null;
  function studentSync() {
    var e = W.state.enrolled;
    if (!ready() || !e) return Promise.resolve(false);
    if (studentBusy) return studentBusy;
    lastMerge = { added: 0, removed: 0 };

    /* joined with codes as a guest: try to move into the teacher's online class */
    var upgrade = e.classId ? Promise.resolve() :
      joinClass(e.code, e.name || W.state.profile.displayName)
        .then(function (c) { e.classId = c.id; e.className = c.name; })
        .catch(function () {});

    studentBusy = upgrade.then(function () {
      if (!e.classId) return false;
      return Promise.all([
        sb.from('classes').select('id, code, name').eq('id', e.classId).maybeSingle(),
        sb.from('assignments').select('id, title, mode, config, created_at').eq('class_id', e.classId).order('created_at')
      ]).then(function (all) {
        var klass = check(all[0]), rows = check(all[1]);
        if (!klass) {
          W.state.enrolled = null;
          W.save();
          W.toast("You're not in " + (e.className || 'that class') + ' anymore',
                  'Ask your teacher for the class code if you want to rejoin', W.Icons.info, 4200);
          return true;
        }
        e.className = klass.name;
        mergeInbox(rows, e);
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
    setManualScore: setManualScore, removePerson: removePerson,
    joinClass: joinClass, leaveClass: leaveClass, studentSync: studentSync,
    canSubmit: canSubmit, submitResult: submitResult,
    get lastInboxChange() { return lastMerge; },
    get available() { return !!client(); },
    get sb() { return client(); },
    get user() { return user; },
    get signedIn() { return !!user; },
    get ready() { return ready(); },
    get status() { return status; }
  };
})(window);
