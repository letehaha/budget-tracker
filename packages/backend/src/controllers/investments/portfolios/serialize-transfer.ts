import { INVESTMENT_DECIMAL_SCALE } from '@common/types/money';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';

/**
 * Serializes a PortfolioTransfers model instance for API response,
 * converting Money fields to decimal strings.
 */
export function serializeTransferResponse({ transfer }: { transfer: PortfolioTransfers }) {
  return {
    ...transfer.toJSON(),
    amount: transfer.amount.toDecimalString(INVESTMENT_DECIMAL_SCALE),
    refAmount: transfer.refAmount.toDecimalString(INVESTMENT_DECIMAL_SCALE),
  };
}
