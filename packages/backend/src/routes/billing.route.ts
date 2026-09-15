import { createCheckout, createPortalSession } from '@controllers/billing.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { blockDemoUsers } from '@middlewares/block-demo-users';
import { cloudOnly } from '@middlewares/cloud-only';
import { billingRateLimit } from '@middlewares/rate-limit';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router();

router.use(cloudOnly);

router.post(
  '/checkout',
  authenticateSession,
  blockDemoUsers,
  billingRateLimit,
  validateEndpoint(createCheckout.schema),
  createCheckout.handler,
);

router.post(
  '/portal',
  authenticateSession,
  blockDemoUsers,
  billingRateLimit,
  validateEndpoint(createPortalSession.schema),
  createPortalSession.handler,
);

export default router;
