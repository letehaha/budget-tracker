import {
  addIgnoredName,
  applyTagsToExisting,
  bulkUpdateCategorizationMode,
  createPayee,
  createPayeeAlias,
  deletePayee,
  deletePayeeAlias,
  getPayee,
  listIgnoredNames,
  listPayees,
  mergePayees,
  removeIgnoredName,
  updatePayee,
} from '@controllers/payees';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(listPayees.schema), listPayees.handler);
router.post('/', authenticateSession, validateEndpoint(createPayee.schema), createPayee.handler);

// Bulk-update sub-resource. Precedes `/:id` patterns for the same reason as
// `/ignored-names` below – Express's path matcher would otherwise treat the
// literal segment as a Payee id.
router.patch(
  '/bulk-categorization-mode',
  authenticateSession,
  validateEndpoint(bulkUpdateCategorizationMode.schema),
  bulkUpdateCategorizationMode.handler,
);

// Ignored-names sub-resource. Routes precede `/:id` patterns so Express's
// path matcher doesn't capture the literal segment as a Payee id.
router.get('/ignored-names', authenticateSession, validateEndpoint(listIgnoredNames.schema), listIgnoredNames.handler);
router.post('/ignored-names', authenticateSession, validateEndpoint(addIgnoredName.schema), addIgnoredName.handler);
router.delete(
  '/ignored-names/:id',
  authenticateSession,
  validateEndpoint(removeIgnoredName.schema),
  removeIgnoredName.handler,
);

router.get('/:id', authenticateSession, validateEndpoint(getPayee.schema), getPayee.handler);
router.patch('/:id', authenticateSession, validateEndpoint(updatePayee.schema), updatePayee.handler);
router.delete('/:id', authenticateSession, validateEndpoint(deletePayee.schema), deletePayee.handler);
router.post('/:id/merge', authenticateSession, validateEndpoint(mergePayees.schema), mergePayees.handler);
router.post(
  '/:id/apply-tags',
  authenticateSession,
  validateEndpoint(applyTagsToExisting.schema),
  applyTagsToExisting.handler,
);
router.post('/:id/aliases', authenticateSession, validateEndpoint(createPayeeAlias.schema), createPayeeAlias.handler);
router.delete(
  '/:id/aliases/:aliasId',
  authenticateSession,
  validateEndpoint(deletePayeeAlias.schema),
  deletePayeeAlias.handler,
);

export default router;
