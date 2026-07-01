import 'dotenv/config';
import express from 'express';
import { loadConfig } from './config/env.js';
import { createCityRouter } from './routes/city.js';

const config = loadConfig();
const app = express();

app.use(createCityRouter(config));

app.listen(config.port, () => {
  console.log(`Sports summaries API listening on http://localhost:${config.port}`);
  console.log(`Supported cities: chicago, losangeles, newyork`);
  console.log(`USE_FIXTURES=${config.useFixtures} MOCK_LLM=${config.mockLlm}`);
});
