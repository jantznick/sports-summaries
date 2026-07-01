import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { CITIES, LEAGUES, getTeamsForLeague } from '../src/config/cities.js';
import { addDays, getGameWindow, getTodayEst } from '../src/utils/dates.js';
import {
  collectNotablePlayerIds,
  extractCompletedGames,
  fixtureKeyFromUrl,
  getAthleteStatsUrl,
  getLeagueNewsUrl,
  getNewsContentUrlFromArticle,
  getScheduleUrl,
  getSummaryUrl,
  getTeamNewsUrl,
  getTeamUrl,
} from '../src/services/espn.js';

const fixturesDir = path.resolve(process.env.FIXTURES_DIR || './data/fixtures');
const gameLookbackDays = Number.parseInt(process.env.GAME_LOOKBACK_DAYS || '30', 10);
const gamesPerTeam = Number.parseInt(process.env.GAMES_PER_TEAM || '2', 10);
const newsHeadlineLimit = Number.parseInt(process.env.NEWS_HEADLINE_LIMIT || '5', 10);

async function downloadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status})`);
  }
  return response.json();
}

async function saveFixture(url, data) {
  const filePath = path.join(fixturesDir, fixtureKeyFromUrl(url));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return filePath;
}

async function downloadIfNeeded(url, saved) {
  if (saved.has(url)) {
    return;
  }
  const data = await downloadJson(url);
  const filePath = await saveFixture(url, data);
  saved.add(url);
  console.log(`saved ${filePath}`);
  return data;
}

async function downloadNewsArticleFixtures(newsData, saved, limit) {
  const articles = newsData?.articles || [];
  for (const article of articles.slice(0, limit)) {
    const contentUrl = getNewsContentUrlFromArticle(article);
    if (contentUrl) {
      await downloadIfNeeded(contentUrl, saved);
    }
  }
}

async function main() {
  const summaryDate = getTodayEst();
  const { startDate, endDate } = getGameWindow(summaryDate, gameLookbackDays);
  const saved = new Set();

  console.log(`Downloading fixtures to ${fixturesDir}`);
  console.log(`Game window: ${startDate} to ${endDate}`);

  for (const leagueKey of LEAGUES) {
    const leagueNewsUrl = getLeagueNewsUrl(leagueKey, 50);
    const leagueNews = await downloadIfNeeded(leagueNewsUrl, saved);
    await downloadNewsArticleFixtures(leagueNews, saved, newsHeadlineLimit);
  }

  for (const [citySlug, city] of Object.entries(CITIES)) {
    console.log(`\nCity: ${citySlug}`);

    for (const leagueKey of LEAGUES) {
      const teams = getTeamsForLeague({ teams: city.teams }, leagueKey);

      for (const team of teams) {
        const scheduleUrl = getScheduleUrl(leagueKey, team.abbr);
        const teamNewsUrl = getTeamNewsUrl(leagueKey, team.abbr, newsHeadlineLimit);
        const teamUrl = getTeamUrl(leagueKey, team.abbr);

        await downloadIfNeeded(teamUrl, saved);

        const teamNews = await downloadIfNeeded(teamNewsUrl, saved);
        await downloadNewsArticleFixtures(teamNews, saved, newsHeadlineLimit);

        const schedule = await downloadIfNeeded(scheduleUrl, saved);
        const completedGames = extractCompletedGames(schedule, {
          startDate,
          endDate,
          limit: gamesPerTeam,
        });

        console.log(`  ${team.name} (${leagueKey}): ${completedGames.length} recent games`);

        for (const game of completedGames) {
          const summaryUrl = getSummaryUrl(leagueKey, game.id);
          const summaryData = await downloadIfNeeded(summaryUrl, saved);

          const playerIds = collectNotablePlayerIds(summaryData, team.abbr);
          for (const playerId of playerIds) {
            await downloadIfNeeded(getAthleteStatsUrl(leagueKey, playerId), saved);
          }
        }
      }
    }
  }

  console.log(`\nDone. Saved ${saved.size} fixture files.`);
  console.log(`Set USE_FIXTURES=true to use them during local dev.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
