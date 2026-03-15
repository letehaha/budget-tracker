import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { authPool } from '@config/auth';
import { errorHandler } from '@controllers/helpers';
import { authenticateSession } from '@middlewares/better-auth';
import { syncExchangeRates } from '@services/exchange-rates/sync-exchange-rates';
import { Router } from 'express';

const router = Router();

// oxlint-disable-next-line oxc/no-async-endpoint-handlers – used only in tests
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

// oxlint-disable-next-line oxc/no-async-endpoint-handlers – used only in tests
router.post('/verify-email', async (req, res) => {
  try {
    const { email } = req.body as { email: string };

    if (!email) {
      return res.status(400).json({
        status: API_RESPONSE_STATUS.error,
        response: { message: 'email is required' },
      });
    }

    await authPool.query('UPDATE ba_user SET "emailVerified" = true WHERE email = $1', [email]);

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
});

export default router;
