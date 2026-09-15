import { logger } from '@js/utils/logger';
import { captureException } from '@js/utils/sentry';
import { NextFunction, Request, Response } from 'express';
import Stripe from 'stripe';

/**
 * Verifies `Stripe-Signature` over the exact request bytes and attaches the parsed event.
 * @see https://docs.stripe.com/webhooks#verify-official-libraries
 */
export function verifyStripeWebhook(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    const error = new Error('STRIPE_WEBHOOK_SECRET is not configured');
    logger.error(error);
    captureException({ error, context: { stage: 'verifyStripeWebhook' } });
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    // Only the body-parser wiring can drop the raw bytes, so this is a deploy bug,
    // not a bad caller.
    const error = new Error('Stripe webhook reached the verifier without a raw body');
    logger.error(error);
    captureException({ error, context: { stage: 'verifyStripeWebhook' } });
    res.status(500).json({ error: 'Webhook misconfigured' });
    return;
  }

  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  try {
    req.stripeEvent = Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    logger.warn(`Stripe webhook signature verification failed: ${(error as Error).message}`);
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}
