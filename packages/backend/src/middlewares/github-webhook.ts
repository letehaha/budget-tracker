import { logger } from '@js/utils/logger';
import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Verifies that the request is a valid GitHub webhook by checking the signature.
 * GitHub signs webhook payloads using HMAC-SHA256 with the configured secret.
 *
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGitHubWebhook(req: Request, res: Response, next: NextFunction): void {
  // Read secret at request time to support test environment setup
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('GITHUB_WEBHOOK_SECRET is not configured');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  if (!signature) {
    logger.warn('GitHub webhook request missing signature header');
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  // Get raw body for signature verification
  // Note: express.json() must be configured to preserve rawBody for this route
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!rawBody) {
    logger.error('Raw body not available for webhook signature verification');
    res.status(500).json({ error: 'Cannot verify signature' });
    return;
  }

  const expectedSignature = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  // Buffers must have same length for timingSafeEqual
  const isValid = sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer);

  if (!isValid) {
    logger.warn('GitHub webhook signature verification failed');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}
