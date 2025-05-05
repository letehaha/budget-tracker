import { Router } from 'express';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { getBudgets, getBudgetById } from '@controllers/budgets/get-budgets';
import { createBudget, createBudgetSchema } from '@controllers/budgets/create-budget';
import { deleteBudget, deleteBudgetSchema } from '@controllers/budgets/delete-budgets';
import { editBudget, editBudgetSchema } from '@controllers/budgets/edit-budget';
import { addTransactionsToBudget, addTransactionsToBudgetSchema } from '@controllers/budgets/add-transaction-to-budget';

const router = Router({});

router.get('/', authenticateJwt, getBudgets);
router.get('/:id', authenticateJwt, getBudgetById)
router.post('/', authenticateJwt, validateEndpoint(createBudgetSchema), createBudget);
router.post('/:id/transactions', authenticateJwt, validateEndpoint(addTransactionsToBudgetSchema), addTransactionsToBudget)
router.put('/:id', authenticateJwt, validateEndpoint(editBudgetSchema), editBudget);
router.delete('/:id', authenticateJwt, validateEndpoint(deleteBudgetSchema), deleteBudget);

export default router;
