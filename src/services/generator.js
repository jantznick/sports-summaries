import { LEAGUES, getTeamsForLeague } from '../config/cities.js';
import { getGameWindow } from '../utils/dates.js';
import { createCostTracker, logCostAggregate } from '../utils/openai-cost.js';
import {
  buildGameContext,
  createFetchCache,
  extractCompletedGames,
  extractNewsArticles,
  fetchGameSummary,
  fetchLeagueNews,
  fetchTeamSchedule,
  resolveTeamNews,
} from './espn.js';
import { summarize } from './llm.js';
import { fetchLeagueRedditPosts, fetchTeamRedditPosts } from './reddit.js';
import {
  buildGamePrompt,
  buildLeagueNewsPrompt,
  buildTeamNewsPrompt,
} from './prompts.js';

function getEspnOptions(config) {
  return {
    useFixtures: config.useFixtures,
    fixturesDir: config.fixturesDir,
  };
}

function getTeamDisplayName(city, team) {
  if (team.displayName) {
    return team.displayName;
  }
  return `${city.label} ${team.name}`;
}

function warnStep(label, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[generator] ${label}: ${message}`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createTeamEntry(city, team) {
  return {
    name: team.name,
    abbr: team.abbr,
    displayName: getTeamDisplayName(city, team),
    newsSummary: null,
    sourceArticles: [],
    recentGames: [],
    skippedReason: null,
    error: null,
  };
}

async function generateLeagueNews(city, leagueKey, config, costTracker) {
  const espnOptions = getEspnOptions(config);
  const leagueBlock = {
    newsSummary: null,
    sourceArticles: [],
    sourceRedditPosts: [],
    error: null,
    teams: {},
  };

  try {
    const leagueNews = await fetchLeagueNews(leagueKey, 50, espnOptions);
    const leagueArticles = await extractNewsArticles(
      leagueNews,
      config.newsHeadlineLimit,
      espnOptions,
    );
    const redditPosts = await fetchLeagueRedditPosts(leagueKey, config);
    const leagueNewsPrompt = buildLeagueNewsPrompt({
      cityLabel: city.label,
      leagueKey,
      articles: leagueArticles,
      redditPosts,
    });

    leagueBlock.newsSummary = await summarize({
      prompt: leagueNewsPrompt,
      config,
      label: `${city.slug}/${leagueKey}/league-news`,
      costTracker,
    });
    leagueBlock.sourceArticles = leagueArticles;
    leagueBlock.sourceRedditPosts = redditPosts;
  } catch (error) {
    warnStep(`${city.slug}/${leagueKey}/league-news`, error);
    leagueBlock.error = errorMessage(error);
  }

  return leagueBlock;
}

async function generateGameSummary(
  city,
  leagueKey,
  team,
  game,
  config,
  costTracker,
  espnOptions,
  fetchCache,
) {
  const summaryData = await fetchGameSummary(leagueKey, game.id, espnOptions);
  const gameContext = await buildGameContext(
    summaryData,
    team,
    leagueKey,
    espnOptions,
    fetchCache,
  );
  const gamePrompt = buildGamePrompt({
    cityLabel: city.label,
    team,
    leagueKey,
    gameContext,
  });
  const gameSummary = await summarize({
    prompt: gamePrompt,
    config,
    label: `${city.slug}/${leagueKey}/${team.abbr}/game/${game.id}`,
    costTracker,
  });

  return {
    gameId: game.id,
    date: gameContext.date,
    matchup: gameContext.matchup,
    opponent: gameContext.opponent.name,
    result: `${gameContext.focusTeam.score}-${gameContext.opponent.score}`,
    summary: gameSummary,
  };
}

async function generateTeamEntry(
  city,
  leagueKey,
  team,
  config,
  costTracker,
  leagueRedditPosts,
  { startDate, endDate },
  fetchCache,
) {
  const espnOptions = getEspnOptions(config);
  const teamEntry = createTeamEntry(city, team);
  const label = `${city.slug}/${leagueKey}/${team.abbr}`;
  const displayTeam = { ...team, displayName: teamEntry.displayName };

  try {
    teamEntry.sourceArticles = await resolveTeamNews(
      leagueKey,
      displayTeam,
      config.newsHeadlineLimit,
      espnOptions,
    );
    teamEntry.sourceRedditPosts = await fetchTeamRedditPosts({
      citySlug: city.slug,
      leagueKey,
      team: displayTeam,
      cityLabel: city.label,
      leagueRedditPosts,
      config,
    });

    const teamNewsPrompt = buildTeamNewsPrompt({
      cityLabel: city.label,
      team,
      leagueKey,
      articles: teamEntry.sourceArticles,
      redditPosts: teamEntry.sourceRedditPosts,
    });
    teamEntry.newsSummary = await summarize({
      prompt: teamNewsPrompt,
      config,
      label: `${label}/team-news`,
      costTracker,
    });
  } catch (error) {
    warnStep(`${label}/team-news`, error);
    teamEntry.error = errorMessage(error);
    return teamEntry;
  }

  let completedGames = [];
  try {
    const schedule = await fetchTeamSchedule(leagueKey, team.abbr, espnOptions);
    completedGames = extractCompletedGames(schedule, {
      startDate,
      endDate,
      limit: config.gamesPerTeam,
    });
  } catch (error) {
    warnStep(`${label}/schedule`, error);
    teamEntry.error = errorMessage(error);
    return teamEntry;
  }

  if (completedGames.length === 0) {
    teamEntry.skippedReason =
      'No completed games in lookback window (likely off-season or idle period)';
    return teamEntry;
  }

  for (const game of completedGames) {
    try {
      teamEntry.recentGames.push(
        await generateGameSummary(
          city,
          leagueKey,
          team,
          game,
          config,
          costTracker,
          espnOptions,
          fetchCache,
        ),
      );
    } catch (error) {
      warnStep(`${label}/game/${game.id}`, error);
      teamEntry.recentGames.push({
        gameId: game.id,
        error: errorMessage(error),
      });
    }
  }

  return teamEntry;
}

export function countGenerationErrors(payload) {
  let count = 0;

  for (const leagueBlock of Object.values(payload.leagues || {})) {
    if (leagueBlock.error) {
      count += 1;
    }
    for (const teamBlock of Object.values(leagueBlock.teams || {})) {
      if (teamBlock.error) {
        count += 1;
      }
      for (const game of teamBlock.recentGames || []) {
        if (game.error) {
          count += 1;
        }
      }
    }
  }

  return count;
}

export async function generateCitySummary(city, summaryDate, config) {
  const fetchCache = createFetchCache();
  const costTracker = createCostTracker();
  const { startDate, endDate } = getGameWindow(summaryDate, config.gameLookbackDays);

  const payload = {
    city: city.slug,
    cityLabel: city.label,
    date: summaryDate,
    generatedAt: new Date().toISOString(),
    gameWindow: { startDate, endDate },
    leagues: {},
  };

  for (const leagueKey of LEAGUES) {
    const teams = getTeamsForLeague(city, leagueKey);
    const leagueBlock = await generateLeagueNews(city, leagueKey, config, costTracker);

    for (const team of teams) {
      leagueBlock.teams[team.abbr] = await generateTeamEntry(
        city,
        leagueKey,
        team,
        config,
        costTracker,
        leagueBlock.sourceRedditPosts,
        { startDate, endDate },
        fetchCache,
      );
    }

    payload.leagues[leagueKey] = leagueBlock;
  }

  payload.openAiUsage = logCostAggregate({
    city: city.slug,
    date: summaryDate,
    model: config.openAiModel,
    costTracker,
    mockLlm: config.mockLlm,
  });

  return payload;
}
