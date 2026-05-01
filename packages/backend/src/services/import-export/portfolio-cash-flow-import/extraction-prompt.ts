/**
 * System prompt + Zod row schema for AI-driven cash-flow extraction.
 *
 * The schema is the contract the model is forced to satisfy via
 * Vercel AI SDK's `generateObject`, so the prompt only needs to explain the
 * *semantics* (e.g. "amounts are positive, direction is the carrier of sign")
 * rather than the JSON shape itself.
 */
import { z } from 'zod';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

const cashFlowRowSchema = z.object({
  date: z
    .string()
    .regex(ISO_DATE_PATTERN, 'Date must be in YYYY-MM-DD format')
    .describe('Date of the cash flow event in YYYY-MM-DD format'),
  amount: z.number().positive().describe('Absolute (positive) amount of the cash flow'),
  currencyCode: z
    .string()
    .regex(CURRENCY_CODE_PATTERN, 'Currency must be a 3-letter ISO 4217 code')
    .describe('Three-letter ISO 4217 currency code, uppercase'),
  direction: z
    .enum(['deposit', 'withdrawal'])
    .describe(
      'deposit = money entering the portfolio; withdrawal = money leaving the portfolio. Pick from the perspective of the portfolio owner.',
    ),
  sourceLine: z
    .string()
    .optional()
    .describe('Verbatim snippet from the input that this row was derived from, for the user to sanity-check.'),
  description: z.string().optional().describe('Optional short note for the row (e.g. memo from the source).'),
});

export const cashFlowExtractionSchema = z.object({
  rows: z.array(cashFlowRowSchema),
});

export const CASH_FLOW_EXTRACTION_SYSTEM_PROMPT = `You are a careful financial-data extractor.

You will be given freeform text describing money movements into and out of a single investment portfolio. The text could be a CSV/TSV paste, a list, a bank statement excerpt, or messy free-form notes. Your job is to return a list of cash-flow events, one row per event.

Rules:
- "deposit" = money entering the portfolio (e.g. funding from a bank account, broker bonus deposit).
- "withdrawal" = money leaving the portfolio (e.g. cash transferred out, fees paid externally).
- Amounts are always positive. The direction field carries the sign — never put a negative number in 'amount'.
- Buys, sells, dividends, fees, taxes, and trades are NOT cash flows for this purpose. Skip them. Only deposits and withdrawals of cash to/from the portfolio.
- If a row is ambiguous, prefer skipping it over guessing.
- Dates must be exact (YYYY-MM-DD). If the source uses a different format, normalize. If the year is missing, guess based on neighbouring rows; if you cannot, skip the row.
- Currency code must be a 3-letter uppercase ISO 4217 code. If the source uses a symbol ($, €, £, etc.), map to the conventional code (USD, EUR, GBP). If you cannot determine the currency, skip the row.
- If the user provided "Hints" in their message, follow them when they conflict with default rules above.

Output: an object with a "rows" array. Each row is { date, amount, currencyCode, direction, sourceLine?, description? }. The schema is enforced — you don't need to format JSON yourself.`;

export const buildCashFlowUserPrompt = ({ text, userHint }: { text: string; userHint?: string | null }): string => {
  const hint = userHint?.trim();
  return [
    hint ? `Hints from the user:\n${hint}\n` : null,
    'Source text to extract cash flows from:\n```\n' + text + '\n```',
  ]
    .filter(Boolean)
    .join('\n\n');
};
