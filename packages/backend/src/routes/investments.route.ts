import {
  createHoldingController,
  deleteHoldingController,
  getHoldingsController,
} from '@controllers/investments/holdings';
import getPricesController from '@controllers/investments/prices/get-prices.controller';
import syncDailyPricesController from '@controllers/investments/prices/sync-daily.controller';
import getAllSecurities from '@controllers/investments/securities/get-all.controller';
import searchSecuritiesController from '@controllers/investments/securities/search.controller';
import triggerSecuritiesSync from '@controllers/investments/securities/sync.controller';
import createInvestmentTransactionController from '@controllers/investments/transactions/create-tx.controller';
import deleteInvestmentTransactionController from '@controllers/investments/transactions/delete-tx.controller';
import getTransactionsController from '@controllers/investments/transactions/get-transactions.controller';
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

router.get(
  '/securities/search',
  authenticateJwt,
  validateEndpoint(searchSecuritiesController.schema),
  searchSecuritiesController.handler,
);

router.get(
  '/accounts/:accountId/holdings',
  authenticateJwt,
  validateEndpoint(getHoldingsController.schema),
  getHoldingsController.handler,
);
router.post(
  '/holding',
  authenticateJwt,
  validateEndpoint(createHoldingController.schema),
  createHoldingController.handler,
);
router.delete(
  '/holding',
  authenticateJwt,
  validateEndpoint(deleteHoldingController.schema),
  deleteHoldingController.handler,
);

router.get(
  '/transactions',
  authenticateJwt,
  validateEndpoint(getTransactionsController.schema),
  getTransactionsController.handler,
);

router.post(
  '/transaction',
  authenticateJwt,
  validateEndpoint(createInvestmentTransactionController.schema),
  createInvestmentTransactionController.handler,
);

router.delete(
  '/transaction/:transactionId',
  authenticateJwt,
  validateEndpoint(deleteInvestmentTransactionController.schema),
  deleteInvestmentTransactionController.handler,
);

export default router;
