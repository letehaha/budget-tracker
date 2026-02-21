import type { Page } from '@playwright/test';

export async function loginViaUI({
  page,
  email,
  password,
}: {
  page: Page;
  email: string;
  password: string;
}): Promise<void> {
  await page.goto('/sign-in');

  // Email mode is the default (no need to switch to legacy)
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/\/(welcome|dashboard)/);
}
