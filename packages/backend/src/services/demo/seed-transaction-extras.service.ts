import type { RecordId } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import RefundTransactions from '@models/refund-transactions.model';
import TransactionSplits, { type CreateSplitPayload } from '@models/transaction-splits.model';
import TransactionTags from '@models/transaction-tags.model';
import { createTransactionGroup } from '@services/transaction-groups/create-transaction-group';

const MAX_NOTE_LENGTH = 100;

interface SplitInput {
  transactionId: string;
  categoryId: string;
  amount: number;
  refAmount: number;
  note?: string;
}

interface RefundInput {
  originalTxId: string;
  refundTxId: string;
}

interface TagLinkInput {
  tagId: string;
  transactionId: string;
}

interface GroupInput {
  name: string;
  note?: string;
  transactionIds: string[];
}

/**
 * Writes the rows that depend on a bulk-inserted demo transaction batch.
 * The caller resolves every id itself (categories, tags, transaction pairs),
 * so this only has to shape rows and respect the DB constraints below.
 */
export async function seedTransactionExtras({
  userId,
  splits,
  refunds,
  tagLinks,
  groups,
}: {
  userId: number;
  splits: SplitInput[];
  refunds: RefundInput[];
  tagLinks: TagLinkInput[];
  groups: GroupInput[];
}): Promise<void> {
  const splitsCreated = await seedSplits({ userId, splits });
  const refundsCreated = await seedRefunds({ userId, refunds });
  const tagLinksCreated = await seedTagLinks({ tagLinks });
  const groupsCreated = await seedGroups({ userId, groups });

  logger.info(
    `Seeded demo transaction extras for user ${userId}: ${splitsCreated} splits, ${refundsCreated} refunds, ${tagLinksCreated} tag links, ${groupsCreated} groups.`,
  );
}

/**
 * (transactionId, categoryId) is UNIQUE in TransactionSplits, so a repeated
 * pair is merged by summing amounts instead of erroring the whole batch.
 */
async function seedSplits({ userId, splits }: { userId: number; splits: SplitInput[] }): Promise<number> {
  if (!splits.length) return 0;

  const merged = new Map<string, SplitInput>();
  for (const split of splits) {
    const key = `${split.transactionId}:${split.categoryId}`;
    const existing = merged.get(key);
    if (existing) {
      existing.amount += split.amount;
      existing.refAmount += split.refAmount;
    } else {
      merged.set(key, { ...split });
    }
  }

  // Typed as the model's own payload so the fields stay checked; only the
  // bulkCreate call needs the cast, matching `bulkCreateSplits` in the model.
  const rows: CreateSplitPayload[] = Array.from(merged.values()).map((split) => ({
    transactionId: split.transactionId,
    userId,
    categoryId: split.categoryId,
    amount: Money.fromCents(split.amount),
    refAmount: Money.fromCents(split.refAmount),
    note: split.note ? split.note.slice(0, MAX_NOTE_LENGTH) : null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await TransactionSplits.bulkCreate(rows as any, { hooks: false, validate: false });

  return rows.length;
}

/** refundTxId is UNIQUE, so a transaction can only ever be one refund's target. */
async function seedRefunds({ userId, refunds }: { userId: number; refunds: RefundInput[] }): Promise<number> {
  if (!refunds.length) return 0;

  const byRefundTxId = new Map<string, RefundInput>();
  for (const refund of refunds) {
    if (!byRefundTxId.has(refund.refundTxId)) {
      byRefundTxId.set(refund.refundTxId, refund);
    }
  }

  const rows = Array.from(byRefundTxId.values()).map((refund) => ({
    userId,
    originalTxId: refund.originalTxId,
    refundTxId: refund.refundTxId,
    splitId: null,
  }));

  await RefundTransactions.bulkCreate(rows, { hooks: false, validate: false });

  return rows.length;
}

async function seedTagLinks({ tagLinks }: { tagLinks: TagLinkInput[] }): Promise<number> {
  if (!tagLinks.length) return 0;

  const seen = new Set<string>();
  const rows: TagLinkInput[] = [];
  for (const link of tagLinks) {
    const key = `${link.tagId}:${link.transactionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(link);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await TransactionTags.bulkCreate(rows as any, { hooks: false, validate: false });

  return rows.length;
}

/**
 * Goes through the real group service (not a raw insert) because it also
 * writes TransactionGroupItems and enforces size/ownership rules. A group
 * that violates those rules is skipped rather than aborting the whole seed,
 * since one bad group in generated demo data shouldn't break account setup.
 */
async function seedGroups({ userId, groups }: { userId: number; groups: GroupInput[] }): Promise<number> {
  if (!groups.length) return 0;

  let created = 0;
  for (const group of groups) {
    try {
      await createTransactionGroup({
        userId,
        name: group.name,
        note: group.note ?? null,
        transactionIds: group.transactionIds as RecordId[],
      });
      created += 1;
    } catch (error) {
      logger.warn(`Skipped demo transaction group "${group.name}" for user ${userId}: ${(error as Error).message}`);
    }
  }

  return created;
}
