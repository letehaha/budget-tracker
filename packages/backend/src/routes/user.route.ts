import addUserCurrencies from '@controllers/currencies/add-user-currencies';
import editCurrencyExchangeRate from '@controllers/currencies/edit-currency-exchange-rate';
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

export default router;
