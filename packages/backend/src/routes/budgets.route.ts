import { addTransactionsToBudget, addTransactionsToBudgetSchema } from '@controllers/budgets/add-transaction-to-budget';
import { createBudget, createBudgetSchema } from '@controllers/budgets/create-budget';
import { deleteBudget, deleteBudgetSchema } from '@controllers/budgets/delete-budgets';
import { editBudget, editBudgetSchema } from '@controllers/budgets/edit-budget';
import { getBudgetById, getBudgets } from '@controllers/budgets/get-budgets';
import removeTransactionsFromBudget from '@controllers/budgets/remove-transaction-from-budget';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateJwt, getBudgets);
router.get('/:id', authenticateJwt, getBudgetById);
router.post('/', authenticateJwt, validateEndpoint(createBudgetSchema), createBudget);
router.put('/:id', authenticateJwt, validateEndpoint(editBudgetSchema), editBudget);
router.delete('/:id', authenticateJwt, validateEndpoint(deleteBudgetSchema), deleteBudget);

router.post(
  '/:id/transactions',
  authenticateJwt,
  validateEndpoint(addTransactionsToBudgetSchema),
  addTransactionsToBudget,
);
router.delete(
  '/:id/transactions',
  authenticateJwt,
  validateEndpoint(removeTransactionsFromBudget.schema),
  removeTransactionsFromBudget.handler,
);

export default router;
