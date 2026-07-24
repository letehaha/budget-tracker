import { budgetBakersWalletStatusController } from '@controllers/import-export/budget-bakers-wallet/budget-bakers-wallet-status.controller';
import { detectBudgetBakersWalletDuplicatesController } from '@controllers/import-export/budget-bakers-wallet/detect-budget-bakers-wallet-duplicates.controller';
import { executeBudgetBakersWalletController } from '@controllers/import-export/budget-bakers-wallet/execute-budget-bakers-wallet.controller';
import { parseBudgetBakersWalletController } from '@controllers/import-export/budget-bakers-wallet/parse-budget-bakers-wallet.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { csvImportRateLimit } from '@middlewares/rate-limit';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.post(
  '/budget-bakers-wallet/parse',
  authenticateSession,
  checkBaseCurrencyLock,
  csvImportRateLimit,
  validateEndpoint(parseBudgetBakersWalletController.schema),
  parseBudgetBakersWalletController.handler,
);

router.post(
  '/budget-bakers-wallet/detect-duplicates',
  authenticateSession,
  checkBaseCurrencyLock,
  csvImportRateLimit,
  validateEndpoint(detectBudgetBakersWalletDuplicatesController.schema),
  detectBudgetBakersWalletDuplicatesController.handler,
);

router.post(
  '/budget-bakers-wallet/execute',
  authenticateSession,
  checkBaseCurrencyLock,
  csvImportRateLimit,
  validateEndpoint(executeBudgetBakersWalletController.schema),
  executeBudgetBakersWalletController.handler,
);

router.get(
  '/budget-bakers-wallet/status/:jobId',
  authenticateSession,
  validateEndpoint(budgetBakersWalletStatusController.schema),
  budgetBakersWalletStatusController.handler,
);

export default router;
