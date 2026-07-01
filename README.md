# Sports Summaries API

Backend service that fetches ESPN data, summarizes it with OpenAI, and caches daily JSON summaries for sports-casual readers in Chicago, Los Angeles, and New York.

**New to the codebase?** See [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for a walkthrough of every file, where to edit prompts, and how data flows through the system.

## Quick start

```bash
cp .env.example .env
npm install
npm run download-fixtures   # optional: refresh saved ESPN responses
npm start
```

### Fast local test (no OpenAI cost)

Use saved ESPN fixtures and mock LLM output:

```bash
USE_FIXTURES=true MOCK_LLM=true npm start
```

Then in another terminal:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/chicago
curl "http://localhost:3000/chicago?date=2026-07-01"
```

### Real summaries (uses OpenAI)

```bash
# .env
OPENAI_API_KEY=sk-...
USE_FIXTURES=true          # recommended for dev
MOCK_LLM=false

npm start
curl http://localhost:3000/chicago
```

First request for a city/date generates summaries and writes a cache file. Later requests return the cached JSON instantly.

---

## API

### `GET /health`

Returns service status and config flags.

### `GET /:city`

Supported cities:

| URL slug | City |
|----------|------|
| `chicago` | Chicago |
| `losangeles` | Los Angeles |
| `newyork` | New York |

Optional query param:

- `date=YYYY-MM-DD` — summary date (defaults to today in US Eastern time)

Example:

```bash
curl http://localhost:3000/newyork
curl "http://localhost:3000/chicago?date=2026-07-01"
```

### Response shape (abbreviated)

```json
{
  "city": "chicago",
  "cityLabel": "Chicago",
  "date": "2026-07-01",
  "generatedAt": "2026-07-01T12:00:00.000Z",
  "gameWindow": { "startDate": "2026-06-02", "endDate": "2026-06-30" },
  "cacheHit": false,
  "leagues": {
    "mlb": {
      "newsSummary": "...",
      "teams": {
        "chc": {
          "name": "Cubs",
          "newsSummary": "...",
          "recentGames": [
            {
              "gameId": "401815959",
              "date": "2026-06-30",
              "matchup": "San Diego Padres at Chicago Cubs",
              "opponent": "San Diego Padres",
              "result": "3-6",
              "summary": "..."
            }
          ]
        }
      }
    }
  }
}
```

Teams with no completed games in the lookback window include `skippedReason` instead of game summaries (typical off-season).

### Errors

| Status | When |
|--------|------|
| `404` | Unknown city slug |
| `400` | Invalid date format or date outside allowed fetch window |
| `500` | Generation failure (missing fixture, OpenAI error, etc.) |

---

## How it works

1. Client hits `GET /:city` (optionally with `?date=`).
2. Server checks `data/cache/{city}/{date}.json`.
3. If cached → return file.
4. If not cached → validate date is within `MAX_FETCH_DAYS` of today (EST).
5. For each league (MLB, NFL, NBA, NHL):
   - Fetch league news → **1 LLM call**
   - For each city team in that league:
     - Fetch team schedule, take up to **2 most recent completed games** in the last 30 days ending **yesterday** (relative to summary date)
     - Each game → fetch summary → **1 LLM call per game** (team-focused, not deduped)
     - Fetch team news → **1 LLM call**
6. Save combined JSON to cache and return it.

Concurrent requests for the same city/date block on a generation lock so only one LLM run happens.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `OPENAI_API_KEY` | — | Required unless `MOCK_LLM=true` |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `MOCK_LLM` | `false` | Return placeholder summaries (pipeline testing) |
| `USE_FIXTURES` | `false` | Read ESPN data from `data/fixtures/` instead of live API |
| `FIXTURES_DIR` | `./data/fixtures` | Saved ESPN JSON responses |
| `CACHE_DIR` | `./data/cache` | Generated summary cache |
| `MAX_FETCH_DAYS` | `7` | Only generate uncached summaries within this many days of today |
| `GAME_LOOKBACK_DAYS` | `30` | How far back to search for completed games |
| `GAMES_PER_TEAM` | `2` | Max recent games per team |
| `NEWS_HEADLINE_LIMIT` | `5` | Headlines fed into news prompts |

---

## Project layout

```
src/
  index.js              # Express entry point
  config/
    cities.js           # City → team → league mapping (from fakefanreport config)
    env.js              # Environment loading
  routes/
    city.js             # GET /health, GET /:city
  services/
    cache.js            # File cache + generation lock
    espn.js             # ESPN fetchers, parsers, fixture support
    generator.js        # Orchestrates fetch → prompt → LLM → JSON
    llm.js              # OpenAI client
    prompts.js          # Prompt templates
  utils/
    dates.js            # EST date helpers, fetch window validation

scripts/
  download-fixtures.js  # Saves ESPN responses for offline dev

data/
  fixtures/             # Saved ESPN API JSON (committed for dev)
  cache/                # Generated summaries (gitignored)
```

---

## Fixtures (offline ESPN data)

Sample ESPN responses live in **`data/fixtures/`**.

Each file is named from the API URL path + query string, e.g.:

- `baseball_mlb_teams_chc_schedule.json`
- `baseball_mlb_summary_event_401815959.json`
- `baseball_mlb_news_limit_50.json`

Refresh fixtures:

```bash
npm run download-fixtures
```

The script downloads, for all three cities:

- League news for MLB, NFL, NBA, NHL
- Each team's full schedule
- Game summaries for the 2 most recent completed games in the configured lookback window

Set `USE_FIXTURES=true` to avoid hitting ESPN during development.

---

## Manual verification checklist

Use this after setup to confirm everything behaves as expected.

### 1. Health check

```bash
curl http://localhost:3000/health
```

Expect: `{ "ok": true, "cities": ["chicago","losangeles","newyork"], ... }`

### 2. Pipeline test (fixtures + mock LLM)

```bash
USE_FIXTURES=true MOCK_LLM=true npm start
curl http://localhost:3000/chicago | jq '.city, .leagues.mlb.teams.chc.recentGames | length'
```

Expect:

- `cacheHit: false` on first request
- Mock summaries starting with `[mock summary]`
- Cubs (`chc`) have up to 2 `recentGames` in July (MLB in season)
- Bears/Bulls/Blackhawks may have `skippedReason` (off-season in sample window)

### 3. Cache hit

Run the same curl again.

Expect: `"cacheHit": true` and identical content.

Verify file exists:

```bash
ls data/cache/chicago/
```

### 4. Fetch window guard

```bash
curl "http://localhost:3000/chicago?date=2020-01-01"
```

Expect: `400` with message about date outside allowed window (unless that file was already cached).

### 5. Unknown city

```bash
curl http://localhost:3000/boston
```

Expect: `404` with `supportedCities` list.

### 6. Real OpenAI run

```bash
# .env with OPENAI_API_KEY, MOCK_LLM=false, USE_FIXTURES=true
rm data/cache/chicago/2026-07-01.json   # clear one cache file if re-testing
curl http://localhost:3000/chicago
```

Expect: human-readable summaries (not mock text). Check OpenAI usage dashboard for call count.

### 7. Code review pointers

| File | What to verify |
|------|----------------|
| `src/config/cities.js` | Team abbreviations match [fakefanreport config](https://github.com/jefe317/fakefanreport/blob/main/config.php) |
| `src/utils/dates.js` | Game window ends at summary date minus 1 day |
| `src/services/generator.js` | One LLM call per game, team, and league; no deduping |
| `src/services/espn.js` | Fixture keys include `event=` query param |
| `src/routes/city.js` | Cached files bypass `MAX_FETCH_DAYS`; uncached requests enforce it |
| `src/services/prompts.js` | Prompt tone/length — edit here for manual tuning |

---

## npm scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run API server |
| `npm run dev` | Run with `--watch` |
| `npm run download-fixtures` | Download/update ESPN fixture files |

---

## Notes

- **Date logic**: Summary date defaults to today (EST). Completed games are searched from `(date - 30)` through `(date - 1)`.
- **ESPN API**: Unofficial/public endpoints documented in [this gist](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b).
- **Team news**: ESPN's per-team news endpoint is often empty; the service falls back to filtering league news by team name.
- **Cost control**: `MAX_FETCH_DAYS` blocks uncached generation for old dates. Cached files are always served regardless of age.
