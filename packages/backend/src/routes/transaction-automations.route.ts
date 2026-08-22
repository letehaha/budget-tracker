import createAutomation from '@controllers/transaction-automations/create-automation';
import deleteAutomation from '@controllers/transaction-automations/delete-automation';
import listAutomations from '@controllers/transaction-automations/list-automations';
import previewAutomation from '@controllers/transaction-automations/preview-automation';
import reorderAutomations from '@controllers/transaction-automations/reorder-automations';
import updateAutomation from '@controllers/transaction-automations/update-automation';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(listAutomations.schema), listAutomations.handler);
router.post(
  '/',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createAutomation.schema),
  createAutomation.handler,
);

// Static paths before `/:id` so a literal segment is never read as an id.
router.put(
  '/reorder',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(reorderAutomations.schema),
  reorderAutomations.handler,
);
router.post(
  '/preview',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(previewAutomation.schema),
  previewAutomation.handler,
);

router.patch(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateAutomation.schema),
  updateAutomation.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteAutomation.schema),
  deleteAutomation.handler,
);

export default router;
