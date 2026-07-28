# Vibedays

Music that fits your day.

![vibedays playing a late night lofi playlist, with the current phase, weather and daylight hours shown](docs/screenshot.jpg)

A static web player that reads the sun and the weather where you are, then finds
music to match. When the day changes, so does the music.

At 6pm on a clear winter evening it plays something calm and unwinding. At 2am it
plays sleep music. When it starts raining it changes again. Nobody picks the
tracks, and there is nothing to configure — no account, no sign-in.

Pick a genre (lofi, synthwave, jazz, classical or ambient) and the whole system
follows it.

Music comes from [Audius](https://audius.co), an open catalogue of independent
artists whose public API needs no key and no login.

No backend, no database, no API keys, no accounts. It runs entirely in the
browser.

## What you need

- **Node 22 or newer**, for the build.
- Nothing else. No account, no API key, no app registration.

## Setup

**1. Clone and install**

```bash
git clone https://github.com/rokublac/vibedays.git
cd vibedays
npm install
```

**2. Run it**

```bash
npm run dev
```

Open http://127.0.0.1:5173 and allow location access when asked. Location is used
only to look up your sunrise, sunset and weather; it never leaves your browser
except as coordinates sent to Open-Meteo.

That is the whole setup. `.env` is optional and only turns on debug logging.

## Commands

```bash
npm run dev      # dev server
npm run build    # typecheck, then production build to dist/
npm test         # run the test suite
npx tsc --noEmit # typecheck on its own
```

## Deploying

The build output is a folder of static files, so any static host works. This repo
is set up for Cloudflare Workers via `wrangler.jsonc`:

```bash
npm run build
npx wrangler deploy
```

Change `name` in `wrangler.jsonc` to your own worker name first.

There is nothing else to configure — no build-time secrets, no redirect URIs to
register. A fresh clone deploys and works.

## When something goes wrong

The diagnostics panel at the bottom grows an **Issue** row whenever a playback call
fails, showing the status code. That exists because the failures worth debugging
happen on phones and tablets, where there is no console to open.

For the full play path, turn on debug logging:

```js
localStorage.hb_debug = '1'   // in the browser console, takes effect immediately
```

Or set `VITE_DEBUG=true` in `.env` and restart. Either prints every search rung
and its result count, which is the fastest way to see whether a genre is finding
specific playlists or falling through to the bare anchor. Both are dev-only;
production builds never log.

## How it works

```
clock + geolocation
        ↓
Open-Meteo: sunrise, sunset, cloud, precipitation, temperature
        ↓
phase + condition bands
        ↓
genre + mood + one vibe word ("glow", "rain", "sleep music")
        ↓
Audius search, filtered to streamable tracks of a playable length
        ↓
playback through an <audio> element, queue owned in the browser
```

### Phases

Daylight phases come from real sunrise and sunset times. The after-dark ones come
from the clock, because dark and bedtime are different things: a 5pm winter
sunset does not mean it is time for sleep music.

| Phase | When |
| --- | --- |
| `dawn` | the hour before sunrise |
| `sunrise-golden` | the hour after sunrise |
| `morning` | sunrise until two hours before solar noon |
| `midday` | solar noon, either side |
| `afternoon` | until an hour before sunset |
| `sunset-golden` | the hour before sunset |
| `blue-hour` | the hour after sunset |
| `evening` | dusk until 22:00 |
| `late-night` | 22:00 until midnight |
| `deep-night` | midnight until 04:00, and 04:00 until dawn |

Without location access it falls back to plain clock hours, and offers a city
box instead. Naming a city gets the same sunrise, sunset and weather lookup, and
is remembered so the question is not asked again on every visit. The season is
left out entirely when neither is available, because the hemisphere is unknown
and guessing it would report summer during an Australian winter.

### Condition bands

| Signal | Bands |
| --- | --- |
| Cloud cover | clear, hazy, scattered, overcast |
| Precipitation | none, sprinkle, drizzle, steady, downpour, snowing |
| Temperature | freezing, cold, mild, warm, hot (feels-like, so wind chill counts) |
| Season | hemisphere aware |

### How a vibe is chosen

Every hour has its own imagery rather than its own mood. This is measured, not
guessed: Audius track titles are full of concrete things and almost empty of
feelings. "glow" returns 40 tracks and "neon" 36, while "hopeful" returns 3,
"emotive" 2 and "wistful" 1.

| Hour | Searches for |
| --- | --- |
| dawn | `soft` |
| sunrise golden | `glow` |
| morning | `morning`, Easygoing |
| midday | `sunny` |
| afternoon | `chill`, Easygoing |
| sunset golden | `nostalgic` |
| blue hour | `neon` |
| evening | `night`, Cool |
| late night | Ambient, `sleep ambient` |
| deep night | Ambient, `sleep music` |

Some hours pair the word with a mood and some deliberately do not. Mood and text
together intersect to almost nothing unless the mood is a common one: `glow`
alone is 40 tracks, but Yearning + `glow` is zero.

After dark the genre itself moves. Lo-Fi at 3am returns hip-hop instrumentals,
not sleep music, so the small hours search Ambient instead — for whichever genre
you picked, unless you picked Jazz or Classical, where late-night jazz and
nocturnes are a real thing worth keeping.

Rain takes the one text slot when it is raining, and the hour keeps its mood, so
a wet morning and a wet evening are both rainy without being identical. Weather
with no searchable word — storm, fog, snow, cloud — can only be felt through the
mood, so it takes that instead.

There is only one text slot. Two words collapse the pool: `rain morning` returns
a single track.

### Colours

Every phase has its own gradient. Each one is paired with a foreground colour
chosen so that all text holds WCAG AA contrast, including the dimmer secondary
tier, at the top, middle and bottom of the gradient.

This is enforced by tests rather than by eye. `src/matcher/palette.test.ts`
computes the real contrast ratios, so a new gradient that fails is a failing test
rather than something you find out about later. If you change a gradient and the
suite goes red, the colour is genuinely unreadable for somebody.

## Layout

```
src/
  conditions/   sun phases, seasons, weather fetch, condition bands
  audius/       search, vibe mapping, track pool, audio playback
  source/       the MusicSource contract and its implementation
  matcher/      conditions to palette
  ui/           rendering, all DOM in here
  config/       genres, volume, saved city
```

Tests sit next to the code they cover. There is no framework and no state
library; the app is small enough not to need either.

Around 420 tests, and a fair number of them are not what you would expect. The
contrast ones compute real WCAG ratios rather than trusting the palette. The
search ones assert that a query for a clear night will not pick a playlist called
"lofi rain". Most exist because the behaviour broke once.

## Making it yours

- **Different genres?** `GENRES` in `src/config/genres.ts`. Each one is a label
  and a search anchor that replaces the genre word in every query. Two rules,
  both covered by tests: no repeated word inside an anchor, and no weather or
  season words (the result ranker would reject its own matches).
- **Different search terms?** `PHASE_TERMS` and the band term tables in
  `src/conditions/descriptors.ts`.
- **Different phase timings?** `LATE_NIGHT_HOUR`, `DEEP_NIGHT_END_HOUR` and the
  golden/blue hour windows in `src/conditions/sun.ts`.
- **Different colours?** `src/matcher/palette.ts`, then run the tests.

## Icons and social images

Anything in `public/` is served from the site root, so `public/favicon.svg` is
`/favicon.svg` in the browser. `index.html` already points at these names:

| File | Size | Notes |
| --- | --- | --- |
| `favicon.svg` | square viewBox | committed |
| `favicon.ico` | 32x32, ideally with a 16x16 inside | the 16 is what a browser tab actually draws |
| `apple-touch-icon.png` | 180x180 | needs a solid background; iOS composites transparency onto black and rounds the corners itself |
| `og-image.png` | 1200x630 | link previews, used for both Open Graph and Twitter |

Missing files break nothing. Browsers fall back to a default icon and link
previews show no image.

`og:image` and its `alt` are commented out in `index.html` until the file
exists, because a tag pointing at a missing image renders worse on some
platforms than no tag at all. Uncomment both when you add it, and switch
`twitter:card` back to `summary_large_image`.

**Change the absolute URLs before you deploy.** `og:url`, `og:image` and the
canonical link in `index.html` all point at the author's domain. Social previews
cannot resolve relative URLs, and a canonical pointing somewhere else tells
search engines your page is a duplicate.

## Privacy

Your coordinates go to [Open-Meteo](https://open-meteo.com) for weather and sun
times, and to [BigDataCloud](https://www.bigdatacloud.com) to turn them into a
place name for the diagnostics panel, and Audius for the music. All three are
free and need no key. Your genre, volume and saved city are held in your
browser's local storage and are never sent anywhere. There are no accounts, no
analytics and no server.

## Licence

MIT. See [LICENSE](LICENSE).
