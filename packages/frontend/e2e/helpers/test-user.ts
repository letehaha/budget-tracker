import type { APIRequestContext } from '@playwright/test';
import { randomBytes } from 'crypto';

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || 'https://localhost:8081';

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

/**
 * Each worker gets a unique user with a random suffix per test run.
 * This avoids collisions with stale users from previous interrupted runs
 * (e.g. when email verification is enabled and prevents sign-in for cleanup).
 */
export function buildTestUser({ workerIndex }: { workerIndex: number }): TestUser {
  const runId = randomBytes(4).toString('hex');
  return {
    email: `pw-${runId}-w${workerIndex}@test.local`,
    name: `pw-${runId}-w${workerIndex}`,
    password: 'E2eTestPass123!',
  };
}

export async function createTestUser({ request, user }: { request: APIRequestContext; user: TestUser }): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/v1/auth/sign-up/email`, {
    data: {
      email: user.email,
      password: user.password,
      name: user.name,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to create test user ${user.email}: ${response.status()} ${body}`);
  }
}

export async function deleteTestUser({ request, user }: { request: APIRequestContext; user: TestUser }): Promise<void> {
  // Sign in to get a fresh session
  const signInResponse = await request.post(`${API_BASE_URL}/api/v1/auth/sign-in/email`, {
    data: {
      email: user.email,
      password: user.password,
    },
  });

  if (!signInResponse.ok()) {
    // User might have unverified email or already been cleaned up — best-effort
    console.warn(`Could not sign in as ${user.email} for cleanup: ${signInResponse.status()}`);
    return;
  }

  const deleteResponse = await request.delete(`${API_BASE_URL}/api/v1/user/delete`);

  if (!deleteResponse.ok()) {
    console.warn(`Could not delete test user ${user.email}: ${deleteResponse.status()}`);
  }
}
