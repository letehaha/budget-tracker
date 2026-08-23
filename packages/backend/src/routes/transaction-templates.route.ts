import {
  createTransactionTemplate,
  deleteTransactionTemplate,
  getTransactionTemplates,
  updateTransactionTemplate,
} from '@controllers/transaction-templates';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getTransactionTemplates.schema), getTransactionTemplates.handler);
router.post(
  '/',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createTransactionTemplate.schema),
  createTransactionTemplate.handler,
);
router.put(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateTransactionTemplate.schema),
  updateTransactionTemplate.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteTransactionTemplate.schema),
  deleteTransactionTemplate.handler,
);

export default router;
