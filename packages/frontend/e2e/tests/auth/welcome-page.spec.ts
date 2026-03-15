import { expect, test } from '../../fixtures';
import { loginViaUI } from '../../helpers/auth';

test.describe('Welcome page', () => {
  test('after login, user without base currency lands on /welcome', async ({ page, testUser }) => {
    await loginViaUI({
      page,
      email: testUser.email,
      password: testUser.password,
    });

    await expect(page).toHaveURL(/\/welcome/, { timeout: 30_000 });
  });

  // FIXME: The app has a race condition — router.push fires before the vue-query cache
  // updates after setting base currency, so the navigation guard redirects back to /welcome.
  // Works with workers=1 but fails with parallel workers due to increased API latency.
  // Fix the app's useSetBaseCurrency mutation to await cache invalidation before navigating.
  test.fixme('user can select a currency and submit', async ({ page, testUser }) => {
    await loginViaUI({
      page,
      email: testUser.email,
      password: testUser.password,
    });

    await expect(page).toHaveURL(/\/welcome/, { timeout: 30_000 });

    // Wait for currencies to load (button is disabled while loading), then submit
    const confirmButton = page.getByRole('button', { name: /confirm currency/i });
    await expect(confirmButton).toBeEnabled({ timeout: 15_000 });
    await confirmButton.click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });
});
