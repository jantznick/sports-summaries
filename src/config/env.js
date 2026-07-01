import path from 'path';

function readBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function readInt(name, defaultValue) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readFloat(name) {
  const parsed = Number.parseFloat(process.env[name] || '');
  return Number.isFinite(parsed) ? parsed : null;
}

export function loadConfig() {
  return {
    port: readInt('PORT', 3000),
    nodeEnv: process.env.NODE_ENV || 'development',
    openAiApiKey: process.env.OPENAI_API_KEY || '',
    openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openAiInputCostPer1M: readFloat('OPENAI_INPUT_COST_PER_1M'),
    openAiOutputCostPer1M: readFloat('OPENAI_OUTPUT_COST_PER_1M'),
    mockLlm: readBool('MOCK_LLM', false),
    cacheDir: path.resolve(process.env.CACHE_DIR || './data/cache'),
    fixturesDir: path.resolve(process.env.FIXTURES_DIR || './data/fixtures'),
    useFixtures: readBool('USE_FIXTURES', false),
    maxFetchDays: readInt('MAX_FETCH_DAYS', 7),
    gameLookbackDays: readInt('GAME_LOOKBACK_DAYS', 30),
    gamesPerTeam: readInt('GAMES_PER_TEAM', 2),
    newsHeadlineLimit: readInt('NEWS_HEADLINE_LIMIT', 5),
    redditEnabled: readBool('REDDIT_ENABLED', true),
    redditPostLimit: readInt('REDDIT_POST_LIMIT', 10),
    redditListingLimit: readInt('REDDIT_LISTING_LIMIT', 25),
    redditUserAgent: process.env.REDDIT_USER_AGENT || 'sports-summaries/1.0.0 (local dev)',
  };
}
