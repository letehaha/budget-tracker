/**
 * Demo mode routes.
 *
 * These endpoints handle demo user creation and management.
 * Demo users get a fully-functional temporary account with seeded data.
 */
import { startDemo } from '@controllers/demo.controller';
import { authRateLimit } from '@middlewares/rate-limit';
import { Router } from 'express';

const router = Router({});

/**
 * POST /api/v1/demo
 *
 * Creates a new demo user account with seeded data.
 * Returns session credentials for immediate login.
 *
 * Rate limited: 5 requests per 15 minutes per IP
 */
router.post('/', authRateLimit, startDemo);

export default router;
