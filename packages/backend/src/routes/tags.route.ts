import {
  addTransactionsToTag,
  createTag,
  deleteTag,
  getTagById,
  getTags,
  removeTransactionsFromTag,
  updateTag,
} from '@controllers/tags';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getTags.schema), getTags.handler);
router.get('/:id', authenticateSession, validateEndpoint(getTagById.schema), getTagById.handler);
router.post('/', authenticateSession, validateEndpoint(createTag.schema), createTag.handler);
router.put('/:id', authenticateSession, validateEndpoint(updateTag.schema), updateTag.handler);
router.delete('/:id', authenticateSession, validateEndpoint(deleteTag.schema), deleteTag.handler);

router.post(
  '/:id/transactions',
  authenticateSession,
  validateEndpoint(addTransactionsToTag.schema),
  addTransactionsToTag.handler,
);
router.delete(
  '/:id/transactions',
  authenticateSession,
  validateEndpoint(removeTransactionsFromTag.schema),
  removeTransactionsFromTag.handler,
);

export default router;
