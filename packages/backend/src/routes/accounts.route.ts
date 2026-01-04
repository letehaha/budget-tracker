import {
  createAccount,
  deleteAccount,
  getAccountById,
  getAccounts,
  updateAccount,
} from '@controllers/accounts.controller';
import linkAccountToBankConnection from '@controllers/accounts/link-to-bank-connection';
import unlinkAccountFromBankConnection from '@controllers/accounts/unlink-from-bunk-connection';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getAccounts.schema), getAccounts.handler);
router.get('/:id', authenticateSession, validateEndpoint(getAccountById.schema), getAccountById.handler);
router.post(
  '/',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createAccount.schema),
  createAccount.handler,
);
router.put(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateAccount.schema),
  updateAccount.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteAccount.schema),
  deleteAccount.handler,
);
router.post(
  '/:id/unlink',
  authenticateSession,
  validateEndpoint(unlinkAccountFromBankConnection.schema),
  unlinkAccountFromBankConnection.handler,
);
router.post(
  '/:id/link',
  authenticateSession,
  validateEndpoint(linkAccountToBankConnection.schema),
  linkAccountToBankConnection.handler,
);

export default router;
