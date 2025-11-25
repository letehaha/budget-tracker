import { detectDuplicatesController } from '@controllers/import-export/detect-duplicates.controller';
import { executeImportController } from '@controllers/import-export/execute-import.controller';
import { extractUniqueValuesController } from '@controllers/import-export/extract-unique-values.controller';
import { parseCsv } from '@controllers/import-export/parse-csv.controller';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Parse CSV file and return preview
router.post('/csv/parse', authenticateJwt, validateEndpoint(parseCsv.schema), parseCsv.handler);

// Extract unique accounts/categories from full dataset
router.post(
  '/csv/extract-unique-values',
  authenticateJwt,
  validateEndpoint(extractUniqueValuesController.schema),
  extractUniqueValuesController.handler,
);

// Validate and detect duplicate transactions
router.post(
  '/csv/detect-duplicates',
  authenticateJwt,
  validateEndpoint(detectDuplicatesController.schema),
  detectDuplicatesController.handler,
);

// Execute the import
router.post(
  '/csv/execute',
  authenticateJwt,
  validateEndpoint(executeImportController.schema),
  executeImportController.handler,
);

export default router;
