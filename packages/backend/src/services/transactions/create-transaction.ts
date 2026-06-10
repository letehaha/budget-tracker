import {
  isTwoLegTransfer,
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { UnwrapPromise } from '@common/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotFoundError, UnexpectedError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as Accounts from '@models/accounts.model';
import Categories from '@models/categories.model';
import Payees from '@models/payees.model';
import Tags from '@models/tags.model';
import * as Transactions from '@models/transactions.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';
import { applyPayeeCategorization } from '@services/payees/apply-categorization';
import { applyPayeeDefaultTags } from '@services/payees/apply-default-tags';
import { resolvePayeeForRawMerchant } from '@services/payees/extraction.service';
import {
  assertSharedWritePhase1Guards,
  authorizeAccountWrite,
} from '@services/sharing/auth/authorize-account-write.service';
import { canUserAccessResource } from '@services/sharing/auth/can-user-access-resource.service';
import { ensureUserCurrencyConnected } from '@services/sharing/auth/ensure-currency-connected.service';
import { getUserSettings } from '@services/user-settings/get-user-settings';
import { v4 as uuidv4 } from 'uuid';

import { withTransaction } from '../common/with-transaction';
import { createSingleRefund } from '../tx-refunds/create-single-refund.service';
import { manageSplits } from './splits';
import { linkTransactions } from './transactions-linking';
import type { CreateTransactionParams, UpdateTransactionParams } from './types';

type CreateOppositeTransactionParams = [
  creationParams: (CreateTransactionParams | UpdateTransactionParams) & {
    time: Date;
  },
  baseTransaction: Transactions.default,
];

/**
 * Calculate oppositeTx based on baseTx amount and currency.
 *
 * *ref-transaction - transaction with ref-currency, means user's base currency
 *
 * 1. If source transaction is a ref-transaction, and opposite is non-ref,
 *    then opposite's refAmount should be the same as of source
 * 2. If source tx is a non-ref, and opposite is ref - then source's
 *    refAmount should be the same as opposite. We update its value right in that
 *    helper and return it back
 * 3. If both are ref, then they both should have same refAmount
 * 4. If both are non-ref, then each of them has separate refAmount. So we don't
 *    touch source tx, and calculate refAmount for opposite tx
 *
 */
export const calcTransferTransactionRefAmount = async ({
  userId,
  baseTransaction,
  destinationAmount,
  oppositeTxCurrencyCode,
  baseCurrency,
  date,
}: {
  userId: number;
  baseTransaction: Transactions.default;
  destinationAmount: Money;
  oppositeTxCurrencyCode: string;
  baseCurrency?: UnwrapPromise<ReturnType<typeof UsersCurrencies.getBaseCurrency>>;
  date: Date;
}) => {
  if (!baseCurrency) {
    baseCurrency = await UsersCurrencies.getBaseCurrency({ userId });
  }

  const isSourceRef = baseTransaction.currencyCode === baseCurrency.currency.code;
  const isOppositeRef = oppositeTxCurrencyCode === baseCurrency.currency.code;

  let oppositeRefAmount: Money = destinationAmount;

  if (isSourceRef && !isOppositeRef) {
    oppositeRefAmount = baseTransaction.refAmount;
  } else if (!isSourceRef && isOppositeRef) {
    baseTransaction = await Transactions.updateTransactionById({
      id: baseTransaction.id,
      userId,
      refAmount: destinationAmount,
    });
    oppositeRefAmount = destinationAmount;
  } else if (isSourceRef && isOppositeRef) {
    oppositeRefAmount = baseTransaction.refAmount;
  } else if (!isSourceRef && !isOppositeRef) {
    oppositeRefAmount = await calculateRefAmount({
      userId,
      amount: destinationAmount,
      baseCode: oppositeTxCurrencyCode,
      quoteCode: baseCurrency.currency.code,
      date,
    });
  }

  return {
    oppositeRefAmount,
    baseTransaction,
  };
};

/**
 * If previously the base tx wasn't transfer, so it was income or expense, we need to:
 *
 * 1. create an opposite tx
 * 2. generate "transferId" and put it to both transactions
 * 3. Calculate correct refAmount for both base and opposite tx. Logic is described down in the code
 */
export const createOppositeTransaction = async (params: CreateOppositeTransactionParams) => {
  const [creationParams, baseTransaction] = params;

  const { destinationAmount, destinationAccountId, userId, transactionType } = creationParams;
  // `transfer_to_loan` and `common_transfer` share all two-leg machinery; the
  // distinct nature gets stamped onto both legs so loan-payment reporting can
  // filter on the label instead of joining via the destination account.
  const oppositeTransferNature = isTwoLegTransfer(creationParams.transferNature)
    ? creationParams.transferNature!
    : TRANSACTION_TRANSFER_NATURE.common_transfer;

  if (!destinationAmount || !destinationAccountId) {
    throw new ValidationError({
      message: t({ key: 'transactions.missingRequiredFields' }),
    });
  }

  // Dest may belong to another user when the caller has a household membership (or per-resource
  // write share) on it. Auth + resolve owner here so opposite-tx fields can be scoped to the
  // *dest owner* — userId on the row, ref-currency, category — instead of leaking source-user
  // context onto someone else's account.
  const destAccess = await canUserAccessResource({
    userId,
    resourceType: RESOURCE_TYPES.account,
    resourceId: destinationAccountId,
    requiredPermission: SHARE_PERMISSIONS.write,
  });
  if (!destAccess.granted) {
    throw new NotFoundError({ message: t({ key: 'accounts.accountNotFoundForTransaction' }) });
  }
  const destOwnerUserId = destAccess.ownerUserId;
  const isCrossUser = destOwnerUserId !== baseTransaction.userId;

  // `transfer_to_loan` is only meaningful when the destination is actually a
  // loan-category account; otherwise the FE detection logic mis-stamped the
  // row. Fail loudly so the bug surfaces instead of producing a transfer with
  // a meaningless reporting label.
  if (creationParams.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan) {
    const destAccount = await findOrThrowNotFound({
      query: Accounts.getAccountById({ id: destinationAccountId, userId: destOwnerUserId }),
      message: t({ key: 'accounts.accountNotFoundForTransaction' }),
    });
    if (destAccount.accountCategory !== ACCOUNT_CATEGORIES.loan) {
      throw new ValidationError({
        message: t({ key: 'transactions.transferToLoanRequiresLoanDestination' }),
      });
    }
    // Liability balance lives in negative cents; the income leg adds toward
    // zero. A positive projected balance means the payment overshoots the
    // remaining owed — institutional loans can't go into credit, so block.
    const projectedLoanBalance = destAccount.currentBalance.add(destinationAmount);
    if (projectedLoanBalance.toCents() > 0) {
      throw new ValidationError({
        message: t({ key: 'transactions.loanPaymentOverpay' }),
      });
    }
  }

  const transferId = uuidv4();

  let baseTx = await Transactions.updateTransactionById({
    id: baseTransaction.id,
    userId: baseTransaction.userId,
    transferId,
    transferNature: oppositeTransferNature,
  });

  const { currency: oppositeTxCurrency } = await Accounts.getAccountCurrency({
    userId: destOwnerUserId,
    id: destinationAccountId,
  });

  const sourceUserBaseCurrency = await UsersCurrencies.getBaseCurrency({ userId });
  const destOwnerBaseCurrency = isCrossUser
    ? await UsersCurrencies.getBaseCurrency({ userId: destOwnerUserId })
    : sourceUserBaseCurrency;

  let oppositeRefAmount: Money;

  if (isCrossUser) {
    // Cross-user pairs deliberately *don't* share a refAmount: each leg's refAmount is in
    // its own owner's base currency. The same-user `calcTransferTransactionRefAmount` would
    // pull one of the two refs back into the other's base currency and corrupt accounting
    // on whichever side it overwrote. Calculate the opposite leg independently using the
    // dest owner's userId so their exchange-rate config drives the conversion.
    if (destOwnerBaseCurrency.currency.code === oppositeTxCurrency.code) {
      oppositeRefAmount = destinationAmount;
    } else {
      oppositeRefAmount = await calculateRefAmount({
        userId: destOwnerUserId,
        amount: destinationAmount,
        baseCode: oppositeTxCurrency.code,
        quoteCode: destOwnerBaseCurrency.currency.code,
        date: new Date(baseTransaction.time),
      });
    }
  } else {
    const result = await calcTransferTransactionRefAmount({
      userId,
      baseTransaction: baseTx,
      destinationAmount,
      oppositeTxCurrencyCode: oppositeTxCurrency.code,
      baseCurrency: sourceUserBaseCurrency,
      date: new Date(baseTransaction.time),
    });
    oppositeRefAmount = result.oppositeRefAmount;
    baseTx = result.baseTransaction;
  }

  // Categories are per-user — copying the source-side category id onto a row owned by a
  // different user would point at a category the dest owner doesn't own. Drop it on
  // cross-user pairs; same-user transfers keep the existing copy-through behavior.
  const oppositeCategoryId = isCrossUser ? undefined : baseTransaction.categoryId;

  const oppositeTx = await Transactions.createTransaction({
    userId: destOwnerUserId,
    amount: destinationAmount,
    refAmount: oppositeRefAmount,
    note: baseTransaction.note,
    time: new Date(baseTransaction.time),
    transactionType:
      transactionType === TRANSACTION_TYPES.income ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
    paymentType: baseTransaction.paymentType,
    accountId: destinationAccountId,
    categoryId: oppositeCategoryId,
    accountType: ACCOUNT_TYPES.system,
    currencyCode: oppositeTxCurrency.code,
    refCurrencyCode: destOwnerBaseCurrency.currency.code,
    transferNature: oppositeTransferNature,
    transferId,
  });

  return { baseTx, oppositeTx: oppositeTx! };
};

/**
 * Creates transaction and updates account balance.
 */
export const createTransaction = withTransaction(
  async ({
    amount,
    commissionRate = Money.zero(),
    userId,
    accountId,
    transferNature,
    destinationTransactionId,
    refundsTxId,
    refundsSplitId,
    splits,
    tagIds,
    rawMerchantName,
    payeeId: callerPayeeId,
    payeeLocked: callerPayeeLocked,
    ...payload
  }: CreateTransactionParams) => {
    try {
      // Detect negative amounts - this is a bug in the caller code
      // Transaction amounts should ALWAYS be positive, with transactionType determining expense/income
      if (amount.isNegative()) {
        const stack = new Error().stack;
        logger.error('Negative amount detected in createTransaction. This is a bug - amounts must be positive.', {
          amount: amount.toNumber(),
          userId,
          accountId,
          transactionType: payload.transactionType,
          stack,
        });
        amount = amount.abs();
      }

      if (refundsTxId && transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer) {
        throw new ValidationError({
          message: t({ key: 'transactions.refundAndTransferNotAllowed' }),
        });
      }

      // Account-scoped auth: owners pass; recipients need `write`. The returned
      // `accountOwnerUserId` scopes downstream owner-only lookups (account row, category
      // set) so a shared-account write resolves correctly. Phase-1 guards block recipient
      // flows that need their own follow-up slices.
      const { isOwner, accountOwnerUserId } = await authorizeAccountWrite({
        userId,
        accountId,
      });
      assertSharedWritePhase1Guards({
        isOwner,
        involvesTransfer: isTwoLegTransfer(transferNature),
        involvesRefund: refundsTxId !== undefined && refundsTxId !== null,
      });

      if (payload.categoryId !== undefined && payload.categoryId !== null) {
        await findOrThrowNotFound({
          query: Categories.findOne({ where: { id: payload.categoryId, userId: accountOwnerUserId } }),
          message: 'Category not found or does not belong to user.',
        });
      }

      const { currency: defaultUserCurrency } = await UsersCurrencies.getCurrency({
        userId,
        isDefaultCurrency: true,
      });

      const { currency: generalTxCurrency } = await Accounts.getAccountCurrency({
        userId: accountOwnerUserId,
        id: accountId,
      });

      // Recipients writing on a shared account whose currency they haven't connected
      // would otherwise trip `currencyNotConnected` inside the ref-amount lookup.
      // Auto-connect so the guard stays internal and not user-facing.
      if (!isOwner && generalTxCurrency.code !== defaultUserCurrency.code) {
        await ensureUserCurrencyConnected({ userId, currencyCode: generalTxCurrency.code });
      }

      // Resolve Payee for provider-sync rows. Caller-supplied `payeeId` wins
      // (manual UI assignment); otherwise extract from `rawMerchantName` only
      // when the row isn't locked. Transfers skip extraction entirely — they
      // model internal account moves, not merchant interactions.
      //
      // When the dedicated merchant field is empty, the user-level
      // `payeeExtractionUsesDescription` setting can authorize falling back
      // to the transaction note. Off by default; opt-in for users whose
      // provider (e.g. Monobank) returns the merchant in `description` only.
      //
      // Caller-supplied ids are validated against `accountOwnerUserId`, not
      // the caller — Payees are scoped to the account owner just like
      // Categories. On a shared-account write the recipient must pick from
      // the owner's payee list; their own private payees are out of scope
      // for rows that live on someone else's account. The owner's user-level
      // `payeeExtractionUsesDescription` setting also drives the description
      // fallback so behavior matches what the owner configured.
      let resolvedPayeeId: string | null = null;
      if (callerPayeeId) {
        const ownedPayee = await Payees.findOne({
          where: { id: callerPayeeId, userId: accountOwnerUserId },
          attributes: ['id'],
        });
        if (!ownedPayee) {
          throw new NotFoundError({ message: t({ key: 'payees.notFound' }) });
        }
        resolvedPayeeId = callerPayeeId;
      }
      if (!callerPayeeLocked && !resolvedPayeeId && !isTwoLegTransfer(transferNature)) {
        let effectiveRawMerchant: string | null | undefined = rawMerchantName;
        if (!effectiveRawMerchant && payload.note) {
          const settings = await getUserSettings({ userId: accountOwnerUserId });
          if (settings.payeeExtractionUsesDescription) {
            effectiveRawMerchant = payload.note;
          }
        }
        if (effectiveRawMerchant) {
          try {
            const extraction = await resolvePayeeForRawMerchant({
              userId: accountOwnerUserId,
              rawMerchantName: effectiveRawMerchant,
            });
            resolvedPayeeId = extraction.payeeId;
          } catch (error) {
            logger.error({
              message: 'Failed to resolve Payee during createTransaction; continuing without link',
              error: error as Error,
            });
          }
        }
      }

      const generalTxParams: Transactions.CreateTransactionPayload & {
        time: Date;
      } = {
        ...payload,
        time: payload.time ?? new Date(),
        amount,
        refAmount: amount,
        commissionRate,
        refCommissionRate: commissionRate,
        userId,
        accountId,
        transferNature,
        currencyCode: generalTxCurrency.code,
        transferId: undefined,
        refCurrencyCode: defaultUserCurrency.code,
        payeeId: resolvedPayeeId,
        payeeLocked: callerPayeeLocked ?? false,
      };

      if (defaultUserCurrency.code !== generalTxCurrency.code) {
        generalTxParams.refAmount = await calculateRefAmount({
          userId,
          amount: generalTxParams.amount,
          baseCode: generalTxCurrency.code,
          quoteCode: defaultUserCurrency.code,
          date: generalTxParams.time,
        });
        generalTxParams.refCommissionRate = await calculateRefAmount({
          userId,
          amount: generalTxParams.commissionRate || Money.zero(),
          baseCode: generalTxCurrency.code,
          quoteCode: defaultUserCurrency.code,
          date: generalTxParams.time,
        });
      }

      const baseTransaction = await Transactions.createTransaction(generalTxParams);

      let transactions: [baseTx: Transactions.default, oppositeTx?: Transactions.default] = [baseTransaction!];

      if (refundsTxId && !isTwoLegTransfer(transferNature)) {
        await createSingleRefund({
          userId,
          originalTxId: refundsTxId,
          refundTxId: baseTransaction!.id,
          splitId: refundsSplitId,
        });
      } else if (isTwoLegTransfer(transferNature)) {
        logger.info('Transfer transaction creation');
        /**
         * If transaction is transfer between two accounts, add transferId to both
         * transactions to connect them, and use destinationAmount and destinationAccountId
         * for the second transaction.
         */

        if (destinationTransactionId) {
          /**
           * When "destinationTransactionId" is provided, we don't need to create an
           * opposite transaction, since it's expected to use the existing one.
           * We need to update the existing one, or fail the whole creation if it
           * doesn't exist
           */
          const result = await linkTransactions({
            userId,
            ids: [[baseTransaction!.id, destinationTransactionId]],
            ignoreBaseTxTypeValidation: true,
          });
          if (result[0]) {
            const [baseTx, oppositeTx] = result[0];
            transactions = [baseTx, oppositeTx];
          } else {
            logger.info('Cannot create transaction with provided params', {
              ids: [[baseTransaction!.id, destinationTransactionId]],
              result,
            });
            throw new UnexpectedError({ message: t({ key: 'transactions.cannotCreateWithParams' }) });
          }
        } else {
          const res = await createOppositeTransaction([
            {
              amount,
              userId,
              accountId,
              transferNature,
              time: payload.time ?? new Date(),
              ...payload,
            },
            baseTransaction!,
          ]);
          transactions = [res.baseTx, res.oppositeTx];
        }
      }

      // Handle splits for non-transfer transactions
      if (splits && splits.length > 0 && !isTwoLegTransfer(transferNature)) {
        await manageSplits({
          transactionId: baseTransaction!.id,
          userId,
          categoryOwnerUserId: accountOwnerUserId,
          splits,
          transactionAmount: amount,
          transactionCurrencyCode: generalTxCurrency.code,
          transactionTime: generalTxParams.time,
          transferNature,
        });
      }

      // Handle tags for the transaction
      if (tagIds && tagIds.length > 0) {
        // Validate that all tagIds belong to the current user
        const userTags = await Tags.findAll({
          where: { userId, id: tagIds },
          attributes: ['id'],
        });

        if (userTags.length !== tagIds.length) {
          throw new ValidationError({
            message: t({ key: 'transactions.invalidTagIds' }),
          });
        }

        await baseTransaction!.$set('tags', tagIds);

        // Emit event for real-time reminders check (handled by event listener)
        eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_TAGGED, { tagIds, userId });
      }

      // Try to match the transaction to a subscription (non-critical)
      if (!isTwoLegTransfer(transferNature)) {
        try {
          const { matchTransactionToSubscriptions } = await import('@services/subscriptions');
          await matchTransactionToSubscriptions({ transaction: baseTransaction!, userId });
        } catch (error) {
          logger.error({
            message: 'Failed to match transaction to subscriptions',
            error: error as Error,
          });
        }
      }

      // Auto-categorize via `payee_rule` — runs AFTER subscription matching so
      // subscription_rule wins on conflict. The helper itself handles the
      // mode-based meta stamping and the overridable-source precedence; we
      // just hand it the linked payeeId.
      //
      // Gated on `isOwner`: when a recipient writes on the owner's shared
      // account we resolve the payee from the owner's namespace but skip
      // categorization here. The row's account belongs to the owner, so the
      // owner's post-sync note fuzzy backfill (or a manual re-categorize) is
      // the appropriate actor for applying their categorization rules.
      // `applyPayeeCategorization` itself filters by `userId` against both
      // the Payee and the Transaction row, which doesn't fit a recipient
      // caller — short-circuiting here also keeps that helper's contract
      // narrow.
      if (isOwner && resolvedPayeeId && !isTwoLegTransfer(transferNature)) {
        try {
          const updated = await applyPayeeCategorization({
            accountOwnerUserId,
            transactionId: baseTransaction!.id,
            payeeId: resolvedPayeeId,
          });
          if (updated) {
            transactions[0] = updated;
          }
        } catch (error) {
          logger.error({
            message: 'Failed to apply payee_rule categorization; leaving transaction uncategorized',
            error: error as Error,
          });
        }

        // Payee default tags. Only when the caller sent no tag list at all —
        // an explicit `tagIds` (even `[]`) means the client already computed
        // the final tag set (the transaction form applies payee tags
        // client-side, where the user may have deselected some). Add-only,
        // so it composes with rows that gained tags through other means.
        //
        // No catch-and-continue here: `applyPayeeDefaultTags` joins this
        // create's transaction via `withTransaction`, and a failed SQL
        // statement aborts the whole Postgres transaction — swallowing the
        // error would just poison every subsequent query before commit.
        // Letting it propagate keeps the create atomic and surfaces a real
        // error to the caller instead of silently dropping tags.
        if (tagIds === undefined) {
          await applyPayeeDefaultTags({
            accountOwnerUserId,
            transactionId: baseTransaction!.id,
            payeeId: resolvedPayeeId,
          });
        }
      }

      return transactions;
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') {
        logger.error(e as Error);
      }
      throw e;
    }
  },
);
