/* ------------------------------------------------------------------
   LearnGeo — god mode

   A testing tool. Turn it on and every answer counts as right, so you can
   walk any mode end to end without knowing the capital of Kyrgyzstan.

   IT AWARDS NOTHING. No XP, no level, no gems, no streak, no mastery, no
   daily goal, no achievements. The reasoning is in NOTES.md and it is worth
   knowing before anyone "fixes" it: the class leaderboard now ranks on level,
   and level is the one number in this app that is supposed to only ever mean
   work actually done. A tool that hands out levels is the single thing that
   breaks that. Skipping the award also keeps the mastery boxes clean, which
   matters more day to day: award() pushes a country up a Leitner box every
   time it is answered right, so a god mode that paid out would mark all 213
   countries mastered after a couple of walkthroughs, and Owen's own practice
   would stop showing him what he is actually weak at.

   Because it pays nothing, the admin gate is not load-bearing. Someone who
   forces this on gains a green tick and no points, which is the property you
   want from a debug switch in a page that anyone can open the console on.

   This file patches three exported functions while it is on and puts them
   back when it is off. It edits no other file.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  var on = false;
  var saved = null;      /* the real functions, while ours are in place */
  var ui = null;         /* banner nodes, while it is on */

  /* The answer inputs, by id. Used only to let Enter submit an empty box,
     which is a convenience, not the mechanism. If these ids change the
     convenience quietly stops and nothing breaks. */
  var ANSWER_INPUTS = ['qz-name', 'qz-cap', 'typed-answer'];

  /* ------------------------------------------------------------ the gate */

  /* Admin.unlocked is set by the Supabase-checked PIN and lives until the tab
     closes. God mode borrows exactly that lifetime: it does not persist, and
     there is nothing in storage to flip. A reload turns it off. */
  function available() {
    return !!(global.Admin && global.Admin.unlocked);
  }

  /* ------------------------------------------------------- the patches */

  /* Three places decide whether an answer was right, and they are not the
     same place, which is why this patches three things rather than one:

       Quiz.grade    typed answers in Learn, and everything in Test
       W.matches     the two typed halves of a class quiz
       Quiz.make     multiple choice, where `correct` is baked into each
                     option when the question is built, long before the click

     The first two are asked at answer time, so they take effect immediately.
     The third is asked at build time, so in Learn a question already on
     screen keeps its original options and the next one is the first to be
     fully god-moded. */
  function patch() {
    if (saved) return;
    var Q = global.Quiz;
    saved = { grade: Q && Q.grade, make: Q && Q.make, matches: W && W.matches, award: W && W.award };

    if (Q && saved.grade) {
      Q.grade = function () { return on ? true : saved.grade.apply(this, arguments); };
    }
    if (W && saved.matches) {
      W.matches = function () { return on ? true : saved.matches.apply(this, arguments); };
    }
    if (Q && saved.make) {
      Q.make = function (type, answer, all, opts) {
        /* "Find this country on the map" is the one question shape god mode
           cannot fake. Learn mode answers it by comparing the country you
           clicked against the country it wanted, with nothing in between to
           patch, so a locate question would stop a walkthrough dead: the one
           thing this tool exists to prevent. Asked for a locate, god mode
           asks for the shaded-country version of the same country instead,
           which is four options and therefore instantly passable.

           quiz.js already swaps question shapes when a country cannot take
           one, so this is the same move for a different reason. The cost is
           that the map-click screen cannot be walked through with god mode
           on; turn it off to test that one. oy-09 could remove this entirely
           with the hook listed in NOTES. */
        if (on && type === 'locate') type = 'identify';
        var q = saved.make.call(this, type, answer, all, opts);
        if (on && q && q.choices) {
          q.choices.forEach(function (ch) { ch.correct = true; });
        }
        return q;
      };
    }

    /* The whole integrity decision is this one function.

       award() is the only place XP, gems, level, streak, lifetime stats, the
       daily goal and the Leitner mastery boxes are written, and every mode
       goes through it. Returning a zeroed result means nothing is recorded
       and nothing is saved, while the modes still get the object shape they
       read for their own display. The "+0 XP" that floats up on a correct
       answer is not a bug, it is the receipt: it says out loud that this one
       did not count. */
    if (W && saved.award) {
      W.award = function (correct, opts) {
        if (!on) return saved.award.apply(this, arguments);
        return { xp: 0, gems: 0, level: false, combo: 0, mult: 1 };
      };
    }
  }

  function unpatch() {
    if (!saved) return;
    var Q = global.Quiz;
    if (Q && saved.grade) Q.grade = saved.grade;
    if (Q && saved.make) Q.make = saved.make;
    if (W && saved.matches) W.matches = saved.matches;
    if (W && saved.award) W.award = saved.award;
    saved = null;
  }

  /* --------------------------------------------------------- the banner */

  /* Persistent and hard to miss, per the brief, and deliberately not a toast.

     Two parts. A ring around the whole viewport, which cannot be mistaken for
     part of the app and covers nothing because it does not take pointer
     events. And a small pill with the off switch in it, which is the only bit
     that is clickable. A slim bar across the top would have sat on the app's
     own nav; this sits on nothing. */
  function showBanner() {
    if (ui) return;
    var ring = document.createElement('div');
    ring.setAttribute('data-godmode', 'ring');
    ring.style.cssText = [
      'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:2147483646',
      'border:4px solid #E8590C', 'box-shadow:inset 0 0 0 1px rgba(232,89,12,.45)'
    ].join(';');

    var pill = document.createElement('div');
    pill.setAttribute('data-godmode', 'pill');
    pill.style.cssText = [
      'position:fixed', 'top:10px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:2147483647', 'display:flex', 'align-items:center', 'gap:10px',
      'padding:6px 8px 6px 14px', 'border-radius:999px',
      'background:#E8590C', 'color:#fff',
      'font:600 13px/1.2 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'box-shadow:0 6px 20px rgba(0,0,0,.28)', 'pointer-events:auto'
    ].join(';');

    var label = document.createElement('span');
    label.textContent = 'God mode on · every answer counts as right · nothing is being recorded';

    var off = document.createElement('button');
    off.type = 'button';
    off.textContent = 'Turn off';
    off.style.cssText = [
      'border:0', 'border-radius:999px', 'cursor:pointer',
      'padding:5px 12px', 'background:#fff', 'color:#E8590C',
      'font:600 12px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
    ].join(';');
    off.addEventListener('click', disable);

    pill.appendChild(label);
    pill.appendChild(off);
    document.body.appendChild(ring);
    document.body.appendChild(pill);
    ui = { ring: ring, pill: pill };
  }

  function hideBanner() {
    if (!ui) return;
    if (ui.ring && ui.ring.parentNode) ui.ring.remove();
    if (ui.pill && ui.pill.parentNode) ui.pill.remove();
    ui = null;
  }

  /* ---------------------------------------------------- the convenience */

  /* A typed question still needs something in the box before its own submit
     will fire, so Enter on an empty answer puts a dot in first. Narrow on
     purpose: only while god mode is on, only the known answer inputs, only
     when empty. */
  function onKeydown(e) {
    if (!on || e.key !== 'Enter') return;
    var el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (ANSWER_INPUTS.indexOf(el.id) === -1) return;
    if (el.value && el.value.trim()) return;
    el.value = '.';
  }

  function onHotkey(e) {
    /* ctrl+shift+G, and only for someone who has already unlocked the panel */
    if (!e.ctrlKey || !e.shiftKey) return;
    if (String(e.key).toLowerCase() !== 'g') return;
    if (!on && !available()) return;
    e.preventDefault();
    toggle();
  }

  /* ---------------------------------------------------------- the switch */

  function enable() {
    if (on) return true;
    if (!available()) return false;
    on = true;
    patch();
    showBanner();
    return true;
  }

  function disable() {
    if (!on) return;
    on = false;
    unpatch();
    hideBanner();
  }

  function toggle() { return on ? (disable(), false) : enable(); }

  /* A button oy-09 can drop into the admin panel. Kept here so the markup and
     the state cannot drift apart, and so the panel only needs one call. */
  function mountToggle(el) {
    if (!el) return null;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost btn--block';
    function paint() {
      btn.textContent = on ? 'God mode: on' : 'God mode: off';
      btn.disabled = !on && !available();
    }
    btn.addEventListener('click', function () { toggle(); paint(); });
    paint();
    el.appendChild(btn);
    return btn;
  }

  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('keydown', onHotkey, true);

  global.GodMode = {
    available: available,
    enable: enable,
    disable: disable,
    toggle: toggle,
    mountToggle: mountToggle,
    get on() { return on; }
  };
})(window);
