import { t } from '@i18n/index';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import PayeeAliases from '@models/payee-aliases.model';
import PayeeIgnoredNames from '@models/payee-ignored-names.model';
import Payees from '@models/payees.model';

import { withTransaction } from '../common/with-transaction';
import { normalizePayeeName } from './normalize-name';

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
   * When true, an existing Payee whose normalizedName matches is deleted as
   * part of the same operation. Without this flag, the API rejects with 409
   * so the user has to acknowledge it (the Payee delete is destructive and
   * we don't want it as an implicit side effect of "I want to ignore this").
   */
  force?: boolean;
}

export const addPayeeIgnoredName = withTransaction(
  async ({ userId, rawName, force = false }: AddInput): Promise<PayeeIgnoredNames> => {
    const trimmed = rawName.trim();
    if (!trimmed) {
      throw new ValidationError({ message: t({ key: 'payees.nameRequired' }) });
    }
    const normalized = normalizePayeeName({ raw: trimmed });
    if (!normalized) {
      throw new ValidationError({ message: t({ key: 'payees.nameRequired' }) });
    }

    const existing = await PayeeIgnoredNames.findOne({ where: { userId, normalizedName: normalized } });
    if (existing) return existing;

    const collidingPayee = await Payees.findOne({
      where: { userId, normalizedName: normalized },
      attributes: ['id'],
    });
    if (collidingPayee) {
      if (!force) {
        throw new ConflictError({ message: t({ key: 'payees.ignoredNameCollidesWithPayee' }) });
      }
      // Cascades clear PayeeAliases + null out Transactions.payeeId via the
      // existing FK rules established in the original Payees migration.
      await Payees.destroy({ where: { id: collidingPayee.id, userId } });
    }

    return PayeeIgnoredNames.create({
      userId,
      normalizedName: normalized,
      rawSample: trimmed,
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
    const payee = await Payees.findOne({
      where: { id: payeeId, userId },
      attributes: ['id', 'name', 'normalizedName'],
    });
    if (!payee) {
      throw new NotFoundError({ message: t({ key: 'payees.notFound' }) });
    }

    const aliases = await PayeeAliases.findAll({
      where: { payeeId: payee.id },
      attributes: ['rawName', 'normalizedName'],
    });

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
