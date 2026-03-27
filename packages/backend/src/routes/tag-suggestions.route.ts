import {
  approveSuggestion,
  bulkApproveSuggestions,
  bulkRejectSuggestions,
  getSuggestions,
  getSuggestionsCount,
  rejectSuggestion,
} from '@controllers/tag-suggestions';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getSuggestions.schema), getSuggestions.handler);
router.get('/count', authenticateSession, validateEndpoint(getSuggestionsCount.schema), getSuggestionsCount.handler);
router.post('/approve', authenticateSession, validateEndpoint(approveSuggestion.schema), approveSuggestion.handler);
router.post('/reject', authenticateSession, validateEndpoint(rejectSuggestion.schema), rejectSuggestion.handler);
router.post(
  '/bulk-approve',
  authenticateSession,
  validateEndpoint(bulkApproveSuggestions.schema),
  bulkApproveSuggestions.handler,
);
router.post(
  '/bulk-reject',
  authenticateSession,
  validateEndpoint(bulkRejectSuggestions.schema),
  bulkRejectSuggestions.handler,
);

export default router;
