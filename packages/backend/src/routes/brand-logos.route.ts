import { search } from '@controllers/brand-logos';
import { authenticateSession } from '@middlewares/better-auth';
import { logoSearchRateLimit } from '@middlewares/rate-limit';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Shared brand-logo search, reused by the payee and subscription logo pickers.
router.get('/search', authenticateSession, logoSearchRateLimit, validateEndpoint(search.schema), search.handler);

export default router;
