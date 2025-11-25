import {
  createAccount,
  deleteAccount,
  getAccountById,
  getAccounts,
  updateAccount,
} from '@controllers/accounts.controller';
import convertMonobankToSystem from '@controllers/accounts/convert-monobank-to-system';
import linkAccountToBankConnection from '@controllers/accounts/link-to-bank-connection';
import unlinkAccountFromBankConnection from '@controllers/accounts/unlink-from-bunk-connection';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateJwt, validateEndpoint(getAccounts.schema), getAccounts.handler);
router.get('/:id', authenticateJwt, validateEndpoint(getAccountById.schema), getAccountById.handler);
router.post('/', authenticateJwt, checkBaseCurrencyLock, validateEndpoint(createAccount.schema), createAccount.handler);
router.put(
  '/:id',
  authenticateJwt,
  checkBaseCurrencyLock,
  validateEndpoint(updateAccount.schema),
  updateAccount.handler,
);
router.delete(
  '/:id',
  authenticateJwt,
  checkBaseCurrencyLock,
  validateEndpoint(deleteAccount.schema),
  deleteAccount.handler,
);
router.post(
  '/:id/unlink',
  authenticateJwt,
  validateEndpoint(unlinkAccountFromBankConnection.schema),
  unlinkAccountFromBankConnection.handler,
);
router.post(
  '/:id/link',
  authenticateJwt,
  validateEndpoint(linkAccountToBankConnection.schema),
  linkAccountToBankConnection.handler,
);
router.post(
  '/:id/convert-to-system',
  authenticateJwt,
  validateEndpoint(convertMonobankToSystem.schema),
  convertMonobankToSystem.handler,
);

export default router;
