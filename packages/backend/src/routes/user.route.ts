import addUserCurrencies from '@controllers/currencies/add-user-currencies';
import changeBaseCurrency from '@controllers/currencies/change-base-currency.controller';
import editCurrencyExchangeRate from '@controllers/currencies/edit-currency-exchange-rate';
// AI API key management is disabled - using server-side GEMINI_API_KEY instead
// import {
//   deleteAiApiKey,
//   deleteAllAiApiKeys,
//   getAiApiKeyStatus,
//   setAiApiKeyController,
//   setDefaultAiProviderController,
// } from '@controllers/user-settings/ai-api-key';
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
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateJwt, validateEndpoint(getUser.schema), getUser.handler);
router.put('/update', authenticateJwt, validateEndpoint(updateUser.schema), updateUser.handler);
router.delete('/delete', authenticateJwt, validateEndpoint(deleteUser.schema), deleteUser.handler);

router.get('/currencies', authenticateJwt, validateEndpoint(getUserCurrencies.schema), getUserCurrencies.handler);
router.get(
  '/currencies/base',
  authenticateJwt,
  validateEndpoint(getUserBaseCurrency.schema),
  getUserBaseCurrency.handler,
);
router.get(
  '/currencies/rates',
  authenticateJwt,
  validateEndpoint(getCurrenciesExchangeRates.schema),
  getCurrenciesExchangeRates.handler,
);

router.post('/currencies', authenticateJwt, validateEndpoint(addUserCurrencies.schema), addUserCurrencies.handler);
router.post(
  '/currencies/base',
  authenticateJwt,
  validateEndpoint(setBaseUserCurrency.schema),
  setBaseUserCurrency.handler,
);
router.post(
  '/currencies/change-base',
  authenticateJwt,
  validateEndpoint(changeBaseCurrency.schema),
  changeBaseCurrency.handler,
);

router.put('/currency', authenticateJwt, validateEndpoint(editUserCurrency.schema), editUserCurrency.handler);
router.put(
  '/currency/rates',
  authenticateJwt,
  validateEndpoint(editCurrencyExchangeRate.schema),
  editCurrencyExchangeRate.handler,
);

router.delete('/currency', authenticateJwt, validateEndpoint(deleteUserCurrency.schema), deleteUserCurrency.handler);
router.delete(
  '/currency/rates',
  authenticateJwt,
  validateEndpoint(removeUserCurrencyExchangeRate.schema),
  removeUserCurrencyExchangeRate.handler,
);

router.get('/settings', authenticateJwt, validateEndpoint(getUserSettings.schema), getUserSettings.handler);
router.put('/settings', authenticateJwt, validateEndpoint(updateUserSettings.schema), updateUserSettings.handler);
router.put(
  '/settings/edit-excluded-categories',
  authenticateJwt,
  validateEndpoint(editExcludedCategories.schema),
  editExcludedCategories.handler,
);

// AI API Key management - disabled, using server-side GEMINI_API_KEY instead
// router.get(
//   '/settings/ai-api-key',
//   authenticateJwt,
//   validateEndpoint(getAiApiKeyStatus.schema),
//   getAiApiKeyStatus.handler,
// );
// router.put(
//   '/settings/ai-api-key',
//   authenticateJwt,
//   validateEndpoint(setAiApiKeyController.schema),
//   setAiApiKeyController.handler,
// );
// router.put(
//   '/settings/ai-api-key/default',
//   authenticateJwt,
//   validateEndpoint(setDefaultAiProviderController.schema),
//   setDefaultAiProviderController.handler,
// );
// router.delete('/settings/ai-api-key', authenticateJwt, validateEndpoint(deleteAiApiKey.schema), deleteAiApiKey.handler);
// router.delete(
//   '/settings/ai-api-key/all',
//   authenticateJwt,
//   validateEndpoint(deleteAllAiApiKeys.schema),
//   deleteAllAiApiKeys.handler,
// );

export default router;
