/**
 * AI-powered import of deposit / withdrawal events into a portfolio.
 *
 * Flow: extract → detect-duplicates → execute. Operates on PortfolioTransfers
 * and supports a per-row `isHistorical` flag (records the flow for stats
 * without changing the cash balance).
 */
import {
  detectCashFlowDuplicatesController,
  executeCashFlowController,
  extractCashFlowController,
} from '@controllers/portfolio-cash-flow-import';
import { authenticateSession } from '@middlewares/better-auth';
import { portfolioCashFlowImportRateLimit } from '@middlewares/rate-limit';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.post(
  '/portfolio-cash-flows/extract',
  authenticateSession,
  portfolioCashFlowImportRateLimit,
  validateEndpoint(extractCashFlowController.schema),
  extractCashFlowController.handler,
);

router.post(
  '/portfolio-cash-flows/detect-duplicates',
  authenticateSession,
  portfolioCashFlowImportRateLimit,
  validateEndpoint(detectCashFlowDuplicatesController.schema),
  detectCashFlowDuplicatesController.handler,
);

router.post(
  '/portfolio-cash-flows/execute',
  authenticateSession,
  portfolioCashFlowImportRateLimit,
  validateEndpoint(executeCashFlowController.schema),
  executeCashFlowController.handler,
);

export default router;
