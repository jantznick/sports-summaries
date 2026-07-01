import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { CITIES } from '../src/config/cities.js';
import { LEAGUES } from '../src/config/cities.js';
import { getTeamSubreddit, LEAGUE_SUBREDDITS, REDDIT_LISTINGS } from '../src/config/reddit.js';
import { fixtureKeyFromUrl } from '../src/services/espn.js';
import { getRedditListingUrl } from '../src/services/reddit.js';

const fixturesDir = path.resolve(process.env.FIXTURES_DIR || './data/fixtures');
const listingLimit = Number.parseInt(process.env.REDDIT_LISTING_LIMIT || '25', 10);
const userAgent = process.env.REDDIT_USER_AGENT || 'sports-summaries/1.0.0 (local dev)';

async function downloadJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status})`);
  }
  const raw = await response.text();
  if (raw.trimStart().startsWith('<')) {
    throw new Error(`Reddit returned HTML for ${url}`);
  }
  return JSON.parse(raw);
}

async function saveFixture(url, data) {
  const filePath = path.join(fixturesDir, fixtureKeyFromUrl(url));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`saved ${filePath}`);
}

async function downloadSubreddit(subreddit, saved) {
  for (const listing of REDDIT_LISTINGS) {
    const url = getRedditListingUrl(subreddit, listing, listingLimit);
    if (saved.has(url)) {
      continue;
    }
    const data = await downloadJson(url);
    await saveFixture(url, data);
    saved.add(url);
  }
}

async function main() {
  const saved = new Set();
  console.log(`Downloading Reddit fixtures to ${fixturesDir}`);

  for (const leagueKey of LEAGUES) {
    const subreddit = LEAGUE_SUBREDDITS[leagueKey];
    console.log(`\nLeague: ${leagueKey} (r/${subreddit})`);
    await downloadSubreddit(subreddit, saved);
  }

  for (const [citySlug, city] of Object.entries(CITIES)) {
    console.log(`\nCity: ${citySlug}`);
    for (const team of city.teams) {
      const subreddit = getTeamSubreddit(citySlug, team.league, team.abbr);
      if (!subreddit) {
        continue;
      }
      console.log(`  ${team.name} (r/${subreddit})`);
      await downloadSubreddit(subreddit, saved);
    }
  }

  console.log(`\nDone. Saved ${saved.size} Reddit fixture files.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
