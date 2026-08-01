/**
 * AI extraction prompt for bank statements
 * Uses CSV format to minimize output tokens
 * Supports PDF, CSV, and TXT input files
 */
import { parseDecimalAmount } from '@common/utils/parse-decimal-amount';

/**
 * System prompt for statement extraction - CSV format for token efficiency
 */
export const STATEMENT_EXTRACTION_SYSTEM_PROMPT = `You are a financial document parser that extracts transaction data from bank statements.
Your task is to analyze bank statement text and extract all transactions into CSV format.

OUTPUT FORMAT:
First line: metadata as comma-separated values
Remaining lines: one transaction per line as comma-separated values

METADATA LINE FORMAT (first line):
bankName,accountLast4,periodFrom,periodTo,currencyCode

TRANSACTION LINE FORMAT (remaining lines):
date,description,merchant,amount,type,balance,confidence

RULES:
1. Output ONLY CSV data - no headers, no markdown, no explanations
2. First line is ALWAYS metadata
3. Whatever the source looks like, every transaction line you write has the 7 fields
   above, in that order. Never merge two of them into one, never add an eighth.
4. amount is REQUIRED on every line and must be a plain positive number: digits, at most
   one dot for the decimal point, nothing else. Convert the statement's own convention
   into that one - 1,234.56 and 1.234,56 and 1 234,56 are all the same amount, and all of
   them are written 1234.56. Decide which convention the statement uses by looking at the
   whole document, not one number. Never emit a currency symbol, a thousands separator or
   a decimal comma. A line without a usable amount will be discarded.
5. The output separator is a COMMA, whatever the source uses. Never join several source
   columns into one output field with the source's own separator.
6. Date format: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS (include time if available in the statement)
7. Type: E for expense, I for income
8. Confidence: number 0-100 (integer)
9. Empty value = field not available (just leave empty between commas)
10. If a field contains commas, wrap the WHOLE field in double quotes
11. Include ALL transactions from the statement
12. If time is available for a transaction, ALWAYS include it - this data is valuable
13. merchant: the counterparty / merchant name when separately identifiable
    (e.g. "AMAZON", "Spotify", "UBER TRIP"). Leave EMPTY when no clear merchant
    exists — internal transfers, fees, interest, salary, etc. Do NOT duplicate
    the description if no real merchant is identifiable.

TYPE RULES:
- E (expense): money OUT (purchases, payments, withdrawals, debits)
- I (income): money IN (deposits, credits, refunds, transfers in)

EXAMPLE OUTPUT:
PrivatBank,1234,2025-01-01,2025-01-31,UAH
2025-01-15 14:32:10,Grocery store purchase ATB #123,ATB,250.50,E,,95
2025-01-16 09:15:00,"Payment, utilities",,1200.00,E,5000.00,90
2025-01-18,Spotify subscription,Spotify,9.99,E,,95
2025-01-20,Salary deposit,,50000.00,I,55000.00,98

When the source is itself tabular (a CSV/TSV export, a statement table), its columns are
rarely the 7 above. Map them; do not copy the source layout. A source row with more
columns than the output has:
  <account> | <category> | <currency> | <amount> | <debit/credit> | <method> | <payee> | <timestamp>
becomes one line that keeps the amount and drops what does not map:
  2025-03-04 12:49:08,Groceries,Fresh Market,1115.00,E,,90
Never emit a line that carries the source's separator or loses the amount, like:
  2025-03-04 12:49:08,Groceries|Card|Fresh Market,E,,90`;

/**
 * User prompt template for text-based extraction
 */
export function createTextExtractionPrompt({ text }: { text: string }): string {
  return `Extract all transactions from this bank statement text:

---
${text}
---

Output CSV only. First line metadata, then transactions.`;
}

/**
 * Expected output structure after parsing CSV
 */
interface AIExtractionOutput {
  transactions: Array<{
    date: string;
    description: string;
    merchant?: string;
    amount: number;
    type: 'income' | 'expense';
    balance?: number | null;
    confidence: number;
  }>;
  metadata: {
    bankName?: string | null;
    accountNumberLast4?: string | null;
    statementPeriod?: {
      from: string;
      to: string;
    } | null;
    currencyCode?: string | null;
  };
  /**
   * Lines the model emitted that no transaction could be read from. Surfaced to the
   * user, because otherwise a statement comes back with fewer rows than it had and
   * nothing on screen says so.
   */
  droppedRowCount: number;
}

/** Columns the prompt asks for: date, description, merchant, amount, type, balance, confidence. */
const EXPECTED_FIELD_COUNT = 7;

/** Enough to read a transaction: date, description, merchant, amount, type. */
const MINIMUM_FIELD_COUNT = 5;

/**
 * `YYYY-MM-DD`, optionally followed by a time. The prompt asks for a space separator and
 * whole seconds, but statements exported from finance apps carry full ISO timestamps and
 * the model copies parts of them through, so the separator, the fractional seconds and a
 * zone designator are all optional here.
 */
const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * The stored form: `YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS`. Sub-second precision is dropped
 * and a zone designator is taken off the wall clock rather than shifted onto it, matching
 * how the import reads a date back.
 */
function normalizeDate({ date }: { date: string }): string | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;

  return match[2] ? `${match[1]} ${match[2]}` : match[1]!;
}

interface TransactionFields {
  date: string;
  description: string;
  merchant: string;
  amountStr: string;
  typeChar: string;
  balanceStr: string;
  confidenceStr: string;
}

/**
 * Which cell holds what. A row of the expected width is read left to right. A wider row
 * has picked up a column the format has no place for — seen on rows where the model fills
 * in a payee — and reading it left to right lands `amount` on the wrong cell. The last
 * four columns are the ones the row can be trusted to end with, so a wide row is read
 * from its tail instead and everything between the date and that tail becomes the
 * description and merchant.
 */
function readTransactionFields({ fields }: { fields: string[] }): TransactionFields | null {
  if (fields.length < MINIMUM_FIELD_COUNT) return null;

  if (fields.length <= EXPECTED_FIELD_COUNT) {
    return {
      date: fields[0] || '',
      description: fields[1] || '',
      merchant: fields[2] || '',
      amountStr: fields[3] || '',
      typeChar: fields[4] || '',
      balanceStr: fields[5] || '',
      confidenceStr: fields[6] || '',
    };
  }

  const tailStart = fields.length - 4;
  const middle = fields.slice(1, tailStart).filter(Boolean);

  return {
    date: fields[0] || '',
    description: middle[0] || '',
    // Anything past the description is the model's own extra column plus the merchant
    merchant: middle.length > 1 ? middle[middle.length - 1]! : '',
    amountStr: fields[tailStart] || '',
    typeChar: fields[tailStart + 1] || '',
    balanceStr: fields[tailStart + 2] || '',
    confidenceStr: fields[tailStart + 3] || '',
  };
}

/**
 * Parse a CSV line handling quoted fields with commas
 */
function parseCSVLine({ line }: { line: string }): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Parse CSV response from AI into structured output
 */
export function parseAIResponse({ response }: { response: string }): AIExtractionOutput | null {
  try {
    // Clean up response - remove any markdown code blocks
    let csvContent = response.trim();

    if (csvContent.startsWith('```csv')) {
      csvContent = csvContent.slice(6);
    } else if (csvContent.startsWith('```')) {
      csvContent = csvContent.slice(3);
    }

    if (csvContent.endsWith('```')) {
      csvContent = csvContent.slice(0, -3);
    }

    csvContent = csvContent.trim();

    const lines = csvContent.split('\n').filter((line) => line.trim());

    if (lines.length < 1) {
      console.error('[Statement Parser] CSV parsing: No lines found');
      return null;
    }

    // Parse metadata (first line)
    const metadataFields = parseCSVLine({ line: lines[0]! });
    const metadata: AIExtractionOutput['metadata'] = {
      bankName: metadataFields[0] || null,
      accountNumberLast4: metadataFields[1] || null,
      statementPeriod:
        metadataFields[2] && metadataFields[3]
          ? {
              from: metadataFields[2],
              to: metadataFields[3],
            }
          : null,
      currencyCode: metadataFields[4] || null,
    };

    // Parse transactions (remaining lines)
    const transactions: AIExtractionOutput['transactions'] = [];
    let droppedRowCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const parsedFields = readTransactionFields({ fields: parseCSVLine({ line: lines[i]! }) });

      if (!parsedFields) {
        console.warn(`[Statement Parser] CSV parsing: Skipping invalid line ${i + 1}: ${lines[i]}`);
        droppedRowCount += 1;
        continue;
      }

      const { description, merchant, amountStr, typeChar, balanceStr, confidenceStr } = parsedFields;

      const date = normalizeDate({ date: parsedFields.date });
      if (!date) {
        console.warn(`[Statement Parser] CSV parsing: Invalid date format on line ${i + 1}: ${parsedFields.date}`);
        droppedRowCount += 1;
        continue;
      }

      // A zero amount is no more importable than a negative one — the import rejects both,
      // and letting one through here only moves the failure to the end of the flow.
      const amount = parseDecimalAmount({ raw: amountStr });
      if (amount === null || amount <= 0) {
        console.warn(`[Statement Parser] CSV parsing: Invalid amount on line ${i + 1}: ${amountStr}`);
        droppedRowCount += 1;
        continue;
      }

      const type = typeChar.toUpperCase() === 'I' ? 'income' : 'expense';
      const balance = balanceStr ? parseFloat(balanceStr) : null;
      const confidence = Math.min(100, Math.max(0, parseInt(confidenceStr, 10) || 80)) / 100;

      transactions.push({
        date,
        description,
        merchant: merchant || undefined,
        amount,
        type,
        balance: balance !== null && !isNaN(balance) ? balance : undefined,
        confidence,
      });
    }

    // A response whose every row is unusable still gets returned: the caller can tell the
    // user how many rows the model produced, which "could not parse the response" cannot.
    console.log(
      `[Statement Parser] CSV parsing: Extracted ${transactions.length} transactions, dropped ${droppedRowCount}`,
    );

    return { transactions, metadata, droppedRowCount };
  } catch (error) {
    console.error('[Statement Parser] CSV parsing error:', error);
    return null;
  }
}
