/* ------------------------------------------------------------------
   LearnGeo — a teacher looking at their own class as a student.

   A teacher can see the gradebook, the roster and the analytics. What
   they cannot see is the thing they actually built: the Classroom their
   students open. So this stands the teacher in a student's place for a
   moment, using their own class.

   The whole of it is a swap and a swap back. Everything the student
   screens read — enrolled, enrolments, inbox, stream, role — is put
   aside, replaced with what a student in this class would have, and put
   back on the way out.

   The rule that makes this safe to use: NOTHING IS WRITTEN DOWN. Saving
   is frozen for the duration, so none of the stand-in data can reach
   localStorage or the account, and the class sync is held off so it
   cannot act on a student who does not exist. A teacher who closes the
   tab mid-masquerade loses the pretend session and keeps their class,
   because the class was never overwritten in the first place.

   It is a view, not a login. Nothing is handed in, no score is
   recorded, and the student's own progress is untouched: the teacher is
   still themselves, looking at a different screen.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var on = false;
  var kept = null;          /* the teacher's real state, while ours is up */
  var realSave = null, realSaveNow = null;

  function active() { return on; }

  /* --------------------------- freezing saves ----------------------
     Every module writes through W.save and W.saveNow, so replacing the
     two of them is enough to make the stand-in state unable to persist.
     Both are put back on the way out, and putting them back is the only
     thing that must not be allowed to fail. */
  function freezeSaves() {
    if (realSave) return;
    realSave = W.save;
    realSaveNow = W.saveNow;
    W.save = function () {};
    W.saveNow = function () {};
  }

  function thawSaves() {
    if (!realSave) return;
    W.save = realSave;
    W.saveNow = realSaveNow;
    realSave = null;
    realSaveNow = null;
  }

  /* ------------------------- what a student has -------------------- */
  /* The teacher's assignments as they arrive on a student's list: the
     same shape mergeInbox builds, minus anything that only exists once
     somebody has actually done the work. */
  function workFrom(c) {
    return (c.assignments || []).map(function (a) {
      return {
        id: a.id, title: a.title, mode: a.mode, config: a.config || {},
        from: c.name || 'Your teacher', classCode: c.code || '',
        added: Date.now()
      };
    });
  }

  function enrolmentFrom(c) {
    return {
      code: c.code || '',
      className: c.name || 'Your class',
      name: W.state.profile.displayName || 'A student',
      classId: c.cloudId || '',
      background: (global.Classes && global.Classes.validBg(c.background)) || 'default'
    };
  }

  /* ------------------------------ start ---------------------------- */
  function start() {
    if (on) return true;
    if (W.state.role !== 'teacher') {
      W.toast('Only a teacher can do that', '', I.info);
      return false;
    }
    var C = global.Classes;
    var c = C && C.active();
    if (!c) { W.toast('No class to look at', '', I.info); return false; }

    kept = {
      role: W.state.role,
      enrolled: W.state.enrolled,
      enrolments: W.state.enrolments,
      inbox: W.state.inbox,
      stream: W.state.stream,
      streamSeen: W.state.streamSeen
    };

    freezeSaves();

    var e = enrolmentFrom(c);
    W.state.enrolments = [e];
    W.state.enrolled = e;
    W.state.inbox = workFrom(c);
    W.state.stream = (c.posts || []).slice();
    W.state.streamSeen = 0;
    /* Still a teacher underneath. The route guard lets this through on
       the preview flag rather than by pretending the role changed,
       which keeps the teacher's own tabs and HUD honest. */

    on = true;
    global.UI.startPreview('Seeing ' + (c.name || 'your class') + ' as a student');
    /* The panel can be opened from the landing page, where the app shell
       is still closed — go() would set the view behind a page nobody is
       looking at. */
    var app = document.getElementById('app');
    if (app && !app.classList.contains('is-open')) global.UI.showApp('classroom');
    global.UI.go('classroom');
    if (global.Classroom && global.Classroom.render) global.Classroom.render(true);
    return true;
  }

  /* ------------------------------- stop ---------------------------- */
  function stop() {
    if (!on) return;
    on = false;

    if (kept) {
      W.state.enrolled = kept.enrolled;
      W.state.enrolments = kept.enrolments;
      W.state.inbox = kept.inbox;
      W.state.stream = kept.stream;
      W.state.streamSeen = kept.streamSeen;
      W.state.role = kept.role;
      kept = null;
    }
    /* Last, and unconditionally: a teacher whose saves stayed frozen
       would lose every change they made afterwards without a word. */
    thawSaves();

    if (global.Classes) { global.Classes.ensure(); global.Classes.ensureEnrolments(); }
    global.UI.refreshTabs();
    global.UI.refreshHud();
  }

  global.Masquerade = {
    start: start, stop: stop,
    get active() { return active(); }
  };
})(window);
