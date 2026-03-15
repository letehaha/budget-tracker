import createCategory from '@controllers/categories.controller/create-category';
import deleteCategory from '@controllers/categories.controller/delete-category';
import getCategories from '@controllers/categories.controller/get-categories';
import getCategoryTransactionCount from '@controllers/categories.controller/get-category-transaction-count';
import editCategory from '@controllers/categories.controller/update-category';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getCategories.schema), getCategories.handler);
router.post('/', authenticateSession, validateEndpoint(createCategory.schema), createCategory.handler);
router.put('/:id', authenticateSession, validateEndpoint(editCategory.schema), editCategory.handler);
router.delete('/:id', authenticateSession, validateEndpoint(deleteCategory.schema), deleteCategory.handler);
router.get(
  '/:id/transaction-count',
  authenticateSession,
  validateEndpoint(getCategoryTransactionCount.schema),
  getCategoryTransactionCount.handler,
);

export default router;
