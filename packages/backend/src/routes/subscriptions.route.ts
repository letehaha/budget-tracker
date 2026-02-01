import createSubscription from '@controllers/subscriptions/create-subscription';
import deleteSubscription from '@controllers/subscriptions/delete-subscription';
import { getSubscriptionById, getSubscriptions } from '@controllers/subscriptions/get-subscriptions';
import linkTransactions from '@controllers/subscriptions/link-transactions';
import suggestMatches from '@controllers/subscriptions/suggest-matches';
import toggleActive from '@controllers/subscriptions/toggle-active';
import unlinkTransactions from '@controllers/subscriptions/unlink-transactions';
import updateSubscription from '@controllers/subscriptions/update-subscription';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getSubscriptions.schema), getSubscriptions.handler);
router.get('/:id', authenticateSession, validateEndpoint(getSubscriptionById.schema), getSubscriptionById.handler);

router.post('/', authenticateSession, validateEndpoint(createSubscription.schema), createSubscription.handler);
router.put('/:id', authenticateSession, validateEndpoint(updateSubscription.schema), updateSubscription.handler);
router.delete('/:id', authenticateSession, validateEndpoint(deleteSubscription.schema), deleteSubscription.handler);

router.patch('/:id/toggle-active', authenticateSession, validateEndpoint(toggleActive.schema), toggleActive.handler);

router.post(
  '/:id/transactions',
  authenticateSession,
  validateEndpoint(linkTransactions.schema),
  linkTransactions.handler,
);
router.delete(
  '/:id/transactions',
  authenticateSession,
  validateEndpoint(unlinkTransactions.schema),
  unlinkTransactions.handler,
);

router.get(
  '/:id/suggest-matches',
  authenticateSession,
  validateEndpoint(suggestMatches.schema),
  suggestMatches.handler,
);

export default router;
