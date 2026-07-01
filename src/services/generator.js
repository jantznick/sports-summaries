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

export async function generateCitySummary(city, summaryDate, config) {
  const espnOptions = getEspnOptions(config);
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
    payload.leagues[leagueKey] = {
      newsSummary: null,
      teams: {},
    };

    const leagueNews = await fetchLeagueNews(leagueKey, 50, espnOptions);
    const leagueArticles = await extractNewsArticles(leagueNews, config.newsHeadlineLimit, espnOptions);
    const redditPosts = await fetchLeagueRedditPosts(leagueKey, config);
    const leagueNewsPrompt = buildLeagueNewsPrompt({
      cityLabel: city.label,
      leagueKey,
      articles: leagueArticles,
      redditPosts,
    });
    payload.leagues[leagueKey].newsSummary = await summarize({
      prompt: leagueNewsPrompt,
      config,
      label: `${city.slug}/${leagueKey}/league-news`,
      costTracker,
    });
    payload.leagues[leagueKey].sourceArticles = leagueArticles;
    payload.leagues[leagueKey].sourceRedditPosts = redditPosts;

    for (const team of teams) {
      const teamEntry = {
        name: team.name,
        abbr: team.abbr,
        displayName: getTeamDisplayName(city, team),
        newsSummary: null,
        sourceArticles: [],
        recentGames: [],
        skippedReason: null,
      };

      const schedule = await fetchTeamSchedule(leagueKey, team.abbr, espnOptions);
      const completedGames = extractCompletedGames(schedule, { startDate, endDate }).slice(
        0,
        config.gamesPerTeam,
      );

      const teamArticles = await resolveTeamNews(
        leagueKey,
        { ...team, displayName: getTeamDisplayName(city, team) },
        config.newsHeadlineLimit,
        espnOptions,
      );
      teamEntry.sourceArticles = teamArticles;

      const teamRedditPosts = await fetchTeamRedditPosts({
        citySlug: city.slug,
        leagueKey,
        team: { ...team, displayName: getTeamDisplayName(city, team) },
        cityLabel: city.label,
        leagueRedditPosts: redditPosts,
        config,
      });
      teamEntry.sourceRedditPosts = teamRedditPosts;

      const teamNewsPrompt = buildTeamNewsPrompt({
        cityLabel: city.label,
        team,
        leagueKey,
        articles: teamArticles,
        redditPosts: teamRedditPosts,
      });
      teamEntry.newsSummary = await summarize({
        prompt: teamNewsPrompt,
        config,
        label: `${city.slug}/${leagueKey}/${team.abbr}/team-news`,
        costTracker,
      });

      if (completedGames.length === 0) {
        teamEntry.skippedReason = 'No completed games in lookback window (likely off-season or idle period)';
        payload.leagues[leagueKey].teams[team.abbr] = teamEntry;
        continue;
      }

      for (const game of completedGames) {
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

        teamEntry.recentGames.push({
          gameId: game.id,
          date: gameContext.date,
          matchup: gameContext.matchup,
          opponent: gameContext.opponent.name,
          result: `${gameContext.focusTeam.score}-${gameContext.opponent.score}`,
          summary: gameSummary,
        });
      }

      payload.leagues[leagueKey].teams[team.abbr] = teamEntry;
    }
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
