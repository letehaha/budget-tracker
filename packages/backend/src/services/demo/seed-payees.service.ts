import { CATEGORIZATION_MODE, RecordId } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Payees from '@models/payees.model';
import { normalizePayeeName } from '@services/payees/normalize-name';

import { allDemoMerchants } from './template/merchants';

/**
 * Inserts one Payee per demo merchant so generated transactions can carry a
 * real `payeeId` instead of only a note string.
 *
 * Goes straight through `Payees.bulkCreate` rather than `createPayee`:
 * `createPayee` enqueues a brand-logo lookup job per row, which would queue
 * one job per merchant on every demo signup even though the logo domain is
 * already known here. Setting `logoSource: 'manual'` tells the logo resolver
 * the row is already authoritative, so it's skipped entirely.
 *
 * Two merchant display names can normalize to the same string, which the
 * unique `(userId, normalizedName)` index would reject. Colliding names are
 * deduped before insert; every original name still maps to the one payee id
 * that got created for it.
 */
export async function seedPayees({
  userId,
  categoryMap,
}: {
  userId: number;
  /** Maps a category key to its id. Subcategory keys look like `food/groceries`. */
  categoryMap: Map<string, string>;
}): Promise<Map<string, string>> {
  const merchants = allDemoMerchants();

  const rows: {
    userId: number;
    name: string;
    normalizedName: string;
    defaultCategoryId: RecordId | null;
    categorizationMode: CATEGORIZATION_MODE;
    logoDomain: string;
    logoSource: 'manual';
  }[] = [];

  // First-seen normalized name owns the row index; later collisions reuse it.
  const normalizedToRowIndex = new Map<string, number>();
  const nameToNormalized = new Map<string, string>();

  for (const merchant of merchants) {
    const normalizedName = normalizePayeeName({ raw: merchant.name });
    nameToNormalized.set(merchant.name, normalizedName);

    if (normalizedToRowIndex.has(normalizedName)) continue;

    normalizedToRowIndex.set(normalizedName, rows.length);
    rows.push({
      userId,
      name: merchant.name,
      normalizedName,
      defaultCategoryId: (categoryMap.get(merchant.categoryKey) ?? null) as RecordId | null,
      categorizationMode: CATEGORIZATION_MODE.enforce,
      logoDomain: merchant.domain,
      logoSource: 'manual',
    });
  }

  const created = await Payees.bulkCreate(rows, { returning: true });

  const nameToPayeeId = new Map<string, string>();
  for (const merchant of merchants) {
    const normalizedName = nameToNormalized.get(merchant.name)!;
    const rowIndex = normalizedToRowIndex.get(normalizedName)!;
    nameToPayeeId.set(merchant.name, created[rowIndex]!.id);
  }

  logger.info(`Created ${created.length} demo payees for user ${userId}`);

  return nameToPayeeId;
}
