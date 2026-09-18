import type { S3Client } from '@aws-sdk/client-s3';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';

interface StoredObject {
  key: string;
  lastModified: Date;
}

/** Blob path for an attachment row; the orphan sweep matches stored keys against this shape. */
export const storageKey = ({ userId, id }: { userId: number; id: string }) => `${userId}/${id}`;

export const STORAGE_KEY_PATTERN = /^\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** S3-compatible storage (Cloudflare R2) is used whenever a bucket is configured; disk otherwise. */
const bucket = (): string | undefined => process.env.ATTACHMENTS_S3_BUCKET || undefined;

let s3Promise: Promise<{ sdk: typeof import('@aws-sdk/client-s3'); client: S3Client }> | null = null;

const s3 = () => {
  s3Promise ??= import('@aws-sdk/client-s3').then((sdk) => ({
    sdk,
    client: new sdk.S3Client({
      region: 'auto',
      endpoint: process.env.ATTACHMENTS_S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.ATTACHMENTS_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.ATTACHMENTS_S3_SECRET_ACCESS_KEY!,
      },
    }),
  }));
  return s3Promise;
};

const localRoot = (): string => {
  if (process.env.ATTACHMENTS_DIR) return path.resolve(process.env.ATTACHMENTS_DIR);
  if (process.env.NODE_ENV === 'test') {
    return path.join(os.tmpdir(), `bt-attachments-test-${process.env.JEST_WORKER_ID ?? '0'}`);
  }
  return path.join(process.cwd(), 'data', 'attachments');
};

/** Keys are server-generated, but a resolved path outside the root is still refused. */
const localPath = ({ key }: { key: string }): string => {
  const root = localRoot();
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep)) {
    throw new ValidationError({ message: 'Invalid attachment storage key.' });
  }
  return resolved;
};

const missing = () => new NotFoundError({ message: t({ key: 'attachments.fileNotFound' }) });

export const putObject = async ({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> => {
  const Bucket = bucket();
  if (Bucket) {
    const { sdk, client } = await s3();
    await client.send(new sdk.PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    return;
  }

  const file = localPath({ key });
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, body);
};

export const getObjectStream = async ({ key }: { key: string }): Promise<Readable> => {
  const Bucket = bucket();
  if (Bucket) {
    const { sdk, client } = await s3();
    try {
      const result = await client.send(new sdk.GetObjectCommand({ Bucket, Key: key }));
      if (!result.Body) throw missing();
      return result.Body as Readable;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') throw missing();
      throw error;
    }
  }

  const file = localPath({ key });
  try {
    await fsp.stat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw missing();
    throw error;
  }
  return fs.createReadStream(file);
};

export const deleteObject = async ({ key }: { key: string }): Promise<void> => {
  const Bucket = bucket();
  if (Bucket) {
    const { sdk, client } = await s3();
    await client.send(new sdk.DeleteObjectCommand({ Bucket, Key: key }));
    return;
  }

  await fsp.rm(localPath({ key }), { force: true });
};

export const listObjects = async (): Promise<StoredObject[]> => {
  const Bucket = bucket();
  const objects: StoredObject[] = [];

  if (Bucket) {
    const { sdk, client } = await s3();
    let token: string | undefined;
    do {
      const page = await client.send(new sdk.ListObjectsV2Command({ Bucket, ContinuationToken: token }));
      for (const item of page.Contents ?? []) {
        if (item.Key) objects.push({ key: item.Key, lastModified: item.LastModified ?? new Date(0) });
      }
      token = page.NextContinuationToken;
    } while (token);
    return objects;
  }

  // Keys are always `${userId}/${id}`, so a two-level walk covers the whole root.
  const root = localRoot();
  const userDirs = await fsp.readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const files = await fsp.readdir(path.join(root, userDir.name), { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      const stat = await fsp.stat(path.join(root, userDir.name, file.name));
      objects.push({ key: `${userDir.name}/${file.name}`, lastModified: stat.mtime });
    }
  }
  return objects;
};
