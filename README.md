# LearnGeo

A focused geography trainer for the world's countries, their capitals and where they sit
on the map. No flags, no filler.

**Live:** _see Deployment below_

## What's covered

| Group | Count |
| --- | --- |
| UN member states | 193 |
| UN permanent observer states (Vatican City, Palestine) | 2 |
| Territories & dependencies (Taiwan, Kosovo, Greenland, Puerto Rico, Hong Kong, …) | 18 |
| **Total entries** | **213** |

Every entry carries its capital, the capital's coordinates and a region. Capitals with more
than one defensible answer (Bolivia, South Africa, the Netherlands, Sri Lanka, Eswatini and
others) carry a short explanatory note and accept the alternates.

## Modes

- **Learn** — endless practice with instant feedback, weakest-first ordering, four question
  types (country→capital, capital→country, locate on map, identify the shaded country).
- **Practice test** — a scored section with a question navigator, flags, optional timer and
  exam mode, followed by a report broken down by region and question type.
- **Class quiz** — the paper map quiz. One country is shaded gold; click it, then write its
  name and its capital from memory. Two marks per question, no multiple choice, and a marked
  paper at the end.
- **Flashcards** — two-sided cards with a Leitner-style queue; Again / Hard / Good / Easy.

Everything feeds one shared mastery record.

## Country outlines

Whole countries are shaded on the map rather than marked with pins. Outlines come from
Natural Earth 1:50m via [world-atlas](https://github.com/topojson/world-atlas), converted to
GeoJSON and rounded to 2 decimal places (`assets/data/countries.geo.json`, ~400 KB gzipped).
211 of the 213 entries have a polygon; Tuvalu and Gibraltar are too small to appear at this
resolution and fall back to a circular highlight on the capital.

The same outlines are reused away from Leaflet. `assets/js/worldmap.js` projects them once
into a flat equirectangular SVG and snaps the result to a coarse grid, which takes about
900 KB of path data down to about 190 KB. That is the map on the home screen, coloured by
what you have mastered, and the map in the two landing-page screenshots.

## Progression

XP and levels, a diamonds currency, answer-streak multipliers up to ×3, daily goals and ten
achievements. Diamonds buy profile cosmetics: avatars, avatar decorations, profile effects,
nameplates, banners and colour themes.

## No accounts

There is no sign-up, no sign-in and no server. Everything — progress, diamonds, purchases,
settings, the teacher's class and the student's assignments — lives in this browser's
`localStorage` under the single key `learngeo.save.v1`, and nothing is transmitted anywhere.

That is also how work moves between people. A teacher's class and its assignments are
serialised into one `LGC-` join code; a finished assignment comes back as an `LGR-` result
code. The codes are the whole transport, which is why a class needs no roster upload and no
student needs an email address.

## Two landing pages

`index.html` is the student page and carries the app shell as well, so every button on it
opens the app directly. `teachers.html` is marketing only: no app shell, no JavaScript, and
its buttons are plain links into `index.html?role=teacher`, which boots straight into teacher
mode. `?role=` and `?view=` are read once on load and then wiped off the address bar.

## Maps

Leaflet over OpenStreetMap raster tiles. **OpenStreetMap's own tile service is free and needs
no API key**, so the app works with no configuration. Settings → Map accepts a key for CARTO,
MapTiler, Thunderforest or Stadia if you want higher rate limits; choosing a keyed provider
without supplying a key falls back to plain OpenStreetMap.

Map data © OpenStreetMap contributors.

## Running it

It is a static site — no build step.

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>.

## Layout

```
index.html               student landing page and the app shell
teachers.html            teacher landing page (marketing only, no script)
assets/css/app.css       the whole design system
assets/js/data.js        the 213 countries, capitals, coordinates, notes, aliases
assets/js/cosmetics.js   avatars, decorations, effects, nameplates, banners, themes
assets/js/avatars.js     inline SVG artwork (no emoji fonts required)
assets/js/core.js        state, storage, economy, sound, reward effects
assets/js/map.js         Leaflet wrapper
assets/js/worldmap.js    the country outlines as one flat inline SVG, no Leaflet
assets/js/quiz.js        question generation
assets/js/assignments.js recommendations, share codes, the country picker
assets/js/ui.js          shell, profile menu, settings, customisation, shop
assets/js/portal.js      the study centre home screen, built around the map
assets/js/teacher.js     teacher mode: the class, the builder, the gradebook
assets/js/classroom.js   the student side: joining a class, classwork, grades
assets/js/mode-learn.js  learn / test / class quiz / flashcards
assets/js/mode-test.js
assets/js/mode-quiz.js
assets/js/mode-cards.js
assets/data/             country outlines (GeoJSON)
assets/js/main.js        bootstrap and routing
```

## Deployment

Static hosting. Deployed to Vercel; no build command and no output directory are needed.
