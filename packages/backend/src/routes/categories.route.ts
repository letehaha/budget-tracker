import createCategory from '@controllers/categories.controller/create-category';
import deleteCategory from '@controllers/categories.controller/delete-category';
import getCategories from '@controllers/categories.controller/get-categories';
import getCategoryTransactionCount from '@controllers/categories.controller/get-category-transaction-count';
import editCategory from '@controllers/categories.controller/update-category';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getCategories.schema), getCategories.handler);
router.post(
  '/',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createCategory.schema),
  createCategory.handler,
);
router.put(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(editCategory.schema),
  editCategory.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteCategory.schema),
  deleteCategory.handler,
);
router.get(
  '/:id/transaction-count',
  authenticateSession,
  validateEndpoint(getCategoryTransactionCount.schema),
  getCategoryTransactionCount.handler,
);

export default router;
