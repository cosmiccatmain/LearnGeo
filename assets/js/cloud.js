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

  /* The class stream lives in `announcements`, which arrives with
     supabase/deployed/0001_announcements.sql. Until that has been applied the
     table is simply not there, and a missing table must not take the whole
     class sync down with it: assignments, results and members have nothing to
     do with the stream. A missing table reads as "no posts". Every other
     error still throws, so a real failure is still a failure. */
  function missingTable(err) {
    var code = (err && err.code) || '';
    var msg = (err && err.message) || '';
    return code === '42P01' || code === 'PGRST205' ||
           /Could not find the table|relation .* does not exist/i.test(msg);
  }

  /* 0002_geolive has not been applied, and Owen is holding on it. Its two
     class columns, its two member columns and sync_level are all absent
     until he does. A missing COLUMN errors a select rather than coming back
     empty, and a missing FUNCTION errors an rpc, so both need catching the
     same way a missing table already is. The code below must work against a
     database that is deliberately behind it, in both states. */
  function missingBit(err) {
    var code = (err && err.code) || '';
    var msg = (err && err.message) || '';
    return missingTable(err) ||
           code === '42703' || code === '42883' ||
           code === 'PGRST202' || code === 'PGRST204' ||
           /column .* does not exist|function .* does not exist|Could not find the function/i.test(msg);
  }

  function checkPosts(res) {
    if (res && res.error) {
      if (missingTable(res.error)) return [];
      throw res.error;
    }
    return (res && res.data) || [];
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
        /* after the profile landed, and not awaited: the push's own result
           must not depend on a function that is not there yet. Wrapped as
           well as caught, because a synchronous throw here would fall into
           this chain's own catch and report a good save as offline. */
        try { pushLevel(); } catch (e) { /* a level is never worth a red dot */ }
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
      id: row.id, assignmentId: row.assignment_id, title: row.title,
      studentId: row.student_id || null, name: row.student_name,
      pct: row.pct, correct: row.correct, total: row.total,
      at: Date.parse(row.created_at), missed: row.missed || [], manual: row.manual
    };
  }

  /* Through Classes, not straight at the field. state.classroom is
     repointed when a save is loaded and when a teacher switches class,
     and a reference taken before that happens is a copy the screen will
     never show. Resolving every time is what keeps the sync writing
     into the class the teacher is actually looking at. */
  function cls() {
    if (global.Classes) global.Classes.ensure();
    return W.state.classroom;
  }
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

  /* The class the teacher is looking at, not merely their first one.

     This used to take whichever row came back first, which is why a
     teacher only ever had one class: a second one could be created but
     never synced, because the sync always resolved to row one. Now the
     active record says which row it is — by id once it has synced, by
     code if it was created on another device, and otherwise there is no
     row yet and we make one. */
  function teacherClass() {
    var c = cls();
    return sb.from('classes').select('id, code, name').eq('teacher_id', user.id)
      .order('created_at', { ascending: true })
      .then(function (res) {
        var rows = check(res) || [];
        teacherRows = rows.slice();

        var want = null;
        if (c.cloudId) want = pick(rows, function (r) { return r.id === c.cloudId; });
        if (!want && c.code) want = pick(rows, function (r) { return r.code === c.code; });

        /* Nothing matched by id or code, so adopt a server row that no
           other local class has already claimed.

           The rule this replaces only adopted when there was exactly one
           class on each side, and fell through to createClass otherwise.
           That turned out to be a trap: a class that lost its id — which
           the orphaned-copy bug did to every teacher who loaded the page
           between the two releases — would match nothing, fail the
           one-and-one test the moment a second class existed, and mint a
           brand new empty room on the server every single sync. The
           teacher's own class then had no id the tag could save against,
           and the name came back from whichever row the sync had landed
           on.

           Creating is now the last resort it should always have been: a
           teacher whose server already holds rows gets one of those. */
        if (!want) {
          var claimed = {};
          (W.state.classes || []).forEach(function (other) {
            if (other !== c && other.cloudId) claimed[other.cloudId] = 1;
          });
          want = pick(rows, function (r) { return !claimed[r.id]; });
        }

        if (want) return { row: want, created: false };
        return createClass(c.code || proposeCode(), c.name || 'Your class', 0);
      });
  }

  function pick(rows, test) {
    for (var i = 0; i < rows.length; i++) if (test(rows[i])) return rows[i];
    return null;
  }

  function classCount() {
    return (global.Classes && global.Classes.count()) || 1;
  }

  /* Every class row this teacher owns, from the last sync. The switcher
     uses it to notice classes made on another computer. */
  var teacherRows = [];
  function teacherClasses() { return teacherRows.slice(); }

  /* The class look. Its own call, and its own failure: the background
     column is newer than some deployments, and a class whose colour will
     not save is not a reason to fail the whole sync. */
  /* What look a class was given, for the student who joined it. Selects
     only the one column and answers null rather than throwing, so a
     deployment whose classes table predates the column simply shows the
     default instead of failing the student's whole sync. */
  function fetchClassBackground(classId) {
    if (!ready() || !classId) return Promise.resolve(null);
    return sb.from('classes').select('background').eq('id', classId).maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) return null;
        return res.data.background || null;
      })
      .catch(function () { return null; });
  }

  function setClassBackground(bg) {
    if (!teacherReady()) return Promise.resolve(false);
    return sb.from('classes').update({ background: String(bg || 'default') })
      .eq('id', cls().cloudId)
      .then(function (res) { return !res.error; })
      .catch(function () { return false; });
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
    var ps = (c.posts || []).filter(function (x) { return String(x.body || '').trim(); })
      .map(function (x) { return announcementRow(x, classId); });
    return (as.length ? sb.from('assignments').upsert(as) : Promise.resolve(null))
      .then(check)
      .then(function () { return sendResults(rs, classId); })
      .then(function (back) {
        /* keep the copies that came back, not the ones that went up: they
           have ids now, so nothing here looks unsent afterwards */
        if (back.length) c.results = back;
      })
      .then(function () {
        return ps.length ? sb.from('announcements').insert(ps).then(checkPosts) : null;
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

  /* Set while a rename is travelling, so a sync that overlaps it does
     not write the old server name back over the new local one. */
  var pendingRename = 0;

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
        /* The server's name wins, except over one the teacher has just
           typed. Renaming re-renders, re-rendering can start a sync, and
           that sync reads the old name from the server and writes it
           back — so the field appeared to refuse the edit. While a
           rename is in the air the local name is the newer one. */
        if (!pendingRename) c.name = got.row.name;
        return got.row;
      })
      .then(function (row) {
        return Promise.all([
          sb.from('assignments').select('id, title, mode, config, created_at').eq('class_id', row.id).order('created_at'),
          sb.from('results').select(RESULT_COLS).eq('class_id', row.id).order('created_at'),
          /* select('*') and not the column names: level and xp arrive with
                0002, and naming a column that is not there yet would error this
                select, which sits in the same Promise.all as assignments,
                results and announcements. That is the announcements outage
                again, and this batch is the class sync, not a feature. */
             sb.from('class_members').select('*').eq('class_id', row.id).order('joined_at'),
          sb.from('announcements').select('id, body, pinned, created_at').eq('class_id', row.id)
            .order('pinned', { ascending: false }).order('created_at', { ascending: false })
        ]).then(function (all) { return { id: row.id, all: all }; });
      })
      .then(function (got) {
        var all = got.all;
        var as = check(all[0]), rs = check(all[1]), ms = check(all[2]), ps = checkPosts(all[3]);
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
        c.members = ms.map(function (m) {
          var out = { id: m.student_id, name: m.display_name };
          /* only once 0002 is in and sync_level has actually written them. The
             columns are nullable on purpose, so unknown stays unknown rather
             than becoming a level 1 nobody earned. */
          if (typeof m.level === 'number') out.level = m.level;
          if (typeof m.xp === 'number') out.xp = m.xp;
          return out;
        });
        c.posts = ps.map(rowToPost);
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
    pendingRename += 1;
    return sb.from('classes').update({ name: String(name || 'Your class').slice(0, 60) || 'Your class' })
      .eq('id', cls().cloudId)
      .then(check)
      .then(function (v) { pendingRename -= 1; return v; },
            function (e) { pendingRename -= 1; throw e; });
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

  /* Leaves a named class, or the one this device thinks it is in.

     The argument is new and it is the half of the switching bug that lives on
     this side. Without it there is no way to leave a class you are a member of
     but no longer enrolled in locally, which is exactly the state a failed
     leave produces. It still rejects on failure: a caller that wants to retry
     or tell somebody can, and one that swallows it is making that choice
     visibly rather than being forced into it. */
  function leaveClass(classId) {
    var e = W.state.enrolled;
    var id = classId || (e && e.classId);
    /* Three outcomes, and they used to be one. Resolving when the
       connection is not ready reported success for something never sent,
       so a student leaving a class on bad school wifi was told it worked
       while their membership stayed exactly where it was. A caller cannot
       compensate for a function that lies to it.

         reject          could not try, or the delete failed
         resolve(false)  there was nothing to leave
         resolve(true)   they are out                                  */
    if (!ready()) return Promise.reject(new Error('not online'));
    if (!id) return Promise.resolve(false);
    return sb.from('class_members').delete().eq('class_id', id).eq('student_id', user.id)
      .then(check).then(function () { return true; });
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
  /* oy-05 renders the class tag from state.enrolled.tag, and reads it as a
     plain four-letter string: it uppercases what it finds and tests the shape,
     so an object would stringify, fail the test and render nothing at all.
     A string, or null when the class has chosen no tag.

     Its own query, never folded into the class select in studentSync. That
     select carries the class itself, and a column 0005 has not added yet
     errors a select rather than coming back empty, so widening it would make
     an unapplied migration take the whole class down. This is the same rule
     the announcements outage taught and the reason classTag.read exists.

     Absent means not loaded. Present and null means no tag chosen. Those are
     different answers and oy-05 needs to tell them apart. A read that cannot
     tell leaves whatever is already there rather than inventing either one:
     on a first load that means the key stays absent, and later it means a
     moment offline does not blank a tag that is really there. */
  function applyEnrolledTag(e) {
    if (!e || !e.classId) return Promise.resolve();
    return readClassTag(e.classId).then(function (got) {
      if (!got || !got.known) return;
      var next = got.tag || null;
      /* the glyph travels with the letters: oy-05 reads e.tagGlyph, and
         returning it from readClassTag while dropping it here left half of
         my own answer going nowhere */
      var glyph = (next && got.glyph) || null;
      if (e.tag !== next || e.tagGlyph !== glyph) {
        e.tag = next;
        e.tagGlyph = glyph;
        W.save();
      }
    }).catch(function () { /* never a reason the class sync fails */ });
  }

  /* ========================= the student's classes =================== */

  /* Which classes this student is actually a member of, as the database sees
     it. state.enrolled is not that and cannot be: classroom.js switches class
     by joining the new one and firing leaveClass() into an empty catch, so a
     leave that fails leaves the student a member of both while local state
     records only the newest. Verified on origin/main at classroom.js:306.

     That matters for a tag picker, which would otherwise offer fewer classes
     than the student is entitled to wear and look broken for the one case
     where being right is most visible. */
  var myClassRows = [];

  function refreshMyClasses() {
    if (!ready()) return Promise.resolve(myClassRows);
    return sb.from('class_members').select('class_id').eq('student_id', user.id)
      .then(function (res) {
        /* a refusal keeps what we had rather than claiming they are in none */
        if (!res || res.error) return myClassRows;
        var ids = (res.data || []).map(function (m) { return m.class_id; })
                    .filter(function (x) { return !!x; });
        if (!ids.length) { myClassRows = []; return myClassRows; }
        /* the whole row: naming tag would fail the read until 0005 is in */
        return sb.from('classes').select('*').in('id', ids).then(function (cres) {
          if (!cres || cres.error) return myClassRows;
          myClassRows = (cres.data || []).map(function (c) {
            var row = { classId: String(c.id), className: c.name || '' };
            var t = c[TAG_COLS.tag] ? cleanTag(c[TAG_COLS.tag]) : '';
            if (validTag(t)) row.tag = t;
            return row;
          });
          return myClassRows;
        });
      })
      .catch(function () { return myClassRows; });
  }

  /* A plain array, read from what is already loaded. Never a promise and
     never a request: the adopt control draws whenever the classroom redraws,
     and a control that costs a round trip to render is a control nobody
     leaves on screen.

     Never emptier than what this device already knows: the class in
     state.enrolled comes first, then anything the last refresh found. An
     empty array here means "offer None", which is a real answer, not a
     failure. */
  function myClasses() {
    var out = [], seen = {};
    /* The same class can arrive twice, once from local state and once from
       the database, and neither copy is reliably the richer one: local state
       may have a name before a tag has loaded, and the database row may have
       the tag before local state has caught up. So fill in rather than let
       whichever came first win. Discarding the second copy is how a student
       ends up unable to wear their own class's tag because the entry offering
       it was dropped as a duplicate. */
    function add(classId, className, tag) {
      if (!classId) return;
      var id = String(classId);
      var row = seen[id];
      if (!row) { row = seen[id] = { classId: id, className: '' }; out.push(row); }
      if (!row.className && className) row.className = className;
      var t = typeof tag === 'string' ? cleanTag(tag) : '';
      if (!row.tag && validTag(t)) row.tag = t;
    }
    var e = W.state.enrolled;
    if (e && e.classId) add(e.classId, e.className, typeof e.tag === 'string' ? e.tag : '');
    myClassRows.forEach(function (r) { add(r.classId, r.className, r.tag); });
    return out;
  }

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
        sb.from('assignments').select('id, title, mode, config, created_at').eq('class_id', e.classId).order('created_at'),
        sb.from('announcements').select('id, body, pinned, created_at').eq('class_id', e.classId)
          .order('pinned', { ascending: false }).order('created_at', { ascending: false })
      ]).then(function (all) {
        var klass = check(all[0]), rows = check(all[1]), posts = checkPosts(all[2]);
        if (!klass) {
          W.state.enrolled = null;
          W.state.stream = [];
          W.save();
          W.toast("You're not in " + (e.className || 'that class') + ' anymore',
                  'Ask your teacher for the class code if you want to rejoin', W.Icons.info, 4200);
          return true;
        }
        e.className = klass.name;
        /* The class look, asked for separately so an older classes table
           costs the student their colour and not their classwork. */
        fetchClassBackground(e.classId).then(function (bg) {
          if (bg && bg !== e.background) {
            e.background = bg;
            W.save();
            if (global.Classroom && global.Classroom.render) global.Classroom.render(true);
          }
        });
        mergeInbox(rows, e);
        W.state.stream = posts.map(rowToPost);
        W.save();
        /* after the class is safely in, and unable to affect it */
        /* both ride alongside, neither able to affect the class itself */
        return applyEnrolledTag(e)
          .then(function () { return refreshMyClasses(); })
          .then(function () { return true; }, function () { return true; });
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

  /* class-features.js looks for exactly this on Cloud, and finds nothing
     today, so store() returns null, load() resolves null and the switches
     render as unreachable. These two give them somewhere to live.

     read uses select('*') so a class row without the 0002 columns comes back
     as "no answer" instead of erroring, and the module falls back to its own
     defaults: live quiz on, leaderboard off.

     write deliberately REJECTS when the columns are absent. class-features
     shows "Not saved" and puts the switch back on a rejection, which is the
     honest outcome before the migration: a switch that appears to move and
     silently does not is worse than one that says it could not. */
  var FEATURE_COLS = { geolive: 'geolive_enabled', leaderboard: 'leaderboard_enabled' };

  /* ============================== class tags ========================= */

  /* A class tag is four capital letters and a glyph, set by the teacher and
     worn next to a name only by students who choose to. The columns arrive
     with 0005 and are not there yet, so everything here has to work against
     a database that is behind it, the way the geolive columns had to.

     Two rules shape these calls.

     A read that is not certain must not be mistaken for a fact. "This class
     has no tag" and "I could not read the tag" are different, and a screen
     told null for both will invent an explanation, which is how a teacher
     ends up acting on a guess. So a read answers { known: ... } and says
     which of the two it is.

     A write says what it means and lets a refusal be a refusal. Only a
     member of a class may wear its tag, and 0005 enforces that in the
     profiles policy. This layer does not pretend to guarantee it and does
     not soften the answer when the database says no: a student who has left
     a class and tries to keep wearing its tag gets a real error, because
     quietly doing nothing would leave them wearing something that is not
     there. */
  var TAG_COLS = { tag: 'tag', glyph: 'tag_glyph' };
  var WEAR_COL = 'tag_class_id';

  /* Four capital letters. Uppercased here rather than trusted from a screen,
     because by the end of this round there are two writers and only one of
     them is a screen. */
  function cleanTag(tag) {
    return String(tag == null ? '' : tag).trim().toUpperCase();
  }

  function validTag(tag) { return /^[A-Z]{4}$/.test(tag); }

  /* -> { known: true, tag: 'ABCD', glyph: 'globe' }   it has one
        { known: true, tag: null }                     it definitely has none
        { known: false, why: 'absent' | 'refused' }    we could not tell     */
  function readClassTag(classId) {
    if (!ready() || !classId) return Promise.resolve({ known: false, why: 'offline' });
    /* Through the function, never a select on classes. A tag travels with
       the student who wears it, so it has to be readable from a class you
       are not in, and the classes policy correctly refuses that. Opening
       the table instead would expose every class row to every signed-in
       user, and a view would be enumerable, which is the one property a
       tag set must not have. Only a function can demand an argument. */
    return sb.rpc('class_tag', { p_class: classId }).maybeSingle()
      .then(function (res) {
        if (res && res.error) {
          return { known: false, why: missingBit(res.error) ? 'absent' : 'refused',
                   code: (res.error && res.error.code) || '' };
        }
        var r = res && res.data;
        /* Anyone entitled to see this tag gets a row, including when the
           class has chosen none. No row at all means we are not entitled,
           which is a refusal and not a feature that has yet to arrive.
           Reading it as absent would tell a screen "this class has no tag"
           about a class whose tag we were simply not shown. */
        if (!r) return { known: false, why: 'refused' };
        if (!(TAG_COLS.tag in r)) return { known: false, why: 'absent' };
        var tag = r[TAG_COLS.tag] ? cleanTag(r[TAG_COLS.tag]) : null;
        return { known: true, tag: validTag(tag || '') ? tag : null,
                 glyph: (tag && r[TAG_COLS.glyph]) || null };
      })
      .catch(function (err) {
        return { known: false, why: missingBit(err) ? 'absent' : 'refused' };
      });
  }

  /* Teacher only, enforced by the classes update policy. Pass null or '' to
     clear the tag, which clears the glyph with it: half a tag is not a tag. */
  function writeClassTag(classId, tag, glyph) {
    if (!ready() || !classId) return Promise.reject(new Error('not online'));
    var clean = cleanTag(tag);
    if (clean === '') {
      var wipe = {};
      wipe[TAG_COLS.tag] = null;
      wipe[TAG_COLS.glyph] = null;
      return sb.from('classes').update(wipe).eq('id', classId).then(check);
    }
    if (!validTag(clean)) {
      return Promise.reject(new Error('A class tag is four letters, A to Z.'));
    }
    var row = {};
    row[TAG_COLS.tag] = clean;
    row[TAG_COLS.glyph] = glyph ? String(glyph).slice(0, 40) : null;
    return sb.from('classes').update(row).eq('id', classId).then(check);
  }

  /* The student's own choice, on their own profiles row. One at a time:
     passing a class id wears that class's tag, passing null takes it off.
     A refusal is passed on rather than swallowed, because "only a member may
     wear it" is the database's rule to enforce and a student who has left
     needs to be told, not quietly left wearing nothing. */
  function wearTag(classId) {
    if (!ready()) return Promise.reject(new Error('not online'));
    var row = {};
    row[WEAR_COL] = classId || null;
    return sb.from('profiles').update(row).eq('id', user.id).then(check);
  }

  /* -> { known: true, classId: '...' | null } or { known: false, why } */
  function myTag() {
    if (!ready()) return Promise.resolve({ known: false, why: 'offline' });
    return sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
      .then(function (res) {
        if (res && res.error) {
          return { known: false, why: missingBit(res.error) ? 'absent' : 'refused' };
        }
        var r = (res && res.data) || {};
        if (!(WEAR_COL in r)) return { known: false, why: 'absent' };
        return { known: true, classId: r[WEAR_COL] || null };
      })
      .catch(function (err) {
        return { known: false, why: missingBit(err) ? 'absent' : 'refused' };
      });
  }


  function readClassFeatures(classId) {
    if (!ready() || !classId) return Promise.resolve(null);
    /* its own query on purpose, never joined to the class sync.

       AND IT STAYS A SELECT. readClassTag above is an rpc because a tag
       travels: a student meets four letters belonging to a class they are
       not in, so only a definer function can answer. These switches do not
       travel. A teacher reads them for a class they are already in, and
       there is no class_features function to call. Grepping for
       from('classes').select and making this match readClassTag would call
       something that does not exist and read as tidying up while it broke
       the feature switches. */
    return sb.from('classes').select('*').eq('id', classId).maybeSingle()
      .then(function (res) {
        if (res && res.error) return null;
        var r = (res && res.data) || {}, out = {}, got = false;
        Object.keys(FEATURE_COLS).forEach(function (k) {
          if (typeof r[FEATURE_COLS[k]] === 'boolean') { out[k] = r[FEATURE_COLS[k]]; got = true; }
        });
        return got ? out : null;
      })
      .catch(function () { return null; });
  }

  function writeClassFeatures(classId, patch) {
    if (!ready() || !classId || !patch) return Promise.reject(new Error('not online'));
    var row = {};
    Object.keys(patch).forEach(function (k) {
      if (FEATURE_COLS[k] && typeof patch[k] === 'boolean') row[FEATURE_COLS[k]] = patch[k];
    });
    if (!Object.keys(row).length) return Promise.reject(new Error('nothing to set'));
    return sb.from('classes').update(row).eq('id', classId).then(check);
  }

  /* A level is a student fact the leaderboard happens to read, not a GeoLive
     fact, so it goes up with the profile rather than from the game module.
     One RPC, updates this student's row in every class they are in.

     Detached from the push on purpose and it can never reject: sync_level
     does not exist until 0002 is applied, and a missing function must not
     turn a sync that otherwise worked into a failed one. A real error costs
     one skipped level update and the next push tries again. */
  function pushLevel() {
    if (!ready() || W.state.role === 'teacher') return Promise.resolve(0);
    var e = W.state.economy || {};
    var lv = typeof e.level === 'number' ? e.level : null;
    var xp = typeof e.xp === 'number' ? e.xp : null;
    if (lv === null && xp === null) return Promise.resolve(0);
    return sb.rpc('sync_level', { p_level: lv, p_xp: xp })
      .then(function (res) {
        if (res && res.error && !missingBit(res.error)) throw res.error;
        return (res && res.data) || 0;
      })
      .catch(function () { return 0; });
  }

  /* The student's own view of who else is in their class. studentSync
     deliberately does not fetch this and I am not adding it there: that batch
     carries the assignments and the stream, which a student always needs,
     and class_members is a table their policy may or may not let them read.
     Putting an uncertain read next to a certain one is the announcements
     outage again.

     So: its own call, and an empty list on ANY refusal. A policy that says no
     reads here as an empty class rather than an error, which is the same
     answer a class with nobody in it gives. */
  function classMembers(classId) {
    if (!ready() || !classId) return Promise.resolve([]);
    return sb.from('class_members').select('*').eq('class_id', classId).order('joined_at')
      .then(function (res) {
        if (res && res.error) return [];
        return (res.data || []).map(function (m) {
          var out = { id: m.student_id, name: m.display_name };
          if (typeof m.level === 'number') out.level = m.level;
          if (typeof m.xp === 'number') out.xp = m.xp;
          /* who is wearing a tag, when 0005 has put it within reach. Absent
             means the column is not there yet, not that they wear nothing:
             a screen should show no tag either way, but it should not record
             "wears none" as a fact it can act on. */
          if (WEAR_COL in m) out.tagClassId = m[WEAR_COL] || null;
          return out;
        });
      })
      .catch(function () { return []; });
  }

  global.Cloud = {
    init: init,
    signUp: signUp, signIn: signIn, signOut: signOut,
    resetPassword: resetPassword, updatePassword: updatePassword,
    push: push, onChange: onChange, friendly: friendly,
    teacherSync: teacherSync, saveAssignment: saveAssignment, deleteAssignment: deleteAssignment,
    renameClass: renameClass, recordResults: recordResults, clearResult: clearResult,
    teacherClasses: teacherClasses, setClassBackground: setClassBackground,
    fetchClassBackground: fetchClassBackground,
    postAnnouncement: postAnnouncement, deleteAnnouncement: deleteAnnouncement,
    pinAnnouncement: pinAnnouncement,
    setManualScore: setManualScore, removePerson: removePerson,
    joinClass: joinClass, leaveClass: leaveClass, studentSync: studentSync,
    canSubmit: canSubmit, submitResult: submitResult,
    get lastInboxChange() { return lastMerge; },
    classFeatures: { read: readClassFeatures, write: writeClassFeatures },
    classTag: { read: readClassTag, write: writeClassTag },
    myClasses: myClasses,
    refreshMyClasses: refreshMyClasses,
    wearTag: wearTag,
    myTag: myTag,
    classMembers: classMembers,
    syncLevel: pushLevel,
    get available() { return !!client(); },
    get sb() { return client(); },
    get user() { return user; },
    get signedIn() { return !!user; },
    get ready() { return ready(); },
    get status() { return status; }
  };
})(window);
