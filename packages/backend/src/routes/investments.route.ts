import {
  createHoldingController,
  deleteHoldingController,
  getHoldingsController,
} from '@controllers/investments/holdings';
import accountToPortfolioTransferController from '@controllers/investments/portfolios/account-to-portfolio-transfer';
import createPortfolioController from '@controllers/investments/portfolios/create-portfolio';
import createPortfolioTransferController from '@controllers/investments/portfolios/create-portfolio-transfer';
import deletePortfolioController from '@controllers/investments/portfolios/delete-portfolio';
import deletePortfolioTransferController from '@controllers/investments/portfolios/delete-portfolio-transfer';
import directCashTransactionController from '@controllers/investments/portfolios/direct-cash-transaction';
import getPortfolioController from '@controllers/investments/portfolios/get-portfolio';
import getPortfolioBalanceController from '@controllers/investments/portfolios/get-portfolio-balance';
import getPortfolioSummaryController from '@controllers/investments/portfolios/get-portfolio-summary.controller';
import listPortfolioTransfersController from '@controllers/investments/portfolios/list-portfolio-transfers';
import listPortfoliosController from '@controllers/investments/portfolios/list-portfolios';
import portfolioToAccountTransferController from '@controllers/investments/portfolios/portfolio-to-account-transfer';
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
import { blockDemoUsers } from '@middlewares/block-demo-users';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { priceSyncRateLimit, securitiesPricesBulkUploadRateLimit } from '@middlewares/rate-limit';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// All investment routes are blocked for demo users
// Demo users see a "Not available in demo" placeholder on the frontend
router.use(authenticateSession, blockDemoUsers);

// Portfolio routes
router.get('/portfolios', validateEndpoint(listPortfoliosController.schema), listPortfoliosController.handler);

router.get('/portfolios/:id', validateEndpoint(getPortfolioController.schema), getPortfolioController.handler);

router.get(
  '/portfolios/:id/balance',
  validateEndpoint(getPortfolioBalanceController.schema),
  getPortfolioBalanceController.handler,
);

router.get(
  '/portfolios/:id/summary',
  validateEndpoint(getPortfolioSummaryController.schema),
  getPortfolioSummaryController.handler,
);

router.put(
  '/portfolios/:id/balance',
  checkBaseCurrencyLock,
  validateEndpoint(updatePortfolioBalanceController.schema),
  updatePortfolioBalanceController.handler,
);

router.post(
  '/portfolios/:id/cash-transaction',
  checkBaseCurrencyLock,
  validateEndpoint(directCashTransactionController.schema),
  directCashTransactionController.handler,
);

router.post(
  '/portfolios/:id/transfer',
  checkBaseCurrencyLock,
  validateEndpoint(createPortfolioTransferController.schema),
  createPortfolioTransferController.handler,
);

router.post(
  '/portfolios/:id/transfer/from-account',
  checkBaseCurrencyLock,
  validateEndpoint(accountToPortfolioTransferController.schema),
  accountToPortfolioTransferController.handler,
);

router.post(
  '/portfolios/:id/transfer/to-account',
  checkBaseCurrencyLock,
  validateEndpoint(portfolioToAccountTransferController.schema),
  portfolioToAccountTransferController.handler,
);

router.get(
  '/portfolios/:id/transfers',
  validateEndpoint(listPortfolioTransfersController.schema),
  listPortfolioTransfersController.handler,
);

router.delete(
  '/portfolios/:id/transfers/:transferId',
  checkBaseCurrencyLock,
  validateEndpoint(deletePortfolioTransferController.schema),
  deletePortfolioTransferController.handler,
);

router.put(
  '/portfolios/:id',
  checkBaseCurrencyLock,
  validateEndpoint(updatePortfolioController.schema),
  updatePortfolioController.handler,
);

router.delete(
  '/portfolios/:id',
  checkBaseCurrencyLock,
  validateEndpoint(deletePortfolioController.schema),
  deletePortfolioController.handler,
);

router.post(
  '/portfolios',
  checkBaseCurrencyLock,
  validateEndpoint(createPortfolioController.schema),
  createPortfolioController.handler,
);

router.post(
  '/sync/securities-prices',
  adminOnly,
  priceSyncRateLimit,
  validateEndpoint(securitiesSyncController.schema),
  securitiesSyncController.handler,
);

router.get('/prices', validateEndpoint(getPricesController.schema), getPricesController.handler);
router.get('/securities', validateEndpoint(getAllSecurities.schema), getAllSecurities.handler);

router.get(
  '/securities/search',
  validateEndpoint(searchSecuritiesController.schema),
  searchSecuritiesController.handler,
);

// Admin-only: Get price upload info (accepts currency code)
router.post(
  '/securities/price-upload-info',
  adminOnly,
  validateEndpoint(getPriceUploadInfoController.schema),
  getPriceUploadInfoController.handler,
);

// Admin-only: Bulk upload security prices (accepts SecuritySearchResult)
// Note: 1mb limit is set in app.ts for this path
router.post(
  '/securities/prices/bulk-upload',
  adminOnly,
  securitiesPricesBulkUploadRateLimit,
  validateEndpoint(bulkUploadPricesController.schema),
  bulkUploadPricesController.handler,
);

router.get(
  '/portfolios/:portfolioId/holdings',
  validateEndpoint(getHoldingsController.schema),
  getHoldingsController.handler,
);
router.post(
  '/holding',
  checkBaseCurrencyLock,
  validateEndpoint(createHoldingController.schema),
  createHoldingController.handler,
);
router.delete(
  '/holding',
  checkBaseCurrencyLock,
  validateEndpoint(deleteHoldingController.schema),
  deleteHoldingController.handler,
);

router.get('/transactions', validateEndpoint(getTransactionsController.schema), getTransactionsController.handler);

router.post(
  '/transaction',
  checkBaseCurrencyLock,
  validateEndpoint(createInvestmentTransactionController.schema),
  createInvestmentTransactionController.handler,
);

router.delete(
  '/transaction/:transactionId',
  checkBaseCurrencyLock,
  validateEndpoint(deleteInvestmentTransactionController.schema),
  deleteInvestmentTransactionController.handler,
);

router.put(
  '/transaction/:transactionId',
  checkBaseCurrencyLock,
  validateEndpoint(updateInvestmentTransactionController.schema),
  updateInvestmentTransactionController.handler,
);

export default router;
