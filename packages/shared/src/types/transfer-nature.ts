import { TRANSACTION_TRANSFER_NATURE } from './enums';

/**
 * `common_transfer` and `transfer_to_loan` share every two-leg invariant
 * (linked `transferId`, opposite-direction legs, balance debit/credit), so all
 * branches driving creation/update/deletion/UI must treat them identically.
 * The label differs only so loan views can isolate payments without joining
 * through the destination account's category.
 */
export const isTwoLegTransfer = (nature: TRANSACTION_TRANSFER_NATURE | undefined | null): boolean =>
  nature === TRANSACTION_TRANSFER_NATURE.common_transfer || nature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan;
