import addUserCurrencies from '@controllers/currencies/add-user-currencies';
import changeBaseCurrencyStatus from '@controllers/currencies/change-base-currency-status.controller';
import changeBaseCurrency from '@controllers/currencies/change-base-currency.controller';
import editCurrencyExchangeRate from '@controllers/currencies/edit-currency-exchange-rate';
import { exportDataController } from '@controllers/data-export/export-data.controller';
import { getConnectedAppsController, revokeConnectedAppController } from '@controllers/mcp/connected-apps.controller';
import {
  deleteAiApiKey,
  deleteAllAiApiKeys,
  getAiApiKeyStatus,
  setAiApiKeyController,
  setDefaultAiProviderController,
} from '@controllers/user-settings/ai-api-key';
import {
  getCustomInstructionsController,
  setCustomInstructionsController,
} from '@controllers/user-settings/ai-custom-instructions';
import {
  getAvailableModelsController,
  getFeatureConfigController,
  getFeaturesStatus,
  resetFeatureConfigController,
  setFeatureConfigController,
} from '@controllers/user-settings/ai-feature-settings';
import getUserSettings from '@controllers/user-settings/get-settings';
import { getOnboarding, updateOnboarding } from '@controllers/user-settings/onboarding';
import patchUserSettings from '@controllers/user-settings/patch-settings';
import updateUserSettings from '@controllers/user-settings/update-settings';
import {
  deleteUser,
  deleteUserCurrency,
  editUserCurrency,
  getCurrenciesExchangeRates,
  getUser,
  getUserBaseCurrency,
  getUserCurrencies,
  removeUserCurrencyExchangeRate,
  setBaseUserCurrency,
  updateUser,
  wipeUserData,
} from '@controllers/user.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { dataExportRateLimit } from '@middlewares/rate-limit';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getUser.schema), getUser.handler);
router.put('/update', authenticateSession, validateEndpoint(updateUser.schema), updateUser.handler);
router.delete(
  '/delete',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteUser.schema),
  deleteUser.handler,
);
router.post(
  '/wipe-data',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(wipeUserData.schema),
  wipeUserData.handler,
);
router.post(
  '/data-export',
  authenticateSession,
  dataExportRateLimit,
  validateEndpoint(exportDataController.schema),
  exportDataController.handler,
);

router.get('/currencies', authenticateSession, validateEndpoint(getUserCurrencies.schema), getUserCurrencies.handler);
router.get(
  '/currencies/base',
  authenticateSession,
  validateEndpoint(getUserBaseCurrency.schema),
  getUserBaseCurrency.handler,
);
router.get(
  '/currencies/rates',
  authenticateSession,
  validateEndpoint(getCurrenciesExchangeRates.schema),
  getCurrenciesExchangeRates.handler,
);

router.post(
  '/currencies',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(addUserCurrencies.schema),
  addUserCurrencies.handler,
);
router.post(
  '/currencies/base',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(setBaseUserCurrency.schema),
  setBaseUserCurrency.handler,
);
// The enqueue route owns its own dedupe: its NX lock acquisition returns the proper 423,
// so guarding it here would reject the request that is supposed to start the change.
router.post(
  '/currencies/change-base',
  authenticateSession,
  validateEndpoint(changeBaseCurrency.schema),
  changeBaseCurrency.handler,
);
// Read-only status any device polls to drive the blocking overlay; GET routes are
// never lock-guarded.
router.get(
  '/currencies/change-base/status',
  authenticateSession,
  validateEndpoint(changeBaseCurrencyStatus.schema),
  changeBaseCurrencyStatus.handler,
);

router.put(
  '/currency',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(editUserCurrency.schema),
  editUserCurrency.handler,
);
router.put(
  '/currency/rates',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(editCurrencyExchangeRate.schema),
  editCurrencyExchangeRate.handler,
);

router.delete(
  '/currency',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteUserCurrency.schema),
  deleteUserCurrency.handler,
);
router.delete(
  '/currency/rates',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(removeUserCurrencyExchangeRate.schema),
  removeUserCurrencyExchangeRate.handler,
);

router.get('/settings', authenticateSession, validateEndpoint(getUserSettings.schema), getUserSettings.handler);
router.put('/settings', authenticateSession, validateEndpoint(updateUserSettings.schema), updateUserSettings.handler);
router.patch('/settings', authenticateSession, validateEndpoint(patchUserSettings.schema), patchUserSettings.handler);

// Onboarding (Quick Start)
router.get('/settings/onboarding', authenticateSession, validateEndpoint(getOnboarding.schema), getOnboarding.handler);
router.put(
  '/settings/onboarding',
  authenticateSession,
  validateEndpoint(updateOnboarding.schema),
  updateOnboarding.handler,
);

// AI API Key management
router.get(
  '/settings/ai/api-keys',
  authenticateSession,
  validateEndpoint(getAiApiKeyStatus.schema),
  getAiApiKeyStatus.handler,
);
router.put(
  '/settings/ai/api-keys',
  authenticateSession,
  validateEndpoint(setAiApiKeyController.schema),
  setAiApiKeyController.handler,
);
router.put(
  '/settings/ai/api-keys/default',
  authenticateSession,
  validateEndpoint(setDefaultAiProviderController.schema),
  setDefaultAiProviderController.handler,
);
router.delete(
  '/settings/ai/api-keys',
  authenticateSession,
  validateEndpoint(deleteAiApiKey.schema),
  deleteAiApiKey.handler,
);
router.delete(
  '/settings/ai/api-keys/all',
  authenticateSession,
  validateEndpoint(deleteAllAiApiKeys.schema),
  deleteAllAiApiKeys.handler,
);

// AI Feature configuration
router.get(
  '/settings/ai/features',
  authenticateSession,
  validateEndpoint(getFeaturesStatus.schema),
  getFeaturesStatus.handler,
);
router.get(
  '/settings/ai/features/:feature',
  authenticateSession,
  validateEndpoint(getFeatureConfigController.schema),
  getFeatureConfigController.handler,
);
router.put(
  '/settings/ai/features/:feature',
  authenticateSession,
  validateEndpoint(setFeatureConfigController.schema),
  setFeatureConfigController.handler,
);
router.delete(
  '/settings/ai/features/:feature',
  authenticateSession,
  validateEndpoint(resetFeatureConfigController.schema),
  resetFeatureConfigController.handler,
);

// AI Custom Instructions
router.get(
  '/settings/ai/custom-instructions',
  authenticateSession,
  validateEndpoint(getCustomInstructionsController.schema),
  getCustomInstructionsController.handler,
);
router.put(
  '/settings/ai/custom-instructions',
  authenticateSession,
  validateEndpoint(setCustomInstructionsController.schema),
  setCustomInstructionsController.handler,
);

// AI Models
router.get(
  '/settings/ai/models',
  authenticateSession,
  validateEndpoint(getAvailableModelsController.schema),
  getAvailableModelsController.handler,
);

// MCP Connected Apps
router.get(
  '/settings/mcp/connected-apps',
  authenticateSession,
  validateEndpoint(getConnectedAppsController.schema),
  getConnectedAppsController.handler,
);
router.delete(
  '/settings/mcp/connected-apps/:clientId',
  authenticateSession,
  validateEndpoint(revokeConnectedAppController.schema),
  revokeConnectedAppController.handler,
);

export default router;
