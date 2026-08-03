import type { ResourceLease } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
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
 *
 * Single process only: the files live in this node's own temp directory, so a
 * second API replica or a worker running in its own container cannot see them
 * and reports every entry as missing.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const META_SUFFIX = '.meta.json';
const PAYLOAD_SUFFIX = '.json';

/** Never `.json`, so a half-written meta cannot be read back as a payload or as
 *  a live entry by the sweeper. */
const TEMP_SUFFIX = '.tmp';

/** Floor on how often a sweep may walk the shared directory. It reads every
 *  user's meta file, and expired entries cost nothing but disk until collected. */
const SWEEP_MIN_INTERVAL_MS = 60_000;

interface LeaseMeta {
  /** ISO instant the entry was stored, which fixes its absolute deadline. */
  createdAt: string;
  expiresAt: string;
  /** Job holding the entry exclusively. Only `claim` ever sets it. */
  claimedByJobId?: string;
}

/** ENOENT is the only errno meaning the file is genuinely gone. Every other one
 *  (EACCES, EMFILE, EIO…) is a read that failed, and treating that as an absent
 *  entry would report a live entry as expired and delete it. */
const isMissingFileError = ({ error }: { error: unknown }): boolean =>
  (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';

/**
 * The one operation the lease registry needs, kept separate from the payload
 * type so caches holding unrelated payloads can sit in the same registry.
 * Refresh-only on purpose: everything reachable from the registry is reachable
 * from a client request, and pinning an entry is not a client's decision.
 */
export interface ResourceLeaseRefresher {
  refresh({ userId, id }: { userId: number; id: string }): Promise<ResourceLease>;
}

interface ExpiringUploadCache<TPayload> extends ResourceLeaseRefresher {
  store({ userId, payload }: { userId: number; payload: TPayload }): Promise<{ id: string; lease: ResourceLease }>;
  read({ userId, id }: { userId: number; id: string }): Promise<TPayload>;
  /**
   * Push the expiry straight to the absolute deadline and record the job the
   * entry now belongs to, so work that must run once cannot be started twice
   * against the same entry: a second claim is refused. Pinning is what lets a
   * queued job read the payload after the idle window would have run out —
   * nobody is left refreshing once the client has handed the work over.
   * `isClaimStale` is asked about the job already on the entry, and lets a retry
   * take an entry back from a job that died.
   */
  claim({
    userId,
    id,
    jobId,
    isClaimStale,
  }: {
    userId: number;
    id: string;
    jobId: string;
    isClaimStale?: ({ jobId }: { jobId: string }) => Promise<boolean>;
  }): Promise<ResourceLease>;
  remove({ userId, id }: { userId: number; id: string }): Promise<void>;
  /** Awaitable sweep. `store` only ever fires it in the background and at most
   *  once per `SWEEP_MIN_INTERVAL_MS`, so tests drive it from here instead. */
  sweepExpired(): Promise<void>;
}

export function createExpiringUploadCache<TPayload>({
  namespace,
  idleTtlMs,
  maxLifetimeMs,
  missingMessage,
  claimedMessage = 'This upload is already being processed.',
}: {
  /** Directory name under the system temp dir. Must be unique per cache. */
  namespace: string;
  /** How long an entry survives without a refresh. */
  idleTtlMs: number;
  /** Ceiling on total lifetime. Refreshing can never push an entry past it. */
  maxLifetimeMs: number;
  /** Shown for every miss, whatever the underlying cause. */
  missingMessage: string;
  /** Shown when an entry is already claimed by work that is still alive. */
  claimedMessage?: string;
}): ExpiringUploadCache<TPayload> {
  const directory = join(tmpdir(), namespace);

  let lastSweepAtMs = 0;

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

  /**
   * Delete a file, treating one that is already gone as done. Any other errno
   * means the file is still there: reporting that as a delete would leave an
   * expired or corrupt entry on disk while every caller believes it is gone.
   */
  const deleteFile = async ({ path }: { path: string }): Promise<void> => {
    try {
      await unlink(path);
    } catch (err) {
      if (isMissingFileError({ error: err })) return;
      logger.error({ message: `[${namespace}] Failed to delete ${path}`, error: err as Error });
    }
  };

  /** The file's stats, or null when it is gone. A stat that failed for any other
   *  reason is logged and treated as unknown, so the sweeper leaves it alone. */
  const statFile = async ({ path }: { path: string }): Promise<Stats | null> => {
    try {
      return await stat(path);
    } catch (err) {
      if (!isMissingFileError({ error: err })) {
        logger.error({ message: `[${namespace}] Failed to stat ${path}`, error: err as Error });
      }
      return null;
    }
  };

  const remove = async ({ userId, id }: { userId: number; id: string }): Promise<void> => {
    assertPlainId({ id });
    await Promise.all([metaPath({ userId, id }), payloadPath({ userId, id })].map((path) => deleteFile({ path })));
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

  /**
   * Read one of an entry's files, null when it is genuinely gone. A read that
   * failed for any other reason is rethrown rather than reported as a miss:
   * every caller deletes on a miss and tells the user the entry expired.
   */
  const readEntryFile = async ({ path }: { path: string }): Promise<string | null> => {
    try {
      return await readFile(path, 'utf8');
    } catch (err) {
      if (isMissingFileError({ error: err })) return null;
      logger.error({ message: `[${namespace}] Failed to read ${path}`, error: err as Error });
      throw err;
    }
  };

  /** The lease an entry carries, or null when its meta is corrupt — which is
   *  logged, because callers cannot tell that apart from an ordinary expiry. */
  const parseMeta = ({ raw }: { raw: string }): LeaseMeta | null => {
    try {
      const meta = JSON.parse(raw) as LeaseMeta;
      const createdAtMs = new Date(meta.createdAt).getTime();
      const expiresAtMs = new Date(meta.expiresAt).getTime();
      if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiresAtMs)) {
        logger.error({
          message: `[${namespace}] Lease meta has unusable timestamps`,
          error: new Error(`createdAt=${meta.createdAt} expiresAt=${meta.expiresAt}`),
        });
        return null;
      }
      return meta;
    } catch (err) {
      logger.error({ message: `[${namespace}] Failed to parse lease meta`, error: err as Error });
      return null;
    }
  };

  /**
   * The live lease for an entry, or null when it is gone, corrupt, or past its
   * expiry. A dead entry is deleted on the way out so a retry does not have to
   * wait for the next sweep to stop failing the same way.
   */
  const loadLiveMeta = async ({ userId, id }: { userId: number; id: string }): Promise<LeaseMeta | null> => {
    const raw = await readEntryFile({ path: metaPath({ userId, id }) });
    if (raw === null) return null;

    const meta = parseMeta({ raw });
    if (!meta || new Date(meta.expiresAt).getTime() <= Date.now()) {
      await remove({ userId, id });
      return null;
    }

    return meta;
  };

  /**
   * The shared body of every lease rewrite: load the live lease, let `next`
   * decide the replacement, write it back. `next` returning null means the entry
   * cannot be kept alive, which deletes it and reports it as missing.
   */
  const rewriteLease = async ({
    userId,
    id,
    next,
  }: {
    userId: number;
    id: string;
    next: ({ meta }: { meta: LeaseMeta }) => Promise<LeaseMeta | null> | LeaseMeta | null;
  }): Promise<ResourceLease> => {
    assertPlainId({ id });

    const meta = await loadLiveMeta({ userId, id });
    if (!meta) throw missing();

    const updated = await next({ meta });
    if (!updated) {
      await remove({ userId, id });
      throw missing();
    }

    await writeMeta({ userId, id, meta: updated });

    return toLease({ meta: updated });
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

    let unreadable: Error | null = null;

    for (const entry of metaEntries) {
      let raw: string | null;
      try {
        raw = await readFile(join(directory, entry), 'utf8');
      } catch (err) {
        // A meta that is genuinely gone leaves a payload behind to collect. One we
        // merely failed to read says nothing about whether its entry is alive, and
        // this walks every user's entries — so leave it for the next round.
        if (!isMissingFileError({ error: err })) {
          unreadable = err as Error;
          continue;
        }
        raw = null;
      }

      const meta = raw === null ? null : parseMeta({ raw });
      if (meta && new Date(meta.expiresAt).getTime() > Date.now()) continue;

      const key = entry.slice(0, -META_SUFFIX.length);
      await deleteFile({ path: join(directory, entry) });
      await deleteFile({ path: join(directory, `${key}${PAYLOAD_SUFFIX}`) });
    }

    if (unreadable) {
      logger.error({ message: `[${namespace}] Skipped unreadable lease files while sweeping`, error: unreadable });
    }

    const orphanCutoff = Date.now() - maxLifetimeMs;
    for (const entry of entries) {
      if (entry.endsWith(META_SUFFIX)) continue;

      if (!entry.endsWith(TEMP_SUFFIX)) {
        if (!entry.endsWith(PAYLOAD_SUFFIX)) continue;
        if (metaKeys.has(entry.slice(0, -PAYLOAD_SUFFIX.length))) continue;
      }

      const path = join(directory, entry);
      const stats = await statFile({ path });
      if (stats && stats.mtimeMs <= orphanCutoff) await deleteFile({ path });
    }
  };

  /**
   * Fire a sweep without making the caller wait for it. It reads every user's
   * meta file in the shared directory, so it is kept off the request path and
   * held to one run per `SWEEP_MIN_INTERVAL_MS`; entries it misses are collected
   * by the next run.
   */
  const sweepInBackground = (): void => {
    const now = Date.now();
    if (now - lastSweepAtMs < SWEEP_MIN_INTERVAL_MS) return;
    lastSweepAtMs = now;

    void sweepExpired().catch((err) => {
      logger.error({ message: `[${namespace}] Failed to sweep expired entries`, error: err as Error });
    });
  };

  return {
    async store({ userId, payload }) {
      await mkdir(directory, { recursive: true, mode: 0o700 });

      sweepInBackground();

      const id = randomUUID();
      const now = Date.now();
      const meta: LeaseMeta = {
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + Math.min(idleTtlMs, maxLifetimeMs)).toISOString(),
      };

      // Payload first: a crash between the two writes then leaves an orphan the
      // sweeper collects, rather than a live-looking lease over a missing file.
      // 0600 because an entry holds the user's own data and the system temp
      // directory is readable by every account on the host.
      await writeFile(payloadPath({ userId, id }), JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
      await writeMeta({ userId, id, meta });

      return { id, lease: toLease({ meta }) };
    },

    async read({ userId, id }) {
      assertPlainId({ id });

      const meta = await loadLiveMeta({ userId, id });
      if (!meta) throw missing();

      const raw = await readEntryFile({ path: payloadPath({ userId, id }) });
      if (raw === null) {
        await remove({ userId, id });
        throw missing();
      }

      try {
        return JSON.parse(raw) as TPayload;
      } catch (err) {
        // A truncated entry can never become readable, so drop it instead of
        // leaving it to fail every retry until the sweeper catches up. Logged
        // because the caller only sees the same message an expiry produces.
        logger.error({ message: `[${namespace}] Failed to parse cached payload`, error: err as Error });
        await remove({ userId, id });
        throw missing();
      }
    },

    refresh({ userId, id }) {
      return rewriteLease({
        userId,
        id,
        next: ({ meta }) => {
          const now = Date.now();
          const deadline = maxExpiresAtMs({ meta });
          // Never move an expiry earlier. An entry pinned for a background job
          // would otherwise be dragged back to the idle window by a client that
          // is still heartbeating it, and die before the job got to read it.
          const expiresAtMs = Math.min(Math.max(now + idleTtlMs, new Date(meta.expiresAt).getTime()), deadline);

          return expiresAtMs <= now ? null : { ...meta, expiresAt: new Date(expiresAtMs).toISOString() };
        },
      });
    },

    claim({ userId, id, jobId, isClaimStale }) {
      return rewriteLease({
        userId,
        id,
        next: async ({ meta }) => {
          const claimedBy = meta.claimedByJobId;
          if (claimedBy && claimedBy !== jobId) {
            const stale = (await isClaimStale?.({ jobId: claimedBy })) ?? false;
            if (!stale) throw new ConflictError({ message: claimedMessage });
          }

          return {
            ...meta,
            expiresAt: new Date(maxExpiresAtMs({ meta })).toISOString(),
            claimedByJobId: jobId,
          };
        },
      });
    },

    remove,

    sweepExpired,
  };
}
