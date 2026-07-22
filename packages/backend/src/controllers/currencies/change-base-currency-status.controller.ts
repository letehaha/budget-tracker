import { createController } from '@controllers/helpers/controller-factory';
import { getBaseCurrencyChangeStatus } from '@services/currencies/base-currency-change-status.service';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user, res }) => {
  // Polled every 2s to drive the blocking overlay — an ETag/conditional-cache hit
  // here could freeze a client on a stale status, so opt out of HTTP caching.
  res.setHeader('Cache-Control', 'no-store');
  const status = await getBaseCurrencyChangeStatus({ userId: user.id });
  return { data: status };
});
