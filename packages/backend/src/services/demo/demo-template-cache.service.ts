import { logger } from '@js/utils/logger';

import { DemoTemplate, generateDemoTemplate } from './generate-demo-template.service';

let cachedTemplate: DemoTemplate | null = null;

/**
 * Returns the cached demo template, generating one if the cache is empty (lazy init).
 */
export function getDemoTemplate(): DemoTemplate {
  if (!cachedTemplate) {
    refreshDemoTemplate();
  }
  return cachedTemplate!;
}

/**
 * Regenerates the cached template with fresh dates.
 * Called by the daily cron job and on app startup.
 */
export function refreshDemoTemplate(): void {
  cachedTemplate = generateDemoTemplate();
  logger.info(`Demo template generated: ${cachedTemplate.transactions.length} transactions`);
}
