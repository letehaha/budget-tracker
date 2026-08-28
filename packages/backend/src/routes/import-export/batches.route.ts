import { batchesHistoryController } from '@controllers/import-export/batches-history.controller';
import { deleteBatchController } from '@controllers/import-export/delete-batch.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get(
  '/batches-history',
  authenticateSession,
  validateEndpoint(batchesHistoryController.schema),
  batchesHistoryController.handler,
);

router.delete(
  '/batch/:batchId',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteBatchController.schema),
  deleteBatchController.handler,
);

export default router;
