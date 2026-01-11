import { app } from '@root/app';
import { API_PREFIX } from '@root/config';
import crypto from 'crypto';
import request from 'supertest';

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';

// Set the test webhook secret in the environment for tests
process.env.GITHUB_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

interface GitHubReleasePayload {
  action: 'published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released';
  release: {
    tag_name: string;
    name: string | null;
    body: string | null;
    html_url: string;
    draft: boolean;
    prerelease: boolean;
    published_at: string | null;
    created_at: string;
  };
  repository: {
    full_name: string;
  };
}

interface SendGitHubWebhookParams {
  payload: GitHubReleasePayload;
  event?: string;
  secret?: string;
}

/**
 * Creates a valid GitHub webhook signature for the given payload
 */
function createWebhookSignature({ payload, secret }: { payload: object; secret: string }): string {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${signature}`;
}

/**
 * Sends a GitHub webhook request to the webhook endpoint.
 * No authentication required - uses signature verification instead.
 */
export async function sendGitHubWebhook({
  payload,
  event = 'release',
  secret = TEST_WEBHOOK_SECRET,
}: SendGitHubWebhookParams): Promise<request.Response> {
  const signature = createWebhookSignature({ payload, secret });

  return request(app)
    .post(`${API_PREFIX}/webhooks/github`)
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', event)
    .set('X-Hub-Signature-256', signature)
    .send(payload);
}

/**
 * Creates a mock GitHub release webhook payload
 */
export function createReleasePayload({
  tagName = 'v1.0.0',
  name = 'Release v1.0.0',
  draft = false,
  prerelease = false,
  action = 'published' as const,
}: {
  tagName?: string;
  name?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  action?: GitHubReleasePayload['action'];
} = {}): GitHubReleasePayload {
  return {
    action,
    release: {
      tag_name: tagName,
      name,
      body: 'Release notes here',
      html_url: `https://github.com/test/repo/releases/tag/${tagName}`,
      draft,
      prerelease,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
    repository: {
      full_name: 'test/repo',
    },
  };
}
