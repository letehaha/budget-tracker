import addTransactionsToBudget from '@controllers/budgets/add-transaction-to-budget';
import createBudget from '@controllers/budgets/create-budget';
import deleteBudget from '@controllers/budgets/delete-budgets';
import editBudget from '@controllers/budgets/edit-budget';
import { getBudgetById, getBudgets } from '@controllers/budgets/get-budgets';
import getCategoryBudgetTransactions from '@controllers/budgets/get-category-budget-transactions';
import getSpendingStats from '@controllers/budgets/get-spending-stats';
import getStats from '@controllers/budgets/get-stats';
import removeTransactionsFromBudget from '@controllers/budgets/remove-transaction-from-budget';
import toggleArchive from '@controllers/budgets/toggle-archive';
import { authenticateSession } from '@middlewares/better-auth';
import { blockDemoUsers } from '@middlewares/block-demo-users';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getBudgets.schema), getBudgets.handler);
router.get('/:id', authenticateSession, validateEndpoint(getBudgetById.schema), getBudgetById.handler);
router.get('/:id/stats', authenticateSession, validateEndpoint(getStats.schema), getStats.handler);
router.get(
  '/:id/spending-stats',
  authenticateSession,
  validateEndpoint(getSpendingStats.schema),
  getSpendingStats.handler,
);
router.get(
  '/:id/category-transactions',
  authenticateSession,
  validateEndpoint(getCategoryBudgetTransactions.schema),
  getCategoryBudgetTransactions.handler,
);
router.post(
  '/',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(createBudget.schema),
  createBudget.handler,
);
router.put(
  '/:id',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(editBudget.schema),
  editBudget.handler,
);
router.patch(
  '/:id/archive',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(toggleArchive.schema),
  toggleArchive.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(deleteBudget.schema),
  deleteBudget.handler,
);

router.post(
  '/:id/transactions',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(addTransactionsToBudget.schema),
  addTransactionsToBudget.handler,
);
router.delete(
  '/:id/transactions',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(removeTransactionsFromBudget.schema),
  removeTransactionsFromBudget.handler,
);

export default router;
