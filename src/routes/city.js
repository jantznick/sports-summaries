import { Router } from 'express';
import { getCity, SUPPORTED_CITIES } from '../config/cities.js';
import { getTodayEst, isValidDateOnly, validateFetchWindow } from '../utils/dates.js';
import { readCache, withGenerationLock, writeCache } from '../services/cache.js';
import { generateCitySummary } from '../services/generator.js';

export function createCityRouter(config) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      cities: SUPPORTED_CITIES,
      useFixtures: config.useFixtures,
      mockLlm: config.mockLlm,
    });
  });

  router.get('/:city', async (req, res) => {
    const citySlug = req.params.city.toLowerCase();
    const city = getCity(citySlug);

    if (!city) {
      return res.status(404).json({
        error: 'Unknown city',
        supportedCities: SUPPORTED_CITIES,
      });
    }

    const requestedDate = (req.query.date || getTodayEst()).toString();
    if (!isValidDateOnly(requestedDate)) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD.',
      });
    }

    try {
      const cached = await readCache(config.cacheDir, citySlug, requestedDate);
      if (cached) {
        return res.json({ ...cached, cacheHit: true });
      }

      const windowCheck = validateFetchWindow(requestedDate, config.maxFetchDays);
      if (!windowCheck.allowed) {
        return res.status(400).json({
          error: windowCheck.reason,
          today: windowCheck.today,
          earliestAllowed: windowCheck.earliestAllowed,
        });
      }

      const summary = await withGenerationLock(`${citySlug}:${requestedDate}`, async () => {
        const cachedAfterLock = await readCache(config.cacheDir, citySlug, requestedDate);
        if (cachedAfterLock) {
          return cachedAfterLock;
        }

        const generated = await generateCitySummary(city, requestedDate, config);
        await writeCache(config.cacheDir, citySlug, requestedDate, generated);
        return generated;
      });

      return res.json({ ...summary, cacheHit: false });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Failed to generate summary',
        message: error.message,
      });
    }
  });

  return router;
}
