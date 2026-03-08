import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Picks an option from a combobox select inside a dialog.
 * @param nth - Zero-based index of the combobox within the dialog.
 */
export async function pickDialogSelect({
  page,
  nth,
  optionName,
}: {
  page: Page;
  nth: number;
  optionName: string | RegExp;
}): Promise<void> {
  const trigger = page.getByRole('dialog').locator('button[role="combobox"]').nth(nth);
  await trigger.click();
  await page.getByRole('option', { name: optionName }).click();
}

export async function waitForSuccessToast({ page }: { page: Page }): Promise<void> {
  await expect(page.locator('[data-sonner-toast][data-type="success"], .bg-success').first()).toBeVisible({
    timeout: 15_000,
  });
}
