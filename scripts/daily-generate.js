import 'dotenv/config';
import { SUPPORTED_CITIES, getCity } from '../src/config/cities.js';
import { loadConfig } from '../src/config/env.js';
import { countGenerationErrors, generateCitySummary } from '../src/services/generator.js';
import { getStorageBackend, writeSummary, destroyS3Client } from '../src/services/storage.js';
import { getTodayEst, isValidDateOnly } from '../src/utils/dates.js';

async function main() {
  const summaryDate = process.argv[2] || getTodayEst();

  if (!isValidDateOnly(summaryDate)) {
    console.error('Invalid date. Use YYYY-MM-DD.');
    process.exit(1);
  }

  const config = loadConfig();
  console.log(`Daily generate for ${summaryDate}`);
  console.log(`Storage backend: ${getStorageBackend(config)}`);

  if (!config.mockLlm && !config.openAiApiKey) {
    console.error('OPENAI_API_KEY is required unless MOCK_LLM=true');
    process.exit(1);
  }

  const failedCities = [];

  for (const citySlug of SUPPORTED_CITIES) {
    console.log(`\nGenerating ${citySlug}...`);

    try {
      const summary = await generateCitySummary(getCity(citySlug), summaryDate, config);
      await writeSummary(citySlug, summary, config);

      const partialErrors = countGenerationErrors(summary);
      const errorNote =
        partialErrors > 0 ? `, ${partialErrors} partial error(s)` : '';

      console.log(
        `Done ${citySlug}: ${summary.openAiUsage?.callCount || 0} LLM calls, ` +
          `cost ${summary.openAiUsage?.totalCost ?? 'n/a'}${errorNote}`,
      );
    } catch (error) {
      console.error(`Failed ${citySlug}:`, error);
      failedCities.push(citySlug);
    }
  }

  if (failedCities.length > 0) {
    console.error(`\nFailed cities: ${failedCities.join(', ')}`);
    destroyS3Client();
    process.exit(1);
  }

  console.log('\nAll cities uploaded.');
  destroyS3Client();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  destroyS3Client();
  process.exit(1);
});
