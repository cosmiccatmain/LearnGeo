/* ------------------------------------------------------------------
   LearnGeo — the class tag.

   Four letters a teacher gives their class, worn by the students who
   choose to adopt it, the way a tag works on Discord. MATH, GEOG, 7B2.

   Four is four. The tag sits in a fixed slot beside children's names,
   and a three letter tag next to a four letter one in the same column
   reads as a bug rather than as a choice, so three characters is simply
   not ready to save yet.

   Typing is not a test. A teacher types math and the field shows MATH,
   and a key that is not a letter never lands in the first place, rather
   than landing and being told off afterwards.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var WW = global.WW || {};
  function ww() { return global.WW || WW; }

  function esc(str) {
    var f = ww().escapeHtml;
    if (f) return f(str);
    return String(str).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function q1(sel, root) {
    var f = ww().$;
    return f ? f(sel, root) : (root || document).querySelector(sel);
  }
  function qa(sel, root) {
    var f = ww().$$;
    if (f) return f(sel, root);
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function toast(a, b, c, d) { var f = ww().toast; if (f) f(a, b, c, d); }

  var LENGTH = 4;

  /* ============================= the marks ========================= */
  /* Built from Cosmetics.tagGlyphs, never from a copy of it. The list and
     the renderer come out of one object in cosmetics.js, so the moment the
     names were pasted in here the two could drift, and a picker offering a
     mark the renderer does not know is exactly that drift showing up in
     front of a teacher.

     Deliberately not the achievement badges. One of those says a student
     did a thing; a tag says which class this is. Offering an earned mark as
     a class logo would blur the two. */
  function glyphs() {
    var C = global.Cosmetics;
    if (!C || !C.tagGlyphs || typeof C.tagGlyph !== 'function') return [];
    return C.tagGlyphs.slice();
  }

  /* Single lowercase words on purpose, so a label is the word title-cased
     rather than a second list of pretty names to keep in step. */
  function label(name) {
    return String(name || '').charAt(0).toUpperCase() + String(name || '').slice(1);
  }

  /* null is the only failure, and it means letters only. Not an error, not
     a placeholder, and not something to warn about: a tag with no mark
     reads perfectly well. */
  function markHtml(name) {
    var C = global.Cosmetics;
    if (!name || !C || typeof C.tagGlyph !== 'function') return '';
    return C.tagGlyph(name) || '';
  }

  /* The mark to show as chosen. A stored name the set does not know draws
     nothing, so the picker has to say None rather than leave every button
     unselected and the teacher unable to tell what state they are in.

     Only when there is a set to check against. With no seam loaded every
     name is unrenderable, and quietly turning a perfectly good stored
     glyph into None would throw it away the first time anyone saved. */
  function effectiveMark(view) {
    if (!glyphs().length) return view.mark;
    return markHtml(view.mark) ? view.mark : '';
  }

  /* ============================== the store ======================== */
  /* The tag lives with the class, which means the database, which this
     file does not talk to. oy-01 owns the column and oy-03 owns the
     call. Until the column exists a class simply has no tag: nothing
     here throws, and the card says what it can and cannot do. */
  function store() {
    var C = global.Cloud;
    if (C && C.classTag &&
        typeof C.classTag.read === 'function' &&
        typeof C.classTag.write === 'function') return C.classTag;
    var S = global.ClassTagStore;
    if (S && typeof S.read === 'function' && typeof S.write === 'function') return S;
    return null;
  }

  function clean(raw) {
    return String(raw || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, LENGTH);
  }

  /* ============================== mounting ========================= */

  function mount(el, opts) {
    opts = opts || {};
    var view = {
      el: el,
      classId: opts.classId || '',
      text: '',
      mark: '',
      saved: null,
      busy: false,
      confirming: false
    };
    if (el.className.indexOf('ct') < 0) {
      el.className = (el.className + ' ct').trim();
    }

    render(view);

    var s = store();
    if (s && view.classId) {
      Promise.resolve()
        .then(function () { return s.read(view.classId); })
        .then(function (row) {
          if (!row) return;
          view.saved = { text: clean(row.tag || row.text || ''), mark: row.mark || row.glyph || '' };
          view.text = view.saved.text;
          view.mark = view.saved.mark;
          render(view);
        })
        .catch(function () { /* no column yet means no tag, not an error */ });
    }
    return view;
  }

  function render(view) {
    var marks = glyphs();
    var ready = view.text.length === LENGTH;
    var hasSaved = !!(view.saved && view.saved.text);
    var canSave = !!store() && !!view.classId;

    view.el.innerHTML =
      '<div class="field">' +
        '<label class="field__label" for="ct-text">Class tag</label>' +
        '<div class="ct__row">' +
          '<input class="input mono ct__input" id="ct-text" maxlength="' + LENGTH + '" ' +
            'spellcheck="false" autocomplete="off" placeholder="MATH" ' +
            'value="' + esc(view.text) + '">' +
          '<button class="btn btn--accent" id="ct-save"' +
            (ready && canSave && !view.busy ? '' : ' disabled') + '>' +
            (view.busy ? 'Saving…' : 'Save tag') + '</button>' +
        '</div>' +

        '<div class="ct__preview">' +
          '<span class="ct__preview-label">Beside a student name</span>' +
          '<span class="ct__sample">' + tagHtml(view) +
            '<span class="ct__name">Ada Lovelace</span></span>' +
        '</div>' +

        (marks.length
          ? '<div class="ct__marks">' +
              '<button class="ct-mark' + (effectiveMark(view) ? '' : ' is-on') + '" data-mark="" ' +
                'title="No mark">None</button>' +
              marks.map(function (name) {
                var art = markHtml(name);
                return '<button class="ct-mark' + (effectiveMark(view) === name ? ' is-on' : '') + '" ' +
                  'data-mark="' + esc(name) + '" title="' + esc(label(name)) + '" ' +
                  'aria-label="' + esc(label(name)) + '">' +
                  (art || esc(label(name))) + '</button>';
              }).join('') +
            '</div>'
          : '') +

        '<div class="field__hint">' +
          (canSave
            ? 'Four letters, A to Z. Students can choose to wear it beside their name.'
            : 'Four letters, A to Z. Saving needs the class to be online, so this is ' +
              'waiting on that. Nothing is lost by typing it now.') +
          (view.text.length && !ready
            ? ' You have ' + view.text.length + ' of ' + LENGTH + '.'
            : '') +
        '</div>' +

        (hasSaved
          ? '<div class="ct__clear">' +
              (view.confirming
                ? '<span class="ct__warn">Removing the tag takes it off every student wearing it.</span>' +
                  '<button class="btn btn--ghost btn--sm" id="ct-clear-yes">Remove it</button>' +
                  '<button class="btn btn--ghost btn--sm" id="ct-clear-no">Keep it</button>'
                : '<button class="btn btn--ghost btn--sm" id="ct-clear">Remove the class tag</button>') +
            '</div>'
          : '') +
      '</div>';

    wire(view);
  }

  /* The tag as it will actually be worn. A teacher choosing MATH should
     see MATH next to a name here, not read a sentence describing it. */
  function tagHtml(view) {
    if (!view.text) {
      return '<span class="ct-tag ct-tag--empty">' + esc('----') + '</span>';
    }
    var art = markHtml(view.mark);
    return '<span class="ct-tag">' +
      (art ? '<span class="ct-tag__mark">' + art + '</span>' : '') +
      '<span class="ct-tag__txt">' + esc(view.text) + '</span>' +
    '</span>';
  }

  function wire(view) {
    var input = q1('#ct-text', view.el);
    if (input) {
      /* A key that cannot be in a tag never lands. Nothing appears and
         then vanishes, and nothing is explained after the fact. */
      input.addEventListener('beforeinput', function (ev) {
        if (ev.inputType !== 'insertText' || ev.data === null) return;
        if (!/^[A-Za-z]+$/.test(ev.data)) ev.preventDefault();
      });
      /* Backstop for paste, drag and autofill, which do not come through
         as insertText. Same rule, applied to whatever landed. */
      input.addEventListener('input', function () {
        var at = input.selectionStart;
        var was = input.value;
        var now = clean(was);
        if (now !== was) {
          input.value = now;
          try { input.setSelectionRange(at, at); } catch (e) {}
        }
        view.text = now;
        paint(view);
      });
    }

    qa('[data-mark]', view.el).forEach(function (b) {
      b.addEventListener('click', function () {
        view.mark = b.getAttribute('data-mark') || '';
        render(view);
        var f = q1('#ct-text', view.el);
        if (f) f.focus();
      });
    });

    on(view, '#ct-save', function () { save(view); });
    on(view, '#ct-clear', function () { view.confirming = true; render(view); });
    on(view, '#ct-clear-no', function () { view.confirming = false; render(view); });
    on(view, '#ct-clear-yes', function () { clear(view); });
  }

  function on(view, sel, fn) {
    var b = q1(sel, view.el);
    if (b) b.addEventListener('click', fn);
  }

  /* Only the parts that change as they type, so the field does not lose
     its cursor on every keystroke. */
  function paint(view) {
    var sample = q1('.ct__sample', view.el);
    if (sample) {
      sample.innerHTML = tagHtml(view) + '<span class="ct__name">Ada Lovelace</span>';
    }
    var btn = q1('#ct-save', view.el);
    if (btn) btn.disabled = !(view.text.length === LENGTH && store() && view.classId && !view.busy);
    var hint = q1('.field__hint', view.el);
    if (hint && view.text.length && view.text.length !== LENGTH) {
      hint.textContent = 'Four letters, A to Z. You have ' + view.text.length + ' of ' + LENGTH + '.';
    }
  }

  function save(view) {
    var s = store();
    if (!s || view.text.length !== LENGTH || view.busy) return;
    view.busy = true;
    render(view);

    Promise.resolve()
      .then(function () {
        return s.write(view.classId, { tag: view.text, mark: effectiveMark(view) });
      })
      .then(function () {
        view.mark = effectiveMark(view);
        view.saved = { text: view.text, mark: view.mark };
        view.busy = false;
        view.confirming = false;
        render(view);
        toast('Tag saved', view.text + ' is this class’s tag now.', (ww().Icons || {}).check, 3800);
      })
      .catch(function () {
        view.busy = false;
        render(view);
        toast('Not saved', 'The tag could not be saved just now, so it is unchanged.',
              (ww().Icons || {}).info, 4500);
      });
  }

  function clear(view) {
    var s = store();
    if (!s || view.busy) return;
    view.busy = true;
    view.confirming = false;
    render(view);

    Promise.resolve()
      .then(function () { return s.write(view.classId, { tag: '', mark: '' }); })
      .then(function () {
        view.saved = null;
        view.text = '';
        view.mark = '';
        view.busy = false;
        render(view);
        toast('Tag removed', 'It is off every student who was wearing it.',
              (ww().Icons || {}).check, 3800);
      })
      .catch(function () {
        view.busy = false;
        render(view);
        toast('Not removed', 'The tag could not be removed just now, so it is unchanged.',
              (ww().Icons || {}).info, 4500);
      });
  }

  global.ClassTag = {
    mount: mount,
    clean: clean,
    length: LENGTH,
    /* so whoever renders a tag beside a name can use the same markup */
    html: function (text, mark) {
      return tagHtml({ text: clean(text), mark: mark || '' });
    }
  };
})(window);
