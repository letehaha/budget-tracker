import {
  createAccount,
  deleteAccount,
  getAccountById,
  getAccounts,
  updateAccount,
} from '@controllers/accounts.controller';
import unlinkAccountFromBankConnection from '@controllers/accounts/unlink-from-bunk-connection';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateJwt, validateEndpoint(getAccounts.schema), getAccounts.handler);
router.get('/:id', authenticateJwt, validateEndpoint(getAccountById.schema), getAccountById.handler);
router.post('/', authenticateJwt, validateEndpoint(createAccount.schema), createAccount.handler);
router.put('/:id', authenticateJwt, validateEndpoint(updateAccount.schema), updateAccount.handler);
router.delete('/:id', authenticateJwt, validateEndpoint(deleteAccount.schema), deleteAccount.handler);
router.post(
  '/:id/unlink',
  authenticateJwt,
  validateEndpoint(unlinkAccountFromBankConnection.schema),
  unlinkAccountFromBankConnection.handler,
);

export default router;
