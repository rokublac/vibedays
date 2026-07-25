# Vibedays

Music that fits your day.

A static web player that reads the sun and the weather where you are, then finds
a playlist on Spotify to match. When the day changes, so does the music.

At 6pm on a clear winter evening it plays something calm and unwinding. At 2am it
plays something ambient. When it starts raining it changes again. Nobody picks
the playlists, and there is nothing to configure beyond signing in.

Pick a genre (lofi, synthwave, jazz, classical or ambient) and the whole system
follows it.

No backend, no database, no API keys. It runs entirely in the browser.

## What you need

- **Spotify Premium.** Playback uses the Web Playback SDK, which does not work on
  free accounts.
- **Node 18 or newer.**
- **A Spotify app**, which is free to create. See below.

## Setup

**1. Clone and install**

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
```

**2. Create a Spotify app**

Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
and create an app. Under settings, add this Redirect URI exactly:

```
http://127.0.0.1:5173/
```

Copy the Client ID. It is a public identifier, not a secret, so there is nothing
here you need to keep private.

**3. Add your Client ID**

```bash
cp .env.example .env
```

Put your Client ID in `.env`:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
```

**4. Run it**

```bash
npm run dev
```

Open http://127.0.0.1:5173 and allow location access when asked. Location is used
only to look up your sunrise, sunset and weather; it never leaves your browser
except as coordinates sent to Open-Meteo.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build to dist/
npm test         # run the test suite
npx tsc --noEmit # typecheck
```

## How it works

```
clock + geolocation
        ↓
Open-Meteo: sunrise, sunset, cloud, precipitation, temperature
        ↓
phase + condition bands
        ↓
composed search query, most specific first
        ↓
Spotify search, filtered for results that contradict the conditions
        ↓
playback via the Web Playback SDK
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
| `deep-night` | 22:00 until midnight, and 04:00 until dawn |
| `late-night` | midnight until 04:00 |

Without location access it falls back to plain clock hours.

### Condition bands

| Signal | Bands |
| --- | --- |
| Cloud cover | clear, hazy, scattered, overcast |
| Precipitation | none, sprinkle, drizzle, steady, downpour, snowing |
| Temperature | freezing, cold, mild, warm, hot (feels-like, so wind chill counts) |
| Season | hemisphere aware |

### The query ladder

Each band contributes search terms in priority order. The search starts with the
most specific query and drops the least important term until it finds enough
playlists:

```
lofi evening chill unwind rainy overcast grey cold winter
lofi evening chill unwind rainy overcast grey cold
lofi evening chill unwind rainy overcast grey
lofi evening chill unwind rainy
lofi evening chill unwind
lofi
```

Bands that add nothing (`mild` temperature, `hazy` cloud) contribute no term, so
an unremarkable day gets a short query instead of a padded one.

Spotify's playlist search matches loosely, so a query for a clear night will
happily return a playlist called "lofi sleep, lofi rain". Results whose names
advertise weather or a season that is not happening get set aside, and are only
used if nothing else comes back.

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
  search/       query ladder, contradiction filtering
  spotify/      auth (PKCE), search, playback, Web Playback SDK, volume fades
  matcher/      conditions to palette
  ui/           rendering, all DOM in here
```

Tests sit next to the code they cover. There is no framework and no state
library; the app is small enough not to need either.

## Making it yours

- **Different genres?** `GENRES` in `src/config/genres.ts`. Each one is a label
  and a search anchor that replaces the genre word in every query. Two rules,
  both covered by tests: no repeated word inside an anchor, and no weather or
  season words (the result ranker would reject its own matches).
- **Different search terms?** `PHASE_TERMS` and the band term tables in
  `src/conditions/descriptors.ts`.
- **Different phase timings?** `DEEP_NIGHT_HOUR` and friends in
  `src/conditions/sun.ts`.
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

Before deploying, update the absolute URLs in `index.html` (`og:url`,
`og:image`, and the canonical link). They currently point at
`vibedays.pages.dev`, and social previews cannot resolve relative URLs.

## Privacy

Your coordinates go to [Open-Meteo](https://open-meteo.com) for weather and to
[BigDataCloud](https://www.bigdatacloud.com) to turn them into a place name, both
free and keyless. Spotify tokens are held in your browser's local storage and
never sent anywhere except Spotify. There is no analytics and no server.

## Licence

MIT. See [LICENSE](LICENSE).
