import { handleGitHubWebhook } from '@controllers/webhooks.controller';
import { verifyGitHubWebhook } from '@middlewares/github-webhook';
import { Router } from 'express';

const router = Router({});

/**
 * GitHub webhook endpoint for release notifications.
 * No authentication required - uses signature verification instead.
 *
 * Configure in GitHub:
 * 1. Go to repo Settings > Webhooks > Add webhook
 * 2. Payload URL: https://your-domain.com/api/v1/webhooks/github
 * 3. Content type: application/json
 * 4. Secret: same as GITHUB_WEBHOOK_SECRET env var
 * 5. Events: Select "Releases" only
 */
router.post('/github', verifyGitHubWebhook, handleGitHubWebhook);

export default router;
