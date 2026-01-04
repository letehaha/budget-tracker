import addUserCurrencies from '@controllers/currencies/add-user-currencies';
import changeBaseCurrency from '@controllers/currencies/change-base-currency.controller';
import editCurrencyExchangeRate from '@controllers/currencies/edit-currency-exchange-rate';
import {
  deleteAiApiKey,
  deleteAllAiApiKeys,
  getAiApiKeyStatus,
  setAiApiKeyController,
  setDefaultAiProviderController,
} from '@controllers/user-settings/ai-api-key';
import {
  getAvailableModelsController,
  getFeatureConfigController,
  getFeaturesStatus,
  resetFeatureConfigController,
  setFeatureConfigController,
} from '@controllers/user-settings/ai-feature-settings';
import editExcludedCategories from '@controllers/user-settings/edit-exclude-categories';
import getUserSettings from '@controllers/user-settings/get-settings';
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
} from '@controllers/user.controller';
import { migrateLegacyEmail, verifyLegacyEmailChange } from '@controllers/user/migrate-legacy-email';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getUser.schema), getUser.handler);
router.put('/update', authenticateSession, validateEndpoint(updateUser.schema), updateUser.handler);
router.delete('/delete', authenticateSession, validateEndpoint(deleteUser.schema), deleteUser.handler);

// Legacy user email migration
router.post(
  '/migrate-legacy-email',
  authenticateSession,
  validateEndpoint(migrateLegacyEmail.schema),
  migrateLegacyEmail.handler,
);
// Verification endpoint - no auth required (user clicks link from email)
router.post('/verify-legacy-email', validateEndpoint(verifyLegacyEmailChange.schema), verifyLegacyEmailChange.handler);

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

router.post('/currencies', authenticateSession, validateEndpoint(addUserCurrencies.schema), addUserCurrencies.handler);
router.post(
  '/currencies/base',
  authenticateSession,
  validateEndpoint(setBaseUserCurrency.schema),
  setBaseUserCurrency.handler,
);
router.post(
  '/currencies/change-base',
  authenticateSession,
  validateEndpoint(changeBaseCurrency.schema),
  changeBaseCurrency.handler,
);

router.put('/currency', authenticateSession, validateEndpoint(editUserCurrency.schema), editUserCurrency.handler);
router.put(
  '/currency/rates',
  authenticateSession,
  validateEndpoint(editCurrencyExchangeRate.schema),
  editCurrencyExchangeRate.handler,
);

router.delete(
  '/currency',
  authenticateSession,
  validateEndpoint(deleteUserCurrency.schema),
  deleteUserCurrency.handler,
);
router.delete(
  '/currency/rates',
  authenticateSession,
  validateEndpoint(removeUserCurrencyExchangeRate.schema),
  removeUserCurrencyExchangeRate.handler,
);

router.get('/settings', authenticateSession, validateEndpoint(getUserSettings.schema), getUserSettings.handler);
router.put('/settings', authenticateSession, validateEndpoint(updateUserSettings.schema), updateUserSettings.handler);
router.put(
  '/settings/edit-excluded-categories',
  authenticateSession,
  validateEndpoint(editExcludedCategories.schema),
  editExcludedCategories.handler,
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

// AI Models
router.get(
  '/settings/ai/models',
  authenticateSession,
  validateEndpoint(getAvailableModelsController.schema),
  getAvailableModelsController.handler,
);

export default router;
