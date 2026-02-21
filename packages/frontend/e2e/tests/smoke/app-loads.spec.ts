import { expect, test } from '../../fixtures';

test.describe('Smoke tests', () => {
  test('app loads without JS errors', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));

    await page.goto('/');

    // Wait for SPA to bootstrap and the router to settle (slower on preview).
    // The landing page may stay at / or redirect to /sign-in or /sign-up.
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
  });

  test('app serves HTML content', async ({ page }) => {
    const response = await page.goto('/');

    expect(response).not.toBeNull();
    expect(response!.headers()['content-type']).toContain('text/html');
  });
});
