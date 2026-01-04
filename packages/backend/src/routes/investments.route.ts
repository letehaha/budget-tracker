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
import getPortfolioSummaryController from '@controllers/investments/portfolios/get-portfolio-summary.controller';
import listPortfolioTransfersController from '@controllers/investments/portfolios/list-portfolio-transfers';
import listPortfoliosController from '@controllers/investments/portfolios/list-portfolios';
import updatePortfolioController from '@controllers/investments/portfolios/update-portfolio';
import updatePortfolioBalanceController from '@controllers/investments/portfolios/update-portfolio-balance';
import getPricesController from '@controllers/investments/prices/get-prices.controller';
import securitiesSyncController from '@controllers/investments/prices/securities-sync.controller';
import bulkUploadPricesController from '@controllers/investments/securities/bulk-upload-prices.controller';
import getAllSecurities from '@controllers/investments/securities/get-all.controller';
import getPriceUploadInfoController from '@controllers/investments/securities/get-price-upload-info.controller';
import searchSecuritiesController from '@controllers/investments/securities/search.controller';
import createInvestmentTransactionController from '@controllers/investments/transactions/create-tx.controller';
import deleteInvestmentTransactionController from '@controllers/investments/transactions/delete-tx.controller';
import getTransactionsController from '@controllers/investments/transactions/get-transactions.controller';
import updateInvestmentTransactionController from '@controllers/investments/transactions/update-tx.controller';
import { adminOnly } from '@middlewares/admin-only';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { priceSyncRateLimit, securitiesPricesBulkUploadRateLimit } from '@middlewares/rate-limit';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Portfolio routes
router.get(
  '/portfolios',
  authenticateSession,
  validateEndpoint(listPortfoliosController.schema),
  listPortfoliosController.handler,
);

router.get(
  '/portfolios/:id',
  authenticateSession,
  validateEndpoint(getPortfolioController.schema),
  getPortfolioController.handler,
);

router.get(
  '/portfolios/:id/balance',
  authenticateSession,
  validateEndpoint(getPortfolioBalanceController.schema),
  getPortfolioBalanceController.handler,
);

router.get(
  '/portfolios/:id/summary',
  authenticateSession,
  validateEndpoint(getPortfolioSummaryController.schema),
  getPortfolioSummaryController.handler,
);

router.put(
  '/portfolios/:id/balance',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updatePortfolioBalanceController.schema),
  updatePortfolioBalanceController.handler,
);

router.post(
  '/portfolios/:id/transfer',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createPortfolioTransferController.schema),
  createPortfolioTransferController.handler,
);

router.get(
  '/portfolios/:id/transfers',
  authenticateSession,
  validateEndpoint(listPortfolioTransfersController.schema),
  listPortfolioTransfersController.handler,
);

router.put(
  '/portfolios/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updatePortfolioController.schema),
  updatePortfolioController.handler,
);

router.delete(
  '/portfolios/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deletePortfolioController.schema),
  deletePortfolioController.handler,
);

router.post(
  '/portfolios',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createPortfolioController.schema),
  createPortfolioController.handler,
);

router.post(
  '/sync/securities-prices',
  authenticateSession,
  adminOnly,
  priceSyncRateLimit,
  validateEndpoint(securitiesSyncController.schema),
  securitiesSyncController.handler,
);

router.get('/prices', authenticateSession, validateEndpoint(getPricesController.schema), getPricesController.handler);
router.get('/securities', authenticateSession, validateEndpoint(getAllSecurities.schema), getAllSecurities.handler);

router.get(
  '/securities/search',
  authenticateSession,
  validateEndpoint(searchSecuritiesController.schema),
  searchSecuritiesController.handler,
);

// Admin-only: Get price upload info (accepts currency code)
router.post(
  '/securities/price-upload-info',
  authenticateSession,
  adminOnly,
  validateEndpoint(getPriceUploadInfoController.schema),
  getPriceUploadInfoController.handler,
);

// Admin-only: Bulk upload security prices (accepts SecuritySearchResult)
// Note: 1mb limit is set in app.ts for this path
router.post(
  '/securities/prices/bulk-upload',
  authenticateSession,
  adminOnly,
  securitiesPricesBulkUploadRateLimit,
  validateEndpoint(bulkUploadPricesController.schema),
  bulkUploadPricesController.handler,
);

router.get(
  '/portfolios/:portfolioId/holdings',
  authenticateSession,
  validateEndpoint(getHoldingsController.schema),
  getHoldingsController.handler,
);
router.post(
  '/holding',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createHoldingController.schema),
  createHoldingController.handler,
);
router.delete(
  '/holding',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteHoldingController.schema),
  deleteHoldingController.handler,
);

router.get(
  '/transactions',
  authenticateSession,
  validateEndpoint(getTransactionsController.schema),
  getTransactionsController.handler,
);

router.post(
  '/transaction',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createInvestmentTransactionController.schema),
  createInvestmentTransactionController.handler,
);

router.delete(
  '/transaction/:transactionId',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteInvestmentTransactionController.schema),
  deleteInvestmentTransactionController.handler,
);

router.put(
  '/transaction/:transactionId',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateInvestmentTransactionController.schema),
  updateInvestmentTransactionController.handler,
);

export default router;
