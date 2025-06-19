import getPricesController from '@controllers/investments/prices/get-prices.controller';
import syncDailyPricesController from '@controllers/investments/prices/sync-daily.controller';
import getAllSecurities from '@controllers/investments/securities/get-all.controller';
import triggerSecuritiesSync from '@controllers/investments/securities/sync.controller';
import { authenticateJwt } from '@middlewares/passport';
import { testOnly } from '@middlewares/test-only';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.post(
  '/sync/securities',
  authenticateJwt,
  testOnly,
  validateEndpoint(triggerSecuritiesSync.schema),
  triggerSecuritiesSync.handler,
);

router.post(
  '/sync/prices/daily',
  authenticateJwt,
  testOnly,
  validateEndpoint(syncDailyPricesController.schema),
  syncDailyPricesController.handler,
);

router.get('/prices', authenticateJwt, validateEndpoint(getPricesController.schema), getPricesController.handler);
router.get('/securities', authenticateJwt, validateEndpoint(getAllSecurities.schema), getAllSecurities.handler);

export default router;
