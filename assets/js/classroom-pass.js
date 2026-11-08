/* ------------------------------------------------------------------
   LearnGeo — iPad classroom passcodes (LEA-81).

   Teacher mints a short 4-character passcode (same alphabet as class
   codes). Students on shared iPads type passcode + name to join Games
   / Geo Live without the full email signup wall.

   Silent session: try anonymous auth first; if the project has it off,
   mint a throwaway email/password the student never sees, then call
   join_class_by_pass. Matches the existing join_class shape afterward.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;
  var PASS_LEN = 4;
  var PASS_OK = /^[A-HJ-NP-Z2-9]{4}$/;
  var KEY = 'lg_classroom_pass';
  var listeners = [];

  function I() { return (W && W.Icons) || {}; }

  function esc(s) {
    return W && W.escapeHtml ? W.escapeHtml(String(s || '')) : String(s || '');
  }

  function normalize(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, PASS_LEN);
  }

  function shapeProblem(pass) {
    if (!pass) return ['Passcode needed', 'Ask your teacher for today’s classroom passcode.'];
    if (/[IO01]/.test(pass)) {
      return ['Check that passcode',
        'Passcodes never use O, I, zero or one — the same rule as class codes.'];
    }
    if (pass.length !== PASS_LEN) {
      return ['That passcode is the wrong length',
        'A classroom passcode is exactly ' + PASS_LEN + ' characters.'];
    }
    if (!PASS_OK.test(pass)) {
      return ['Check that passcode', 'That is not a passcode we can read.'];
    }
    return null;
  }

  function loadLocal() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.classId || !o.at) return null;
      /* A pass session older than a school day is stale for shared iPads. */
      if (Date.now() - (o.at || 0) > 14 * 60 * 60 * 1000) {
        clearLocal();
        return null;
      }
      return o;
    } catch (e) { return null; }
  }

  function saveLocal(row) {
    try {
      if (!global.localStorage) return;
      global.localStorage.setItem(KEY, JSON.stringify(row));
    } catch (e) { /* private mode */ }
  }

  function clearLocal() {
    try {
      if (global.localStorage) global.localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(session()); } catch (e) { /* listener */ }
    });
  }

  function session() { return loadLocal(); }

  /* Games may treat a fresh pass session as enough to play locally even
     before Cloud.signedIn settles; Geo Live still needs a real session. */
  function unlocked() {
    if (global.Cloud && global.Cloud.signedIn && session()) return true;
    return !!session();
  }

  function onChange(fn) { listeners.push(fn); }

  function sb() {
    var C = global.Cloud;
    return (C && C.sb) ? C.sb : null;
  }

  function rpc(name, args) {
    var client = sb();
    if (!client) return Promise.reject(new Error('Not connected'));
    return client.rpc(name, args).then(function (res) {
      if (res.error) throw res.error;
      return res.data;
    });
  }

  function friendly(err) {
    var C = global.Cloud;
    if (C && C.friendly) return C.friendly(err);
    var m = (err && (err.message || err.error_description)) || String(err || '');
    if (/P0002|No class has that passcode/i.test(m)) return 'No class has that passcode. Check the board.';
    if (/22023|does not look right|name is needed/i.test(m)) return m.replace(/^.*?:\s*/, '') || m;
    if (/28000|Sign in first/i.test(m)) return 'Could not open a classroom session. Try again.';
    if (/own class/i.test(m)) return 'That passcode belongs to your own class.';
    return m || 'Something went wrong.';
  }

  /* -------------------- silent account -------------------- */
  function randomBits(n) {
    var abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    var out = '';
    for (var i = 0; i < n; i++) out += abc[(Math.random() * abc.length) | 0];
    return out;
  }

  function waitReady(ms) {
    var C = global.Cloud;
    if (!C) return Promise.reject(new Error('Accounts are not available.'));
    if (C.ready) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var start = Date.now();
      var t = setInterval(function () {
        if (C.ready || Date.now() - start > (ms || 8000)) {
          clearInterval(t);
          resolve(!!C.ready);
        }
      }, 120);
    });
  }

  function ensureSession(name) {
    var C = global.Cloud;
    if (!C || !C.available) {
      return Promise.reject(new Error('Joining needs a connection. Try again when you are online.'));
    }
    if (C.signedIn) {
      if (name && W.state && W.state.profile) {
        W.state.profile.displayName = name;
        W.saveNow();
      }
      return waitReady().then(function () { return true; });
    }

    var client = sb();
    if (!client || !client.auth) {
      return Promise.reject(new Error('Accounts are not available right now.'));
    }

    /* Prefer anonymous when the project has it on — no email at all. */
    var tryAnon = client.auth.signInAnonymously
      ? client.auth.signInAnonymously({
          options: { data: { display_name: name, classroom_pass: true } }
        })
      : Promise.resolve({ error: { message: 'anonymous off' } });

    return tryAnon.then(function (res) {
      if (res && !res.error && res.data && res.data.session) return true;
      /* Throwaway mailbox the student never sees. Confirmations are off. */
      var email = 'pass.' + randomBits(10) + '@pass.learngeo.app';
      var password = randomBits(10) + randomBits(4);
      return C.signUp(email, password, name, 'student').then(function (out) {
        if (out && out.needsConfirm) {
          return C.signIn(email, password).then(function () { return true; });
        }
        return true;
      });
    }).then(function () {
      if (name && W.state && W.state.profile) {
        W.state.profile.displayName = name;
        W.saveNow();
      }
      return waitReady();
    });
  }

  /* -------------------- student redeem -------------------- */
  function lookup(pass) {
    var code = normalize(pass);
    var bad = shapeProblem(code);
    if (bad) return Promise.reject(new Error(bad[1]));
    return rpc('classroom_pass_lookup', { p_pass: code }).then(function (row) {
      if (!row || !row.id) throw new Error('No class has that passcode. Check the board.');
      return row;
    });
  }

  function redeem(pass, name, opts) {
    var code = normalize(pass);
    var nm = String(name || '').trim().slice(0, 40);
    var bad = shapeProblem(code);
    if (bad) return Promise.reject(new Error(bad[1]));
    if (!nm) return Promise.reject(new Error('Your teacher needs a name to put next to your work.'));

    return lookup(code).then(function (preview) {
      return ensureSession(nm).then(function () {
        return rpc('join_class_by_pass', { p_pass: code, p_name: nm }).then(function (klass) {
          var row = {
            at: Date.now(),
            pass: code,
            name: nm,
            classId: (klass && klass.id) || preview.id,
            classCode: (klass && klass.code) || preview.code,
            className: (klass && klass.name) || preview.name,
            via: 'classroom_pass'
          };
          saveLocal(row);
          if (global.Classes && global.Classes.addEnrolment) {
            global.Classes.addEnrolment({
              code: row.classCode,
              className: row.className,
              name: nm,
              classId: row.classId
            });
          } else if (W.state) {
            W.state.enrolled = {
              code: row.classCode,
              className: row.className,
              name: nm,
              classId: row.classId
            };
            W.saveNow();
          }
          emit();
          if (global.Cloud && global.Cloud.studentSync) {
            global.Cloud.studentSync().catch(function () {});
          }
          if (!(opts && opts.silentToast) && W.toast) {
            W.toast('You’re in',
              (row.className || 'Class') + ' · Games and Geo Live are ready',
              I().check || I().users, 4200);
          }
          return row;
        });
      });
    });
  }

  function leave() {
    clearLocal();
    emit();
  }

  /* -------------------- teacher mint -------------------- */
  function teacherPass(classId) {
    if (!classId) return Promise.resolve(null);
    return rpc('read_classroom_pass', { p_class_id: classId }).then(function (row) {
      return row && row.pass ? row : null;
    })['catch'](function (err) {
      /* Migration not applied yet — fail soft. */
      if (/PGRST202|could not find the function|does not exist/i.test(String((err && err.message) || err))) {
        return null;
      }
      throw err;
    });
  }

  function mint(classId) {
    if (!classId) return Promise.reject(new Error('Put your class online first.'));
    return rpc('set_classroom_pass', { p_class_id: classId });
  }

  function clear(classId) {
    if (!classId) return Promise.reject(new Error('Put your class online first.'));
    return rpc('clear_classroom_pass', { p_class_id: classId });
  }

  /* -------------------- UI: student join card -------------------- */
  function openJoinModal(opts) {
    opts = opts || {};
    var then = opts.then;
    var title = opts.title || 'Classroom passcode';
    var known = '';
    if (W.state && W.state.profile && W.state.profile.displayName &&
        W.state.profile.displayName !== 'Explorer') {
      known = W.state.profile.displayName;
    }
    var sess = session();
    if (sess && sess.name) known = sess.name;

    if (!(global.UI && global.UI.modal)) {
      return Promise.reject(new Error('UI is not ready'));
    }

    return new Promise(function (resolve) {
      var settled = false;
      function done(row) {
        if (settled) return;
        settled = true;
        resolve(row || null);
      }

      global.UI.modal({
        title: title,
        icon: I().users || '',
        body:
          '<p class="t-muted" style="margin:0 0 14px">Type the short passcode your teacher put on the board, and your name. No email needed.</p>' +
          '<div class="field">' +
            '<label class="field__label" for="cp-pass">Classroom passcode</label>' +
            '<input class="input mono join-code" id="cp-pass" maxlength="' + PASS_LEN + '" ' +
              'placeholder="AB34" autocomplete="off" spellcheck="false" ' +
              'inputmode="text" enterkeyhint="next">' +
            '<div class="field__hint">Four letters and numbers — shorter than the class code.</div>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="cp-name">Your name</label>' +
            '<input class="input" id="cp-name" maxlength="40" placeholder="First and last name" ' +
              'value="' + esc(known) + '" enterkeyhint="go">' +
          '</div>' +
          '<div id="cp-err"></div>',
        actions: [
          { label: 'Cancel', cls: 'btn--ghost', close: true,
            onClick: function () { done(null); } },
          { label: 'Join', cls: 'btn--accent', close: false,
            onClick: function (m, close) {
              submit(m, close);
              return false;
            } }
        ],
        onMount: function (m) {
          var passEl = W.$('#cp-pass', m);
          if (!passEl) return;
          passEl.addEventListener('input', function () {
            passEl.value = normalize(passEl.value);
          });
          W.$$('#cp-pass, #cp-name', m).forEach(function (el) {
            el.addEventListener('keydown', function (e) {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit(m, function () {
                  if (global.UI && global.UI.closeModals) global.UI.closeModals();
                });
              }
            });
          });
          setTimeout(function () { try { passEl.focus(); } catch (e) {} }, 30);
        },
        onClose: function () { done(null); }
      });

      function showErr(m, titleText, body) {
        var errEl = W.$('#cp-err', m);
        if (!errEl) return;
        errEl.innerHTML =
          '<div class="feedback feedback--wrong" style="margin:0 0 12px">' +
          (I().info || '') +
          '<div><b>' + esc(titleText) + '</b><p>' + esc(body) + '</p></div></div>';
      }

      function submit(m, close) {
        var passEl = W.$('#cp-pass', m);
        var nameEl = W.$('#cp-name', m);
        var goBtn = W.$('[data-act="1"]', m);
        var pass = normalize(passEl && passEl.value);
        var name = String((nameEl && nameEl.value) || '').trim();
        var bad = shapeProblem(pass);
        if (bad) { showErr(m, bad[0], bad[1]); return; }
        if (!name) { showErr(m, 'Name needed', 'Your teacher needs to know whose work this is.'); return; }
        if (goBtn) { goBtn.disabled = true; goBtn.textContent = 'Joining…'; }
        redeem(pass, name).then(function (row) {
          if (close) close();
          else if (global.UI && global.UI.closeModals) global.UI.closeModals();
          if (then) then(row);
          settled = true;
          resolve(row);
        }, function (err) {
          if (goBtn) { goBtn.disabled = false; goBtn.textContent = 'Join'; }
          showErr(m, 'Couldn’t join', friendly(err));
        });
      }
    });
  }

  /* -------------------- UI: teacher mount -------------------- */
  function mountTeacher(host, opts) {
    if (!host) return;
    opts = opts || {};
    var classId = opts.classId || '';
    var pass = null;
    var busy = false;

    function paint() {
      if (!classId) {
        host.innerHTML =
          '<div class="field"><label class="field__label">Classroom passcode</label>' +
          '<div class="field__hint">Put your class online first, then mint a short passcode for iPads.</div></div>';
        return;
      }
      host.innerHTML =
        '<div class="field cp-teacher">' +
          '<label class="field__label">Classroom passcode</label>' +
          (pass
            ? '<div class="code-chip code-chip--pass" title="Students type this on iPads">' +
                esc(pass) +
                '<button type="button" data-cp-copy title="Copy passcode">' +
                  (I().clip || 'Copy') + '</button></div>' +
              '<div class="field__hint">Students open Games or Geo Live, tap <b>Classroom passcode</b>, ' +
                'and type this plus their name — no email signup.</div>' +
              '<div class="cp-teacher__actions">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-cp-rotate>New passcode</button>' +
                '<button type="button" class="btn btn--ghost btn--sm" data-cp-clear>Turn off</button>' +
              '</div>'
            : '<div class="field__hint">Mint a short code for shared iPads. Faster than the six-character class code, and skips account signup.</div>' +
              '<button type="button" class="btn btn--accent btn--sm" data-cp-mint ' +
                (busy ? 'disabled' : '') + '>' + (busy ? 'Minting…' : 'Mint passcode') + '</button>') +
        '</div>';

      var copy = host.querySelector('[data-cp-copy]');
      if (copy) copy.addEventListener('click', function () {
        if (!pass) return;
        if (global.UI && global.UI.copyText) global.UI.copyText(pass);
        else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(pass)['catch'](function () {});
        }
        if (W.toast) W.toast('Passcode copied', pass, I().clip || I().check, 2800);
      });
      var mintBtn = host.querySelector('[data-cp-mint]');
      if (mintBtn) mintBtn.addEventListener('click', doMint);
      var rot = host.querySelector('[data-cp-rotate]');
      if (rot) rot.addEventListener('click', doMint);
      var clr = host.querySelector('[data-cp-clear]');
      if (clr) clr.addEventListener('click', doClear);
    }

    function doMint() {
      if (busy || !classId) return;
      busy = true; paint();
      mint(classId).then(function (row) {
        pass = row && row.pass ? row.pass : null;
        busy = false; paint();
        if (pass && W.toast) {
          W.toast('Classroom passcode', pass + ' — write it on the board', I().users, 5200);
        }
      }, function (err) {
        busy = false; paint();
        if (W.toast) W.toast('Couldn’t mint', friendly(err), I().info, 4200);
      });
    }

    function doClear() {
      if (busy || !classId) return;
      busy = true; paint();
      clear(classId).then(function () {
        pass = null; busy = false; paint();
        if (W.toast) W.toast('Passcode off', 'Students need the class code or a new passcode.', I().info, 3600);
      }, function (err) {
        busy = false; paint();
        if (W.toast) W.toast('Couldn’t clear', friendly(err), I().info, 4200);
      });
    }

    paint();
    if (classId) {
      teacherPass(classId).then(function (row) {
        pass = row && row.pass ? row.pass : null;
        paint();
      }, function () { /* soft */ });
    }

    return {
      refresh: function (id) {
        classId = id || classId;
        pass = null;
        paint();
        if (classId) {
          teacherPass(classId).then(function (row) {
            pass = row && row.pass ? row.pass : null;
            paint();
          }, function () {});
        }
      }
    };
  }

  /* Banner chip next to the class code. */
  function bannerHtml(pass) {
    if (!pass) return '';
    return '<button class="cr-banner__code cr-banner__code--pass" id="tm-passcode" ' +
      'type="button" title="Classroom passcode for iPads">' +
      '<span>iPad passcode</span><b>' + esc(pass) + '</b></button>';
  }

  global.ClassroomPass = {
    PASS_LEN: PASS_LEN,
    normalize: normalize,
    shapeProblem: shapeProblem,
    session: session,
    unlocked: unlocked,
    onChange: onChange,
    lookup: lookup,
    redeem: redeem,
    leave: leave,
    mint: mint,
    clear: clear,
    teacherPass: teacherPass,
    openJoinModal: openJoinModal,
    mountTeacher: mountTeacher,
    bannerHtml: bannerHtml,
    friendly: friendly
  };
})(window);
