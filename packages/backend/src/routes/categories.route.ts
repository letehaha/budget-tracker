import createCategory from '@controllers/categories.controller/create-category';
import deleteCategory from '@controllers/categories.controller/delete-category';
import getCategories from '@controllers/categories.controller/get-categories';
import editCategory from '@controllers/categories.controller/update-category';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateJwt, validateEndpoint(getCategories.schema), getCategories.handler);
router.post('/', authenticateJwt, validateEndpoint(createCategory.schema), createCategory.handler);
router.put('/:id', authenticateJwt, validateEndpoint(editCategory.schema), editCategory.handler);
router.delete('/:id', authenticateJwt, validateEndpoint(deleteCategory.schema), deleteCategory.handler);

export default router;
