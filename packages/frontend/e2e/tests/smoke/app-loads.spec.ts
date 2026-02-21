import { expect, test } from '../../fixtures';

test.describe('Smoke tests', () => {
  test('app loads without JS errors', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));

    await page.goto('/');

    await expect(page).toHaveURL(/\/sign-in/);

    expect(errors).toHaveLength(0);
  });

  test('app serves HTML content', async ({ page }) => {
    const response = await page.goto('/');

    expect(response).not.toBeNull();
    expect(response!.headers()['content-type']).toContain('text/html');
  });
});
