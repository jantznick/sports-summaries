import fs from 'fs/promises';
import path from 'path';

export function getCachePath(cacheDir, citySlug) {
  return path.join(cacheDir, `${citySlug}.json`);
}

export function getArchiveCachePath(cacheDir, archiveDate, citySlug) {
  return path.join(cacheDir, `${archiveDate}-${citySlug}.json`);
}

export async function archiveCache(cacheDir, citySlug, archiveDate) {
  const sourcePath = getCachePath(cacheDir, citySlug);
  const archivePath = getArchiveCachePath(cacheDir, archiveDate, citySlug);

  try {
    await fs.access(sourcePath);
  } catch {
    return false;
  }

  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.copyFile(sourcePath, archivePath);
  console.log(`[cache] archived ${sourcePath} → ${archivePath}`);
}

export async function writeCache(cacheDir, citySlug, payload) {
  const filePath = getCachePath(cacheDir, citySlug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
