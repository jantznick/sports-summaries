import { getLeagueMeta } from '../config/cities.js';

function formatArticles(articles) {
  if (!articles.length) {
    return 'No recent articles available.';
  }

  return articles
    .map((item, index) => {
      const parts = [`${index + 1}. ${item.headline}`];
      if (item.body) {
        parts.push(`   ${item.body}`);
      }
      return parts.join('\n');
    })
    .join('\n\n');
}

function formatTeamGameStats(gameStats) {
  if (!gameStats?.length) {
    return '';
  }

  return gameStats
    .map((group) => `- ${group.category}: ${group.stats}`)
    .join('\n');
}

function formatPlayerProfiles(profiles) {
  if (!profiles?.length) {
    return '';
  }

  return profiles
    .map((player) => {
      const lines = [
        `- ${player.name} (${player.position}, ${player.statGroup})`,
        `  This game: ${player.gameStats}`,
      ];

      for (const seasonBlock of player.seasonStats || []) {
        lines.push(`  Season ${seasonBlock.label}: ${seasonBlock.stats}`);
      }
      for (const careerBlock of player.careerStats || []) {
        lines.push(`  Career ${careerBlock.label}: ${careerBlock.stats}`);
      }

      return lines.join('\n');
    })
    .join('\n');
}

export function buildGamePrompt({ cityLabel, team, leagueKey, gameContext }) {
  const leagueLabel = getLeagueMeta(leagueKey).label;

  return `You are writing for someone who does not follow sports but wants to stay casually informed about local conversations.

Write a short, friendly summary (2-4 sentences) focused on the ${team.name}'s perspective in this ${leagueLabel} game.

Audience: people in ${cityLabel} who may hear coworkers or friends mention this team.
Tone: casual but neutral. Avoid jargon where possible; briefly explain anything a non-fan would need.

Game details:
- Date: ${gameContext.date}
- Matchup: ${gameContext.matchup}
- ${gameContext.focusTeam.name}: ${gameContext.focusTeam.score}${gameContext.focusTeam.lineScore ? ` (${gameContext.focusTeam.lineScore} by period/inning)` : ''}
- ${gameContext.opponent.name}: ${gameContext.opponent.score}${gameContext.opponent.lineScore ? ` (${gameContext.opponent.lineScore} by period/inning)` : ''}
- Status: ${gameContext.status}
${gameContext.focusTeam.seasonRecord ? `- ${gameContext.focusTeam.name} season record: ${gameContext.focusTeam.seasonRecord}${gameContext.focusTeam.standing ? ` (${gameContext.focusTeam.standing})` : ''}` : ''}
${gameContext.opponent.seasonRecord ? `- ${gameContext.opponent.name} season record: ${gameContext.opponent.seasonRecord}${gameContext.opponent.standing ? ` (${gameContext.opponent.standing})` : ''}` : ''}
${gameContext.focusTeam.gameStats?.length ? `\n${gameContext.focusTeam.name} team stats this game:\n${formatTeamGameStats(gameContext.focusTeam.gameStats)}` : ''}
${gameContext.opponent.gameStats?.length ? `\n${gameContext.opponent.name} team stats this game:\n${formatTeamGameStats(gameContext.opponent.gameStats)}` : ''}
${gameContext.recap ? `\nFull game recap:\n${gameContext.recap}` : ''}
${gameContext.keyPlays?.length ? `\nKey plays:\n${gameContext.keyPlays.map((play) => `- ${play}`).join('\n')}` : ''}
${gameContext.playerProfiles?.length ? `\nKey players (game + season/career context):\n${formatPlayerProfiles(gameContext.playerProfiles)}` : ''}
${gameContext.notes?.length ? `\nNotes:\n${gameContext.notes.map((note) => `- ${note}`).join('\n')}` : ''}

Focus on: why this game might come up in conversation, who stood out, and whether the team is trending up or down. Use season/career stats only as helpful context — do not invent facts not supported above.`;
}

function formatRedditPosts(posts) {
  if (!posts?.length) {
    return 'No Reddit discussion threads available.';
  }

  return posts
    .map((post, index) => {
      const parts = [
        `${index + 1}. ${post.title} (r/${post.subreddit}, ${post.numComments} comments, ${post.listing})`,
      ];
      if (post.body) {
        parts.push(`   ${post.body}`);
      }
      return parts.join('\n');
    })
    .join('\n\n');
}

export function buildLeagueNewsPrompt({ cityLabel, leagueKey, articles, redditPosts = [] }) {
  const leagueLabel = getLeagueMeta(leagueKey).label;

  return `You are writing for sports-casual readers in ${cityLabel}.

Summarize the most conversation-worthy ${leagueLabel} news from the sources below in 2-4 sentences.
Prioritize trades, injuries, suspensions, milestones, playoff implications, or other major storylines a non-fan might hear about.
Use Reddit threads to capture what fans are actively discussing today; ESPN articles for official/reporting context.
If nothing is truly major, say that briefly and mention the most relevant storyline anyway.
Do not invent facts.

ESPN articles:
${formatArticles(articles)}

Reddit discussion (sorted by comment count across hot/top/rising/best):
${formatRedditPosts(redditPosts)}`;
}

export function buildTeamNewsPrompt({ cityLabel, team, leagueKey, articles, redditPosts = [] }) {
  const leagueLabel = getLeagueMeta(leagueKey).label;

  return `You are writing for sports-casual readers in ${cityLabel}.

Summarize the most conversation-worthy ${team.name} (${leagueLabel}) news from the sources below in 2-4 sentences.
Prioritize roster moves, injuries, discipline, contract news, manager/coach changes, or hot/cold streaks.
Use Reddit threads to capture what fans are actively discussing about the ${team.name} today; ESPN articles for official/reporting context.
If sources are thin or generic, say that briefly.
Do not invent facts.

ESPN articles:
${formatArticles(articles)}

Reddit discussion (team subreddit + league posts mentioning ${team.name}, sorted by comment count):
${formatRedditPosts(redditPosts)}`;
}
