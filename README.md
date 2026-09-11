# LearnGeo

LearnGeo is a geography study app for learning the world's countries, their capitals and
where they are on the map. It's a static site with no build step, and it's deployed on Vercel.

## What's in it

| Group | Count |
| --- | --- |
| UN member states | 193 |
| UN observer states (Vatican City, Palestine) | 2 |
| Territories and other places (Taiwan, Kosovo, Greenland, Puerto Rico, Hong Kong, ...) | 18 |
| **Total** | **213** |

Each place has a capital, the capital's coordinates and a region. A few capitals are tricky
because there's more than one reasonable answer (Bolivia, South Africa, the Netherlands, Sri
Lanka, Eswatini and some others). Those show a short note explaining why, and the other
answers are accepted too.

## Modes

- **Learn**: practice for as long as you want and find out right away if you got it. The
  countries you're worst at come up first. There are four question types: country to capital,
  capital to country, find the country on the map, and name the shaded country.
- **Practice test**: a fixed set of questions with a navigator, flags, an optional timer and an
  exam mode. At the end you get a report split up by region and question type.
- **Class quiz**: works like the paper map quizzes from school. A country is shaded gold, you
  click it, then type its name and its capital from memory. Each question is worth two marks,
  there's no multiple choice, and you get a marked paper at the end.
- **Flashcards**: country on one side, capital on the other. Rate each card Again, Hard, Good
  or Easy, and the ones you struggled with come back before the deck is over.

All four modes save to the same mastery record, so the app knows what you keep getting wrong.

## The map blur

OpenStreetMap tiles have every country and capital name printed on them, which would give
away a lot of answers. So while a question is on screen, the map is clear at the world view
but the tiles get blurred once you zoom in. Borders are drawn on top from our own country
shapes, so you can still see them. After you answer, the blur goes away. If the question
already tells you the country (country to capital), that country is shaded and labeled.

## Country outlines

Countries are shaded as whole shapes instead of being marked with pins. The outlines come from
Natural Earth 1:50m through [world-atlas](https://github.com/topojson/world-atlas), converted
to GeoJSON and rounded to 2 decimal places. They're in `assets/data/countries.geo.json`
(about 1.3 MB, around 400 KB gzipped). 211 of the 213 places have a polygon. Tuvalu and
Gibraltar are too small to show up at this scale, so they get a circle on the capital instead.

The same outlines are reused away from Leaflet. `assets/js/worldmap.js` projects them once
into a flat equirectangular SVG and snaps the result to a coarse grid, which takes about
900 KB of path data down to about 190 KB. That is the map on the home screen, coloured by
what you have mastered, and the map in the two landing-page screenshots.
## Landing page demo

The landing page has a quick demo with three sample questions: one country to capital, one
capital to country, and one where you name a country from its outline. It doesn't touch your
saved progress. When you finish, it asks if you want to sign up as a student or a teacher.
The outlines it uses are in `demo-shapes.js`, which was generated from `countries.geo.json`
so the landing page doesn't have to load the whole file.

## Progress and rewards

You earn XP, level up and collect diamonds. Getting answers right in a row gives you a
multiplier that goes up to ×3. There's a daily goal, and your day streak only counts days
where you actually hit it. There are also ten achievements. You can spend diamonds in the
shop on profile cosmetics: avatars, avatar decorations, profile effects, nameplates, banners
and color themes.

## Classroom

A teacher gets one class with one class code. The teacher view has Stream, Classwork, People
and Analytics tabs, plus a gradebook. Students get a Classroom tab where their assigned work
shows up.

Without accounts, the classroom runs on codes you copy and paste: `LGC-` codes to join,
`LG1-` codes for assignments and `LGR-` codes to send results back. A teacher can paste in a
whole batch of result codes at once, or type a score into the gradebook by hand.

## Accounts (Supabase)

You don't need an account. As a guest, everything is saved in your browser's `localStorage`.
If you make an account (email and password through Supabase Auth), your whole save gets
synced to Supabase: progress, mastery, diamonds, purchases, settings and classes. That way it
follows you to other devices. A new account starts with whatever you already played as a guest.

Accounts also make the classroom live:

- the teacher's class, assignments and gradebook are stored online
- students join with just the class code, and new assignments show up on their own
- when a student finishes an assignment, the score goes straight into the teacher's gradebook

All of this is in `assets/js/cloud.js`.

### Database

| Table | Holds | Who can see it |
| --- | --- | --- |
| `profiles` | display name, role, the full save (`jsonb`) | only its owner |
| `classes` | class code, name, teacher | the teacher and the class's students |
| `class_members` | who joined which class, under what name | the student and the teacher |
| `assignments` | title, mode, config | the teacher (read/write) and students (read) |
| `results` | score, correct/total, countries missed | the student who sent it and the teacher |

Row-level security is on for every table. Students join through the `join_class(code, name)`
function and hand in work through `submit_result(...)`, so nobody can add themselves to a
class or post a score as someone else. A trigger creates the profile row when someone signs up.

The publishable key in `cloud.js` is supposed to be public. What people can read or write is
controlled by the policies above.

### Supabase dashboard settings

- **Authentication > URL Configuration**: set the Site URL to the deployed address, and add
  it to Redirect URLs along with `http://localhost:8765` for local testing. That way the
  confirmation and password reset emails link back to the app.
- **Authentication > Providers > Email**: "Confirm email" is on by default. If some students
  can't check their email easily, you might want to turn it off so they can sign up in class.
  The built-in email sender is rate limited, so set up custom SMTP before a whole class tries
  to sign up at once.

## Maps

The map uses [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles. OpenStreetMap's tile
server is free and doesn't need an API key, so the app works without any setup. If you want
higher rate limits, Settings > Map lets you pick CARTO, MapTiler, Thunderforest or Stadia and
paste in your key. If you pick one of those without a key, it goes back to plain OpenStreetMap.

Map data © OpenStreetMap contributors.

## Animations

`motion.css` and `motion.js` handle the animations: button feedback, click ripples, views
sliding in, modals fading out and the scroll reveals on the landing page. `motion.js` only
watches the page and never calls into the other scripts, so you can delete both files and
everything still works. Most of it is skipped if your system has reduced motion turned on.

## Running it

There's no build step. From the repo folder, run:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>. Use a local server instead of opening `index.html`
directly, because the country outlines are loaded with `fetch` and won't load from the
filesystem (every country would fall back to a circle).

Leaflet and supabase-js are loaded from CDNs in `index.html`, so there's nothing to install.

## Two landing pages

`index.html` is the student page and carries the app shell too, so every button on it opens
the app. `teachers.html` is marketing only: no app shell, and its buttons are plain links into
`index.html?role=teacher`. It loads two scripts and nothing else, `data.js` and `hero.js`, which
is what the animated hero backdrop needs.

`?role=` and `?view=` are read once on load and then wiped off the address bar. A role in the
URL only settles things for a guest; if the save belongs to an account, the account's own role
wins, so the link can open a view but never change who you are.

## File layout

```
index.html                      student landing page and app shell
teachers.html                   teacher landing page (marketing only, no app shell)
assets/css/app.css              main styles
assets/css/motion.css           button feedback and transitions
assets/css/demo.css             landing page demo
assets/js/data.js               the 213 places: capitals, coordinates, notes, aliases
assets/js/cosmetics.js          avatars, decorations, effects, nameplates, banners, themes, achievements
assets/js/avatars.js            inline SVG artwork for avatars (no emoji fonts needed)
assets/js/core.js               icons, state, storage, economy, sound, reward effects
assets/js/map.js                Leaflet setup, country shapes, the map blur
assets/js/worldmap.js           the outlines as one flat inline SVG, no Leaflet
assets/js/hero.js               the capitals as a moving backdrop behind the hero headline
assets/js/quiz.js               question generation
assets/js/assignments.js        suggestions, share codes, handing in work
assets/js/cloud.js              Supabase accounts, save sync, online classes
assets/js/ui.js                 shell, profile menu, sign in, settings, customization, shop
assets/js/portal.js             study center home screen, built around the map
assets/js/teacher.js            teacher view: stream, classwork, people, analytics
assets/js/classroom.js          student Classroom tab
assets/js/mode-learn.js         Learn
assets/js/mode-test.js          Practice test
assets/js/mode-quiz.js          Class quiz
assets/js/mode-cards.js         Flashcards
assets/js/main.js               startup and routing
assets/js/demo.js               the three-question demo on the landing page
assets/js/demo-shapes.js        country outlines for the demo
assets/js/motion.js             ripples, entrances and scroll reveals
assets/data/countries.geo.json  country outlines (GeoJSON)
```

## Deployment

It's hosted on Vercel as a static site. You don't need a build command or an output directory.
