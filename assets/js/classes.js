/* ------------------------------------------------------------------
   LearnGeo — a teacher's several classes.

   One teacher, several classes: period 3 and period 5 are different
   rooms with different students, different work and different scores,
   and they were sharing one record.

   The whole app reads the current class through a cls() helper that
   returns state.classroom. So rather than rewrite every one of those,
   state.classroom keeps meaning "the class you are looking at" and this
   module owns the list behind it. Switching writes the live record back
   into the list and points state.classroom at another entry. Nothing
   downstream has to know the list exists.

   The database already allowed this: classes.teacher_id has no unique
   constraint, and it was the client that pinned a teacher to one with a
   .limit(1). See cloud.js.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  /* The look of a class, so a teacher running four of them can tell at a
     glance which room they are in. The key is stored, never the colours,
     so the palette can be restyled later without touching saved data. */
  var BACKGROUNDS = [
    { key: 'default', name: 'Blue' },
    { key: 'slate',   name: 'Slate' },
    { key: 'forest',  name: 'Forest' },
    { key: 'sunset',  name: 'Sunset' },
    { key: 'plum',    name: 'Plum' },
    { key: 'ocean',   name: 'Ocean' },
    { key: 'sand',    name: 'Sand' },
    { key: 'ink',     name: 'Ink' }
  ];
  var BG_KEYS = BACKGROUNDS.map(function (b) { return b.key; });

  function validBg(key) {
    return BG_KEYS.indexOf(String(key || '')) === -1 ? 'default' : String(key);
  }

  function newLid() {
    return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  }

  /* A class record, with every list present so callers never guard. */
  function blank(name) {
    return {
      lid: newLid(),
      name: name || '',
      code: '',
      cloudId: '',
      background: 'default',
      roster: [],
      members: [],
      results: [],
      assignments: [],
      posts: []
    };
  }

  function fill(c) {
    if (!c || typeof c !== 'object') return blank('');
    if (!c.lid) c.lid = newLid();
    if (!c.roster) c.roster = [];
    if (!c.members) c.members = [];
    if (!c.results) c.results = [];
    if (!c.assignments) c.assignments = [];
    if (!c.posts) c.posts = [];
    c.background = validBg(c.background);
    return c;
  }

  /* ----------------------------------------------------------------
     Bringing a save up to date.

     Every existing save has one class in state.classroom and no list.
     The list starts as that one record — the same object, not a copy,
     so state.classroom and state.classes[0] stay the same thing and
     cannot drift apart.
  ---------------------------------------------------------------- */
  function ensure() {
    var s = W.state;
    if (!Array.isArray(s.classes)) s.classes = [];
    s.classroom = fill(s.classroom);

    if (!s.classes.length) {
      s.classes.push(s.classroom);
    } else {
      /* Loading splits the one class in two. It is saved under both
         `classroom` and `classes[0]`, and JSON.parse has no idea they
         were the same object, so it returns two — and core's merge()
         then rebuilds `classroom` again from the defaults while the
         array is taken wholesale. Repointing `classroom` at the list
         entry below is what re-joins them.

         That repoint has to happen before any module reads
         state.classroom, or it reads the copy about to be orphaned and
         writes into it forever after. cloud.js did exactly that: the
         class sync wrote the server id, the code and the name into a
         copy nothing rendered, so a teacher could not change the name,
         the tag or the colour and saw no error. Hence the ensure() call
         at the bottom of this file, which runs at load, and cloud.js
         resolving through here rather than reaching for the field. */
      s.classes = s.classes.map(fill);
      /* Point the list entry and state.classroom at one object. If the
         active id has gone (a class deleted on another device), fall
         back to the first rather than leaving a teacher with no room. */
      var i = indexOf(s.activeClassId);
      if (i === -1) i = 0;
      s.activeClassId = s.classes[i].lid;
      s.classroom = s.classes[i];
    }
    if (!s.activeClassId) s.activeClassId = s.classroom.lid;
    return s.classes;
  }

  function all() { ensure(); return W.state.classes; }
  function active() { ensure(); return W.state.classroom; }
  function activeId() { ensure(); return W.state.activeClassId; }
  function count() { return all().length; }

  function indexOf(lid) {
    var list = W.state.classes || [];
    for (var i = 0; i < list.length; i++) if (list[i].lid === lid) return i;
    return -1;
  }

  function byId(lid) {
    var i = indexOf(lid);
    return i === -1 ? null : W.state.classes[i];
  }

  /* ----------------------------------------------------------------
     Switching.

     state.classroom is the same object as its entry in the list, so
     there is nothing to write back: pointing at another entry is the
     whole operation. Callers re-render afterwards.
  ---------------------------------------------------------------- */
  function switchTo(lid) {
    ensure();
    var row = byId(lid);
    if (!row || row.lid === W.state.activeClassId) return active();
    W.state.activeClassId = row.lid;
    W.state.classroom = row;
    W.saveNow();
    emit();
    return row;
  }

  function create(name) {
    ensure();
    var row = fill(blank(name));
    W.state.classes.push(row);
    W.state.activeClassId = row.lid;
    W.state.classroom = row;
    W.saveNow();
    emit();
    return row;
  }

  /* Removing is local only. It takes the class off this teacher's list
     and does not delete the row in Supabase, because a class with
     students in it is not this device's to destroy. */
  function remove(lid) {
    ensure();
    var list = W.state.classes;
    if (list.length < 2) return false;          /* never leave zero rooms */
    var i = indexOf(lid);
    if (i === -1) return false;
    list.splice(i, 1);
    if (W.state.activeClassId === lid) {
      var next = list[Math.min(i, list.length - 1)];
      W.state.activeClassId = next.lid;
      W.state.classroom = next;
    }
    W.saveNow();
    emit();
    return true;
  }

  function rename(lid, name) {
    var row = byId(lid) || active();
    row.name = String(name || '').slice(0, 60);
    W.saveNow();
    emit();
    return row;
  }

  /* ------------------------------ the look ------------------------ */
  function background(lid) {
    var row = lid ? byId(lid) : active();
    return validBg(row && row.background);
  }

  function setBackground(key, lid) {
    ensure();
    var row = lid ? byId(lid) : active();
    if (!row) return 'default';
    row.background = validBg(key);
    W.saveNow();
    emit();
    return row.background;
  }

  /* The class a student is in carries its own look too, sent down with
     the class row. Students have no list, so this reads the one class
     they are enrolled in. */
  function studentBackground() {
    var e = W.state.enrolled;
    return validBg(e && e.background);
  }

  /* Put the look on a container. One class name, swapped rather than
     added to, so re-rendering never stacks two backgrounds. */
  function paint(el, key) {
    if (!el) return;
    var want = 'cr--bg-' + validBg(key);
    var keep = [];
    String(el.className).split(/\s+/).forEach(function (n) {
      if (n && n.indexOf('cr--bg-') !== 0) keep.push(n);
    });
    keep.push(want);
    el.className = keep.join(' ');
  }

  /* ======================= the student's side ======================
     A student can be in more than one class too. Same shape as the
     teacher's list and the same identity rule: state.enrolled is the
     class on screen AND the matching entry in state.enrolments, one
     object, so a reference taken anywhere stays live. The key is the
     class code, which is unique and always present.
  ================================================================= */
  function indexOfEnrol(code) {
    var list = W.state.enrolments || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === code) return i;
    }
    return -1;
  }

  function ensureEnrolments() {
    var s = W.state;
    if (!Array.isArray(s.enrolments)) s.enrolments = [];

    /* an older save has the one class under `enrolled` and no list */
    if (s.enrolled && s.enrolled.code && indexOfEnrol(s.enrolled.code) === -1) {
      s.enrolments.push(s.enrolled);
    }
    if (s.enrolments.length) {
      var i = s.enrolled && s.enrolled.code ? indexOfEnrol(s.enrolled.code) : 0;
      if (i === -1) i = 0;
      s.enrolled = s.enrolments[i];      /* rejoin the two after a load */
    } else {
      s.enrolled = null;
    }
    return s.enrolments;
  }

  function enrolments() { ensureEnrolments(); return W.state.enrolments; }
  function enrolment() { ensureEnrolments(); return W.state.enrolled; }
  function enrolCount() { return enrolments().length; }

  function addEnrolment(e) {
    ensureEnrolments();
    if (!e || !e.code) return null;
    var i = indexOfEnrol(e.code);
    if (i !== -1) {
      /* already in it: refresh what we know rather than add a second */
      var row = W.state.enrolments[i];
      if (e.className) row.className = e.className;
      if (e.classId) row.classId = e.classId;
      if (e.name) row.name = e.name;
      W.state.enrolled = row;
    } else {
      W.state.enrolments.push(e);
      W.state.enrolled = e;
    }
    W.saveNow();
    emit();
    return W.state.enrolled;
  }

  function switchEnrolment(code) {
    ensureEnrolments();
    var i = indexOfEnrol(code);
    if (i === -1) return W.state.enrolled;
    W.state.enrolled = W.state.enrolments[i];
    W.saveNow();
    emit();
    return W.state.enrolled;
  }

  /* Leaving takes the class off this device's list. The classwork for it
     goes with it, except anything already handed in, which is the
     student's own record of what they did. */
  function removeEnrolment(code) {
    ensureEnrolments();
    var i = indexOfEnrol(code);
    if (i === -1) return false;
    W.state.enrolments.splice(i, 1);
    W.state.inbox = (W.state.inbox || []).filter(function (a) {
      return a.done || a.classCode !== code;
    });
    var next = W.state.enrolments[Math.min(i, W.state.enrolments.length - 1)];
    W.state.enrolled = next || null;
    W.saveNow();
    emit();
    return true;
  }

  /* The classwork belonging to one class. The inbox is one flat list
     across every class a student is in, so every screen that shows work
     has to say which class it means. */
  function workFor(code) {
    return (W.state.inbox || []).filter(function (a) { return a.classCode === code; });
  }

  /* ------------------------------ listeners ----------------------- */
  var listeners = [];
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function emit() {
    listeners.forEach(function (f) { try { f(W.state.classroom); } catch (e) {} });
  }

  /* At load, before cloud.js or anything else can take a reference.
     This file is loaded straight after core.js for that reason. */
  ensure();
  ensureEnrolments();

  global.Classes = {
    BACKGROUNDS: BACKGROUNDS,
    ensure: ensure, all: all, active: active, activeId: activeId, count: count,
    byId: byId, switchTo: switchTo, create: create, remove: remove, rename: rename,
    background: background, setBackground: setBackground,
    studentBackground: studentBackground, paint: paint,
    validBg: validBg, onChange: onChange,
    ensureEnrolments: ensureEnrolments, enrolments: enrolments,
    enrolment: enrolment, enrolCount: enrolCount, addEnrolment: addEnrolment,
    switchEnrolment: switchEnrolment, removeEnrolment: removeEnrolment,
    workFor: workFor
  };
})(window);
