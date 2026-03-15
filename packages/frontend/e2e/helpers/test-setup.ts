import { randomBytes } from 'crypto';

import { signUpViaFetch, verifyEmailViaFetch } from './api-client';

// Required for raw fetch() calls (local dev uses self-signed certs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export interface TestCredentials {
  email: string;
  password: string;
  name: string;
}

/**
 * Generates unique test credentials using a random suffix.
 * @param prefix - Short identifier for the test suite (e.g. 'pc' for portfolio-creation).
 */
export function buildTestCredentials({ prefix }: { prefix: string }): TestCredentials {
  const runId = randomBytes(4).toString('hex');
  return {
    email: `pw-${prefix}-${runId}@test.local`,
    password: 'E2eTestPass123!',
    name: `pw-${prefix}-${runId}`,
  };
}

/**
 * Signs up a new test user and verifies their email.
 * Intended for use in `test.beforeAll` (runs once before all tests in a suite).
 */
export async function signUpAndVerify({ creds }: { creds: TestCredentials }): Promise<void> {
  await signUpViaFetch({ email: creds.email, password: creds.password, name: creds.name });
  await verifyEmailViaFetch({ email: creds.email });
}
