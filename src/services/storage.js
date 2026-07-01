import {
  CopyObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { addDays } from '../utils/dates.js';
import { archiveCache, writeCache } from './cache.js';

let s3Client;

function getS3Client(config) {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: config.b2Endpoint,
      region: config.b2Region,
      credentials: {
        accessKeyId: config.b2KeyId,
        secretAccessKey: config.b2ApplicationKey,
      },
    });
  }
  return s3Client;
}

function normalizePrefix(config) {
  const prefix = config.b2KeyPrefix || 'summaries/';
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

export function getSummaryKey(citySlug, config) {
  return `${normalizePrefix(config)}${citySlug}.json`;
}

export function getArchiveKey(citySlug, archiveDate, config) {
  return `${normalizePrefix(config)}${archiveDate}-${citySlug}.json`;
}

function useB2(config) {
  return (
    config.storageBackend === 'b2' ||
    (config.storageBackend !== 'local' &&
      config.b2KeyId &&
      config.b2ApplicationKey &&
      config.b2Bucket &&
      config.b2Endpoint)
  );
}

export function getStorageBackend(config) {
  return useB2(config) ? 'b2' : 'local';
}

export function destroyS3Client() {
  s3Client?.destroy?.();
  s3Client = undefined;
}

export async function writeSummary(citySlug, payload, config) {
  const archiveDate = addDays(payload.date, -1);

  if (useB2(config)) {
    await archiveSummaryOnB2(citySlug, archiveDate, config);
  }
  await archiveCache(config.cacheDir, citySlug, archiveDate);

  if (useB2(config)) {
    await writeSummaryToB2(citySlug, payload, config);
  }
  await writeCache(config.cacheDir, citySlug, payload);
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function archiveSummaryOnB2(citySlug, archiveDate, config) {
  const client = getS3Client(config);
  const sourceKey = getSummaryKey(citySlug, config);
  const archiveKey = getArchiveKey(citySlug, archiveDate, config);

  const exists = await objectExists(client, config.b2Bucket, sourceKey);
  if (!exists) {
    return;
  }

  await client.send(
    new CopyObjectCommand({
      Bucket: config.b2Bucket,
      Key: archiveKey,
      CopySource: `${config.b2Bucket}/${sourceKey}`,
      ContentType: 'application/json',
    }),
  );

  console.log(`[b2] archived s3://${config.b2Bucket}/${sourceKey} → ${archiveKey}`);
}

async function writeSummaryToB2(citySlug, payload, config) {
  const client = getS3Client(config);
  const key = getSummaryKey(citySlug, config);
  const body = `${JSON.stringify(payload, null, 2)}\n`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.b2Bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }),
  );

  console.log(`[b2] uploaded s3://${config.b2Bucket}/${key} (date=${payload.date})`);
}
