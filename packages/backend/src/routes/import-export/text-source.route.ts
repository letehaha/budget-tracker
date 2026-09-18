import {
  detectDuplicatesController,
  estimateCostController,
  executeImportController,
  extractController,
  importStatusController,
} from '@controllers/statement-parser';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

/**
 * Estimate the cost of extracting transactions from a statement file
 * POST /import/text-source/estimate-cost
 *
 * Supports PDF, CSV, and TXT files
 * Body: { fileBase64: string, password?: string }
 * Returns: StatementCostEstimate
 */
router.post(
  '/text-source/estimate-cost',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(estimateCostController.schema),
  estimateCostController.handler,
);

/**
 * Extract transactions from a statement file using AI
 * POST /import/text-source/extract
 *
 * Supports PDF, CSV, and TXT files
 * Body: { fileBase64: string, password?: string }
 * Returns: StatementExtractionResult
 */
router.post(
  '/text-source/extract',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(extractController.schema),
  extractController.handler,
);

/**
 * Detect duplicate transactions for statement import
 * POST /import/text-source/detect-duplicates
 *
 * Compares extracted transactions against existing transactions in an account
 * Body: { accountId: number, transactions: ExtractedTransaction[] }
 * Returns: StatementDetectDuplicatesResponse
 */
router.post(
  '/text-source/detect-duplicates',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(detectDuplicatesController.schema),
  detectDuplicatesController.handler,
);

/**
 * Execute statement import - create transactions in the database
 * POST /import/text-source/execute
 *
 * Enqueues the import as a background job
 * Body: StatementExecuteImportRequest
 * Returns: StatementExecuteImportQueuedResponse
 */
router.post(
  '/text-source/execute',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(executeImportController.schema),
  executeImportController.handler,
);

/**
 * Status of a statement import job
 * GET /import/text-source/execute/status/:jobId
 *
 * Returns: StatementImportProgress
 */
router.get(
  '/text-source/execute/status/:jobId',
  authenticateSession,
  validateEndpoint(importStatusController.schema),
  importStatusController.handler,
);

export default router;
