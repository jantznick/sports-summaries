import fs from 'fs/promises';
import path from 'path';
import { getLeagueMeta } from '../config/cities.js';
import { stripHtml, truncateText } from '../utils/html.js';
import { toDateOnlyEst } from '../utils/dates.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_COMMON_BASE = 'https://site.api.espn.com/apis/common/v3/sports';
const ESPN_CONTENT_BASE = 'https://content.core.api.espn.com/v1/sports/news';

const NOTABLE_PLAYER_LIMIT = 5;

export function fixtureKeyFromUrl(url) {
  const parsed = new URL(url);
  const hostPart = parsed.hostname.replace(/\./g, '_');
  const pathPart = parsed.pathname
    .replace(/^\//, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_');
  let key = `${hostPart}_${pathPart}`;

  if (parsed.search) {
    const queryKey = parsed.searchParams
      .toString()
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_');
    key = `${key}_${queryKey}`;
  }

  return `${key}.json`;
}

function buildUrl(sport, league, ...segments) {
  const suffix = segments.filter(Boolean).join('/');
  return `${ESPN_BASE}/${sport}/${league}/${suffix}`;
}

async function readFixture(fixturesDir, url) {
  const filePath = path.join(fixturesDir, fixtureKeyFromUrl(url));
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeFixture(fixturesDir, url, data) {
  const filePath = path.join(fixturesDir, fixtureKeyFromUrl(url));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function fetchLiveJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function fetchJson(url, { useFixtures, fixturesDir, saveFixture = false }) {
  if (useFixtures) {
    try {
      return await readFixture(fixturesDir, url);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  const data = await fetchLiveJson(url);

  if (useFixtures || saveFixture) {
    await writeFixture(fixturesDir, url, data);
  }

  return data;
}

export function getScheduleUrl(leagueKey, teamAbbr) {
  const { sport } = getLeagueMeta(leagueKey);
  return buildUrl(sport, leagueKey, 'teams', teamAbbr, 'schedule');
}

export function getSummaryUrl(leagueKey, gameId) {
  const { sport } = getLeagueMeta(leagueKey);
  return `${buildUrl(sport, leagueKey, 'summary')}?event=${gameId}`;
}

export function getLeagueNewsUrl(leagueKey, limit = 50) {
  const { sport } = getLeagueMeta(leagueKey);
  return `${buildUrl(sport, leagueKey, 'news')}?limit=${limit}`;
}

export function getTeamNewsUrl(leagueKey, teamAbbr, limit = 50) {
  const { sport } = getLeagueMeta(leagueKey);
  return `${buildUrl(sport, leagueKey, 'teams', teamAbbr, 'news')}?limit=${limit}`;
}

export function getTeamUrl(leagueKey, teamAbbr) {
  const { sport } = getLeagueMeta(leagueKey);
  return buildUrl(sport, leagueKey, 'teams', teamAbbr);
}

export function getAthleteStatsUrl(leagueKey, athleteId) {
  const { sport } = getLeagueMeta(leagueKey);
  return `${ESPN_COMMON_BASE}/${sport}/${leagueKey}/athletes/${athleteId}/stats`;
}

export function getNewsContentUrl(articleId) {
  return `${ESPN_CONTENT_BASE}/${articleId}`;
}

export function getNewsContentUrlFromArticle(article) {
  const apiHref = article?.links?.api?.self?.href;
  if (apiHref) {
    return apiHref;
  }
  if (article?.id) {
    return getNewsContentUrl(article.id);
  }
  return null;
}

export function getArticleWebUrl(article) {
  const web = article?.links?.web?.href;
  if (web) {
    return web;
  }
  const mobile = article?.links?.mobile?.href;
  if (mobile) {
    return mobile;
  }
  if (article?.id) {
    return `https://www.espn.com/espn/story/_/id/${article.id}`;
  }
  return null;
}

export async function fetchTeamSchedule(leagueKey, teamAbbr, options) {
  return fetchJson(getScheduleUrl(leagueKey, teamAbbr), options);
}

export async function fetchGameSummary(leagueKey, gameId, options) {
  return fetchJson(getSummaryUrl(leagueKey, gameId), options);
}

export async function fetchLeagueNews(leagueKey, limit, options) {
  return fetchJson(getLeagueNewsUrl(leagueKey, limit), options);
}

export async function fetchTeamNews(leagueKey, teamAbbr, limit, options) {
  return fetchJson(getTeamNewsUrl(leagueKey, teamAbbr, limit), options);
}

export async function fetchTeamInfo(leagueKey, teamAbbr, options) {
  return fetchJson(getTeamUrl(leagueKey, teamAbbr), options);
}

export async function fetchAthleteStats(leagueKey, athleteId, options) {
  return fetchJson(getAthleteStatsUrl(leagueKey, athleteId), options);
}

export function extractCompletedGames(scheduleData, { startDate, endDate, limit } = {}) {
  let completed = (scheduleData?.events || [])
    .filter((event) => event.competitions?.[0]?.status?.type?.completed)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (limit) {
    completed = completed.slice(0, limit);
  }

  if (startDate && endDate) {
    completed = completed.filter((event) => {
      const gameDate = toDateOnlyEst(event.date);
      return gameDate && gameDate >= startDate && gameDate <= endDate;
    });
  }

  return completed;
}

function formatStatLine(labels, stats) {
  if (!labels?.length || !stats?.length) {
    return stats?.join(', ') || '';
  }
  return labels
    .slice(0, stats.length)
    .map((label, index) => `${label}: ${stats[index]}`)
    .join(', ');
}

function formatStatObjects(stats) {
  if (!stats?.length) {
    return '';
  }
  return stats
    .filter((stat) => stat.displayValue !== undefined && stat.displayValue !== null)
    .map((stat) => `${stat.abbreviation || stat.name}: ${stat.displayValue}`)
    .join(', ');
}

function parseTeamSeasonInfo(teamData) {
  const team = teamData?.team || teamData;
  const recordItems = team?.record?.items || [];
  const overall = recordItems.find((item) => item.type === 'total');

  return {
    record: overall?.summary || null,
    standing: team?.standingSummary || null,
    homeRecord: recordItems.find((item) => item.type === 'home')?.summary || null,
    awayRecord: recordItems.find((item) => item.type === 'road')?.summary || null,
  };
}

async function getCachedTeamInfo(leagueKey, teamAbbr, options, cache) {
  const key = `${leagueKey}:${teamAbbr}`;
  if (cache.teamInfo.has(key)) {
    return cache.teamInfo.get(key);
  }

  try {
    const teamData = await fetchTeamInfo(leagueKey, teamAbbr, options);
    const info = parseTeamSeasonInfo(teamData);
    cache.teamInfo.set(key, info);
    return info;
  } catch (error) {
    console.warn(`[espn] Team info unavailable for ${teamAbbr}: ${error.message}`);
    const empty = { record: null, standing: null, homeRecord: null, awayRecord: null };
    cache.teamInfo.set(key, empty);
    return empty;
  }
}

function extractTeamBoxScoreStats(summaryData, teamAbbr) {
  const teamBlock = summaryData?.boxscore?.teams?.find(
    (entry) => entry.team?.abbreviation?.toLowerCase() === teamAbbr.toLowerCase(),
  );
  if (!teamBlock) {
    return [];
  }

  return (teamBlock.statistics || []).map((group) => ({
    category: group.displayName || group.name,
    stats: formatStatObjects(group.stats),
  }));
}

function extractLineScore(competitor) {
  if (!competitor?.linescores?.length) {
    return null;
  }
  return competitor.linescores.map((period) => period.displayValue).join('-');
}

function selectNotablePlayers(summaryData, teamAbbr, limit = NOTABLE_PLAYER_LIMIT) {
  const teamBlock = summaryData?.boxscore?.players?.find(
    (entry) => entry.team?.abbreviation?.toLowerCase() === teamAbbr.toLowerCase(),
  );
  if (!teamBlock) {
    return [];
  }

  const candidates = [];
  for (const group of teamBlock.statistics || []) {
    const labels = group.names || group.labels || [];
    for (const athleteEntry of group.athletes || []) {
      if (!athleteEntry.athlete?.id) {
        continue;
      }
      candidates.push({
        id: athleteEntry.athlete.id,
        name: athleteEntry.athlete.displayName,
        position: athleteEntry.position?.abbreviation || athleteEntry.position?.name,
        statGroup: group.displayName || group.text || group.name,
        gameStats: formatStatLine(labels, athleteEntry.stats),
        starter: Boolean(athleteEntry.starter),
      });
    }
  }

  const starters = candidates.filter((player) => player.starter);
  const others = candidates.filter((player) => !player.starter);
  return [...starters, ...others].slice(0, limit);
}

function parseAthleteStatCategories(statsData) {
  const categories = statsData?.categories || [];
  const season = [];
  const career = [];

  for (const category of categories) {
    const statBlock = category.statistics?.[0];
    if (!statBlock?.stats?.length) {
      continue;
    }

    const line = formatStatLine(category.labels || category.displayNames, statBlock.stats);
    const entry = {
      label: category.displayName || category.name,
      stats: line,
    };

    if (/career/i.test(category.name) || /career/i.test(category.displayName || '')) {
      career.push(entry);
    } else if (/postseason|playoff/i.test(category.name)) {
      continue;
    } else {
      season.push(entry);
    }
  }

  return {
    season: season.slice(0, 3),
    career: career.slice(0, 2),
  };
}

async function enrichPlayerProfiles(players, leagueKey, options, cache) {
  const profiles = [];

  for (const player of players) {
    const cacheKey = `${leagueKey}:${player.id}`;
    let statProfile = cache.athleteStats.get(cacheKey);

    if (!statProfile) {
      try {
        const statsData = await fetchAthleteStats(leagueKey, player.id, options);
        statProfile = parseAthleteStatCategories(statsData);
        cache.athleteStats.set(cacheKey, statProfile);
      } catch (error) {
        console.warn(`[espn] Athlete stats unavailable for ${player.name}: ${error.message}`);
        statProfile = { season: [], career: [] };
        cache.athleteStats.set(cacheKey, statProfile);
      }
    }

    profiles.push({
      ...player,
      seasonStats: statProfile.season,
      careerStats: statProfile.career,
    });
  }

  return profiles;
}

export async function buildGameContext(summaryData, team, leagueKey, options, cache = createFetchCache()) {
  const competition = summaryData?.header?.competitions?.[0];
  const competitors = competition?.competitors || [];
  const focusTeam = competitors.find(
    (entry) => entry.team?.abbreviation?.toLowerCase() === team.abbr.toLowerCase(),
  );
  const opponent = competitors.find((entry) => entry !== focusTeam);

  const recapArticle = summaryData?.article;
  const recap = truncateText(
    stripHtml(recapArticle?.story || recapArticle?.description || recapArticle?.summary || ''),
    5000,
  );

  const scoringPlays = (summaryData?.scoringPlays || summaryData?.plays || [])
    .filter((play) => play.scoringPlay || / homer|touchdown|goal|scores/i.test(play.text || ''))
    .slice(-8)
    .map((play) => play.text)
    .filter(Boolean);

  const focusTeamInfo = focusTeam?.team?.abbreviation
    ? await getCachedTeamInfo(leagueKey, focusTeam.team.abbreviation, options, cache)
    : await getCachedTeamInfo(leagueKey, team.abbr, options, cache);

  const opponentInfo = opponent?.team?.abbreviation
    ? await getCachedTeamInfo(leagueKey, opponent.team.abbreviation, options, cache)
    : { record: null, standing: null, homeRecord: null, awayRecord: null };

  const notablePlayers = selectNotablePlayers(summaryData, team.abbr);
  const playerProfiles = await enrichPlayerProfiles(notablePlayers, leagueKey, options, cache);

  return {
    gameId: competition?.id || summaryData?.header?.id,
    date: toDateOnlyEst(competition?.date) || toDateOnlyEst(summaryData?.gameInfo?.date),
    matchup: competition?.description || summaryData?.header?.description,
    venue: summaryData?.gameInfo?.venue?.fullName,
    status: competition?.status?.type?.description,
    focusTeam: {
      name: focusTeam?.team?.displayName || team.name,
      score: focusTeam?.score,
      lineScore: extractLineScore(focusTeam),
      seasonRecord: focusTeamInfo.record,
      standing: focusTeamInfo.standing,
      homeRecord: focusTeamInfo.homeRecord,
      awayRecord: focusTeamInfo.awayRecord,
      gameStats: extractTeamBoxScoreStats(summaryData, team.abbr),
    },
    opponent: {
      name: opponent?.team?.displayName,
      score: opponent?.score,
      lineScore: extractLineScore(opponent),
      seasonRecord: opponentInfo.record,
      standing: opponentInfo.standing,
      gameStats: opponent?.team?.abbreviation
        ? extractTeamBoxScoreStats(summaryData, opponent.team.abbreviation)
        : [],
    },
    recap,
    keyPlays: scoringPlays,
    playerProfiles,
    notes: (summaryData?.notes || []).map((note) => note.text).filter(Boolean).slice(0, 5),
  };
}

export function createFetchCache() {
  return {
    teamInfo: new Map(),
    athleteStats: new Map(),
  };
}

export function collectNotablePlayerIds(summaryData, teamAbbr, limit = NOTABLE_PLAYER_LIMIT) {
  return selectNotablePlayers(summaryData, teamAbbr, limit).map((player) => player.id);
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = article.id || article.headline;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function enrichNewsArticles(articles, limit, options) {
  const selected = dedupeArticles(articles).slice(0, limit);
  const enriched = [];

  for (const article of selected) {
    enriched.push(await enrichSingleArticle(article, options));
  }

  return enriched;
}

async function enrichSingleArticle(article, options) {
  const contentUrl = getNewsContentUrlFromArticle(article);
  let headline = article.headline?.trim() || '';
  let body = article.description || '';

  if (contentUrl) {
    try {
      const content = await fetchJson(contentUrl, options);
      const item = content.headlines?.[0] || content;
      headline = item.headline || headline;
      body = stripHtml(item.story || item.description || body);
    } catch (error) {
      console.warn(`[espn] Article body unavailable for ${headline || article.id}: ${error.message}`);
    }
  }

  return {
    id: article.id || null,
    headline,
    body: truncateText(body, 4000),
    published: article.published || article.pubDate || null,
    url: getArticleWebUrl(article),
  };
}

export async function extractNewsArticles(newsData, limit, options) {
  const articles = newsData?.articles || [];
  return enrichNewsArticles(articles, limit, options);
}

export function filterTeamNewsFromLeague(leagueNewsData, team, limit) {
  const articles = leagueNewsData?.articles || [];
  const searchTerms = [team.displayName, team.name]
    .filter(Boolean)
    .map((term) => term.toLowerCase());
  const filtered = [];

  for (const article of articles) {
    const categories = article.categories || [];
    const matchesTeam = categories.some((category) => {
      const description = (category.description || '').toLowerCase();
      return category.type === 'team' && searchTerms.some((term) => description.includes(term));
    });

    const headline = (article.headline || '').toLowerCase();
    const mentionsTeam = searchTerms.some((term) => headline.includes(term));

    if (matchesTeam || mentionsTeam) {
      filtered.push(article);
    }

    if (filtered.length >= limit) {
      break;
    }
  }

  return filtered;
}

export async function resolveTeamNews(leagueKey, team, limit, options) {
  try {
    const directNews = await fetchTeamNews(leagueKey, team.abbr, limit, options);
    const directArticles = await extractNewsArticles(directNews, limit, options);
    if (directArticles.length > 0) {
      return directArticles;
    }
  } catch (error) {
    console.warn(`[espn] Direct team news failed for ${team.abbr}: ${error.message}`);
  }

  try {
    const leagueNews = await fetchLeagueNews(leagueKey, 50, options);
    const filtered = filterTeamNewsFromLeague(leagueNews, team, limit);
    return enrichNewsArticles(filtered, limit, options);
  } catch (error) {
    console.warn(`[espn] League news fallback failed for ${team.abbr}: ${error.message}`);
    return [];
  }
}

export { ESPN_BASE };
