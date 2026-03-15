/**
 * Routes that wrap better-auth server-side only APIs.
 * These endpoints expose functionality that better-auth doesn't provide as HTTP endpoints.
 */
import { setPassword } from '@controllers/better-auth-extensions.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { blockDemoUsers } from '@middlewares/block-demo-users';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Demo users cannot set/change passwords
router.post(
  '/set-password',
  authenticateSession,
  blockDemoUsers,
  validateEndpoint(setPassword.schema),
  setPassword.handler,
);

export default router;
