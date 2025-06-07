import addTransactionsToBudget from '@controllers/budgets/add-transaction-to-budget';
import createBudget from '@controllers/budgets/create-budget';
import deleteBudget from '@controllers/budgets/delete-budgets';
import editBudget from '@controllers/budgets/edit-budget';
import { getBudgetById, getBudgets } from '@controllers/budgets/get-budgets';
import getStats from '@controllers/budgets/get-stats';
import removeTransactionsFromBudget from '@controllers/budgets/remove-transaction-from-budget';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateJwt, validateEndpoint(getBudgets.schema), getBudgets.handler);
router.get('/:id', authenticateJwt, validateEndpoint(getBudgetById.schema), getBudgetById.handler);
router.get('/:id/stats', authenticateJwt, validateEndpoint(getStats.schema), getStats.handler);
router.post('/', authenticateJwt, validateEndpoint(createBudget.schema), createBudget.handler);
router.put('/:id', authenticateJwt, validateEndpoint(editBudget.schema), editBudget.handler);
router.delete('/:id', authenticateJwt, validateEndpoint(deleteBudget.schema), deleteBudget.handler);

router.post(
  '/:id/transactions',
  authenticateJwt,
  validateEndpoint(addTransactionsToBudget.schema),
  addTransactionsToBudget.handler,
);
router.delete(
  '/:id/transactions',
  authenticateJwt,
  validateEndpoint(removeTransactionsFromBudget.schema),
  removeTransactionsFromBudget.handler,
);

export default router;
