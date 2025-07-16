import {
  createHoldingController,
  deleteHoldingController,
  getHoldingsController,
} from '@controllers/investments/holdings';
import createPortfolioController from '@controllers/investments/portfolios/create-portfolio';
import createPortfolioTransferController from '@controllers/investments/portfolios/create-portfolio-transfer';
import deletePortfolioController from '@controllers/investments/portfolios/delete-portfolio';
import getPortfolioController from '@controllers/investments/portfolios/get-portfolio';
import getPortfolioBalanceController from '@controllers/investments/portfolios/get-portfolio-balance';
import listPortfolioTransfersController from '@controllers/investments/portfolios/list-portfolio-transfers';
import listPortfoliosController from '@controllers/investments/portfolios/list-portfolios';
import updatePortfolioController from '@controllers/investments/portfolios/update-portfolio';
import updatePortfolioBalanceController from '@controllers/investments/portfolios/update-portfolio-balance';
import getPricesController from '@controllers/investments/prices/get-prices.controller';
import syncDailyPricesController from '@controllers/investments/prices/sync-daily.controller';
import getAllSecurities from '@controllers/investments/securities/get-all.controller';
import searchSecuritiesController from '@controllers/investments/securities/search.controller';
import triggerSecuritiesSync from '@controllers/investments/securities/sync.controller';
import createInvestmentTransactionController from '@controllers/investments/transactions/create-tx.controller';
import deleteInvestmentTransactionController from '@controllers/investments/transactions/delete-tx.controller';
import getTransactionsController from '@controllers/investments/transactions/get-transactions.controller';
import updateInvestmentTransactionController from '@controllers/investments/transactions/update-tx.controller';
import { authenticateJwt } from '@middlewares/passport';
import { testOnly } from '@middlewares/test-only';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Portfolio routes
router.get(
  '/portfolios',
  authenticateJwt,
  validateEndpoint(listPortfoliosController.schema),
  listPortfoliosController.handler,
);

router.get(
  '/portfolios/:id',
  authenticateJwt,
  validateEndpoint(getPortfolioController.schema),
  getPortfolioController.handler,
);

router.get(
  '/portfolios/:id/balance',
  authenticateJwt,
  validateEndpoint(getPortfolioBalanceController.schema),
  getPortfolioBalanceController.handler,
);

router.put(
  '/portfolios/:id/balance',
  authenticateJwt,
  validateEndpoint(updatePortfolioBalanceController.schema),
  updatePortfolioBalanceController.handler,
);

router.post(
  '/portfolios/:id/transfer',
  authenticateJwt,
  validateEndpoint(createPortfolioTransferController.schema),
  createPortfolioTransferController.handler,
);

router.get(
  '/portfolios/:id/transfers',
  authenticateJwt,
  validateEndpoint(listPortfolioTransfersController.schema),
  listPortfolioTransfersController.handler,
);

router.put(
  '/portfolios/:id',
  authenticateJwt,
  validateEndpoint(updatePortfolioController.schema),
  updatePortfolioController.handler,
);

router.delete(
  '/portfolios/:id',
  authenticateJwt,
  validateEndpoint(deletePortfolioController.schema),
  deletePortfolioController.handler,
);

router.post(
  '/portfolios',
  authenticateJwt,
  validateEndpoint(createPortfolioController.schema),
  createPortfolioController.handler,
);

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
  '/portfolios/:portfolioId/holdings',
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

router.put(
  '/transaction/:transactionId',
  authenticateJwt,
  validateEndpoint(updateInvestmentTransactionController.schema),
  updateInvestmentTransactionController.handler,
);

export default router;
