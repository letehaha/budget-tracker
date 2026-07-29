import { logger } from '@js/utils/logger';

import { generateDemoTemplate } from './template/generate';
import type { DemoTemplate } from './template/types';

let cachedTemplate: DemoTemplate | null = null;

/**
 * Returns the cached demo template, generating one if the cache is empty (lazy init).
 *
 * Dates in the template are offsets, not calendar dates, so a copy stays usable
 * between refreshes: the seeder anchors the offsets to its own reference date.
 */
export function getDemoTemplate(): DemoTemplate {
  if (!cachedTemplate) {
    refreshDemoTemplate();
  }
  return cachedTemplate!;
}

/**
 * Regenerates the cached template. Called by the daily cron job and on app startup.
 */
export function refreshDemoTemplate(): void {
  cachedTemplate = generateDemoTemplate();
  logger.info(`Demo template generated: ${cachedTemplate.transactions.length} transactions`);
}
