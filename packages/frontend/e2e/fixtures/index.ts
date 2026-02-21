import { test as base } from '@playwright/test';

import { type TestUser, buildTestUser, createTestUser, deleteTestUser } from '../helpers/test-user';

// Required for the raw fetch() in ensurePreviewAlive (local dev uses self-signed certs)
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
      try {
        const response = await fetch(BASE_URL, {
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          testInfo.skip(true, 'Preview environment is not reachable');
        }
      } catch {
        testInfo.skip(true, 'Preview environment torn down');
      }

      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
