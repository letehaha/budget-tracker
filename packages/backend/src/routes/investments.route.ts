import {
  estimateCostController as importEstimateCostController,
  executeImportController as importExecuteController,
  extractController as importExtractController,
} from '@controllers/investment-transactions-parser';
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
import exchangeCurrencyController from '@controllers/investments/portfolios/exchange-currency';
import getPortfolioController from '@controllers/investments/portfolios/get-portfolio';
import getPortfolioBalanceController from '@controllers/investments/portfolios/get-portfolio-balance';
import getPortfolioSummaryController from '@controllers/investments/portfolios/get-portfolio-summary.controller';
import getPortfoliosAnnualizedReturnsController from '@controllers/investments/portfolios/get-portfolios-annualized-returns.controller';
import listPortfolioTransfersController from '@controllers/investments/portfolios/list-portfolio-transfers';
import listPortfoliosController from '@controllers/investments/portfolios/list-portfolios';
import portfolioToAccountTransferController from '@controllers/investments/portfolios/portfolio-to-account-transfer';
import restorePortfolioController from '@controllers/investments/portfolios/restore-portfolio';
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

// Demo users get a pre-seeded portfolio and can edit it freely. Creating new
// portfolios and deleting existing ones are blocked per-route below; admin-only
// endpoints enforce their own access checks.
router.use(authenticateSession);

// Portfolio routes
router.get('/portfolios', validateEndpoint(listPortfoliosController.schema), listPortfoliosController.handler);

// Static path — must be registered before `/portfolios/:id` so it isn't
// swallowed as `:id = "annualized-returns"`.
router.get(
  '/portfolios/annualized-returns',
  validateEndpoint(getPortfoliosAnnualizedReturnsController.schema),
  getPortfoliosAnnualizedReturnsController.handler,
);

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

// Test-only cash seeding: writes `PortfolioBalances` directly, bypassing the
// InvestmentTransaction/PortfolioTransfers audit trail. Production cash moves
// through transfers and cash-transactions instead, so this stays off there.
// "development" is required: Playwright frontend e2e run against the dev backend.
// ENABLE_TEST_SEEDING_ENDPOINTS covers the preview environment: it runs with
// NODE_ENV=production yet hosts the Playwright e2e suite that seeds via this route.
if (
  process.env.NODE_ENV === 'test' ||
  process.env.NODE_ENV === 'development' ||
  process.env.ENABLE_TEST_SEEDING_ENDPOINTS === 'true'
) {
  router.put(
    '/portfolios/:id/balance',
    checkBaseCurrencyLock,
    validateEndpoint(updatePortfolioBalanceController.schema),
    updatePortfolioBalanceController.handler,
  );
}

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
  '/portfolios/:id/exchange-currency',
  checkBaseCurrencyLock,
  validateEndpoint(exchangeCurrencyController.schema),
  exchangeCurrencyController.handler,
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
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(deletePortfolioController.schema),
  deletePortfolioController.handler,
);

router.post(
  '/portfolios/:id/restore',
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(restorePortfolioController.schema),
  restorePortfolioController.handler,
);

router.post(
  '/portfolios',
  blockDemoUsers,
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

/**
 * Investment transactions import. Two paths share the review + execute stages:
 *   - AI:  estimate-cost → extract({ source: 'ai' }) → execute
 *   - CSV: (frontend parses locally via papaparse) → extract({ source: 'csv', columnMapping }) → execute
 *
 * `extract` is the merged endpoint; the body's discriminator decides whether
 * the file is fed through the AI provider or parsed via the codebase CSV
 * parser using a user-supplied column mapping.
 */
router.post(
  '/transactions-import/estimate-cost',
  validateEndpoint(importEstimateCostController.schema),
  importEstimateCostController.handler,
);
router.post(
  '/transactions-import/extract',
  validateEndpoint(importExtractController.schema),
  importExtractController.handler,
);
router.post(
  '/transactions-import/execute',
  checkBaseCurrencyLock,
  validateEndpoint(importExecuteController.schema),
  importExecuteController.handler,
);

export default router;
