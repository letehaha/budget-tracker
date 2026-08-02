import type { ResourceLease } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Disk cache for payloads that outlive a single request but must not outlive the
 * user's interest in them — a parsed upload held while its wizard is filled in,
 * for example.
 *
 * Each entry is two files: the payload, written once, and a small meta file
 * holding the lease. Refreshing rewrites only the meta, so extending a lease
 * costs a few bytes regardless of how large the payload is. The meta is also the
 * only place expiry is read from, so there is no second source of truth to drift
 * out of step with it.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const META_SUFFIX = '.meta.json';
const PAYLOAD_SUFFIX = '.json';

/** Never `.json`, so a half-written meta cannot be read back as a payload or as
 *  a live entry by the sweeper. */
const TEMP_SUFFIX = '.tmp';

interface LeaseMeta {
  /** ISO instant the entry was stored, which fixes its absolute deadline. */
  createdAt: string;
  expiresAt: string;
}

/**
 * The one operation the lease registry needs, kept separate from the payload
 * type so caches holding unrelated payloads can sit in the same registry.
 * Refresh-only on purpose: everything reachable from the registry is reachable
 * from a client request, and `hold` is not a decision a client may make.
 */
export interface ResourceLeaseRefresher {
  refresh({ userId, id }: { userId: number; id: string }): Promise<ResourceLease>;
}

interface ExpiringUploadCache<TPayload> extends ResourceLeaseRefresher {
  store({ userId, payload }: { userId: number; payload: TPayload }): Promise<{ id: string; lease: ResourceLease }>;
  read({ userId, id }: { userId: number; id: string }): Promise<TPayload>;
  /** Confirm an entry is live without loading its payload. */
  assertExists({ userId, id }: { userId: number; id: string }): Promise<void>;
  /**
   * Push the expiry straight to the absolute deadline, for work that has been
   * handed to a background job: nobody is left to refresh it, and the job may
   * not read the payload until it reaches the front of a backlog.
   */
  hold({ userId, id }: { userId: number; id: string }): Promise<ResourceLease>;
  remove({ userId, id }: { userId: number; id: string }): Promise<void>;
}

export function createExpiringUploadCache<TPayload>({
  namespace,
  idleTtlMs,
  maxLifetimeMs,
  missingMessage,
}: {
  /** Directory name under the system temp dir. Must be unique per cache. */
  namespace: string;
  /** How long an entry survives without a refresh. */
  idleTtlMs: number;
  /** Ceiling on total lifetime. Refreshing can never push an entry past it. */
  maxLifetimeMs: number;
  /** Shown for every miss, whatever the underlying cause. */
  missingMessage: string;
}): ExpiringUploadCache<TPayload> {
  const directory = join(tmpdir(), namespace);

  const missing = () => new NotFoundError({ message: missingMessage });

  /**
   * The id reaches us from a request body, so anything that is not a plain UUID
   * is refused before it can build a path: a value containing `..` or a
   * separator would otherwise point the read outside the cache directory.
   */
  const assertPlainId = ({ id }: { id: string }): void => {
    if (!UUID_PATTERN.test(id)) throw missing();
  };

  /** The owner is part of the filename, so reads are scoped by construction —
   *  another user asking for the same id builds a path that does not exist. */
  const payloadPath = ({ userId, id }: { userId: number; id: string }) =>
    join(directory, `${userId}-${id}${PAYLOAD_SUFFIX}`);

  const metaPath = ({ userId, id }: { userId: number; id: string }) => join(directory, `${userId}-${id}${META_SUFFIX}`);

  const remove = async ({ userId, id }: { userId: number; id: string }): Promise<void> => {
    assertPlainId({ id });
    await Promise.all(
      [metaPath({ userId, id }), payloadPath({ userId, id })].map((path) => unlink(path).catch(() => undefined)),
    );
  };

  const maxExpiresAtMs = ({ meta }: { meta: LeaseMeta }) => new Date(meta.createdAt).getTime() + maxLifetimeMs;

  const toLease = ({ meta }: { meta: LeaseMeta }): ResourceLease => {
    const now = Date.now();
    const deadline = maxExpiresAtMs({ meta });

    return {
      expiresAt: meta.expiresAt,
      maxExpiresAt: new Date(deadline).toISOString(),
      expiresInMs: Math.max(0, new Date(meta.expiresAt).getTime() - now),
      maxExpiresInMs: Math.max(0, deadline - now),
    };
  };

  /**
   * Rewrite the lease atomically. The meta file is the only record of when an
   * entry dies, so a half-written one would make the next read drop a payload
   * that is still perfectly good.
   */
  const writeMeta = async ({ userId, id, meta }: { userId: number; id: string; meta: LeaseMeta }): Promise<void> => {
    const target = metaPath({ userId, id });
    const temp = `${target}.${randomUUID()}${TEMP_SUFFIX}`;

    await writeFile(temp, JSON.stringify(meta), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, target);
  };

  const parseMeta = ({ raw }: { raw: string }): LeaseMeta | null => {
    try {
      const meta = JSON.parse(raw) as LeaseMeta;
      const createdAtMs = new Date(meta.createdAt).getTime();
      const expiresAtMs = new Date(meta.expiresAt).getTime();
      if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiresAtMs)) return null;
      return meta;
    } catch {
      return null;
    }
  };

  /**
   * The live lease for an entry, or null when it is gone, unreadable, or past
   * its expiry. A dead entry is deleted on the way out so a retry does not have
   * to wait for the next sweep to stop failing the same way.
   */
  const loadLiveMeta = async ({ userId, id }: { userId: number; id: string }): Promise<LeaseMeta | null> => {
    let raw: string;
    try {
      raw = await readFile(metaPath({ userId, id }), 'utf8');
    } catch {
      return null;
    }

    const meta = parseMeta({ raw });
    if (!meta || new Date(meta.expiresAt).getTime() <= Date.now()) {
      await remove({ userId, id });
      return null;
    }

    return meta;
  };

  /**
   * Delete entries whose lease has run out. Driven entirely by the meta files,
   * which stay small however large the payloads grow. A payload with no meta —
   * or a temp file a crashed meta write left behind — is a half-finished entry,
   * so it goes once it is old enough that no in-flight write could still be
   * completing it.
   */
  const sweepExpired = async (): Promise<void> => {
    const entries = await readdir(directory);
    const metaEntries = entries.filter((entry) => entry.endsWith(META_SUFFIX));
    const metaKeys = new Set(metaEntries.map((entry) => entry.slice(0, -META_SUFFIX.length)));

    for (const entry of metaEntries) {
      const raw = await readFile(join(directory, entry), 'utf8').catch(() => null);
      const meta = raw === null ? null : parseMeta({ raw });
      if (meta && new Date(meta.expiresAt).getTime() > Date.now()) continue;

      const key = entry.slice(0, -META_SUFFIX.length);
      await unlink(join(directory, entry)).catch(() => undefined);
      await unlink(join(directory, `${key}${PAYLOAD_SUFFIX}`)).catch(() => undefined);
    }

    const orphanCutoff = Date.now() - maxLifetimeMs;
    for (const entry of entries) {
      if (entry.endsWith(META_SUFFIX)) continue;

      if (!entry.endsWith(TEMP_SUFFIX)) {
        if (!entry.endsWith(PAYLOAD_SUFFIX)) continue;
        if (metaKeys.has(entry.slice(0, -PAYLOAD_SUFFIX.length))) continue;
      }

      const path = join(directory, entry);
      const stats = await stat(path).catch(() => null);
      if (stats && stats.mtimeMs <= orphanCutoff) await unlink(path).catch(() => undefined);
    }
  };

  return {
    async store({ userId, payload }) {
      await mkdir(directory, { recursive: true, mode: 0o700 });

      // Best effort: a failed sweep only leaves entries on disk for another
      // round, so it must never fail the request the user is waiting on.
      try {
        await sweepExpired();
      } catch (err) {
        logger.error({ message: `[${namespace}] Failed to sweep expired entries`, error: err as Error });
      }

      const id = randomUUID();
      const now = Date.now();
      const meta: LeaseMeta = {
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + Math.min(idleTtlMs, maxLifetimeMs)).toISOString(),
      };

      // 0600 because an entry holds the user's own data and the system temp
      // directory is readable by every account on the host.
      const writeOptions = { encoding: 'utf8', mode: 0o600 } as const;

      // Payload first: a crash between the two writes then leaves an orphan the
      // sweeper collects, rather than a live-looking lease over a missing file.
      await writeFile(payloadPath({ userId, id }), JSON.stringify(payload), writeOptions);
      await writeFile(metaPath({ userId, id }), JSON.stringify(meta), writeOptions);

      return { id, lease: toLease({ meta }) };
    },

    async read({ userId, id }) {
      assertPlainId({ id });

      const meta = await loadLiveMeta({ userId, id });
      if (!meta) throw missing();

      let raw: string;
      try {
        raw = await readFile(payloadPath({ userId, id }), 'utf8');
      } catch {
        await remove({ userId, id });
        throw missing();
      }

      try {
        return JSON.parse(raw) as TPayload;
      } catch {
        // A truncated entry can never become readable, so drop it instead of
        // leaving it to fail every retry until the sweeper catches up.
        await remove({ userId, id });
        throw missing();
      }
    },

    async assertExists({ userId, id }) {
      assertPlainId({ id });
      if (!(await loadLiveMeta({ userId, id }))) throw missing();
    },

    async refresh({ userId, id }) {
      assertPlainId({ id });

      const meta = await loadLiveMeta({ userId, id });
      if (!meta) throw missing();

      const now = Date.now();
      const deadline = maxExpiresAtMs({ meta });
      const expiresAtMs = Math.min(now + idleTtlMs, deadline);

      if (expiresAtMs <= now) {
        await remove({ userId, id });
        throw missing();
      }

      const refreshed: LeaseMeta = { createdAt: meta.createdAt, expiresAt: new Date(expiresAtMs).toISOString() };
      await writeMeta({ userId, id, meta: refreshed });

      return toLease({ meta: refreshed });
    },

    async hold({ userId, id }) {
      assertPlainId({ id });

      const meta = await loadLiveMeta({ userId, id });
      if (!meta) throw missing();

      const held: LeaseMeta = {
        createdAt: meta.createdAt,
        expiresAt: new Date(maxExpiresAtMs({ meta })).toISOString(),
      };
      await writeMeta({ userId, id, meta: held });

      return toLease({ meta: held });
    },

    remove,
  };
}
