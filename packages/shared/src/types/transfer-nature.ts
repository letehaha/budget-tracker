import { TRANSACTION_TRANSFER_NATURE } from './enums';

/**
 * Both `common_transfer` and `transfer_to_loan` are two-leg internal transfers
 * between user-owned accounts. They share the same paired-row invariants
 * (linked `transferId`, opposite-direction tx, balance debit/credit), so every
 * branch that drives creation, update, deletion, payee resolution, refund
 * gating, subscription matching, or UI rendering (grouped from→to row,
 * opposite-leg lookup, dedup, edit-form prepopulation) must treat them
 * identically — the only difference is the nature label, which exists so
 * loan-specific views and reports can isolate payments without joining through
 * the destination account's category.
 */
export const isTwoLegTransfer = (nature: TRANSACTION_TRANSFER_NATURE | undefined | null): boolean =>
  nature === TRANSACTION_TRANSFER_NATURE.common_transfer || nature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan;
