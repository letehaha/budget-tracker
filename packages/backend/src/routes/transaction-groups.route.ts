import {
  addTransactionsToGroup,
  createTransactionGroup,
  deleteTransactionGroup,
  getTransactionGroupById,
  getTransactionGroups,
  removeTransactionsFromGroup,
  updateTransactionGroup,
} from '@controllers/transaction-groups';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getTransactionGroups.schema), getTransactionGroups.handler);
router.get(
  '/:id',
  authenticateSession,
  validateEndpoint(getTransactionGroupById.schema),
  getTransactionGroupById.handler,
);
router.post(
  '/',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createTransactionGroup.schema),
  createTransactionGroup.handler,
);
router.put(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateTransactionGroup.schema),
  updateTransactionGroup.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteTransactionGroup.schema),
  deleteTransactionGroup.handler,
);

router.post(
  '/:id/transactions',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(addTransactionsToGroup.schema),
  addTransactionsToGroup.handler,
);
router.delete(
  '/:id/transactions',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(removeTransactionsFromGroup.schema),
  removeTransactionsFromGroup.handler,
);

export default router;
