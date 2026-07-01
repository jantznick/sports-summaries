# Sports Summaries

Daily cron job that fetches ESPN + Reddit data, summarizes it with OpenAI, and uploads JSON to Backblaze B2.

The frontend reads summaries directly from B2 — there is no API server in this repo.

**Deploying?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for GitHub Actions + B2 setup.

**New to the codebase?** See [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for file layout, prompts, and data flow.

## Quick start

```bash
cp .env.example .env
npm install
npm run download-fixtures   # optional: refresh saved ESPN responses
```

### Fast local test (no OpenAI cost)

```bash
STORAGE_BACKEND=local USE_FIXTURES=true MOCK_LLM=true npm run daily-generate
cat data/cache/chicago.json | head
```

### Real summaries (uses OpenAI)

```bash
# .env
OPENAI_API_KEY=sk-...
USE_FIXTURES=true
MOCK_LLM=false
STORAGE_BACKEND=b2   # or local

npm run daily-generate
```

### Backfill a specific date

```bash
npm run daily-generate -- 2026-07-01
```

---

## Output

Generates one JSON file per city per day for `chicago`, `losangeles`, and `newyork`.

**B2 key pattern:** `summaries/{city}.json` (overwritten daily; `date` is inside the JSON)

Before each run, the existing file is copied to `summaries/{date-1}-{city}.json` as a backup.

Example response shape (abbreviated):

```json
{
  "city": "chicago",
  "cityLabel": "Chicago",
  "date": "2026-07-01",
  "generatedAt": "2026-07-01T12:00:00.000Z",
  "gameWindow": { "startDate": "2026-06-02", "endDate": "2026-06-30" },
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

---

## How it works

1. Cron runs `npm run daily-generate` (defaults to today in US Eastern time).
2. For each city, for each league (MLB, NFL, NBA, NHL):
   - Fetch league news + Reddit → **1 LLM call**
   - For each city team:
     - Fetch schedule, take up to **2 most recent completed games** in the last 30 days through **yesterday**
     - Each game → **1 LLM call** (team-focused, not deduped)
     - Fetch team news + Reddit → **1 LLM call**
3. Upload JSON to B2 and write a local copy to `data/cache/`.

~40–55 LLM calls per city per day.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Required unless `MOCK_LLM=true` |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `MOCK_LLM` | `false` | Return placeholder summaries |
| `STORAGE_BACKEND` | `auto` | `auto`, `b2`, or `local` |
| `B2_KEY_ID` / `B2_APPLICATION_KEY` / `B2_BUCKET` / `B2_ENDPOINT` | — | Backblaze B2 credentials |
| `B2_KEY_PREFIX` | `summaries/` | Object key prefix in bucket |
| `USE_FIXTURES` | `false` | Read ESPN data from `data/fixtures/` |
| `CACHE_DIR` | `./data/cache` | Local copy of generated JSON |
| `GAME_LOOKBACK_DAYS` | `30` | How far back to search for games |
| `GAMES_PER_TEAM` | `2` | Max recent games per team |
| `NEWS_HEADLINE_LIMIT` | `5` | Headlines fed into news prompts |
| `REDDIT_ENABLED` | `true` | Include Reddit posts in news prompts |

See `.env.example` for the full list.

---

## Project layout

```
scripts/
  daily-generate.js       # Cron entry point
  download-fixtures.js    # Saves ESPN responses for offline dev

src/
  config/
    cities.js             # City → team → league mapping
    env.js                # Environment loading
    reddit.js             # Subreddit config
  services/
    cache.js              # Local file writes
    storage.js            # B2 upload
    espn.js               # ESPN fetchers + fixture support
    reddit.js             # Reddit fetchers
    generator.js          # Orchestrates fetch → prompt → LLM → JSON
    llm.js                # OpenAI client
    prompts.js            # Prompt templates
  utils/
    dates.js              # EST date helpers
    openai-cost.js        # Cost logging
    html.js               # HTML stripping

data/
  fixtures/               # Saved ESPN + Reddit JSON (committed for dev)
  cache/                  # Generated summaries (gitignored)
```

---

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run daily-generate` | Generate all cities and upload to B2 |
| `npm run download-fixtures` | Download/update ESPN fixture files |
| `npm run download-reddit-fixtures` | Download/update Reddit fixture files |

---

## Notes

- **Date logic**: Summary date defaults to today (EST). Completed games are searched from `(date - 30)` through `(date - 1)`.
- **ESPN API**: Unofficial/public endpoints documented in [this gist](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b).
- **Cost**: 3 cities × ~40–55 LLM calls ≈ **120–165 OpenAI calls/day**. Set a monthly cap in the OpenAI dashboard.
