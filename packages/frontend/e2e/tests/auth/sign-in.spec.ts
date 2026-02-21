import { expect, test } from '../../fixtures';

test.describe('Sign in', () => {
  test('redirects unauthenticated user to auth page', async ({ page }) => {
    await page.goto('/dashboard');

    // SPA needs to bootstrap before the router guard redirects (slower on preview)
    // The guard may redirect to /sign-in or /sign-up depending on the environment
    await expect(page).toHaveURL(/\/sign-(in|up)/, { timeout: 30_000 });
  });

  test('user can sign in with valid email credentials', async ({ page, testUser }) => {
    await page.goto('/sign-in');

    await page.locator('input[name="email"]').fill(testUser.email);
    await page.locator('input[type="password"]').fill(testUser.password);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/(welcome|dashboard)/, { timeout: 30_000 });
  });

  test('user cannot sign in with invalid credentials and sees an error', async ({ page }) => {
    await page.goto('/sign-in');

    await page.locator('input[name="email"]').fill('invalid@test.local');
    await page.locator('input[type="password"]').fill('InvalidPass123!');
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.locator('.form-wrapper .text-destructive-text')).toBeVisible();
  });
});
