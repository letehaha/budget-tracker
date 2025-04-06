import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { errorHandler } from '@controllers/helpers';
import { authenticateJwt } from '@middlewares/passport';
import { syncExchangeRates } from '@services/exchange-rates/sync-exchange-rates';
import { Router } from 'express';

const router = Router();

router.get('/exchange-rates/sync', authenticateJwt, async (req, res) => {
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
