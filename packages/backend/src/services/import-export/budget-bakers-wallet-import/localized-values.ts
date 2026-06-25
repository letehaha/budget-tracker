import { BUDGET_BAKERS_WALLET_TRANSFER_CATEGORY, PAYMENT_TYPES } from '@bt/shared/types';

/**
 * BudgetBakers Wallet writes the `type`, `payment_type`, and transfer-marker
 * category cells in the language the app's UI was set to when exporting, so a
 * single English lookup silently rejects exports made in any other language
 * (every row's `type` reads as unknown and gets skipped). These tables map the
 * known per-language cell values onto the importer's internal,
 * language-independent representation.
 *
 * Lookup keys are normalized (trimmed, lowercased, diacritics stripped) so an
 * accented value such as "Tarjeta de crédito" matches whether or not the accents
 * survived the file round-trip. Add a language by extending each table with that
 * language's exact export strings.
 *
 * Supported languages: English (en), Spanish (es).
 */

/** Trim, lowercase, and strip diacritics for case-/accent-insensitive lookup. */
function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Income/expense direction, independent of the export language. */
type BudgetBakersWalletTxType = 'Expense' | 'Income';

/** Normalized `type` cell → direction. */
const TYPE_BY_VALUE: Record<string, BudgetBakersWalletTxType> = {
  // English
  expense: 'Expense',
  income: 'Income',
  // Spanish
  gasto: 'Expense',
  ingreso: 'Income',
};

/**
 * Resolve a `type` cell to its income/expense direction, or null when the value
 * is not a known type in any supported language (the caller skips the row).
 */
export function interpretBudgetBakersWalletType({ raw }: { raw: string }): BudgetBakersWalletTxType | null {
  return TYPE_BY_VALUE[normalize(raw)] ?? null;
}

/** Normalized `payment_type` cell → PAYMENT_TYPES. Unlisted values fall back to bankTransfer. */
const PAYMENT_TYPE_BY_VALUE: Record<string, PAYMENT_TYPES> = {
  // English
  cash: PAYMENT_TYPES.cash,
  'credit card': PAYMENT_TYPES.creditCard,
  // Spanish
  efectivo: PAYMENT_TYPES.cash,
  'tarjeta de credito': PAYMENT_TYPES.creditCard,
};

/**
 * Translate a `payment_type` cell into the app's PAYMENT_TYPES enum. Cash and
 * credit card map to their equivalents in each supported language; every other
 * value (bank transfer, debit card, Wallet's transfer marker, or a value in an
 * unsupported language) falls back to `bankTransfer` so a row never lands
 * without a payment type. Payment type is cosmetic metadata here, not a
 * correctness-critical field.
 */
export function mapBudgetBakersWalletPaymentType({ raw }: { raw: string }): PAYMENT_TYPES {
  return PAYMENT_TYPE_BY_VALUE[normalize(raw)] ?? PAYMENT_TYPES.bankTransfer;
}

/** Normalized transfer-marker category values across supported languages. */
const TRANSFER_CATEGORY_VALUES = new Set<string>([
  normalize(BUDGET_BAKERS_WALLET_TRANSFER_CATEGORY), // English ("Transfer, withdraw")
  normalize('Transferir, retirar'), // Spanish
]);

/**
 * Whether a `category` cell is Wallet's transfer-marker pseudo-category — a
 * value Wallet attaches to transfer legs that is never a real, creatable
 * category. Matches the marker in any supported language.
 */
export function isBudgetBakersWalletTransferCategory({ raw }: { raw: string }): boolean {
  return TRANSFER_CATEGORY_VALUES.has(normalize(raw));
}
