/**
 * Routes that wrap better-auth server-side only APIs.
 * These endpoints expose functionality that better-auth doesn't provide as HTTP endpoints.
 */
import { setPassword } from '@controllers/better-auth-extensions.controller';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.post('/set-password', validateEndpoint(setPassword.schema), setPassword.handler);

export default router;
