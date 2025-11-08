import connectProvider from '@controllers/bank-data-providers/connections/connect-provider';
import connectSelectedAccounts from '@controllers/bank-data-providers/connections/connect-selected-accounts';
import disconnectProvider from '@controllers/bank-data-providers/connections/disconnect-provider';
import getConnectionDetails from '@controllers/bank-data-providers/connections/get-connection-details';
import getSyncJobProgress from '@controllers/bank-data-providers/connections/get-sync-job-progress';
import listActiveSyncJobs from '@controllers/bank-data-providers/connections/list-active-sync-jobs';
import listExternalAccounts from '@controllers/bank-data-providers/connections/list-external-accounts';
import listUserConnections from '@controllers/bank-data-providers/connections/list-user-connections';
import loadTransactionsForPeriod from '@controllers/bank-data-providers/connections/load-transactions-for-period';
import syncTransactionsForAccount from '@controllers/bank-data-providers/connections/sync-transactions-for-account';
import * as providersController from '@controllers/bank-data-providers/providers.controller';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import express from 'express';

const router = express.Router();

// Provider discovery
router.get(
  '/',
  authenticateJwt,
  validateEndpoint(providersController.listProviders.schema),
  providersController.listProviders.handler,
);

// Connection management
router.get('/connections', authenticateJwt, validateEndpoint(listUserConnections.schema), listUserConnections.handler);
router.get(
  '/connections/:connectionId',
  authenticateJwt,
  validateEndpoint(getConnectionDetails.schema),
  getConnectionDetails.handler,
);
router.post(
  '/:providerType/connect',
  authenticateJwt,
  validateEndpoint(connectProvider.schema),
  connectProvider.handler,
);
router.delete(
  '/connections/:connectionId',
  authenticateJwt,
  validateEndpoint(disconnectProvider.schema),
  disconnectProvider.handler,
);

// Account sync flow
router.get(
  '/connections/:connectionId/available-accounts',
  authenticateJwt,
  validateEndpoint(listExternalAccounts.schema),
  listExternalAccounts.handler,
);
router.post(
  '/connections/:connectionId/sync-selected-accounts',
  authenticateJwt,
  validateEndpoint(connectSelectedAccounts.schema),
  connectSelectedAccounts.handler,
);

// Transactions sync
router.post(
  '/connections/:connectionId/sync-transactions',
  authenticateJwt,
  validateEndpoint(syncTransactionsForAccount.schema),
  syncTransactionsForAccount.handler,
);
router.post(
  '/connections/:connectionId/load-transactions-for-period',
  authenticateJwt,
  validateEndpoint(loadTransactionsForPeriod.schema),
  loadTransactionsForPeriod.handler,
);
router.get(
  '/connections/:connectionId/sync-job-progress',
  authenticateJwt,
  validateEndpoint(getSyncJobProgress.schema),
  getSyncJobProgress.handler,
);
router.get(
  '/active-sync-jobs',
  authenticateJwt,
  validateEndpoint(listActiveSyncJobs.schema),
  listActiveSyncJobs.handler,
);

export default router;
