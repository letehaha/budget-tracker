import { expect, test } from '../../fixtures';

// The static Astro landing page is only served at `/` from the production
// frontend Docker image (nginx serves /landing/index.html). Local Vite dev
// runs the SPA at `/`, where this button doesn't exist, so we skip there.
test.describe('Landing page - Try Demo button', () => {
  test('hydrates and starts a demo session that redirects to /dashboard', async ({ page }) => {
    const cspViolations: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && /Content Security Policy/i.test(text)) {
        cspViolations.push(text);
      }
    });

    await page.goto('/');

    const tryDemoButton = page.getByRole('button', { name: /try demo/i });
    if ((await tryDemoButton.count()) === 0) {
      test.skip(true, 'Static landing page not served at / (likely local SPA dev environment)');
    }

    // The button is rendered into the SSR HTML even when hydration is broken.
    // To prove the Vue island actually hydrated, we click and require the
    // POST /demo + redirect to dashboard to complete — that flow only runs
    // when the @click handler is wired up.
    await expect(tryDemoButton).toBeVisible();
    await expect(tryDemoButton).toBeEnabled();

    await tryDemoButton.click();

    // The button does `window.location.href = '/dashboard'` after the POST
    // /api/v1/demo succeeds. If the demo cookie isn't set, the SPA's auth
    // guard would bounce us to /sign-in — which would fail this assertion.
    await page.waitForURL(/\/(dashboard|welcome)/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    expect(page.url()).toMatch(/\/(dashboard|welcome)/);

    expect(cspViolations, `CSP blocked Astro hydration scripts:\n${cspViolations.join('\n')}`).toHaveLength(0);
  });
});
