import { estimateCostController, extractController } from '@controllers/statement-parser';
import { authenticateJwt } from '@middlewares/passport';
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
  authenticateJwt,
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
  authenticateJwt,
  validateEndpoint(extractController.schema),
  extractController.handler,
);

export default router;
