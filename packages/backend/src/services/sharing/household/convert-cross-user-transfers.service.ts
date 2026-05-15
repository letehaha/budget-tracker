import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import * as Transactions from '@models/transactions.model';
import Users from '@models/users.model';
import { Op } from 'sequelize';

/**
 * Converts any `common_transfer` pairs that span the two given users into independent
 * `transfer_out_wallet` rows. Triggered when a household membership between them ends
 * (leave / revoke), so a transfer that previously crossed the household boundary stops
 * advertising a partner the recipient can no longer see or touch.
 *
 * Behaviour per pair:
 *   - Both legs flip to `transfer_out_wallet` and have `transferId` cleared.
 *   - Each leg's `note` gains a one-line suffix describing the other side
 *     (`Transfer to/from @{username} • {accountName}`) so the user keeps a paper trail
 *     of where the funds went after the link is severed.
 *   - Balances are unaffected — amount/account/time/type stay put.
 *
 * Same-user transfers on each side are untouched, even when the loop loads them as
 * candidates. The pair filter checks that the two legs' account owners are exactly
 * `userIdA` and `userIdB` in some order.
 */
export const convertCrossUserTransfersToOutOfWallet = async ({
  userIdA,
  userIdB,
}: {
  userIdA: number;
  userIdB: number;
}): Promise<{ convertedPairCount: number }> => {
  if (userIdA === userIdB) return { convertedPairCount: 0 };

  const accounts = (await Accounts.findAll({
    where: { userId: { [Op.in]: [userIdA, userIdB] } },
    attributes: ['id', 'userId', 'name'],
    raw: true,
  })) as unknown as Array<{ id: number; userId: number; name: string }>;

  const accountById = new Map<number, { id: number; userId: number; name: string }>();
  const accountIds: number[] = [];
  for (const account of accounts) {
    accountById.set(account.id, account);
    accountIds.push(account.id);
  }

  // Neither user has any accounts in scope — nothing could possibly need conversion.
  if (accountIds.length === 0) return { convertedPairCount: 0 };

  const candidates = await Transactions.default.findAll({
    where: {
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      transferId: { [Op.not]: null },
      accountId: { [Op.in]: accountIds },
    },
  });

  // Group candidates by `transferId` so each pair is processed exactly once. Any group
  // that isn't a clean pair (length !== 2, or both legs on the same user) is left alone.
  const byTransferId = new Map<string, Transactions.default[]>();
  for (const tx of candidates) {
    if (!tx.transferId) continue;
    const arr = byTransferId.get(tx.transferId) ?? [];
    arr.push(tx);
    byTransferId.set(tx.transferId, arr);
  }

  const [userA, userB] = await Promise.all([Users.findByPk(userIdA), Users.findByPk(userIdB)]);
  const usernameByUserId = new Map<number, string | null>([
    [userIdA, userA?.username ?? null],
    [userIdB, userB?.username ?? null],
  ]);

  let convertedPairCount = 0;

  for (const [, legs] of byTransferId) {
    if (legs.length !== 2) continue;
    const [first, second] = legs as [Transactions.default, Transactions.default];
    const firstAccount = accountById.get(first.accountId);
    const secondAccount = accountById.get(second.accountId);
    if (!firstAccount || !secondAccount) continue;
    const ownerPair = new Set([firstAccount.userId, secondAccount.userId]);
    const isAcrossThisPair = ownerPair.has(userIdA) && ownerPair.has(userIdB);
    if (!isAcrossThisPair) continue;

    for (const leg of legs) {
      const myAccount = leg === first ? firstAccount : secondAccount;
      const otherAccount = leg === first ? secondAccount : firstAccount;
      const otherUsername = usernameByUserId.get(otherAccount.userId);
      // expense leg = "money went out → to other"; income leg = "money came in → from other"
      const direction = leg.transactionType === TRANSACTION_TYPES.expense ? 'to' : 'from';
      const counterpartLabel = otherUsername ? `@${otherUsername} • ${otherAccount.name}` : otherAccount.name;
      const suffix = `Transfer ${direction} ${counterpartLabel}`;
      const newNote = leg.note ? `${leg.note}\n${suffix}` : suffix;

      try {
        await Transactions.updateTransactionById({
          id: leg.id,
          userId: leg.userId,
          transferId: null,
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
          note: newNote,
        });
      } catch (err) {
        // Conversion runs inside the parent share-break transaction; surface the
        // failure so the break itself rolls back rather than half-converting a pair.
        logger.error(
          {
            message: 'Failed to convert cross-user transfer leg on share break',
            error: err as Error,
          },
          {
            code: 'CROSS_USER_TRANSFER_CONVERT_FAILED',
            transferId: leg.transferId,
            txId: leg.id,
            accountId: leg.accountId,
            myUserId: myAccount.userId,
            otherUserId: otherAccount.userId,
          },
        );
        throw err;
      }
    }

    convertedPairCount += 1;
  }

  return { convertedPairCount };
};
