import {
  getUser,
  loadTransactions,
  pairAccount,
  refreshAccounts,
  updateUser,
} from '@controllers/banks/monobank.controller';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.post('/pair-user', authenticateJwt, validateEndpoint(pairAccount.schema), pairAccount.handler);
router.get('/user', authenticateJwt, validateEndpoint(getUser.schema), getUser.handler);
router.post('/user', authenticateJwt, validateEndpoint(updateUser.schema), updateUser.handler);
router.get('/load-transactions', authenticateJwt, validateEndpoint(loadTransactions.schema), loadTransactions.handler);
router.get('/refresh-accounts', authenticateJwt, validateEndpoint(refreshAccounts.schema), refreshAccounts.handler);

export default router;
