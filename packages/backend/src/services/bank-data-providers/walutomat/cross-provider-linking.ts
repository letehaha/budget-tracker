import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils';
import Accounts from '@models/Accounts.model';
import Transactions from '@models/Transactions.model';
import { linkTransactions } from '@services/transactions/transactions-linking/link-transactions';
import { addDays, subDays } from 'date-fns';
import { Op, Sequelize } from 'sequelize';

/**
 * Date window (in days) for matching cross-provider transactions.
 * Bank transfers typically settle within 1-2 business days.
 */
const DATE_WINDOW_DAYS = 3;

/**
 * Extract the counterparty IBAN from a Walutomat transaction's operationDetails.
 *
 * - PAYIN: `sourceAccount` is the sender's IBAN (the external bank account that sent money)
 * - PAYOUT: `destinationAccount` is the receiver's IBAN (the external bank account receiving money)
 */
function extractCounterpartyIban({
  operationType,
  operationDetails,
}: {
  operationType: string;
  operationDetails: Array<{ key: string; value: string }>;
}): string | null {
  if (operationType === 'PAYIN') {
    return operationDetails.find((d) => d.key === 'sourceAccount')?.value ?? null;
  }
  if (operationType === 'PAYOUT') {
    return operationDetails.find((d) => d.key === 'destinationAccount')?.value ?? null;
  }
  return null;
}

/**
 * Auto-link Walutomat PAYIN/PAYOUT transactions to their counterparts in other
 * bank accounts by matching IBAN + exact amount + currency + date window.
 *
 * Both Enable Banking and Monobank store the account's IBAN in
 * Account.externalData.iban. This function queries all user accounts for that
 * field, matching against the IBAN found in Walutomat's operationDetails.
 *
 * Matching criteria (all must be true):
 * - Account IBAN matches Walutomat's sourceAccount/destinationAccount
 * - Exact same amount (to the cent)
 * - Same currency
 * - Date within ±3 days
 * - Opposite transaction type (PAYOUT→income, PAYIN→expense)
 * - Neither transaction is already linked as a transfer
 *
 * Only links when exactly 1 unambiguous match is found.
 */
export async function linkCrossProviderTransfers({ userId }: { userId: number }): Promise<void> {
  // Step 1: Find unlinked Walutomat PAYIN/PAYOUT transactions
  const walutomatTxs = await Transactions.findAll({
    where: {
      userId,
      accountType: ACCOUNT_TYPES.walutomat,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      [Op.or]: [
        Sequelize.where(Sequelize.literal(`"externalData"->>'operationType'`), 'PAYIN'),
        Sequelize.where(Sequelize.literal(`"externalData"->>'operationType'`), 'PAYOUT'),
      ],
    },
  });

  if (walutomatTxs.length === 0) return;

  // Step 2: Build IBAN → accountId[] index from all user accounts that have an IBAN
  // Both Enable Banking and Monobank store IBANs in externalData.iban
  const accountsWithIban = await Accounts.findAll({
    where: {
      userId,
      [Op.and]: [Sequelize.where(Sequelize.literal(`"externalData"->>'iban'`), { [Op.not]: null })],
    },
  });

  const ibanToAccountIds = new Map<string, number[]>();
  for (const account of accountsWithIban) {
    const externalData = account.externalData as Record<string, unknown> | null;
    const iban = externalData?.iban as string | undefined;
    if (!iban) continue;

    const normalized = iban.replace(/\s/g, '').toUpperCase();
    const existing = ibanToAccountIds.get(normalized);
    if (existing) {
      existing.push(account.id);
    } else {
      ibanToAccountIds.set(normalized, [account.id]);
    }
  }

  if (ibanToAccountIds.size === 0) return;

  // Step 3: Match each Walutomat transaction
  const pairsToLink: [number, number][] = [];

  for (const tx of walutomatTxs) {
    const externalData = tx.externalData as {
      operationType: string;
      operationDetails: Array<{ key: string; value: string }>;
    };

    const counterpartyIban = extractCounterpartyIban({
      operationType: externalData.operationType,
      operationDetails: externalData.operationDetails ?? [],
    });

    if (!counterpartyIban) continue;

    const normalizedIban = counterpartyIban.replace(/\s/g, '').toUpperCase();
    const matchingAccountIds = ibanToAccountIds.get(normalizedIban);

    if (!matchingAccountIds || matchingAccountIds.length === 0) continue;

    // Determine the expected opposite transaction type
    // PAYIN = money coming INTO Walutomat → the other account had an EXPENSE
    // PAYOUT = money going OUT of Walutomat → the other account had an INCOME
    const expectedOppositeType =
      externalData.operationType === 'PAYIN' ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income;

    const txDate = new Date(tx.time);
    const dateFrom = subDays(txDate, DATE_WINDOW_DAYS);
    const dateTo = addDays(txDate, DATE_WINDOW_DAYS);

    // Search for matching transactions in the identified accounts
    const candidates = await Transactions.findAll({
      where: {
        userId,
        accountId: { [Op.in]: matchingAccountIds },
        transactionType: expectedOppositeType,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        currencyCode: tx.currencyCode,
        // amount is stored as cents in DB, tx.amount is a Money object
        amount: tx.amount.toCents(),
        time: { [Op.between]: [dateFrom, dateTo] },
      },
    });

    // Only auto-link if exactly 1 unambiguous match
    if (candidates.length !== 1) continue;

    const match = candidates[0]!;

    // Determine base (expense) and opposite (income)
    const [baseTxId, oppositeTxId] =
      tx.transactionType === TRANSACTION_TYPES.expense ? [tx.id, match.id] : [match.id, tx.id];

    pairsToLink.push([baseTxId, oppositeTxId]);
  }

  if (pairsToLink.length === 0) return;

  await linkTransactions({ userId, ids: pairsToLink });

  logger.info(`[Walutomat] Auto-linked ${pairsToLink.length} cross-provider transfer(s) for user ${userId}`);
}
