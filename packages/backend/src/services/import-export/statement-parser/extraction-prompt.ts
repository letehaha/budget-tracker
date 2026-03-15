/**
 * AI extraction prompt for bank statements
 * Uses CSV format to minimize output tokens
 * Supports PDF, CSV, and TXT input files
 */

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
date,description,amount,type,balance,confidence

RULES:
1. Output ONLY CSV data - no headers, no markdown, no explanations
2. First line is ALWAYS metadata
3. Amount is ALWAYS positive number
4. Date format: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS (include time if available in the statement)
5. Type: E for expense, I for income
6. Confidence: number 0-100 (integer)
7. Empty value = field not available (just leave empty between commas)
8. If description contains commas, wrap it in double quotes
9. Include ALL transactions from the statement
10. If time is available for a transaction, ALWAYS include it - this data is valuable

TYPE RULES:
- E (expense): money OUT (purchases, payments, withdrawals, debits)
- I (income): money IN (deposits, credits, refunds, transfers in)

EXAMPLE OUTPUT:
PrivatBank,1234,2025-01-01,2025-01-31,UAH
2025-01-15 14:32:10,Grocery store purchase,250.50,E,,95
2025-01-16 09:15:00,"Payment, utilities",1200.00,E,5000.00,90
2025-01-20,Salary deposit,50000.00,I,55000.00,98`;

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

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine({ line: lines[i]! });

      if (fields.length < 4) {
        console.warn(`[Statement Parser] CSV parsing: Skipping invalid line ${i + 1}: ${lines[i]}`);
        continue;
      }

      const date = fields[0] || '';
      const description = fields[1] || '';
      const amountStr = fields[2] || '0';
      const typeChar = fields[3]?.toUpperCase() || 'E';
      const balanceStr = fields[4] || '';
      const confidenceStr = fields[5] || '80';

      // Validate date format: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
      if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(date)) {
        console.warn(`[Statement Parser] CSV parsing: Invalid date format on line ${i + 1}: ${date}`);
        continue;
      }

      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount < 0) {
        console.warn(`[Statement Parser] CSV parsing: Invalid amount on line ${i + 1}: ${amountStr}`);
        continue;
      }

      const type = typeChar === 'I' ? 'income' : 'expense';
      const balance = balanceStr ? parseFloat(balanceStr) : null;
      const confidence = Math.min(100, Math.max(0, parseInt(confidenceStr, 10) || 80)) / 100;

      transactions.push({
        date,
        description,
        amount,
        type,
        balance: balance !== null && !isNaN(balance) ? balance : undefined,
        confidence,
      });
    }

    if (transactions.length === 0) {
      console.error('[Statement Parser] CSV parsing: No valid transactions found');
      return null;
    }

    console.log(`[Statement Parser] CSV parsing: Extracted ${transactions.length} transactions`);

    return { transactions, metadata };
  } catch (error) {
    console.error('[Statement Parser] CSV parsing error:', error);
    return null;
  }
}
