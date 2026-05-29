import { Money } from '@common/types/money';
import { roundHalfToEven } from '@common/utils/round-half-to-even';

export const calculateRefAmountFromParams = ({
  amount,
  rate,
  useFloorAbs = true,
}: {
  amount: Money;
  rate: number;
  // Investments use DECIMAL columns and need full decimal precision instead of integer cents.
  useFloorAbs?: boolean;
}): Money => {
  if (!useFloorAbs) {
    // Investments are stored as DECIMAL columns - preserve full precision via Money arithmetic
    // instead of round-tripping through integer cents (which both loses precision and would
    // throw when amountCents * rate produces a fractional result like 128479.5).
    return amount.multiply(rate);
  }

  const amountCents = amount.toCents();
  const isNegative = amountCents < 0;

  // Use Banker's Rounding (round half to even) per IEEE 754 and IFRS/GAAP standards.
  // This minimizes cumulative rounding bias in bidirectional currency conversions (e.g., USD → EUR → USD).
  // Since amounts are stored as integers (cents * 100), rounding still produces integers
  // but with better reversibility and compliance with accounting standards.
  const refAmount = amountCents === 0 ? 0 : roundHalfToEven(Math.abs(amountCents) * rate);
  const finalAmount = isNegative ? refAmount * -1 : refAmount;

  return Money.fromCents(finalAmount);
};
