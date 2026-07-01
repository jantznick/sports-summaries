import fs from 'fs/promises';
import path from 'path';
import { getTeamSubreddit, LEAGUE_SUBREDDITS, REDDIT_LISTINGS } from '../config/reddit.js';
import { stripHtml, truncateText } from '../utils/html.js';
import { fixtureKeyFromUrl } from './espn.js';

const REDDIT_BASE = 'https://www.reddit.com';

function getRedditUserAgent(config) {
  return config.redditUserAgent || 'sports-summaries/1.0.0 (local dev)';
}

export function getRedditListingUrl(subreddit, listing, limit = 25) {
  const base = `${REDDIT_BASE}/r/${subreddit}/${listing}.json`;
  const params = new URLSearchParams({
    limit: String(limit),
    raw_json: '1',
  });

  if (listing === 'top') {
    params.set('t', 'day');
  }

  return `${base}?${params.toString()}`;
}

async function readFixture(fixturesDir, url) {
  const filePath = path.join(fixturesDir, fixtureKeyFromUrl(url));
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function fetchJson(url, config) {
  if (config.useFixtures) {
    return readFixture(config.fixturesDir, url);
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': getRedditUserAgent(config),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit request failed (${response.status}) for ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  if (!contentType.includes('json') && raw.trimStart().startsWith('<')) {
    throw new Error(`Reddit returned HTML instead of JSON for ${url}. Check REDDIT_USER_AGENT.`);
  }

  return JSON.parse(raw);
}

function parseListingPosts(listingData, listingName) {
  const children = listingData?.data?.children || [];

  return children
    .filter((child) => child.kind === 't3')
    .map((child) => child.data)
    .filter(Boolean)
    .map((post) => ({
      id: post.id,
      title: post.title?.trim(),
      body: truncateText(stripHtml(post.selftext || ''), 1500),
      numComments: post.num_comments || 0,
      score: post.score || 0,
      subreddit: post.subreddit,
      permalink: post.permalink ? `https://www.reddit.com${post.permalink}` : null,
      listing: listingName,
      createdUtc: post.created_utc,
      stickied: Boolean(post.stickied),
    }))
    .filter((post) => post.title && !post.title.includes('[removed]'));
}

function mergePostsByComments(postLists, limit) {
  const byId = new Map();

  for (const posts of postLists) {
    for (const post of posts) {
      if (post.stickied) {
        continue;
      }
      const existing = byId.get(post.id);
      if (!existing || post.numComments > existing.numComments) {
        byId.set(post.id, post);
      }
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.numComments - a.numComments)
    .slice(0, limit);
}

async function fetchSubredditListingPosts(subreddit, config) {
  const listingLimit = config.redditListingLimit;
  const postLists = [];

  for (const listing of REDDIT_LISTINGS) {
    const url = getRedditListingUrl(subreddit, listing, listingLimit);
    try {
      const data = await fetchJson(url, config);
      postLists.push(parseListingPosts(data, listing));
    } catch (error) {
      if (config.useFixtures && error.code === 'ENOENT') {
        continue;
      }
      console.warn(`[reddit] Skipping r/${subreddit}/${listing}: ${error.message}`);
    }
  }

  return postLists;
}

export function filterRedditPostsForTeam(posts, team, cityLabel) {
  const terms = [team.displayName, team.name, `${cityLabel} ${team.name}`]
    .filter(Boolean)
    .map((term) => term.toLowerCase());

  return posts.filter((post) => {
    const text = `${post.title} ${post.body}`.toLowerCase();
    return terms.some((term) => text.includes(term));
  });
}

export async function fetchLeagueRedditPosts(leagueKey, config) {
  if (config.redditEnabled === false) {
    return [];
  }

  const subreddit = LEAGUE_SUBREDDITS[leagueKey];
  if (!subreddit) {
    return [];
  }

  const postLists = await fetchSubredditListingPosts(subreddit, config);
  return mergePostsByComments(postLists, config.redditPostLimit);
}

export async function fetchTeamRedditPosts({
  citySlug,
  leagueKey,
  team,
  cityLabel,
  leagueRedditPosts,
  config,
}) {
  if (config.redditEnabled === false) {
    return [];
  }

  const postLists = [];
  const teamSubreddit = getTeamSubreddit(citySlug, leagueKey, team.abbr);

  if (teamSubreddit) {
    postLists.push(...(await fetchSubredditListingPosts(teamSubreddit, config)));
  }

  const leagueMatches = filterRedditPostsForTeam(leagueRedditPosts, team, cityLabel);
  if (leagueMatches.length > 0) {
    postLists.push(leagueMatches);
  }

  return mergePostsByComments(postLists, config.redditPostLimit);
}

export { REDDIT_BASE };
