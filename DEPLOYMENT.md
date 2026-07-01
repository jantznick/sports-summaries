# Deployment (Railway + Backblaze B2)

This repo is a **single Railway cron job**. It generates summaries daily and uploads JSON to B2. Your frontend fetches those files directly — no API server.

---

## Architecture

```text
Railway Cron (daily, ~6 AM EST)
  → npm run daily-generate
  → generate chicago, losangeles, newyork
  → upload to B2: summaries/{city}.json

Frontend
  → fetch JSON from B2 (hardcoded URL)
  → render summaries
```

---

## Backblaze B2 setup

1. Create a bucket (public if the frontend fetches without auth)
2. Create an **Application Key** with write access (cron) — read-only is fine if you separate keys later
3. Note your S3 endpoint from B2 → Bucket Settings → **S3 Endpoint**

Env vars for Railway:

```bash
B2_KEY_ID=your_key_id
B2_APPLICATION_KEY=your_application_key
B2_BUCKET=your-bucket-name
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004
B2_KEY_PREFIX=summaries/

OPENAI_API_KEY=sk-...
REDDIT_USER_AGENT=sports-summaries/1.0.0 (by /u/yourusername)
```

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

**S3-compatible URL** (if using that endpoint directly):

```text
https://{bucketName}.s3.{region}.backblazeb2.com/summaries/chicago.json
```

Hardcode your bucket's base URL in the frontend and append `{city}.json` after the prefix.

---

## Railway setup

One service from this repo. Config is in `railway.toml`:

- **Start command:** `npm run daily-generate`
- **Cron schedule:** `0 11 * * *` (6 AM EST during standard time)

Set all env vars in the Railway dashboard. The job exits when done (`restartPolicyType = NEVER`).

### Cron schedule (EST)

| Desired run time | Cron (UTC, EST / UTC-5) | Cron (UTC, EDT / UTC-4) |
|------------------|---------------------------|-------------------------|
| 6:00 AM | `0 11 * * *` | `0 10 * * *` |

---

## Local development

**Generate locally (no B2):**

```bash
STORAGE_BACKEND=local USE_FIXTURES=true MOCK_LLM=true npm run daily-generate
cat data/cache/chicago.json | jq '.city, .date'
```

**Generate + upload to B2:**

```bash
STORAGE_BACKEND=b2 npm run daily-generate
```

**Backfill a date:**

```bash
npm run daily-generate -- 2026-07-01
```

---

## OpenAI spending

Cron runs **3 generation jobs/day** (~120–165 LLM calls total). Set a monthly cap in the OpenAI dashboard as a backstop.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Frontend 404 | Cron hasn't run yet — trigger manually in Railway or run locally |
| B2 upload fails | Check endpoint region matches `B2_REGION`, key has write permission |
| Reddit blocked | Set `REDDIT_USER_AGENT` to a descriptive value with a Reddit username |
