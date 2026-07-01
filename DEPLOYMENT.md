# Deployment (GitHub Actions + Backblaze B2)

This repo runs a **daily GitHub Actions workflow** that generates summaries and uploads JSON to B2. Your frontend fetches those files directly — no API server.

---

## Architecture

```text
GitHub Actions (daily, 4:00 AM America/New_York)
  → node scripts/daily-generate.js
  → generate chicago, losangeles, newyork
  → upload to B2: summaries/{city}.json

Frontend
  → fetch JSON from B2 (hardcoded URL)
  → render summaries
```

Workflow file: [`.github/workflows/daily-generate.yml`](./.github/workflows/daily-generate.yml)

---

## Backblaze B2 setup

1. Create a bucket (public if the frontend fetches without auth)
2. Create an **Application Key** with write access
3. Note your S3 endpoint from B2 → Bucket Settings → **S3 Endpoint**

---

## GitHub Actions setup

### Secrets (Settings → Secrets and variables → Actions)

| Secret | Required |
|--------|----------|
| `OPENAI_API_KEY` | Yes |
| `B2_KEY_ID` | Yes |
| `B2_APPLICATION_KEY` | Yes |
| `B2_BUCKET` | Yes |
| `B2_ENDPOINT` | Yes |
| `B2_REGION` | Yes |
| `REDDIT_USER_AGENT` | Recommended |

### Variables (optional)

| Variable | Default |
|----------|---------|
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `B2_KEY_PREFIX` | `summaries/` |

### Schedule

Runs at **4:00 AM America/New_York** (handles EST/EDT). GitHub cron is UTC-only, so the workflow fires at 08:00 and 09:00 UTC and skips unless the Eastern hour is 04.

**Manual run:** Actions → *Daily generate* → *Run workflow*

---

## Frontend URL pattern

Object keys:

| File | Purpose |
|------|---------|
| `summaries/{city}.json` | Current summary (frontend fetches this) |
| `summaries/{date-1}-{city}.json` | Previous day's file, archived before each run |

Cities: `chicago`, `losangeles`, `newyork`

Each run copies the existing `{city}.json` to `{summaryDate - 1 day}-{city}.json`, then overwrites `{city}.json`. The summary date is in the JSON `date` field.

**Friendly download URL** (public bucket):

```text
https://f{accountId}.backblazeb2.com/file/{bucketName}/summaries/chicago.json
```

---

## Local development

**Generate locally (no B2):**

```bash
STORAGE_BACKEND=local USE_FIXTURES=true MOCK_LLM=true npm run daily-generate
cat data/cache/chicago.json | jq '.city, .date'
```

**Generate + upload to B2:**

```bash
STORAGE_BACKEND=b2 USE_FIXTURES=false npm run daily-generate
```

**Backfill a date:**

```bash
npm run daily-generate -- 2026-07-01
```

---

## OpenAI spending

The workflow runs **3 generation jobs/day** (~120–165 LLM calls total). Set a monthly cap in the OpenAI dashboard as a backstop.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Frontend 404 | Workflow hasn't run yet — trigger manually via *Run workflow* |
| B2 upload fails | Check endpoint region matches `B2_REGION`, key has write permission |
| Reddit blocked | Set `REDDIT_USER_AGENT` to a descriptive value with a Reddit username |
| Article body warnings locally | Expected with `USE_FIXTURES=true` when fixture files are stale; re-run `npm run download-fixtures` or let fixture mode fetch missing articles live |
