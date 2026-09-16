import { createController } from '@controllers/helpers/controller-factory';
import { getUserActiveImportBatchDeleteStatus } from '@services/import-export/delete-batch-queue';
import { z } from 'zod';

/**
 * GET /import/batch-delete/status
 *
 * User-scoped status of the background batch delete, polled to drive the
 * app-blocking overlay. Never 404s: returns `idle` when nothing is running.
 */
export const batchDeleteStatusController = createController(z.object({}), async ({ user, res }) => {
  // Polled to drive the blocking overlay — a conditional-cache hit here could
  // freeze a client on a stale status, so opt out of HTTP caching.
  res.setHeader('Cache-Control', 'no-store');
  const status = await getUserActiveImportBatchDeleteStatus({ userId: user.id });
  return { data: status };
});
