import {
  createAutoMatchRule,
  deleteAutoMatchRule,
  getAutoMatchRules,
  toggleAutoMatchRule,
  updateAutoMatchRule,
} from '@controllers/tag-auto-match-rules';
import {
  createReminder,
  deleteReminder,
  getReminderById,
  getRemindersForTag,
  updateReminder,
} from '@controllers/tag-reminders';
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

// Tag reminders routes
router.get(
  '/:tagId/reminders',
  authenticateSession,
  validateEndpoint(getRemindersForTag.schema),
  getRemindersForTag.handler,
);
router.get(
  '/:tagId/reminders/:id',
  authenticateSession,
  validateEndpoint(getReminderById.schema),
  getReminderById.handler,
);
router.post('/:tagId/reminders', authenticateSession, validateEndpoint(createReminder.schema), createReminder.handler);
router.put(
  '/:tagId/reminders/:id',
  authenticateSession,
  validateEndpoint(updateReminder.schema),
  updateReminder.handler,
);
router.delete(
  '/:tagId/reminders/:id',
  authenticateSession,
  validateEndpoint(deleteReminder.schema),
  deleteReminder.handler,
);

// Tag auto-match rules routes
router.get(
  '/:tagId/auto-match-rules',
  authenticateSession,
  validateEndpoint(getAutoMatchRules.schema),
  getAutoMatchRules.handler,
);
router.post(
  '/:tagId/auto-match-rules',
  authenticateSession,
  validateEndpoint(createAutoMatchRule.schema),
  createAutoMatchRule.handler,
);
router.put(
  '/:tagId/auto-match-rules/:id',
  authenticateSession,
  validateEndpoint(updateAutoMatchRule.schema),
  updateAutoMatchRule.handler,
);
router.delete(
  '/:tagId/auto-match-rules/:id',
  authenticateSession,
  validateEndpoint(deleteAutoMatchRule.schema),
  deleteAutoMatchRule.handler,
);
router.patch(
  '/:tagId/auto-match-rules/:id/toggle',
  authenticateSession,
  validateEndpoint(toggleAutoMatchRule.schema),
  toggleAutoMatchRule.handler,
);

export default router;
