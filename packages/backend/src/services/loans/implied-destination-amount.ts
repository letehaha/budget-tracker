import type { Money } from '@common/types/money';

/**
 * Same-currency legs of a transfer are always equal, so a base-amount edit that
 * omits an explicit destinationAmount mirrors the base amount onto the
 * destination leg 1:1. Cross-currency pairs have no assumable exchange rate, so
 * nothing can be implied and the caller must state destinationAmount.
 *
 * Returns the implied destination amount, or `undefined` when none can be
 * derived: no base-amount edit, an explicit destinationAmount was supplied, or
 * the two legs use different currencies.
 */
export const deriveImpliedDestinationAmount = ({
  baseAmount,
  destinationAmount,
  baseLegCurrencyCode,
  destinationLegCurrencyCode,
}: {
  baseAmount: Money | undefined;
  destinationAmount: Money | undefined;
  baseLegCurrencyCode: string;
  destinationLegCurrencyCode: string;
}): Money | undefined => {
  if (baseAmount === undefined || destinationAmount !== undefined) {
    return undefined;
  }
  return destinationLegCurrencyCode === baseLegCurrencyCode ? baseAmount : undefined;
};
