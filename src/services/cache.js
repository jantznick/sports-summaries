import fs from 'fs/promises';
import path from 'path';

const locks = new Map();

export function getCachePath(cacheDir, citySlug, dateStr) {
  return path.join(cacheDir, citySlug, `${dateStr}.json`);
}

export async function readCache(cacheDir, citySlug, dateStr) {
  const filePath = getCachePath(cacheDir, citySlug, dateStr);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeCache(cacheDir, citySlug, dateStr, payload) {
  const filePath = getCachePath(cacheDir, citySlug, dateStr);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/**
 * Ensures only one generation runs per city/date at a time.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withGenerationLock(key, fn) {
  while (locks.has(key)) {
    await locks.get(key);
  }

  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(key, gate);

  try {
    return await fn();
  } finally {
    locks.delete(key);
    release();
  }
}
