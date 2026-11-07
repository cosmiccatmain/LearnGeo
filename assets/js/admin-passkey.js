/* ------------------------------------------------------------------
   LearnGeo — WebAuthn passkey for admin unlock (LEA-82).

   Separate from assets/js/passkey.js (account Auth sign-in). This file
   only unlocks the admin panels. Enroll after UltraAdmin is already
   open; unlock runs navigator.credentials.get, then exchanges a
   device-bound secret for an admin_sessions token. The shared code
   (adminisbetter) remains the fallback everywhere.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var STORE_KEY = 'learngeo.adminPasskey.v1';
  var RP_NAME = 'LearnGeo Admin';

  function sb() { return (global.Cloud && global.Cloud.sb) || null; }
  function uid() { return (global.Cloud && global.Cloud.user && global.Cloud.user.id) || ''; }
  function ops() { return global.AdminOps || null; }

  function supported() {
    return !!(global.PublicKeyCredential &&
      navigator.credentials &&
      typeof navigator.credentials.create === 'function' &&
      typeof navigator.credentials.get === 'function');
  }

  function b64url(buf) {
    var bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf)
      : (buf && buf.buffer instanceof ArrayBuffer) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      : new Uint8Array(buf || []);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromB64url(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function randomBytes(n) {
    var a = new Uint8Array(n);
    if (!global.crypto || !global.crypto.getRandomValues) return null;
    global.crypto.getRandomValues(a);
    return a;
  }

  function randomSecret() {
    var a = randomBytes(32);
    return a ? b64url(a.buffer) : '';
  }

  function rpId() {
    try {
      var h = String(location.hostname || '');
      if (!h || h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
      return h;
    } catch (e) { return null; }
  }

  function readStore() {
    try {
      var d = JSON.parse(global.localStorage.getItem(STORE_KEY) || 'null');
      if (!d || typeof d !== 'object') return { accounts: {} };
      if (!d.accounts || typeof d.accounts !== 'object') d.accounts = {};
      return d;
    } catch (e) { return { accounts: {} }; }
  }

  function writeStore(d) {
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(d)); return true; }
    catch (e) { return false; }
  }

  function localRecord() {
    var id = uid();
    if (!id) return null;
    var rec = readStore().accounts[id];
    if (!rec || typeof rec.credentialId !== 'string' || typeof rec.secret !== 'string') return null;
    if (rec.credentialId.length < 16 || rec.secret.length < 32) return null;
    return rec;
  }

  function hasLocal() { return !!localRecord(); }

  function saveLocal(credentialId, secret) {
    var id = uid();
    if (!id) return false;
    var d = readStore();
    d.accounts[id] = {
      credentialId: credentialId,
      secret: secret,
      at: Date.now()
    };
    return writeStore(d);
  }

  function clearLocal() {
    var id = uid();
    if (!id) return;
    var d = readStore();
    delete d.accounts[id];
    writeStore(d);
  }

  function deviceId() {
    var O = ops();
    if (!O) return null;
    /* Reuse the Private Password device id so enroll and unlock share one device row. */
    try {
      var raw = global.localStorage.getItem('learngeo.adminDevice.v1');
      var d = raw ? JSON.parse(raw) : null;
      if (d && typeof d.id === 'string' && /^[0-9a-f]{64}$/.test(d.id)) return d.id;
    } catch (e) { /* fall through */ }
    if (typeof O.ensureDevice === 'function') return O.ensureDevice();
    /* Create the same shape admin-ops uses. */
    if (!global.crypto || !global.crypto.getRandomValues) return null;
    var bytes = new Uint8Array(32);
    global.crypto.getRandomValues(bytes);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
    var payload = { id: hex, accounts: {} };
    try { global.localStorage.setItem('learngeo.adminDevice.v1', JSON.stringify(payload)); }
    catch (e2) { return null; }
    return hex;
  }

  function problem(err) {
    var name = (err && err.name) || '';
    var msg = (err && err.message) || '';
    if (name === 'NotAllowedError' || name === 'AbortError' ||
        /not allowed|cancell?ed|aborted|timed out/i.test(msg)) return null;
    if (name === 'SecurityError' || /relying party|rp id|origin/i.test(msg)) {
      return 'Passkeys only work on the real site address, not on this one.';
    }
    if (name === 'InvalidStateError') return 'This device already has an admin passkey.';
    if (name === 'NotSupportedError') return 'This device cannot make a passkey.';
    return msg || 'The passkey did not work. Use the code instead.';
  }

  function createCredential() {
    var rid = rpId();
    if (!rid) return Promise.reject(new Error('Passkeys only work on the real site address, not on this one.'));
    var challenge = randomBytes(32);
    var userId = randomBytes(16);
    if (!challenge || !userId) return Promise.reject(new Error('This browser cannot make a passkey.'));
    var email = (global.Cloud && global.Cloud.user && global.Cloud.user.email) || 'admin';

    return navigator.credentials.create({
      publicKey: {
        challenge: challenge.buffer,
        rp: { name: RP_NAME, id: rid },
        user: {
          id: userId.buffer,
          name: email,
          displayName: 'LearnGeo admin'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    }).then(function (cred) {
      if (!cred || !cred.rawId) throw new Error('No passkey was created.');
      return b64url(cred.rawId);
    });
  }

  function assertCredential(credentialId) {
    var rid = rpId();
    if (!rid) return Promise.reject(new Error('Passkeys only work on the real site address, not on this one.'));
    var challenge = randomBytes(32);
    if (!challenge) return Promise.reject(new Error('This browser cannot use a passkey.'));
    return navigator.credentials.get({
      publicKey: {
        challenge: challenge.buffer,
        rpId: rid,
        allowCredentials: [{
          type: 'public-key',
          id: fromB64url(credentialId)
        }],
        userVerification: 'required',
        timeout: 60000
      }
    }).then(function (cred) {
      if (!cred) throw new Error('No passkey was used.');
      return true;
    });
  }

  function enroll() {
    var O = ops();
    if (!supported()) return Promise.resolve({ ok: false, message: 'This device cannot make a passkey.' });
    if (!O || !O.live || !O.live()) {
      return Promise.resolve({ ok: false, message: 'Open UltraAdmin with the code first, then set up a passkey.' });
    }
    var device = deviceId();
    if (!device) return Promise.resolve({ ok: false, message: 'This browser will not store a device id.' });

    return createCredential().then(function (credentialId) {
      var secret = randomSecret();
      if (!secret || secret.length < 32) {
        return { ok: false, message: 'Could not make an unlock secret.' };
      }
      return O.enrollPasskey(device, credentialId, secret).then(function (r) {
        if (!r || !r.ok) {
          return {
            ok: false,
            kind: r && r.kind,
            message: (r && r.message) || 'The server refused the passkey.'
          };
        }
        if (!saveLocal(credentialId, secret)) {
          return { ok: false, message: 'Saved on the server, but this browser blocked local storage.' };
        }
        return { ok: true };
      });
    }).catch(function (err) {
      var why = problem(err);
      if (why === null) return { ok: false, kind: 'cancelled', message: '' };
      return { ok: false, message: why };
    });
  }

  function remove() {
    var O = ops();
    if (!O || !O.live || !O.live()) {
      clearLocal();
      return Promise.resolve({ ok: false, message: 'Open UltraAdmin first to remove the server copy.' });
    }
    var device = deviceId();
    if (!device) {
      clearLocal();
      return Promise.resolve({ ok: true });
    }
    return O.removePasskey(device).then(function (r) {
      clearLocal();
      if (!r || !r.ok) {
        return {
          ok: false,
          kind: r && r.kind,
          message: (r && r.message) || 'Could not remove the passkey.'
        };
      }
      return { ok: true };
    });
  }

  /* Unlock UltraAdmin via passkey. Answers {ok, scope} or a fault. */
  function unlock() {
    if (!supported()) {
      return Promise.resolve({ ok: false, message: 'This device cannot use a passkey.' });
    }
    var rec = localRecord();
    if (!rec) {
      return Promise.resolve({ ok: false, message: 'No admin passkey on this device. Use the code, then set one up.' });
    }
    var O = ops();
    if (!O || !O.openPasskey) {
      return Promise.resolve({ ok: false, message: 'admin-ops.js did not load.' });
    }
    var device = deviceId();
    if (!device) {
      return Promise.resolve({ ok: false, message: 'This browser will not store a device id.' });
    }

    return assertCredential(rec.credentialId).then(function () {
      return O.openPasskey(device, rec.credentialId, rec.secret);
    }).then(function (r) {
      if (r && r.ok) return { ok: true, scope: 'ultra' };
      return {
        ok: false,
        kind: r && r.kind,
        message: (r && r.message) || 'Passkey unlock failed. Use the code.'
      };
    }).catch(function (err) {
      var why = problem(err);
      if (why === null) return { ok: false, kind: 'cancelled', message: '' };
      return { ok: false, message: why };
    });
  }

  global.AdminPasskey = {
    supported: supported,
    hasLocal: hasLocal,
    enroll: enroll,
    remove: remove,
    unlock: unlock,
    CODE: 'adminisbetter'
  };
})(window);
