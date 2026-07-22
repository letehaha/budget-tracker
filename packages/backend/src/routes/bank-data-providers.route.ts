import connectProvider from '@controllers/bank-data-providers/connections/connect-provider';
import connectSelectedAccounts from '@controllers/bank-data-providers/connections/connect-selected-accounts';
import disconnectProvider from '@controllers/bank-data-providers/connections/disconnect-provider';
import getConnectionDetails from '@controllers/bank-data-providers/connections/get-connection-details';
import getSyncJobProgress from '@controllers/bank-data-providers/connections/get-sync-job-progress';
import listActiveSyncJobs from '@controllers/bank-data-providers/connections/list-active-sync-jobs';
import listExternalAccounts from '@controllers/bank-data-providers/connections/list-external-accounts';
import listUserConnections from '@controllers/bank-data-providers/connections/list-user-connections';
import loadTransactionsForPeriod from '@controllers/bank-data-providers/connections/load-transactions-for-period';
import reauthorizeConnection from '@controllers/bank-data-providers/connections/reauthorize-connection';
import reconcileDuplicatesForAccount from '@controllers/bank-data-providers/connections/reconcile-duplicates-for-account';
import syncTransactionsForAccount from '@controllers/bank-data-providers/connections/sync-transactions-for-account';
import updateConnectionDetails from '@controllers/bank-data-providers/connections/update-connection-details';
import listBanks from '@controllers/bank-data-providers/enablebanking/list-banks';
import listCountries from '@controllers/bank-data-providers/enablebanking/list-countries';
import oauthCallback from '@controllers/bank-data-providers/enablebanking/oauth-callback';
import * as providersController from '@controllers/bank-data-providers/providers.controller';
import checkSync from '@controllers/bank-data-providers/sync/check-sync';
import getSyncStatus from '@controllers/bank-data-providers/sync/get-sync-status';
import triggerSync from '@controllers/bank-data-providers/sync/trigger-sync';
import { authenticateSession } from '@middlewares/better-auth';
import { blockDemoUsers } from '@middlewares/block-demo-users';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import express from 'express';

const router = express.Router();

// Provider discovery
router.get(
  '/',
  authenticateSession,
  validateEndpoint(providersController.listProviders.schema),
  providersController.listProviders.handler,
);

// Connection management
router.get(
  '/connections',
  authenticateSession,
  validateEndpoint(listUserConnections.schema),
  listUserConnections.handler,
);
router.get(
  '/connections/:connectionId',
  authenticateSession,
  validateEndpoint(getConnectionDetails.schema),
  getConnectionDetails.handler,
);
router.post(
  '/:providerType/connect',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(connectProvider.schema),
  connectProvider.handler,
);
router.delete(
  '/connections/:connectionId',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(disconnectProvider.schema),
  disconnectProvider.handler,
);
router.post(
  '/connections/:connectionId/reauthorize',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(reauthorizeConnection.schema),
  reauthorizeConnection.handler,
);
router.patch(
  '/connections/:connectionId',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(updateConnectionDetails.schema),
  updateConnectionDetails.handler,
);

// Account sync flow
router.get(
  '/connections/:connectionId/available-accounts',
  authenticateSession,
  blockDemoUsers,
  validateEndpoint(listExternalAccounts.schema),
  listExternalAccounts.handler,
);
router.post(
  '/connections/:connectionId/sync-selected-accounts',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(connectSelectedAccounts.schema),
  connectSelectedAccounts.handler,
);

// Transactions sync
router.post(
  '/connections/:connectionId/sync-transactions',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(syncTransactionsForAccount.schema),
  syncTransactionsForAccount.handler,
);
router.post(
  '/connections/:connectionId/reconcile-duplicates',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(reconcileDuplicatesForAccount.schema),
  reconcileDuplicatesForAccount.handler,
);
router.post(
  '/connections/:connectionId/load-transactions-for-period',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(loadTransactionsForPeriod.schema),
  loadTransactionsForPeriod.handler,
);
router.get(
  '/connections/:connectionId/sync-job-progress',
  authenticateSession,
  validateEndpoint(getSyncJobProgress.schema),
  getSyncJobProgress.handler,
);
router.get(
  '/active-sync-jobs',
  authenticateSession,
  validateEndpoint(listActiveSyncJobs.schema),
  listActiveSyncJobs.handler,
);

// Bulk account sync endpoints
router.get('/sync/check', authenticateSession, blockDemoUsers, validateEndpoint(checkSync.schema), checkSync.handler);
router.post(
  '/sync/trigger',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(triggerSync.schema),
  triggerSync.handler,
);
router.get(
  '/sync/status',
  authenticateSession,
  blockDemoUsers,
  validateEndpoint(getSyncStatus.schema),
  getSyncStatus.handler,
);

// Enable Banking specific endpoints
router.post(
  '/enablebanking/countries',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(listCountries.schema),
  listCountries.handler,
);
router.post(
  '/enablebanking/banks',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(listBanks.schema),
  listBanks.handler,
);
router.post(
  '/enablebanking/oauth-callback',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(oauthCallback.schema),
  oauthCallback.handler,
);

export default router;
