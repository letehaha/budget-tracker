import { addUserCurrencies, addUserCurrenciesSchema } from '@controllers/currencies/add-user-currencies';
import {
  editCurrencyExchangeRate,
  editCurrencyExchangeRateSchema,
} from '@controllers/currencies/edit-currency-exchange-rate';
import {
  editExcludedCategoriesHandler,
  editExcludedCategoriesSchema,
} from '@controllers/user-settings/edit-exclude-categories';
import { getUserSettings } from '@controllers/user-settings/get-settings';
import { updateUserSettings, updateUserSettingsSchema } from '@controllers/user-settings/update-settings';
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

router.get('/', authenticateJwt, getUser);
router.put('/update', authenticateJwt, updateUser);
router.delete('/delete', authenticateJwt, deleteUser);

router.get('/currencies', authenticateJwt, getUserCurrencies);
router.get('/currencies/base', authenticateJwt, getUserBaseCurrency);
router.get('/currencies/rates', authenticateJwt, getCurrenciesExchangeRates);

router.post('/currencies', authenticateJwt, validateEndpoint(addUserCurrenciesSchema), addUserCurrencies);
router.post('/currencies/base', authenticateJwt, setBaseUserCurrency);

router.put('/currency', authenticateJwt, editUserCurrency);
router.put(
  '/currency/rates',
  authenticateJwt,
  validateEndpoint(editCurrencyExchangeRateSchema),
  editCurrencyExchangeRate,
);

router.delete('/currency', authenticateJwt, deleteUserCurrency);
router.delete('/currency/rates', authenticateJwt, removeUserCurrencyExchangeRate);

router.get('/settings', authenticateJwt, getUserSettings);
router.put('/settings', authenticateJwt, validateEndpoint(updateUserSettingsSchema), updateUserSettings);
router.put(
  '/settings/edit-excluded-categories',
  authenticateJwt,
  validateEndpoint(editExcludedCategoriesSchema),
  editExcludedCategoriesHandler,
);

export default router;
