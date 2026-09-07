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
  types (country→capital, capital→country, locate on map, identify the pin).
- **Practice test** — a scored section with a question navigator, flags, optional timer and
  exam mode, followed by a report broken down by region and question type.
- **Flashcards** — two-sided cards with a Leitner-style queue; Again / Hard / Good / Easy.

Everything feeds one shared mastery record.

## Progression

XP and levels, a diamonds currency, answer-streak multipliers up to ×3, daily goals and ten
achievements. Diamonds buy profile cosmetics: avatars, avatar decorations, profile effects,
nameplates, banners and colour themes.

## Accounts

Accounts live in the browser's `localStorage`. Passwords are never stored in plain text —
each account gets a random salt and only a SHA-256 hash is kept (`assets/js/auth.js`).
Nothing is transmitted anywhere. `Auth` is written as a single swappable module so it can be
pointed at Supabase Auth without touching the rest of the app.

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
index.html              landing page, auth screen, app shell
assets/css/app.css      the whole design system
assets/js/data.js       the 213 countries, capitals, coordinates, notes, aliases
assets/js/cosmetics.js  avatars, decorations, effects, nameplates, banners, themes
assets/js/avatars.js    inline SVG artwork (no emoji fonts required)
assets/js/core.js       state, storage, economy, sound, reward effects
assets/js/auth.js       accounts
assets/js/map.js        Leaflet wrapper
assets/js/quiz.js       question generation
assets/js/ui.js         shell, profile menu, settings, customisation, shop
assets/js/portal.js     the study centre home screen
assets/js/mode-*.js     learn / test / flashcards
assets/js/main.js       bootstrap and routing
```

## Deployment

Static hosting. Deployed to Vercel; no build command and no output directory are needed.
