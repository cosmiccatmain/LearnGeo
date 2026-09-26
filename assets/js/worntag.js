/* ------------------------------------------------------------------
   LearnGeo — wearing a class tag.

   The tag itself already exists. assets/js/class-tag.js is live: it owns
   the teacher's control, the four letter rule, the markup and
   ClassTag.html(text, mark), which is commented "so whoever renders a tag
   beside a name can use the same markup". This file is that whoever.

   So this file does ONE thing that did not exist: the student's side of
   it. Whether they are wearing their class's tag, adopting it, dropping
   it, and handing the shared renderer the right text when a name is drawn.
   It does not define the markup, the stylesheet or the four letter rule,
   because all three are already owned elsewhere and a second copy of any
   of them is how they drift.

   It is deliberately NOT called ClassTag. That global belongs to the live
   file and defining it twice means whichever script loads second silently
   erases the other.

   Owen's words were that someone can adopt it "but they dont have to", so:
   nobody is opted in by joining a class, taking it off is one call that
   gets the same care as putting it on, and a student wearing nothing is
   the normal case rather than the empty one.

   Three things it refuses to do:

     it never guesses   an unknown tag renders as nothing at all. Not a
                        placeholder, not a dashed box, not a spinner. The
                        shared renderer has an empty state for the
                        teacher's own preview; beside a child's name in a
                        list, nothing is the right answer.

     it never costs     no tag means no request and no work. Rendering
                        reads state that is already loaded. refresh() is
                        the only call that touches the network and nothing
                        renders through it.

     it is not a name   the tag is its own element with its own label,
                        never inside the name.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var W = global.WW || {};
  var esc = W.escapeHtml || function (s) { return String(s == null ? '' : s); };

  var LEN = 4;
  var SHAPE = /^[A-Z]{4}$/;

  function shared() {
    var C = global.ClassTag;
    return (C && typeof C.html === 'function') ? C : null;
  }

  /* ------------------------------ the text ------------------------ */

  /* Four letters or nothing. Anything else is a tag we do not
     understand, and ruling two says render nothing rather than guess.
     Lower case is tidied because a teacher typing one should not be the
     reason a tag disappears; everything else is refused. */
  function clean(raw) {
    var C = global.ClassTag;
    if (C && typeof C.clean === 'function') {
      try {
        var via = C.clean(raw);
        return SHAPE.test(String(via || '')) ? String(via) : '';
      } catch (e) { /* fall through to the same rule */ }
    }
    if (raw == null) return '';
    var t = String(raw).trim().toUpperCase();
    return SHAPE.test(t) ? t : '';
  }

  /* ------------------------- who is wearing what ------------------ */

  /* A student is in at most one class: state.enrolled is a single
     object or null, and there is no list of classes anywhere in this
     app. So wearing a tag is a yes or no about one class rather than a
     choice between several. If enrolment ever becomes a list this is
     the function that changes, and nothing else here has to. */
  function enrolled() {
    var e = W.state && W.state.enrolled;
    return (e && e.classId) ? e : null;
  }

  /* A student is in one class. core.js:125 keeps `enrolled` as a single
     object or null, and cloud.js's leaveClass() takes no argument because
     there is only ever one to leave. So this is a toggle: wear your class's
     tag or do not, and there is no picker to build.

     It is still a list of one, and the worn value is still a class id
     rather than a boolean, so if enrolment ever does become a list this
     function is the only one that changes. A class with no tag is not
     offerable, because there is nothing to wear. */
  function memberships() {
    /* Cloud.myClasses() is the authoritative list and is a plain array read
       from state already loaded, never a promise, so asking costs nothing
       and rendering stays free. */
    var C = global.Cloud;
    if (C && typeof C.myClasses === 'function') {
      try {
        var rows = C.myClasses();
        if (rows && typeof rows.length === 'number') {
          var out = [];
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i] || {};
            var id = r.classId || r.class_id || r.id;
            var t = clean(r.tag);
            if (id && t) {
              out.push({ classId: String(id), className: r.className || r.name || '',
                         tag: t, glyph: r.tagGlyph || r.tag_glyph || null });
            }
          }
          return out;
        }
      } catch (e2) { /* fall back to what is already loaded */ }
    }

    /* Until it lands: state.enrolled, which is one class and is right for
       every student whose leave has never failed. A known under-report, not
       a guess, and the reason Cloud.myClasses() was commissioned. */
    var e = enrolled();
    var tag = e && clean(e.tag);
    return tag ? [{ classId: String(e.classId), className: e.className || '',
                    tag: tag, glyph: e.tagGlyph || null }] : [];
  }

  /* The tag a student could wear, if their class has one at all. */
  function available() {
    var list = memberships();
    return list.length ? list[0] : null;
  }

  function member(classId) {
    var id = String(classId);
    var list = memberships();
    for (var i = 0; i < list.length; i++) if (list[i].classId === id) return list[i];
    return null;
  }

  /* The class whose tag is actually being worn, or null for none.
     Stored as a class id rather than a boolean so it still means
     something if a student ever belongs to more than one class. */
  function worn() {
    var p = W.state && W.state.profile;
    var id = p && p.tagClassId;
    return id ? String(id) : null;
  }

  function wearing() {
    var a = available();
    return (a && worn() === String(a.classId)) ? a : null;
  }

  /* --------------------------- adopt and drop --------------------- */

  /* Both go through one function, because a drop that took a different
     path from an adopt is a drop that gets tested less. `null` is a
     first class argument here, not an absence. */
  function wear(classId) {
    var p = W.state && W.state.profile;
    if (!p) return Promise.resolve(null);

    var next = classId ? String(classId) : null;

    /* Checked against the same list the control is built from, so the
       guard and the offer can never disagree. Dropping is always allowed:
       a student must be able to take a tag off even if the class it came
       from has gone. */
    if (next && !member(next)) return Promise.resolve(worn());

    if (worn() === next) return Promise.resolve(next);   /* already there */

    p.tagClassId = next;
    if (typeof W.save === 'function') W.save();
    if (typeof W.emit === 'function') W.emit('tag', next);

    return push(next);
  }

  function adopt(classId) {
    if (classId) return wear(classId);
    var only = memberships();
    /* No argument means "the obvious one", which only exists when there
       is exactly one. With several, the control has to ask. */
    return only.length === 1 ? wear(only[0].classId) : Promise.resolve(worn());
  }
  function drop() { return wear(null); }

  /* One control, two directions, so neither gets less use than the other. */
  function toggle() { return wearing() ? drop() : adopt(); }

  /* The one line that reaches the network, and it is somebody else's to
     write. Until cloud-tag lands this resolves and the choice lives in
     the student's own save, which is where every other profile choice
     in this app already lives. No call, no failure, no spinner. */
  /* oy-03's name, on the existing Cloud namespace. It rejects rather than
     resolving when the app is not online, so both outcomes are handled and
     neither changes what the student sees: the choice is already in their
     own save, which is where every other profile choice in this app lives.
     A classroom with bad wifi must still be able to take a tag off. */
  function push(next) {
    var C = global.Cloud;
    if (C && typeof C.wearTag === 'function') {
      try {
        return Promise.resolve(C.wearTag(next))
          .then(function () { return next; }, function () { return next; });
      } catch (e) { /* the local choice still stands */ }
    }
    return Promise.resolve(next);
  }

  /* Reconcile with the server, for a student who wore a tag on another
     device. Deliberately not called on render: it is a request, and
     rendering must stay free. Whoever builds the control calls this once.
     known:false means 0005 is not applied, or we are offline, or we were
     refused. None of those is a reason to change what they are wearing. */
  function refresh() {
    var C = global.Cloud;
    if (!C || typeof C.myTag !== 'function') return Promise.resolve(worn());
    return Promise.resolve(C.myTag()).then(function (got) {
      if (!got || !got.known) return worn();
      var next = got.classId ? String(got.classId) : null;
      var p = W.state && W.state.profile;
      if (p && p.tagClassId !== next) {
        p.tagClassId = next;
        if (typeof W.save === 'function') W.save();
        if (typeof W.emit === 'function') W.emit('tag', next);
      }
      return next;
    }, function () { return worn(); });
  }

  /* ----------------------------- rendering ------------------------ */

  /* Follows verifiedMark in core.js: give it a subject, get markup or an
     empty string, and never anything in between.

     `subject` is whatever the caller already has beside the name. A
     string is read as the tag itself, which is what a standings row or a
     leaderboard row will have once those rows carry one. An object is
     read as a person, and only their own tag is used: this never looks
     up someone else's class, because it has no way to and guessing is
     the thing it must not do. */
  function mark(subject, size) {
    var t = textFor(subject);
    if (!t) return '';

    /* One markup, owned by the live file, so a tag beside a name in
       GeoLive and a tag in the teacher's preview cannot drift apart. If
       that file is not loaded we render nothing rather than our own
       unstyled span: unstyled markup beside a child's name is worse than
       an absent tag, which is the whole of ruling two. */
    var C = shared();
    if (!C) return '';
    try { return C.html(t, glyphFor(subject) || ''); } catch (e) { return ''; }
  }

  /* Only ever this person's own glyph name, never borrowed. */
  function glyphFor(subject) {
    if (!subject || typeof subject === 'string') return null;
    if (subject.tagGlyph || subject.tag_glyph) return subject.tagGlyph || subject.tag_glyph;
    var p = W.state && W.state.profile;
    if (p && subject === p) {
      var w = wearing();
      return w ? w.glyph : null;
    }
    return null;
  }

  function textFor(subject) {
    if (subject == null) return '';
    if (typeof subject === 'string') return clean(subject);

    /* a row that already carries its own tag */
    var direct = clean(subject.tag || subject.classTag || subject.class_tag);
    if (direct) return direct;

    /* the signed-in student, whose choice we can see */
    var p = W.state && W.state.profile;
    if (p && subject === p) {
      var w = wearing();
      return w ? w.tag : '';
    }
    return '';
  }

  /* The glyph belongs to cosmetics.js and its names are not mine to
     invent, so this asks and renders nothing if the answer is nothing.
     A tag reads perfectly well as four letters in the meantime. */
  /* The glyph is a name on the class row, handed straight to the shared
     renderer, which owns the glyph set and draws it. Nothing here resolves
     one: a second glyph source is a second thing to drift. No name means
     four letters and nothing else, which reads fine. */

  global.WornTag = {
    mark: mark,
    text: textFor,
    clean: clean,
    available: available,
    memberships: memberships,
    refresh: refresh,
    toggle: toggle,
    wearing: wearing,
    worn: worn,
    adopt: adopt,
    drop: drop,
    wear: wear,
    LENGTH: LEN
  };
})(window);
