# NOTES for LearnGeo 1 OY

## Built on

Commit: ade3a48 (my two commits were made on it). The working copy I copied
from is at local HEAD ade3a48, and origin/main has since moved to 43b5d2d.

## What I changed

- You can sign in with a passkey instead of a password: fingerprint, face or
  screen lock, with no email to type. The password form is still there below it.
- Every password box has an eye button to show what you typed: sign in, create
  an account, and the set-a-new-password dialog.
- Passkeys can be added and removed from the profile menu and from Settings,
  and anyone who signs in with a password is offered one, once.

## Files in this folder

- `index.html` (NOT my version, see the warning below)
- `assets/js/passkey.js` (all of the above lives here)
- `assets/css/auth.css` (styles for the eye button, the passkey button, the list)

Both of my files are byte-identical to origin/main. They are already landed as
7c959af and 2ffe134, so there is nothing here to merge, only something to keep.

Two changes of mine are NOT in this folder as files:

1. `index.html` needs these two lines, already on main:
   `<link rel="stylesheet" href="assets/css/auth.css">`
   `<script src="assets/js/passkey.js"></script>`
2. `assets/js/cloud.js` needs the passkey API turned on and the client shared:
   in `createClient`, the auth options gain `experimental: { passkey: true }`,
   and the exported object gains `get sb() { return client(); }`.
   I did not copy cloud.js in, on purpose: the working copy of that file holds
   173 added lines of another session's unfinished work, and dropping it here
   would hand you their half-done code under my name. Take cloud.js from
   origin/main or from whoever owns those lines, then check my two bits survive.

## Status

Status: complete. Everything above is committed on main and tested. Nothing of
mine is half-done, and nothing of mine is uncommitted.

## Do not overwrite

- The relying party for passkeys is set on the Supabase project to
  **www.learngeo.app**. Passkey sign-in therefore only works on that exact
  domain. It cannot work on localhost, on a Vercel preview URL, or on
  learngeo.app without the www. This is not a bug and must not be "fixed" by
  loosening anything in the code: the domain lives in Supabase, not in the
  repo. Changing the relying party ID in Supabase invalidates every passkey
  anyone has already created. If it looks broken while testing, check the
  address bar first. passkey.js already catches that exact refusal and shows
  "Passkeys only work on the real site address, not on this one."
- supabase-js returns passkey failures in `res.error` instead of throwing.
  Both paths are handled in passkey.js on purpose. Collapsing that back into a
  single `.then(ok, fail)` silently swallows every failure, which is a bug I
  already fixed once (2ffe134).
- The `unhandledrejection` guard in passkey.js only swallows a SecurityError
  whose message mentions RP ID. Leave it narrow.

## Warning about the index.html in this folder

It is a copy of the shared working copy, not a version of mine, and it is DIFFERENT from origin/main.
Local HEAD is ade3a48 while origin/main is 43b5d2d, so treating this file as the newest
would reintroduce exactly the stale-index.html problem Owen reported. Take
index.html from origin/main and make sure the two lines listed above are in it.
