import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { errorHandler } from '@controllers/helpers';
import { authenticateSession } from '@middlewares/better-auth';
import { syncExchangeRates } from '@services/exchange-rates/sync-exchange-rates';
import { Router } from 'express';

const router = Router();

// oxlint-disable-next-line oxc/no-async-endpoint-handlers – used only in tests
router.get('/exchange-rates/sync', authenticateSession, async (req, res) => {
  try {
    await syncExchangeRates();

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
});

export default router;
