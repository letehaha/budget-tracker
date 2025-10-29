import getAccountsController from '@controllers/banks/lunchflow/get-accounts';
import refreshBalanceController from '@controllers/banks/lunchflow/refresh-balance';
import removeConnectionController from '@controllers/banks/lunchflow/remove-connection';
import storeApiKeyController from '@controllers/banks/lunchflow/store-api-key';
import syncAccountsController from '@controllers/banks/lunchflow/sync-accounts';
import syncTransactionsController from '@controllers/banks/lunchflow/sync-transactions';
import triggerSyncController from '@controllers/banks/lunchflow/trigger-sync';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router();

// Store/validate API key
router.post(
  '/store-api-key',
  authenticateJwt,
  validateEndpoint(storeApiKeyController.schema),
  storeApiKeyController.handler,
);

// Get accounts from Lunch Flow API
router.get('/accounts', authenticateJwt, validateEndpoint(getAccountsController.schema), getAccountsController.handler);

// Sync accounts to our database
router.post(
  '/sync-accounts',
  authenticateJwt,
  validateEndpoint(syncAccountsController.schema),
  syncAccountsController.handler,
);

// Sync transactions for specific account
router.post(
  '/sync-transactions',
  authenticateJwt,
  validateEndpoint(syncTransactionsController.schema),
  syncTransactionsController.handler,
);

// Refresh account balance
router.post(
  '/refresh-balance',
  authenticateJwt,
  validateEndpoint(refreshBalanceController.schema),
  refreshBalanceController.handler,
);

// Remove connection
router.delete(
  '/disconnect',
  authenticateJwt,
  validateEndpoint(removeConnectionController.schema),
  removeConnectionController.handler,
);

// Manually trigger sync for all user's Lunchflow accounts
router.post(
  '/trigger-sync',
  authenticateJwt,
  validateEndpoint(triggerSyncController.schema),
  triggerSyncController.handler,
);

export default router;
