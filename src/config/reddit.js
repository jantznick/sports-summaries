/**
 * Primary subreddit per league for trending discussion.
 */
export const LEAGUE_SUBREDDITS = {
  mlb: 'baseball',
  nfl: 'nfl',
  nba: 'nba',
  nhl: 'hockey',
};

/** Team-specific subreddits keyed as `{citySlug}:{league}:{abbr}`. */
export const TEAM_SUBREDDITS = {
  'chicago:nfl:chi': 'CHIBears',
  'chicago:nba:chi': 'chicagobulls',
  'chicago:mlb:chc': 'CHICubs',
  'chicago:mlb:chw': 'whitesox',
  'chicago:nhl:chi': 'hawks',

  'losangeles:nfl:lar': 'LosAngelesRams',
  'losangeles:nfl:lac': 'Chargers',
  'losangeles:nba:lal': 'lakers',
  'losangeles:nba:lac': 'LAClippers',
  'losangeles:mlb:lad': 'Dodgers',
  'losangeles:mlb:laa': 'angelsbaseball',
  'losangeles:nhl:la': 'losangeleskings',

  'newyork:nfl:nyg': 'NYGiants',
  'newyork:nfl:nyj': 'nyjets',
  'newyork:nba:ny': 'NYKnicks',
  'newyork:nba:bkn': 'GoNets',
  'newyork:mlb:nyy': 'NYYankees',
  'newyork:mlb:nym': 'NewYorkMets',
  'newyork:nhl:nyr': 'NYRangers',
  'newyork:nhl:nyi': 'NYIslanders',
};

/** Reddit listing sorts to merge for league/team summaries. */
export const REDDIT_LISTINGS = ['hot', 'top', 'rising', 'best'];

export function getTeamSubreddit(citySlug, leagueKey, teamAbbr) {
  return TEAM_SUBREDDITS[`${citySlug}:${leagueKey}:${teamAbbr}`] || null;
}
