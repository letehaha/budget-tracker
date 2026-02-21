import { expect, test } from '../../fixtures';
import { loginViaUI } from '../../helpers/auth';

test.describe('Welcome page', () => {
  test('after login, user without base currency lands on /welcome', async ({ page, testUser }) => {
    await loginViaUI({
      page,
      email: testUser.email,
      password: testUser.password,
    });

    await expect(page).toHaveURL(/\/welcome/);
  });

  test('user can select a currency and submit', async ({ page, testUser }) => {
    await loginViaUI({
      page,
      email: testUser.email,
      password: testUser.password,
    });

    await expect(page).toHaveURL(/\/welcome/);

    // Wait for currencies to load (button is disabled while loading), then submit
    const confirmButton = page.getByRole('button', { name: /confirm currency/i });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
