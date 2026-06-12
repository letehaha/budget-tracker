import { t } from '@i18n/index';
import { ConflictError, NotFoundError } from '@js/errors';
import PayeeIgnoredNames from '@models/payee-ignored-names.model';
import Payees from '@models/payees.model';

import { withTransaction } from '../common/with-transaction';
import { parsePayeeName, resolveNormalizedName } from './payee-namespace';
import { loadPayeeOrThrow } from './payees.service';

interface ListInput {
  userId: number;
}

export const listPayeeIgnoredNames = withTransaction(async ({ userId }: ListInput): Promise<PayeeIgnoredNames[]> => {
  return PayeeIgnoredNames.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
  });
});

interface AddInput {
  userId: number;
  rawName: string;
  /**
   * When true, the Payee this name resolves to (by canonical name or alias)
   * is deleted as part of the same operation. Without this flag, the API
   * rejects with 409 so the user has to acknowledge it (the Payee delete is
   * destructive and we don't want it as an implicit side effect of "I want
   * to ignore this").
   */
  force?: boolean;
}

export const addPayeeIgnoredName = withTransaction(
  async ({ userId, rawName, force = false }: AddInput): Promise<PayeeIgnoredNames> => {
    const { display, normalized } = parsePayeeName({ raw: rawName, emptyMessageKey: 'payees.nameRequired' });

    const existing = await PayeeIgnoredNames.findOne({ where: { userId, normalizedName: normalized } });
    if (existing) return existing;

    // Ignoring a name that still resolves to a Payee (canonical or alias)
    // would be a silent no-op: the blocklist only gates Step-3 promotion in
    // `resolvePayeeForRawMerchant`, and a resolvable name links at Step 1
    // before the blocklist is consulted. Force-acknowledge deletes the
    // resolved Payee so the ignore actually takes effect.
    const hit = await resolveNormalizedName({ userId, normalized });
    if (hit) {
      if (!force) {
        throw new ConflictError({
          message: t({ key: 'payees.ignoredNameCollidesWithPayee' }),
          details: { conflictingPayee: { id: hit.payeeId, name: hit.name } },
        });
      }
      // Cascades clear PayeeAliases + null out Transactions.payeeId via the
      // existing FK rules established in the original Payees migration.
      await Payees.destroy({ where: { id: hit.payeeId, userId } });
    }

    return PayeeIgnoredNames.create({
      userId,
      normalizedName: normalized,
      rawSample: display,
    });
  },
);

interface RemoveInput {
  userId: number;
  id: string;
}

export const removePayeeIgnoredName = withTransaction(async ({ userId, id }: RemoveInput): Promise<void> => {
  const row = await PayeeIgnoredNames.findOne({ where: { id, userId }, attributes: ['id'] });
  if (!row) {
    throw new NotFoundError({ message: t({ key: 'payees.ignoredNameNotFound' }) });
  }
  await PayeeIgnoredNames.destroy({ where: { id, userId } });
});

interface DeleteAndIgnoreInput {
  userId: number;
  payeeId: string;
}

interface DeleteAndIgnoreResult {
  addedCount: number;
}

/**
 * Delete a Payee AND add every one of its normalized names (canonical + every
 * alias) to the ignored list. This is the "Delete & ignore" UI flow — the
 * user is saying "this isn't a real merchant, never recreate it".
 *
 * Idempotent on already-ignored names: bulk insert ignores duplicates by
 * pre-filtering against the existing set.
 */
export const deletePayeeAndIgnoreFuture = withTransaction(
  async ({ userId, payeeId }: DeleteAndIgnoreInput): Promise<DeleteAndIgnoreResult> => {
    const payee = await loadPayeeOrThrow({ userId, id: payeeId });
    const aliases = payee.aliases ?? [];

    const candidates = new Map<string, string>();
    candidates.set(payee.normalizedName, payee.name);
    for (const alias of aliases) {
      if (!candidates.has(alias.normalizedName)) {
        candidates.set(alias.normalizedName, alias.rawName);
      }
    }

    const existing = await PayeeIgnoredNames.findAll({
      where: { userId, normalizedName: Array.from(candidates.keys()) },
      attributes: ['normalizedName'],
    });
    const existingSet = new Set(existing.map((e) => e.normalizedName));

    const toCreate = Array.from(candidates.entries())
      .filter(([normalized]) => !existingSet.has(normalized))
      .map(([normalized, rawSample]) => ({ userId, normalizedName: normalized, rawSample }));

    if (toCreate.length > 0) {
      await PayeeIgnoredNames.bulkCreate(toCreate);
    }

    // Payees → Transactions.payeeId SET NULL via FK; PayeeAliases cascade.
    await Payees.destroy({ where: { id: payee.id, userId } });

    return { addedCount: toCreate.length };
  },
);
