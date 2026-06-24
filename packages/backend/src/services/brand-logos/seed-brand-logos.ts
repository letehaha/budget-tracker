import { logger } from '@js/utils/logger';
import BrandLogos from '@models/brand-logos.model';
import { normalizePayeeName } from '@services/payees/normalize-name';

import brandLogosSeed from './brand-logos-seed.json';

interface SeedEntry {
  name: string;
  domain: string;
}

/**
 * Populate the shared `BrandLogos` cache with the bundled list of common
 * brands so the most frequent payees and subscriptions resolve with zero
 * logo.dev calls.
 *
 * Idempotent: `bulkCreate(..., { ignoreDuplicates: true })` inserts only rows
 * whose `normalizedName` isn't present yet, so re-running never clobbers
 * existing logodev/admin-supplied rows. Entries are deduped by `normalizedName`
 * within the batch first (two seed names can normalize to the same key).
 */
export async function seedBrandLogos(): Promise<void> {
  const entries = brandLogosSeed as SeedEntry[];

  const rowByName = new Map<string, { normalizedName: string; domain: string; brandName: string; source: string }>();
  for (const { name, domain } of entries) {
    const normalizedName = normalizePayeeName({ raw: name });
    if (!normalizedName) continue;
    // First occurrence wins within the batch; later duplicates are dropped.
    if (!rowByName.has(normalizedName)) {
      rowByName.set(normalizedName, { normalizedName, domain, brandName: name, source: 'seed' });
    }
  }

  const rows = [...rowByName.values()];
  if (rows.length === 0) return;

  await BrandLogos.bulkCreate(rows, { ignoreDuplicates: true });
  logger.info(`[Brand Logos Seed] Seeded ${rows.length} brand logos (existing rows untouched)`);
}
