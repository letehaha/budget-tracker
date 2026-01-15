import addTransactionsToBudget from '@controllers/budgets/add-transaction-to-budget';
import createBudget from '@controllers/budgets/create-budget';
import deleteBudget from '@controllers/budgets/delete-budgets';
import editBudget from '@controllers/budgets/edit-budget';
import { getBudgetById, getBudgets } from '@controllers/budgets/get-budgets';
import getCategoryBudgetTransactions from '@controllers/budgets/get-category-budget-transactions';
import getStats from '@controllers/budgets/get-stats';
import removeTransactionsFromBudget from '@controllers/budgets/remove-transaction-from-budget';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getBudgets.schema), getBudgets.handler);
router.get('/:id', authenticateSession, validateEndpoint(getBudgetById.schema), getBudgetById.handler);
router.get('/:id/stats', authenticateSession, validateEndpoint(getStats.schema), getStats.handler);
router.get(
  '/:id/category-transactions',
  authenticateSession,
  validateEndpoint(getCategoryBudgetTransactions.schema),
  getCategoryBudgetTransactions.handler,
);
router.post('/', authenticateSession, validateEndpoint(createBudget.schema), createBudget.handler);
router.put('/:id', authenticateSession, validateEndpoint(editBudget.schema), editBudget.handler);
router.delete('/:id', authenticateSession, validateEndpoint(deleteBudget.schema), deleteBudget.handler);

router.post(
  '/:id/transactions',
  authenticateSession,
  validateEndpoint(addTransactionsToBudget.schema),
  addTransactionsToBudget.handler,
);
router.delete(
  '/:id/transactions',
  authenticateSession,
  validateEndpoint(removeTransactionsFromBudget.schema),
  removeTransactionsFromBudget.handler,
);

export default router;
