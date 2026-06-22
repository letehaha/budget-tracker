import { detectWalletDuplicatesController } from '@controllers/import-export/wallet/detect-wallet-duplicates.controller';
import { executeWalletController } from '@controllers/import-export/wallet/execute-wallet.controller';
import { parseWalletController } from '@controllers/import-export/wallet/parse-wallet.controller';
import { walletStatusController } from '@controllers/import-export/wallet/wallet-status.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { csvImportRateLimit } from '@middlewares/rate-limit';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.post(
  '/wallet/parse',
  authenticateSession,
  csvImportRateLimit,
  validateEndpoint(parseWalletController.schema),
  parseWalletController.handler,
);

router.post(
  '/wallet/detect-duplicates',
  authenticateSession,
  csvImportRateLimit,
  validateEndpoint(detectWalletDuplicatesController.schema),
  detectWalletDuplicatesController.handler,
);

router.post(
  '/wallet/execute',
  authenticateSession,
  csvImportRateLimit,
  validateEndpoint(executeWalletController.schema),
  executeWalletController.handler,
);

router.get(
  '/wallet/status/:jobId',
  authenticateSession,
  validateEndpoint(walletStatusController.schema),
  walletStatusController.handler,
);

export default router;
