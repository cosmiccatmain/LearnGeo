/* ------------------------------------------------------------------
   LearnGeo — voluntary screen sharing.

   A signed-in person clicks Share screen, reads a short consent line,
   and Chrome's own picker runs (getDisplayMedia). Nothing is captured
   before that click, and Stop sharing leaves the Daily room.

   The first time they enter the app in a browser session, the same
   explanation is offered once. Not now leaves the top-bar button.

   This is not activity.js. That file reports the name of the view
   (Learn, Games, …). This one sends a live picture of a window the
   person picked, and only while they leave it on.

   The browser receives a Daily meeting token from the Edge Function.
   It never receives the Daily API key, and it never calls Daily's
   REST API itself. Watching (the owner) is a second join of the same
   room and does not delete it.
------------------------------------------------------------------- */
(function (global) {
  'use strict';
  var W = global.WW;

  var DAILY_SRC = 'https://unpkg.com/@daily-co/daily-js@0.94.0/dist/daily.js';
  var HEARTBEAT = 30000;

  var dailyLoad = null;
  var publisher = null;
  var roomName = '';
  var accessToken = '';
  var live = false;
  var busy = false;
  var asking = false;
  var closing = false;
  var beat = null;

  var viewer = null;
  var viewerRoom = '';
  var watchGen = 0;

  var CONSENT =
    '<p>The site owner can see the window or tab you pick, and only while sharing stays on. ' +
    'LearnGeo does not save a video of it. Your camera and microphone stay off. ' +
    'The browser shows its own sharing light. You can stop anytime.</p>' +
    '<p>Choose a browser tab if you can, on Chrome or Edge on a computer. ' +
    'Sharing a whole screen can show other tabs, email, or your home screen. Leave those out.</p>' +
    '<p class="t-sm t-muted">This is voluntary. Nothing is captured unless you click Share screen. ' +
    'Screen monitoring also lists which LearnGeo page you are on. That list is not this picture. ' +
    'A child needs a parent or a school to agree before sharing. ' +
    '<a href="/terms.html#screen">Screen terms</a>.</p>';

  /* Once per tab. Refresh keeps it; a new tab asks again. */
  var PROMPT_KEY = 'lg-share-prompt';
  var promptWait = null;
  var promptedMem = false;

  function signed() {
    return !!(global.Cloud && global.Cloud.signedIn && global.Cloud.sb);
  }

  function ownRoom() {
    var id = global.Cloud && global.Cloud.user && global.Cloud.user.id;
    if (!id) return '';
    return 'lg-u-' + String(id).toLowerCase();
  }

  function desktopShare() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return false;
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
  }

  function toast(title, msg) {
    if (W && W.toast) W.toast(title, msg || '', (W.Icons && W.Icons.info) || '', 4600);
  }

  function paint() {
    if (!signed() && (live || publisher)) { stop(); return; }
    var btn = document.getElementById('share-screen');
    var bar = document.getElementById('share-bar');
    if (btn) {
      btn.classList.toggle('hidden', !signed() || live);
      btn.disabled = !!busy;
      var long = btn.querySelector('.share-btn__long');
      var short = btn.querySelector('.share-btn__short');
      if (long) long.textContent = busy ? 'Starting…' : 'Share screen';
      if (short) short.textContent = busy ? '…' : 'Share';
    }
    if (bar) bar.classList.toggle('hidden', !live);
  }

  function loadDaily() {
    var existing = global.DailyIframe || global.Daily;
    if (existing && typeof existing.createCallObject === 'function') {
      return Promise.resolve(existing);
    }
    if (dailyLoad) return dailyLoad;
    dailyLoad = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = DAILY_SRC;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function () {
        var lib = global.DailyIframe || global.Daily;
        if (lib && typeof lib.createCallObject === 'function') resolve(lib);
        else reject(new Error('Screen sharing loaded, but the call library was missing.'));
      };
      s.onerror = function () {
        dailyLoad = null;
        reject(new Error('Could not load screen sharing. Allow unpkg.com and daily.co, then try again.'));
      };
      document.head.appendChild(s);
    });
    return dailyLoad;
  }

  /* The meeting link has to be a Daily room for this student. A token
     response that points anywhere else is refused before join(). */
  function trusted(data) {
    if (!data || typeof data.token !== 'string' || typeof data.roomUrl !== 'string') return false;
    if (typeof data.roomName !== 'string') return false;
    if (!/^lg-u-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.roomName)) return false;
    if (data.token.length < 20 || data.token.length > 8000 || /\s/.test(data.token)) return false;
    var url;
    try { url = new URL(data.roomUrl); } catch (e) { return false; }
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password || url.port || url.search || url.hash) return false;
    if (!/\.daily\.co$/i.test(url.hostname)) return false;
    var path = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    return path === data.roomName;
  }

  function readFnError(error) {
    var ctx = error && error.context;
    if (ctx && typeof ctx.json === 'function') {
      return ctx.json().then(function (body) {
        return (body && body.error) || (error && error.message) || 'The server refused that.';
      }, function () {
        return (error && error.message) || 'The server refused that.';
      });
    }
    if (ctx && typeof ctx === 'object' && ctx.error) {
      return Promise.resolve(String(ctx.error));
    }
    return Promise.resolve((error && error.message) || 'The server refused that.');
  }

  function invoke(name, body) {
    var sb = global.Cloud && global.Cloud.sb;
    if (!sb || !sb.functions || !sb.functions.invoke) {
      return Promise.resolve({ ok: false, message: 'Sign in again and retry.' });
    }
    return sb.functions.invoke(name, { body: body || {} }).then(function (res) {
      if (!res || res.error) return readFnError(res && res.error).then(function (msg) {
        return { ok: false, message: msg };
      });
      return { ok: true, data: res.data };
    }, function (e) {
      return { ok: false, message: String((e && e.message) || e) };
    });
  }

  function rememberSession() {
    var sb = global.Cloud && global.Cloud.sb;
    if (!sb || !sb.auth || !sb.auth.getSession) return;
    sb.auth.getSession().then(function (res) {
      var token = res && res.data && res.data.session && res.data.session.access_token;
      if (token) accessToken = token;
    }, function () {});
  }

  function reportStatus(status, room) {
    var sb = global.Cloud && global.Cloud.sb;
    if (!sb || !room) return Promise.resolve();
    return sb.rpc('report_screen_share', { p_status: status, p_room_name: room }).then(function (res) {
      if (res && res.error && live && status === 'live' && res.error.code === '42501') stop();
    }, function () {});
  }

  function keepaliveStop(room) {
    var sb = global.Cloud && global.Cloud.sb;
    if (!sb || !room || !accessToken || !sb.supabaseUrl || !sb.supabaseKey) return;
    var base = String(sb.supabaseUrl).replace(/\/$/, '');
    var headers = {
      apikey: sb.supabaseKey,
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    };
    try {
      fetch(base + '/rest/v1/rpc/report_screen_share', {
        method: 'POST', keepalive: true, headers: headers,
        body: JSON.stringify({ p_status: 'stopped', p_room_name: room })
      });
      fetch(base + '/functions/v1/daily-share-stop', {
        method: 'POST', keepalive: true, headers: headers,
        body: JSON.stringify({ room_name: room })
      });
    } catch (e) { /* the tab is going away */ }
  }

  function armHeartbeat() {
    disarmHeartbeat();
    beat = global.setInterval(function () {
      if (live && roomName) {
        rememberSession();
        reportStatus('live', roomName);
      }
    }, HEARTBEAT);
  }

  function disarmHeartbeat() {
    if (beat) global.clearInterval(beat);
    beat = null;
  }

  function leaveCall(call) {
    return Promise.resolve().then(function () {
      try {
        var local = call.participants && call.participants().local;
        if (local && local.screen && call.stopScreenShare) return call.stopScreenShare();
      } catch (e) { /* already gone */ }
    }).catch(function () {}).then(function () {
      return call.leave();
    }).catch(function () {}).then(function () {
      try { call.destroy(); } catch (e) { /* already destroyed */ }
    });
  }

  function startShare(call) {
    var withExclude = {
      displayMediaOptions: { video: true, audio: false, selfBrowserSurface: 'exclude' }
    };
    return call.startScreenShare(withExclude).catch(function (err) {
      var name = err && err.name;
      if (name === 'NotAllowedError' || name === 'AbortError') throw err;
      return call.startScreenShare({ displayMediaOptions: { video: true, audio: false } });
    });
  }

  function cancelled(err) {
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'AbortError') return true;
    return /cancel|permission|dismiss|denied/i.test(String(err && err.message || ''));
  }

  function abortJoin(message) {
    closing = true;
    live = false;
    busy = false;
    disarmHeartbeat();
    var room = roomName;
    var call = publisher;
    publisher = null;
    roomName = '';
    paint();
    return (call ? leaveCall(call) : Promise.resolve()).then(function () {
      if (room) {
        reportStatus('stopped', room);
        invoke('daily-share-stop', { room_name: room });
      }
      closing = false;
      paint();
      if (message) toast('Screen share', message);
    });
  }

  function begin() {
    if (busy || live) return;
    busy = true;
    paint();
    invoke('daily-share-token', { role: 'publisher' }).then(function (res) {
      if (!res.ok) {
        busy = false;
        paint();
        toast('Screen share', res.message || 'Could not start sharing.');
        return;
      }
      if (!trusted(res.data)) {
        var mine = ownRoom();
        if (mine) {
          reportStatus('stopped', mine);
          invoke('daily-share-stop', { room_name: mine });
        }
        busy = false;
        paint();
        toast('Screen share', 'The meeting link was not a Daily room for your account.');
        return;
      }
      roomName = res.data.roomName;
      return loadDaily().then(function (Daily) {
        var call = Daily.createCallObject({
          audioSource: false,
          videoSource: false,
          subscribeToTracksAutomatically: false
        });
        publisher = call;
        call.on('local-screen-share-stopped', function () { if (!closing) stop(); });
        call.on('left-meeting', function () { if (!closing && live) stop(); });
        return call.join({
          url: res.data.roomUrl,
          token: res.data.token,
          subscribeToTracksAutomatically: false
        }).then(function () {
          return startShare(call);
        }).then(function () {
          live = true;
          busy = false;
          rememberSession();
          reportStatus('live', roomName);
          armHeartbeat();
          paint();
        }, function (err) {
          return abortJoin(cancelled(err)
            ? 'Sharing cancelled. Nothing was sent.'
            : 'Could not share that screen. Use Chrome or Edge on a computer.');
        });
      });
    }).catch(function (err) {
      abortJoin((err && err.message) || 'Could not start sharing.');
    });
  }

  function promptSeen() {
    if (promptedMem) return true;
    try { return sessionStorage.getItem(PROMPT_KEY) === '1'; }
    catch (e) { return false; }
  }

  function markPrompt() {
    promptedMem = true;
    try { sessionStorage.setItem(PROMPT_KEY, '1'); }
    catch (e) { /* still only once while this page stays open */ }
  }

  function appIsOpen() {
    var app = document.getElementById('app');
    return !!(app && app.classList.contains('is-open'));
  }

  function ask() {
    if (asking || busy || live) return;
    if (!signed()) {
      toast('Sign in', 'Sign in to share your screen. Guests are not watched.');
      return;
    }
    if (!desktopShare()) {
      toast('Use a computer', 'Screen sharing needs Chrome or Edge on a computer. This phone or browser cannot share a tab.');
      return;
    }
    markPrompt();
    asking = true;
    if (!global.UI || !global.UI.modal) {
      var ok = global.confirm(
        'Share your screen?\n\nThe site owner can see the window or tab you pick, only while sharing stays on. ' +
        'LearnGeo does not save a video. You can stop anytime. Choose a browser tab if you can. ' +
        'A child needs a parent or school to agree first. The full rules are at /terms.html#screen.'
      );
      asking = false;
      if (ok) begin();
      return;
    }
    var decided = false;
    global.UI.modal({
      title: 'Share your screen',
      body: CONSENT,
      onClose: function () { if (!decided) asking = false; },
      actions: [
        { label: 'Not now', cls: 'btn--ghost', close: true },
        { label: 'Share screen', cls: 'btn--primary', close: true, onClick: function () {
          decided = true;
          asking = false;
          begin();
        } }
      ]
    });
  }

  /* After sign-in, once per browser session, while the app is open.
     The dialog is the consent step, so Share screen goes straight to
     begin() and Chrome's picker. Not now does not start a share.
     Guests and phones are skipped; the top-bar button stays. */
  function offer() {
    if (promptSeen() || asking || busy || live || promptWait) return;
    if (!signed() || !appIsOpen() || !desktopShare()) return;
    if (!global.UI || !global.UI.modal) return;
    if (document.querySelector('.overlay, .lg-update-overlay')) {
      promptWait = global.setInterval(function () {
        if (promptSeen() || !signed() || !appIsOpen()) {
          global.clearInterval(promptWait);
          promptWait = null;
          return;
        }
        if (document.querySelector('.overlay, .lg-update-overlay')) return;
        global.clearInterval(promptWait);
        promptWait = null;
        offer();
      }, 350);
      return;
    }
    markPrompt();
    asking = true;
    var decided = false;
    global.UI.modal({
      title: 'Share your screen?',
      body: CONSENT,
      onClose: function () { if (!decided) asking = false; },
      actions: [
        { label: 'Not now', cls: 'btn--ghost', close: true },
        { label: 'Share screen', cls: 'btn--primary', close: true, onClick: function () {
          decided = true;
          asking = false;
          begin();
        } }
      ]
    });
  }

  function stop() {
    if (closing) return;
    if (!live && !publisher) return;
    closing = true;
    live = false;
    busy = false;
    disarmHeartbeat();
    var room = roomName;
    var call = publisher;
    publisher = null;
    roomName = '';
    paint();
    (call ? leaveCall(call) : Promise.resolve()).then(function () {
      if (room) {
        reportStatus('stopped', room);
        invoke('daily-share-stop', { room_name: room });
      }
      closing = false;
      paint();
    });
  }

  /* ---- owner watch: one tile, subscribe only ---------------------- */

  function setStatus(msg) {
    var el = document.getElementById('ap-watch-status');
    if (el) el.textContent = msg || '';
  }

  function attachTrack(track) {
    var video = document.getElementById('ap-watch-video');
    if (!video || !track) return;
    var stream = video.srcObject instanceof MediaStream ? video.srcObject : new MediaStream();
    stream.getVideoTracks().forEach(function (t) {
      if (t !== track) stream.removeTrack(t);
    });
    if (stream.getVideoTracks().indexOf(track) < 0) stream.addTrack(track);
    if (video.srcObject !== stream) video.srcObject = stream;
    video.muted = true;
    var play = video.play && video.play();
    if (play && play.catch) play.catch(function () {});
  }

  function attach() {
    if (!viewer || !viewer.participants) return;
    var parts = viewer.participants() || {};
    Object.keys(parts).forEach(function (id) {
      var p = parts[id];
      if (!p || p.local) return;
      var slot = p.tracks && p.tracks.screenVideo;
      var track = slot && (slot.persistentTrack || slot.track);
      if (track && track.readyState === 'live') {
        attachTrack(track);
        setStatus('Live');
      }
    });
  }

  function bindViewer(call) {
    call.on('track-started', function (ev) {
      if (!ev || ev.type !== 'screenVideo' || !ev.track) return;
      if (ev.participant && ev.participant.local) return;
      attachTrack(ev.track);
      setStatus('Live');
    });
    call.on('track-stopped', function (ev) {
      if (!ev || ev.type !== 'screenVideo') return;
      if (ev.participant && ev.participant.local) return;
      setStatus('They stopped sharing.');
    });
    call.on('participant-left', function (ev) {
      if (ev && ev.participant && !ev.participant.local) setStatus('They left the room.');
    });
  }

  /* Leaves this browser's participant. Does not delete the student's room. */
  function stopWatch() {
    watchGen++;
    var call = viewer;
    viewer = null;
    viewerRoom = '';
    if (!call) return Promise.resolve();
    return leaveCall(call);
  }

  function watch(room) {
    return stopWatch().then(function () {
      var gen = watchGen;
      var ops = global.AdminOps;
      if (!ops || !ops.viewerToken) {
        return { ok: false, message: 'admin-ops.js did not load.' };
      }
      setStatus('Joining…');
      return ops.viewerToken(room).then(function (res) {
        if (gen !== watchGen) return { ok: false, message: 'Stopped.' };
        if (!res || !res.ok) {
          setStatus((res && res.message) || 'Could not join that share.');
          return res || { ok: false, message: 'Could not join that share.' };
        }
        if (!trusted(res.data)) {
          setStatus('The meeting link was not a Daily room for that student.');
          return { ok: false, message: 'The meeting link was not a Daily room for that student.' };
        }
        return loadDaily().then(function (Daily) {
          if (gen !== watchGen) return { ok: false, message: 'Stopped.' };
          var call = Daily.createCallObject({
            audioSource: false,
            videoSource: false
          });
          viewer = call;
          viewerRoom = res.data.roomName;
          bindViewer(call);
          return call.join({
            url: res.data.roomUrl,
            token: res.data.token,
            subscribeToTracksAutomatically: true
          }).then(function () {
            if (gen !== watchGen) {
              return leaveCall(call).then(function () {
                return { ok: false, message: 'Stopped.' };
              });
            }
            setStatus('Waiting for their screen…');
            attach();
            return { ok: true };
          }, function () {
            viewer = null;
            viewerRoom = '';
            return leaveCall(call).then(function () {
              setStatus('Could not join that share.');
              return { ok: false, message: 'Could not join that share.' };
            });
          });
        });
      });
    });
  }

  function mount() {
    var btn = document.getElementById('share-screen');
    var stopBtn = document.getElementById('share-stop');
    if (btn) btn.addEventListener('click', ask);
    if (stopBtn) stopBtn.addEventListener('click', stop);
    paint();
    if (global.Cloud && global.Cloud.onChange) {
      global.Cloud.onChange(function () { paint(); offer(); });
    }
    global.addEventListener('pagehide', function () {
      if (live && roomName) keepaliveStop(roomName);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else mount();

  global.ScreenShare = {
    ask: ask,
    offer: offer,
    stop: stop,
    watch: watch,
    stopWatch: stopWatch,
    attach: attach,
    sharing: function () { return live; },
    watching: function () { return viewerRoom; }
  };
})(window);
