# Developer Guide

This document explains how the repo is organized, how data flows through the system, and where to go when you want to change behavior, prompts, teams, or configuration.

For quick setup and API usage, see [README.md](./README.md).

---

## What this repo does

This is a **Node.js/Express backend** that:

1. Accepts a request for a city (`chicago`, `losangeles`, `newyork`)
2. Checks if a summary JSON file already exists for that date
3. If not, fetches sports data from ESPN, sends it to OpenAI, and saves the result
4. Returns bite-sized summaries aimed at people who don't follow sports

The frontend (or any consumer) hits this API and reads the JSON. This repo does not serve a UI.

---

## Request flow (high level)

```
GET /:city?date=YYYY-MM-DD
        │
        ▼
  src/routes/city.js
        │
        ├─ cache exists? ──yes──► return data/cache/{city}/{date}.json
        │
        └─ no cache
              │
              ├─ date within MAX_FETCH_DAYS? ──no──► 400 error
              │
              └─ yes
                    │
                    ▼
              src/services/generator.js
                    │
                    ├─ for each league (mlb, nfl, nba, nhl)
                    │     ├─ fetch league news → LLM call
                    │     └─ for each team in that city
                    │           ├─ fetch schedule → pick recent final games
                    │           ├─ for each game → fetch summary → LLM call
                    │           └─ fetch team news → LLM call
                    │
                    ▼
              save to data/cache/{city}/{date}.json
                    │
                    ▼
              return JSON
```

---

## Directory map

```
sports-summaries/
├── .env                    # Your local config (not committed)
├── .env.example            # Template for all env vars
├── README.md               # Setup, API reference, test checklist
├── DEVELOPER_GUIDE.md      # This file
│
├── src/
│   ├── index.js            # Starts Express server
│   ├── config/
│   │   ├── cities.js       # Cities, teams, leagues
│   │   └── env.js          # Reads .env into a config object
│   ├── routes/
│   │   └── city.js         # HTTP routes (/health, /:city)
│   ├── services/
│   │   ├── cache.js        # Read/write cache files + generation lock
│   │   ├── espn.js         # ESPN API + fixture loading + data parsing
│   │   ├── generator.js    # Main orchestration (fetch → prompt → LLM)
│   │   ├── llm.js          # OpenAI client
│   │   └── prompts.js      # ★ Prompt templates — edit these first
│   └── utils/
│       └── dates.js        # Date math, fetch window validation
│
├── scripts/
│   └── download-fixtures.js  # Downloads ESPN JSON into data/fixtures/
│
└── data/
    ├── fixtures/           # Saved ESPN responses for offline dev
    └── cache/              # Generated summary output (gitignored)
```

---

## File-by-file reference

### Entry point

| File | Role |
|------|------|
| `src/index.js` | Loads `.env`, builds config, mounts routes, starts server on `PORT` |

### Configuration

| File | Role | Edit when… |
|------|------|------------|
| `src/config/env.js` | Parses env vars into a single `config` object | Adding a new env variable |
| `src/config/cities.js` | Maps cities → teams → leagues | Adding/removing cities or teams |
| `.env` | Your local secrets and toggles | Changing model, paths, limits |

**Team mapping** follows [fakefanreport's config.php](https://github.com/jefe317/fakefanreport/blob/main/config.php). Each team needs:

- `league` — `mlb`, `nfl`, `nba`, or `nhl`
- `name` — display short name (`Cubs`, `Bears`)
- `abbr` — ESPN API abbreviation (`chc`, `chi`)

To add a city, add a new key to `CITIES` in `src/config/cities.js` and re-run `npm run download-fixtures` if you use fixture mode.

### HTTP layer

| File | Role | Edit when… |
|------|------|------------|
| `src/routes/city.js` | Handles `/health` and `GET /:city` | Adding routes, auth, response shape changes |

Key behaviors in `city.js`:

- Default date = today in US Eastern (`getTodayEst()`)
- Cached files are **always** served, regardless of `MAX_FETCH_DAYS`
- Uncached requests are blocked if the date is too old
- Concurrent requests for the same city/date wait on a generation lock

### Core logic

| File | Role | Edit when… |
|------|------|------------|
| `src/services/generator.js` | Loops leagues/teams/games, calls ESPN + LLM | Changing what gets summarized or output structure |
| `src/services/espn.js` | Fetches/parses ESPN data | Changing data sources, parsing, game selection |
| `src/services/prompts.js` | Builds prompt strings | **Changing tone, length, instructions** |
| `src/services/llm.js` | Calls OpenAI | Changing model params, switching providers |
| `src/services/cache.js` | File cache + lock | Changing cache location or concurrency behavior |
| `src/utils/dates.js` | Date windows and validation | Changing "yesterday" logic or fetch limits |

---

## Where to edit common things

### Prompts (tone, length, instructions)

**File:** `src/services/prompts.js`

Three functions, one per LLM call type:

| Function | Used for |
|----------|----------|
| `buildGamePrompt()` | Each recent game, from the team's perspective |
| `buildLeagueNewsPrompt()` | League-wide news (trades, big stories) |
| `buildTeamNewsPrompt()` | Team-specific news |

Each prompt receives structured data (scores, headlines, player stats) as plain text inside the template. Change the instruction text freely; the data sections at the bottom are assembled from ESPN.

To test prompt changes without burning OpenAI tokens:

```bash
MOCK_LLM=true USE_FIXTURES=true npm start
```

Mock responses won't reflect your new prompts — delete the cache file and set `MOCK_LLM=false` when you're ready to test for real:

```bash
rm data/cache/chicago/2026-07-01.json
curl "http://localhost:3000/chicago?date=2026-07-01"
```

### LLM model and parameters

**Files:** `.env` and `src/services/llm.js`

- Model name: `OPENAI_MODEL` in `.env` (default `gpt-4o-mini`)
- API key: `OPENAI_API_KEY` in `.env`
- Temperature, system message, etc.: `src/services/llm.js`

### What data goes into game prompts

**File:** `src/services/espn.js` → `buildGameContext()`

This function assembles:

- **Full game recap** — stripped HTML from ESPN's game summary article (`article.story`)
- **Team season context** — record, standing, home/away splits from the team endpoint
- **Team game stats** — batting/pitching/fielding totals from the box score
- **Line score** — inning/period breakdown when available
- **Key plays** — scoring plays from the play-by-play feed
- **Player profiles** (up to 5 starters/key players):
  - Stats from this game (box score line)
  - Season stats from ESPN's athlete stats API
  - Career stats when available (e.g. MLB `career-batting`)

Edit `buildGameContext()` and `selectNotablePlayers()` in `espn.js` to change what's included, then update `buildGamePrompt()` in `prompts.js`.

### Which games are included

**Files:** `src/services/generator.js` + `src/services/espn.js`

Rules (configured via `.env`):

| Setting | Default | Effect |
|---------|---------|--------|
| `GAME_LOOKBACK_DAYS` | 30 | Search window for completed games |
| `GAMES_PER_TEAM` | 2 | Max games per team |

Date window logic in `src/utils/dates.js`:

- Summary date = the date in the request (default: today EST)
- Games considered: from `(date - 1 - lookback)` through `(date - 1)` — i.e. **through yesterday**
- Only games with `status.type.completed === true`

Teams with zero qualifying games get `skippedReason` instead of game summaries (typical off-season).

### News articles fed to prompts

**File:** `src/services/espn.js` → `enrichNewsArticles()`

For each news item:

1. Reads the headline from the news feed
2. Fetches the **full article body** from ESPN's content API (`content.core.api.espn.com/v1/sports/news/{id}`)
3. Strips HTML and truncates to ~4000 characters

- `NEWS_HEADLINE_LIMIT` in `.env` controls how many articles per league/team prompt
- Team news tries the team `/news` endpoint first; if empty, filters league news by team name, then still fetches full content

If team news quality is poor, improve `resolveTeamNews()` and `filterTeamNewsFromLeague()` in `espn.js`.

### Output JSON shape

**File:** `src/services/generator.js`

The `payload` object built in `generateCitySummary()` is what gets cached and returned. To add fields (e.g. raw scores, links, metadata), edit the objects pushed into `payload.leagues[leagueKey].teams[abbr]`.

Current shape per team:

```json
{
  "name": "Cubs",
  "abbr": "chc",
  "displayName": "Chicago Cubs",
  "newsSummary": "...",
  "sourceArticles": [...],
  "recentGames": [
    {
      "gameId": "...",
      "date": "2026-06-30",
      "matchup": "...",
      "opponent": "...",
      "result": "3-6",
      "summary": "..."
    }
  ],
  "skippedReason": null
}
```

`sourceArticles` is included so you can debug what the LLM saw (full article bodies, not just headlines). Remove it from the output later if you don't want it exposed to consumers.

### Adding a new city

1. Add entry to `CITIES` in `src/config/cities.js`
2. Run `npm run download-fixtures` to save ESPN data for offline dev
3. Test: `curl http://localhost:3000/yourcityslug`

### Adding a new league

1. Add to `SPORT_LABELS` and `LEAGUES` in `src/config/cities.js`
2. Assign teams the new `league` key
3. ESPN URL patterns in `espn.js` should work automatically if the league follows ESPN's standard path structure

---

## Environment variables

All defined in `.env.example`. Loaded by `src/config/env.js`.

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port |
| `OPENAI_API_KEY` | OpenAI auth (required unless `MOCK_LLM=true`) |
| `OPENAI_MODEL` | Model slug |
| `MOCK_LLM` | Skip OpenAI; return placeholder text |
| `USE_FIXTURES` | Read ESPN data from `data/fixtures/` instead of live API |
| `FIXTURES_DIR` | Path to fixture files |
| `CACHE_DIR` | Path to generated summary cache |
| `MAX_FETCH_DAYS` | Block uncached generation for dates older than this |
| `GAME_LOOKBACK_DAYS` | How far back to search for games |
| `GAMES_PER_TEAM` | Max recent games per team |
| `NEWS_HEADLINE_LIMIT` | Headlines per news prompt |

---

## Data directories

### `data/fixtures/` — ESPN sample files

Saved ESPN API responses used during development so you don't hammer ESPN's servers.

- Populated by: `npm run download-fixtures`
- Used when: `USE_FIXTURES=true`
- **Committed to git** (intentionally, for repeatable dev)
- Filenames derive from the API URL, e.g.:
  - `baseball_mlb_teams_chc_schedule.json`
  - `baseball_mlb_summary_event_401815959.json`
  - `baseball_mlb_news_limit_50.json`

Naming logic lives in `fixtureKeyFromUrl()` in `src/services/espn.js`.

If you add teams or change `NEWS_HEADLINE_LIMIT`, re-run the download script so fixture filenames stay in sync.

### `data/cache/` — Generated summaries

- Created automatically on first request for a city/date
- Path: `data/cache/{city}/{YYYY-MM-DD}.json`
- **Gitignored** — safe to delete when re-testing generation
- Once written, always served as-is (no re-generation until you delete the file)

---

## LLM call breakdown

For one city on one date, the number of OpenAI calls is:

```
(4 league news calls)
+ (N team news calls, one per team in that city)
+ (up to GAMES_PER_TEAM × N game calls, one per game per team — not deduped)
```

Example for Chicago (~5 teams × 4 leagues = ~17 teams):

- 4 league + 17 team + ~(17 × 2) game calls ≈ **55 calls** on a busy day

Each call is independent. There is no batching. Game calls are team-focused even when two teams played each other (same game, different prompts).

---

## ESPN API reference

This repo uses ESPN's undocumented public API, documented in [this gist](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b).

Endpoints used:

| Data | URL pattern |
|------|-------------|
| Team schedule | `/sports/{sport}/{league}/teams/{abbr}/schedule` |
| Game summary | `/sports/{sport}/{league}/summary?event={gameId}` |
| League news | `/sports/{sport}/{league}/news?limit=50` |
| Team news | `/sports/{sport}/{league}/teams/{abbr}/news?limit=5` |

URL builders are in `src/services/espn.js` (`getScheduleUrl`, `getSummaryUrl`, etc.).

---

## Local development workflow

### 1. Zero-cost iteration (fixtures + mock)

```bash
USE_FIXTURES=true MOCK_LLM=true npm start
```

Verifies routing, caching, JSON shape, and game selection. Does not test prompt quality.

### 2. Test prompts with real LLM, no ESPN calls

```bash
USE_FIXTURES=true MOCK_LLM=false npm start
rm data/cache/chicago/2026-07-01.json   # clear cache to regenerate
curl "http://localhost:3000/chicago?date=2026-07-01"
```

### 3. Full live run

```bash
USE_FIXTURES=false MOCK_LLM=false npm start
```

Hits ESPN and OpenAI live. Use sparingly.

### 4. Refresh fixtures

```bash
npm run download-fixtures
```

Downloads schedules, game summaries, league news, and team news for all configured cities/teams.

---

## Manual verification checklist

Run through these after making changes:

- [ ] `curl http://localhost:3000/health` — returns city list
- [ ] `curl http://localhost:3000/chicago` — returns full JSON
- [ ] Second identical request returns `"cacheHit": true`
- [ ] Off-season teams have `skippedReason`, not empty errors
- [ ] In-season teams have up to `GAMES_PER_TEAM` entries in `recentGames`
- [ ] `curl "http://localhost:3000/chicago?date=2020-01-01"` returns 400 (unless cached)
- [ ] `curl http://localhost:3000/boston` returns 404
- [ ] Inspect `sourceArticles` in output to verify news quality (should include full article bodies)
- [ ] Delete cache file, regenerate, confirm prompt changes took effect

---

## Common modification scenarios

| I want to… | Edit this |
|------------|-----------|
| Change summary tone or length | `src/services/prompts.js` |
| Use a different OpenAI model | `.env` → `OPENAI_MODEL` |
| Add/remove teams or cities | `src/config/cities.js` |
| Include more stats in game prompts | `src/services/espn.js` → `buildGameContext()` |
| Change how many games per team | `.env` → `GAMES_PER_TEAM` |
| Change game date window | `.env` → `GAME_LOOKBACK_DAYS` + `src/utils/dates.js` |
| Improve team news filtering | `src/services/espn.js` → `filterTeamNewsFromLeague()` |
| Add a new API endpoint | `src/routes/city.js` |
| Change cached JSON structure | `src/services/generator.js` |
| Add auth to the API | `src/routes/city.js` (middleware before handlers) |
| Switch from OpenAI to another provider | `src/services/llm.js` |
| Prevent old-date API abuse | `.env` → `MAX_FETCH_DAYS` |

---

## npm scripts

| Command | What it does |
|---------|--------------|
| `npm start` | Run the server |
| `npm run dev` | Run with auto-restart on file changes |
| `npm run download-fixtures` | Download/update ESPN fixture files |

---

## Notes and gotchas

- **Dates use server EST.** The client cannot override timezone; `date` query param is just `YYYY-MM-DD`.
- **Cache is permanent until deleted.** There is no cache busting endpoint. Delete files in `data/cache/` to force regeneration.
- **Team news is often empty** from ESPN's direct endpoint. The fallback filters league news by team name — results vary.
- **Same game, multiple LLM calls.** If the Lakers and Clippers both played each other, each team gets its own game summary call with a team-focused prompt.
- **Fixture files must match config.** If you change `NEWS_HEADLINE_LIMIT` or add teams, re-run `download-fixtures`.
