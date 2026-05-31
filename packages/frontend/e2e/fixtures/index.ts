import { test as base } from '@playwright/test';

import { isReachable } from '../helpers/is-reachable';
import { type TestUser, buildTestUser, createTestUser, deleteTestUser } from '../helpers/test-user';

// Local dev uses self-signed certs; allow them for any Node-side TLS in helpers.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://localhost:8100';

type CustomFixtures = {
  testUser: TestUser;
  ensurePreviewAlive: void;
};

export const test = base.extend<Pick<CustomFixtures, 'ensurePreviewAlive'>, Pick<CustomFixtures, 'testUser'>>({
  testUser: [
    async ({ playwright }, use, workerInfo) => {
      const user = buildTestUser({ workerIndex: workerInfo.workerIndex });
      const request = await playwright.request.newContext({
        ignoreHTTPSErrors: true,
        // better-auth requires Origin header for CSRF protection (must match trustedOrigins)
        extraHTTPHeaders: { Origin: BASE_URL },
      });

      await createTestUser({ request, user });
      await use(user);
      await deleteTestUser({ request, user });
      await request.dispose();
    },
    { scope: 'worker' },
  ],

  ensurePreviewAlive: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      // Skip only when the server is genuinely unreachable (connection refused /
      // timeout) — e.g. a CI preview env torn down mid-run. Any HTTP response
      // means it's alive; see isReachable for why this can't use `fetch`.
      if (!(await isReachable({ url: BASE_URL }))) {
        testInfo.skip(true, 'Preview environment is not reachable');
      }

      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
