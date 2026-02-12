import acceptCandidate from '@controllers/subscriptions/accept-candidate';
import createSubscription from '@controllers/subscriptions/create-subscription';
import deleteSubscription from '@controllers/subscriptions/delete-subscription';
import detectCandidates from '@controllers/subscriptions/detect-candidates';
import dismissCandidate from '@controllers/subscriptions/dismiss-candidate';
import getCandidates from '@controllers/subscriptions/get-candidates';
import { getSubscriptionById, getSubscriptions } from '@controllers/subscriptions/get-subscriptions';
import getSubscriptionsSummary from '@controllers/subscriptions/get-subscriptions-summary';
import getUpcomingPayments from '@controllers/subscriptions/get-upcoming-payments';
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
router.get(
  '/summary',
  authenticateSession,
  validateEndpoint(getSubscriptionsSummary.schema),
  getSubscriptionsSummary.handler,
);
router.get('/upcoming', authenticateSession, validateEndpoint(getUpcomingPayments.schema), getUpcomingPayments.handler);

// Subscription candidate detection routes (must be before /:id)
router.get(
  '/detect-candidates',
  authenticateSession,
  validateEndpoint(detectCandidates.schema),
  detectCandidates.handler,
);
router.get('/candidates', authenticateSession, validateEndpoint(getCandidates.schema), getCandidates.handler);
router.post(
  '/candidates/:id/accept',
  authenticateSession,
  validateEndpoint(acceptCandidate.schema),
  acceptCandidate.handler,
);
router.post(
  '/candidates/:id/dismiss',
  authenticateSession,
  validateEndpoint(dismissCandidate.schema),
  dismissCandidate.handler,
);
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
