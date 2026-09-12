# Round 3: the class leaderboard, an off switch, and better GeoLive

Owen asked for three things on 2026-09-12. Eight sessions: four building, four
testing. Read `GEOLIVE-SPEC.md` first if you have not; everything in it still
applies, especially the working rules at the end.

## 1. The class leaderboard ranks on LEVEL, never on gems

**This is the change, and it is not cosmetic.** Owen was explicit: based on
level, not gems.

`core.js` holds `economy: { diamonds: 150, xp: 0, level: 1 }`. Diamonds are
**spendable**: a student buys things in the shop with them. So a leaderboard
built on diamonds punishes a student for spending, and the top of the table is
whoever hoarded rather than whoever learned. Two students who did identical
work rank differently because one bought a hat.

XP only ever accumulates, and level is derived from it, so level measures work
done and cannot go backwards. `levelProgress()` is in `core.js` around line 241.

Rank on level, break ties on XP within the level. Show level prominently.
Do not show diamonds on this table at all.

The existing `leaderboard.js` computes a points figure from quiz percentages
plus a perfect-quiz bonus plus GeoLive points. That is closer to right than
gems, but it is still not what was asked for. Level leads.

## 2. A teacher can switch the feature off

Per class, and it must actually be off, not hidden.

Off means: no tab, no mount, **and no network call**. A feature that is
invisible but still reading rows is not off, and this project has already shipped
one thing that queried a table nobody could see.

Separate switches for GeoLive and for the leaderboard. A teacher who wants a
class quiz without a public ranking is a real case, and so is the reverse.

Default: decide and write down which, with a reason. A new switch that silently
turns something on for every existing class is its own kind of surprise.

## 3. GeoLive, better

Known gaps, all found this round and all real:

- A teacher asks for 20 questions and gets 12 with nothing saying so.
- `resolveCodes` is never called before a game starts, so a teacher who picks
  three countries can silently get a whole-world quiz.
- The lobby cannot tell invited from arrived, so it cannot honestly say who is
  in the room. Pending `joined_at` becoming nullable and set in `live_join`.
- No teacher control over question length, though `open()` takes one, clamped
  1000 to 300000.

Beyond that, use judgement, and prefer finishing what is half-done over adding
something new.

## Who is doing what

**Building:** oy-01 schema, oy-04 teacher screen and GeoLive, oy-06 polish,
oy-07 leaderboard.

**Testing:** oy-02, oy-03, oy-05, oy-10. Each tests something they did not
write. A tester's job is to find what is wrong, not to confirm what is right;
"this breaks when X" is worth more than a pass.

oy-09 is finishing the integration wiring carried over from round 2 and still
owns every existing file. oy-08 is on standby.

## The rules that held last round

Write only inside your own folder, at real paths. Run no git that writes. Only
oy-09 touches files that already exist. Nobody deploys and nobody promotes.

Anything you are told about another session's file, go and read the file. Three
summaries were wrong last round and one cost a full rewrite.

A check that only walks the happy path certifies nothing, and searching a file
for a name finds the name, not the rule.
