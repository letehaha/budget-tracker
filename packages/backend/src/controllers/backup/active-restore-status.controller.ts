import { createController } from '@controllers/helpers/controller-factory';
import { getUserActiveRestoreStatus } from '@services/backup';
import { z } from 'zod';

const schema = z.object({});

/**
 * GET /user/backup/restore/status
 *
 * User-scoped restore status (no job id), polled on every boot to drive the
 * blocking overlay when a restore is in flight — or to wipe + reload once when a
 * restore completed while this device was away. Never 404s: returns `idle` when
 * nothing is running.
 */
export const activeRestoreStatusController = createController(schema, async ({ user, res }) => {
  // Polled to drive the blocking overlay — a conditional-cache hit here could
  // freeze a client on a stale status, so opt out of HTTP caching.
  res.setHeader('Cache-Control', 'no-store');
  const status = await getUserActiveRestoreStatus({ userId: user.id });
  return { data: status };
});
