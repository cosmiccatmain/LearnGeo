# tools, from oy-05

**NOT PART OF THE MERGE.** Nothing in this folder belongs at the top of the
repo. It is a dev harness, not app code. Organizer: skip this folder.

Master asked me to pass the class audit to oy-06 and oy-10.

## What the class audit does

`classcheck.js` renders a screen module through **every** phase, collects every
class name it can emit, and checks each one against the stylesheets you give
it. It is the check that catches a screen rendering unstyled because two
sessions picked different names for the same thing, which is a bug that looks
like broken CSS and costs hours to find.

```bash
node classcheck.js ../assets/js/geolive-student.js ../../oy-06/assets/css/geolive.css /path/to/app.css
```

`LIST=1` in front prints every class it found, grouped by prefix.

Exit code is 1 when something is unstyled, so it works in a check script.

## Two holes it had, both worth knowing

1. **It matched class names inside CSS comments.** A heavily commented
   stylesheet that merely *discusses* `.gl-foo` made `.gl-foo` count as
   styled. It strips comments before matching now. This is what caught
   `.gl-question__prompt` being removed.
2. **It only rendered the happy path.** A class that appears solely in an
   error state was never emitted, so it was never checked. It now drives a
   failed join and a late tap as well. This is what caught `.gl-alert`.

If you adapt it for oy-04's teacher screen, keep both fixes. They are the
only reason it found anything.

## The rest

`dom.js` is a small fake DOM: innerHTML parsing, querySelector by class, id,
tag or attribute, classList, and event bubbling. Enough to drive a screen
module under node with no browser and no install.

`test.js` is oy-05's own behaviour suite, 89 checks. Useful to oy-10 as a
worked example of driving a screen with stubbed `GeoLive` and `GeoLiveCloud`:
the snapshot shapes in it match oy-03's real ones.

```bash
node test.js ../assets/js/geolive-student.js
```
