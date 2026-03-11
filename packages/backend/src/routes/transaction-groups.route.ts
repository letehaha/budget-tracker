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
router.post('/', authenticateSession, validateEndpoint(createTransactionGroup.schema), createTransactionGroup.handler);
router.put(
  '/:id',
  authenticateSession,
  validateEndpoint(updateTransactionGroup.schema),
  updateTransactionGroup.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  validateEndpoint(deleteTransactionGroup.schema),
  deleteTransactionGroup.handler,
);

router.post(
  '/:id/transactions',
  authenticateSession,
  validateEndpoint(addTransactionsToGroup.schema),
  addTransactionsToGroup.handler,
);
router.delete(
  '/:id/transactions',
  authenticateSession,
  validateEndpoint(removeTransactionsFromGroup.schema),
  removeTransactionsFromGroup.handler,
);

export default router;
