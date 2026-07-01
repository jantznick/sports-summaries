/**
 * City/team/league mapping.
 * 'abbr' must match ESPN's site API team abbreviation.
 * @see https://github.com/jefe317/fakefanreport/blob/main/config.php
 */

export const SPORT_LABELS = {
  nfl: { sport: 'football', label: 'Football' },
  nba: { sport: 'basketball', label: 'Basketball' },
  mlb: { sport: 'baseball', label: 'Baseball' },
  nhl: { sport: 'hockey', label: 'Hockey' },
};

export const CITIES = {
  chicago: {
    label: 'Chicago',
    teams: [
      { league: 'nfl', name: 'Bears', abbr: 'chi' },
      { league: 'nba', name: 'Bulls', abbr: 'chi' },
      { league: 'mlb', name: 'Cubs', abbr: 'chc' },
      { league: 'mlb', name: 'White Sox', abbr: 'chw' },
      { league: 'nhl', name: 'Blackhawks', abbr: 'chi' },
    ],
  },
  losangeles: {
    label: 'Los Angeles',
    teams: [
      { league: 'nfl', name: 'Rams', abbr: 'lar' },
      { league: 'nfl', name: 'Chargers', abbr: 'lac' },
      { league: 'nba', name: 'Lakers', abbr: 'lal' },
      { league: 'nba', name: 'Clippers', abbr: 'lac' },
      { league: 'mlb', name: 'Dodgers', abbr: 'lad' },
      { league: 'mlb', name: 'Angels', abbr: 'laa' },
      { league: 'nhl', name: 'Kings', abbr: 'la' },
    ],
  },
  newyork: {
    label: 'New York',
    teams: [
      { league: 'nfl', name: 'Giants', abbr: 'nyg' },
      { league: 'nfl', name: 'Jets', abbr: 'nyj' },
      { league: 'nba', name: 'Knicks', abbr: 'ny' },
      { league: 'nba', name: 'Nets', abbr: 'bkn' },
      { league: 'mlb', name: 'Yankees', abbr: 'nyy' },
      { league: 'mlb', name: 'Mets', abbr: 'nym' },
      { league: 'nhl', name: 'Rangers', abbr: 'nyr' },
      { league: 'nhl', name: 'Islanders', abbr: 'nyi' },
    ],
  },
};

export const SUPPORTED_CITIES = Object.keys(CITIES);

export const LEAGUES = ['mlb', 'nfl', 'nba', 'nhl'];

export function getCity(citySlug) {
  const city = CITIES[citySlug];
  if (!city) {
    return null;
  }
  return { slug: citySlug, ...city };
}

export function getLeagueMeta(leagueKey) {
  return SPORT_LABELS[leagueKey];
}

export function getTeamsForLeague(city, leagueKey) {
  return city.teams.filter((team) => team.league === leagueKey);
}
