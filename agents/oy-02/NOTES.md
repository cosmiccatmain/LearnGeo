# NOTES for LearnGeo 2 OY

## Built on

Commit: ade3a48 (local HEAD when I copied these files)

origin/main has since moved to 43b5d2d, the rings merge. Nothing I did
conflicts with it: all three of my changes are already ancestors of main.

## What I changed

- Buttons, cards and screens animate. Buttons have a soft gloss, a light
  that sweeps across on hover, a springy press and a ripple where you click.
  Cards lift and pick up a light that follows the cursor. Screens, reports,
  dialogs and the profile menu fade in and out instead of snapping, and the
  landing page sections appear as you scroll. Landed as c74333a.
- The admin keypad accepts extra codes that are not written in the page.
  The typed digits go to Supabase, which answers yes or no, and the codes
  are stored hashed in a table the publishable key cannot read. Landed as
  3c880bc.
- The shop no longer charges you more than once for the same item and no
  longer locks the page up. Landed as dd1c0a7.

## Files in this folder

- `index.html`
- `assets/css/motion.css`
- `assets/js/motion.js`
- `assets/js/ui.js`
- `assets/js/admin-pin.js`
- `assets/js/admin.js`

Read this before merging any of them. These are working copies, so four of
them carry other sessions' uncommitted edits mixed in with mine:

- `index.html` is NOT my own version. It is the shared working copy, and it
  differs from origin/main by two reworded demo lines that belong to another
  session. My only claim on this file is two script/stylesheet lines that are
  already on main (`motion.css`, `motion.js`, `admin-pin.js`).
- `assets/js/ui.js` is mine as committed, plus 35 added and 3 removed
  uncommitted lines from another session.
- `assets/js/admin.js` has 32 added and 20 removed uncommitted lines from
  another session (LearnGeo 3 is removing the built-in 1357 fallback).
- `assets/js/admin-pin.js` has 7 added and 5 removed uncommitted lines from
  LearnGeo 3, changing verify() to return null instead of false when Supabase
  cannot be reached.
- `assets/css/motion.css` and `assets/js/motion.js` are clean. They match what
  is committed, with no one else's edits in them.

## Status

Status: Complete. All three of my changes are committed and on origin/main
(c74333a, 3c880bc, dd1c0a7) and each was tested in a browser before it was
pushed. Nothing of mine is half-done and nothing of mine is sitting
uncommitted.

The caveat is not my work but the copies above: the uncommitted edits by other
sessions inside `ui.js`, `admin.js` and `admin-pin.js` are their business to
declare, and I cannot vouch for whether those are finished.

## Do not overwrite

- **The shop fix in `assets/js/ui.js` (dd1c0a7).** Two parts, both required:
  `function wireShop(root, scope)` taking a second argument, and the call
  `wireShop(root, next)` inside `equip()`. Also the owned check at the top of
  the Unlock button's handler.
  What goes wrong if it is dropped: all six shop tabs are built at once, and
  the old code re-attached a click handler to every item in every tab each
  time you equipped or bought anything. Items in the other tabs collected a
  duplicate handler every time, so one click later ran the handler once per
  copy. Measured on the old code: three equips, then one click on a 300
  diamond item opened 4 confirm dialogs, charged 1,200 diamonds and saved the
  item into the player's collection 4 times. It compounds as you keep
  shopping until the page locks up. Production is serving a build without this
  fix right now, so that is what it looks like when it goes missing.
  Careful with the second argument. Passing the rebuilt panel as `root`
  instead of as `scope` looks like it works, but the tab then stops refreshing
  after a purchase and the balance and live preview go stale. I hit exactly
  that and caught it in testing.
  As of this writing one cloud branch differs from main in `ui.js`
  (`claude/happy-keller-qnk71y`). Diff that one against main before merging.

- **`assets/js/admin-pin.js` and the Supabase check in `admin.js`.** Do not
  "simplify" this back into a code written in the page. The codes live hashed
  in the `admin_pins` table, which has row level security on with no policies,
  so the publishable key cannot read them. Only the `verify_admin_pin`
  function can, and it answers yes or no. The repo and the site are public, so
  any code put back into a file is public too.

- **`assets/css/motion.css` and `assets/js/motion.js`.** Self-contained. They
  only use class names app.css already defines, and nothing else imports them,
  so they merge cleanly as whole files. If both are dropped the site still
  works and just loses the animations, so they are the safest thing here to
  take wholesale from my folder.

- **The `pre-push` hook**, at `repo/.git/hooks/pre-push`. Before any push it
  fetches and refuses if the commit was built on an older copy, listing what
  is missing. Its limit: it only guards pushes made from this folder. The five
  `claude/*` cloud branches push from elsewhere and go straight around it, so
  they still have to merge main themselves before they land. It also cannot
  help with what is deployed, since the live site only changes when someone
  deploys in Vercel.
