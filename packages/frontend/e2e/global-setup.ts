import type { FullConfig } from '@playwright/test';

// Allow self-signed certificates (local dev uses HTTPS with self-signed certs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 10 * 60 * 1_000; // 10 minutes

async function isReachable({ url }: { url: string }): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });
    // Frontend should return 200; API may return 401 (auth-required but alive)
    return response.status === 200 || response.status === 401;
  } catch {
    return false;
  }
}

async function waitForService({ url, label }: { url: string; label: string }): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    const reachable = await isReachable({ url });

    if (reachable) {
      console.log(`  [OK] ${label} is ready at ${url}`);
      return;
    }

    const elapsed = Math.round((Date.now() - start) / 1_000);
    console.log(`  [WAIT] ${label} not ready (${elapsed}s elapsed), retrying in ${POLL_INTERVAL_MS / 1_000}s...`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`${label} at ${url} did not become reachable within ${MAX_WAIT_MS / 60_000} minutes`);
}

export default async function globalSetup(config: FullConfig) {
  const frontendURL = config.projects[0]?.use?.baseURL || process.env.PLAYWRIGHT_BASE_URL || 'https://localhost:8100';
  const apiURL = process.env.PLAYWRIGHT_API_BASE_URL || 'https://localhost:8081';

  console.log('\nGlobal Setup: Waiting for services to be ready...');
  console.log(`  Frontend: ${frontendURL}`);
  console.log(`  API: ${apiURL}`);

  await Promise.all([
    waitForService({ url: frontendURL, label: 'Frontend' }),
    waitForService({ url: `${apiURL}/api/v1/user`, label: 'API' }),
  ]);

  console.log('Global Setup: All services are ready!\n');
}
