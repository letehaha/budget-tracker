import {
  detectDuplicatesController,
  estimateCostController,
  executeImportController,
  extractController,
} from '@controllers/statement-parser';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

/**
 * Estimate the cost of extracting transactions from a statement file
 * POST /import/text-source/estimate-cost
 *
 * Supports PDF, CSV, and TXT files
 * Body: { fileBase64: string }
 * Returns: StatementCostEstimate
 */
router.post(
  '/text-source/estimate-cost',
  authenticateSession,
  validateEndpoint(estimateCostController.schema),
  estimateCostController.handler,
);

/**
 * Extract transactions from a statement file using AI
 * POST /import/text-source/extract
 *
 * Supports PDF, CSV, and TXT files
 * Body: { fileBase64: string }
 * Returns: StatementExtractionResult
 */
router.post(
  '/text-source/extract',
  authenticateSession,
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
  validateEndpoint(detectDuplicatesController.schema),
  detectDuplicatesController.handler,
);

/**
 * Execute statement import - create transactions in the database
 * POST /import/text-source/execute
 *
 * Creates transactions in the specified account from extracted statement data
 * Body: StatementExecuteImportRequest
 * Returns: StatementExecuteImportResponse
 */
router.post(
  '/text-source/execute',
  authenticateSession,
  validateEndpoint(executeImportController.schema),
  executeImportController.handler,
);

export default router;
