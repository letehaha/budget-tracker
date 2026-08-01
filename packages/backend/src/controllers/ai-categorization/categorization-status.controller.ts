import { createController } from '@controllers/helpers/controller-factory';
import { getCategorizationStatus } from '@services/ai-categorization';
import { z } from 'zod';

const schema = z.object({});

/**
 * GET /user/ai/categorization/status
 *
 * User-scoped AI categorization status, fetched on boot so a reloaded page can
 * rehydrate the header progress indicator that SSE alone would have lost.
 * Never 404s: returns `idle` when nothing is running.
 */
export const categorizationStatusController = createController(schema, async ({ user, res }) => {
  // A conditional-cache hit here could freeze a client on a stale status, so
  // opt out of HTTP caching.
  res.setHeader('Cache-Control', 'no-store');
  const status = await getCategorizationStatus({ userId: user.id });
  return { data: status };
});
