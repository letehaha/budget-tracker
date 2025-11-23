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
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { authenticateJwt } from '@middlewares/passport';
import { priceSyncRateLimit, securitiesPricesBulkUploadRateLimit } from '@middlewares/rate-limit';
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

router.get(
  '/portfolios/:id/summary',
  authenticateJwt,
  validateEndpoint(getPortfolioSummaryController.schema),
  getPortfolioSummaryController.handler,
);

router.put(
  '/portfolios/:id/balance',
  authenticateJwt,
  checkBaseCurrencyLock,
  validateEndpoint(updatePortfolioBalanceController.schema),
  updatePortfolioBalanceController.handler,
);

router.post(
  '/portfolios/:id/transfer',
  authenticateJwt,
  checkBaseCurrencyLock,
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
  checkBaseCurrencyLock,
  validateEndpoint(updatePortfolioController.schema),
  updatePortfolioController.handler,
);

router.delete(
  '/portfolios/:id',
  authenticateJwt,
  checkBaseCurrencyLock,
  validateEndpoint(deletePortfolioController.schema),
  deletePortfolioController.handler,
);

router.post(
  '/portfolios',
  authenticateJwt,
  checkBaseCurrencyLock,
  validateEndpoint(createPortfolioController.schema),
  createPortfolioController.handler,
);

router.post(
  '/sync/securities-prices',
  authenticateJwt,
  adminOnly,
  priceSyncRateLimit,
  validateEndpoint(securitiesSyncController.schema),
  securitiesSyncController.handler,
);

router.get('/prices', authenticateJwt, validateEndpoint(getPricesController.schema), getPricesController.handler);
router.get('/securities', authenticateJwt, validateEndpoint(getAllSecurities.schema), getAllSecurities.handler);

router.get(
  '/securities/search',
  authenticateJwt,
  validateEndpoint(searchSecuritiesController.schema),
  searchSecuritiesController.handler,
);

// Admin-only: Get price upload info (accepts currency code)
router.post(
  '/securities/price-upload-info',
  authenticateJwt,
  adminOnly,
  validateEndpoint(getPriceUploadInfoController.schema),
  getPriceUploadInfoController.handler,
);

// Admin-only: Bulk upload security prices (accepts SecuritySearchResult)
// Note: 1mb limit is set in app.ts for this path
router.post(
  '/securities/prices/bulk-upload',
  authenticateJwt,
  adminOnly,
  securitiesPricesBulkUploadRateLimit,
  validateEndpoint(bulkUploadPricesController.schema),
  bulkUploadPricesController.handler,
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
  checkBaseCurrencyLock,
  validateEndpoint(createHoldingController.schema),
  createHoldingController.handler,
);
router.delete(
  '/holding',
  authenticateJwt,
  checkBaseCurrencyLock,
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
  checkBaseCurrencyLock,
  validateEndpoint(createInvestmentTransactionController.schema),
  createInvestmentTransactionController.handler,
);

router.delete(
  '/transaction/:transactionId',
  authenticateJwt,
  checkBaseCurrencyLock,
  validateEndpoint(deleteInvestmentTransactionController.schema),
  deleteInvestmentTransactionController.handler,
);

router.put(
  '/transaction/:transactionId',
  authenticateJwt,
  checkBaseCurrencyLock,
  validateEndpoint(updateInvestmentTransactionController.schema),
  updateInvestmentTransactionController.handler,
);

export default router;
