import {
  createAccount,
  deleteAccount,
  getAccountById,
  getAccounts,
  updateAccount,
} from '@controllers/accounts.controller';
import { authenticateJwt } from '@middlewares/passport';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateJwt, getAccounts);
router.get('/:id', authenticateJwt, getAccountById);
router.post('/', authenticateJwt, createAccount);
router.put('/:id', authenticateJwt, updateAccount);
router.delete('/:id', authenticateJwt, deleteAccount);

export default router;
