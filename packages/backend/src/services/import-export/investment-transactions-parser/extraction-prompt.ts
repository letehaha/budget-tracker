/**
 * AI extraction prompts for investment transactions.
 *
 * One universal prompt handles both crypto and stocks — the model tags each row
 * with its own `assetClassHint` so the server can route per row at resolve
 * time. The user can still override the symbol (and therefore the class) at
 * review time, so the hint is advisory, not authoritative.
 *
 * Output format: CSV (one transaction per line). CSV minimises output tokens
 * vs JSON and matches the statement-parser convention so cost estimation,
 * tokenisation, and parsing stay consistent.
 */

/**
 * Universal system prompt — extracts BUY/SELL transactions for either asset
 * class. Picks the class per row from context clues (ticker shape, price
 * range, lot size, source-text hints like "Shares" vs "Coins").
 */
const UNIVERSAL_TRANSACTIONS_SYSTEM_PROMPT = `You are an investment transaction history parser.
Your job is to extract BUY and SELL transactions from any text source the user provides
(exchange CSV export, broker PDF statement, brokerage account history, free-text paste).
The source may be stocks, crypto, or a mix of both.

OUTPUT FORMAT:
Output ONLY CSV — no markdown, no headers, no explanation.
One transaction per line. Columns, in order:

symbol,name,date,side,quantity,price,fees,currency,assetClassHint,confidence

COLUMN RULES:
- symbol: ticker as written in the source (e.g. BTC, ETH, AAPL, MSFT). UPPERCASE.
- name: full name if available (e.g. Bitcoin, Apple Inc.). Empty if unknown.
- date: YYYY-MM-DD (UTC). If the source has a full timestamp, take the date in UTC and discard the time.
- side: B for buy, S for sell.
- quantity: positive decimal number, the amount transacted (shares for stocks, units for crypto).
- price: positive decimal number, the unit price per share/coin in the quote currency. If only "total" is shown, divide total by quantity.
- fees: decimal number for any explicit fee/commission, in the same quote currency. 0 if not present.
- currency: the quote currency literal as it appears in the source (USD, EUR, USDT, USDC, BUSD, GBP, etc.). Empty if the trade is a crypto/crypto pair (e.g. BTC/ETH).
- assetClassHint: "crypto" or "stocks" — your best guess for this row based on context (ticker shape, source format, quote currency, lot sizes). Default to "stocks" for ambiguous tickers (e.g. AAPL); default to "crypto" for stable-coin quotes and well-known coin tickers.
- confidence: integer 0-100 reflecting how sure you are this is a real buy/sell trade with all fields correct.

WHAT TO EXTRACT:
- Spot BUY and SELL transactions in either asset class.
- For stocks: trades on any exchange, regardless of currency.
- For crypto: spot trades against fiat or USD-pegged stablecoins (USDT/USDC/BUSD/DAI/USD).
- Crypto-to-crypto swaps: emit them anyway but leave currency empty. The server will mark them invalid and let the user fix.

WHAT TO SKIP:
- Deposits / withdrawals / transfers (no cash flow into a position).
- Staking rewards, airdrops, interest, dividend payouts, capital distributions.
- Stock splits, mergers, reverse splits, spin-offs, rights issues.
- Internal transfers between user's own accounts/wallets.
- Fee-only rows that don't pair with a buy/sell.
- Any row you can't confidently classify.

NUMBER FORMAT:
- Use a dot as the decimal separator.
- No thousands separator (write 1234.56 not 1,234.56).
- Negative numbers are not allowed — quantity, price and fees are ALWAYS positive. Direction is encoded in \`side\`.

EXAMPLE OUTPUT (no headers, no trailing whitespace):
BTC,Bitcoin,2024-01-15,B,0.05,42000,5.25,USDT,crypto,98
ETH,Ethereum,2024-01-20,S,1.2,2300,2.30,USDT,crypto,95
AAPL,Apple Inc.,2024-02-12,B,10,182.5,0.99,USD,stocks,99
TSLA,Tesla,2024-03-04,S,4,205.10,0.99,USD,stocks,98`;

/**
 * Single universal prompt — no longer asset-class-branching. Kept as a function
 * so callers don't need to know it stopped switching.
 */
export function getSystemPrompt(): string {
  return UNIVERSAL_TRANSACTIONS_SYSTEM_PROMPT;
}

export function createTextExtractionPrompt({ text }: { text: string }): string {
  return `Extract every BUY/SELL transaction (stocks or crypto) from this source text:

---
${text}
---

Output CSV only. One transaction per line.`;
}

/**
 * Shape of one row after CSV parsing. Numbers stay as strings until the server
 * has normalised the quote currency and resolved the symbol — that's when we
 * commit to typed values.
 */
export interface AIParsedTransactionRow {
  symbol: string;
  name: string | null;
  date: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  fees: string;
  /** Raw currency literal as the model wrote it (USDT, USD, EUR, ""). */
  currency: string | null;
  /** AI's best guess at the asset class for this row. Server may override at resolve time. */
  assetClassHint: 'crypto' | 'stocks';
  /** 0.0 – 1.0. */
  confidence: number;
}

/**
 * CSV-line splitter that respects double-quoted fields containing commas.
 * Copied from statement-parser's parser — same conventions.
 */
function splitCsvLine({ line }: { line: string }): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accept YYYY-MM-DD only when the date is actually valid (rules out 2024-13-99).
 * Round-tripping through Date and re-comparing the slice is the simplest
 * way — Date.parse alone accepts 2024-13-99 by rolling over.
 */
function isValidDateString({ date }: { date: string }): boolean {
  if (!DATE_REGEX.test(date)) return false;
  const ts = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ts)) return false;
  return new Date(ts).toISOString().slice(0, 10) === date;
}

function normalizeAssetClassHint(raw: string | undefined): 'crypto' | 'stocks' {
  const v = raw?.trim().toLowerCase();
  if (v === 'crypto') return 'crypto';
  if (v === 'stocks' || v === 'stock' || v === 'securities' || v === 'equity' || v === 'equities') return 'stocks';
  // Default for unrecognised values: stocks. Crypto sources tend to be more
  // structured and the AI tags them confidently; ambiguity skews toward equities.
  return 'stocks';
}

/**
 * Parse the AI's CSV response into typed rows. Drops any row that fails
 * validation (bad date, non-positive quantity, unrecognised side, etc.) —
 * the AI returns garbage often enough that surfacing partial successes is
 * better than failing the whole import.
 */
export function parseAIResponse({ response }: { response: string }): AIParsedTransactionRow[] {
  let csv = response.trim();

  // Strip markdown fences if the model added them despite instructions.
  if (csv.startsWith('```csv')) csv = csv.slice(6);
  else if (csv.startsWith('```')) csv = csv.slice(3);
  if (csv.endsWith('```')) csv = csv.slice(0, -3);
  csv = csv.trim();

  if (!csv) return [];

  const rows: AIParsedTransactionRow[] = [];
  const lines = csv
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const cells = splitCsvLine({ line });
    // 10 columns expected; tolerate the old 9-column shape for transitional
    // outputs by inferring assetClassHint as "crypto" (the old default).
    if (cells.length < 9) continue;

    const hasHintColumn = cells.length >= 10;
    const [symbol, name, date, sideRaw, qtyRaw, priceRaw, feesRaw, currencyRaw] = cells;
    const assetClassRaw = hasHintColumn ? cells[8] : 'crypto';
    const confidenceRaw = hasHintColumn ? cells[9] : cells[8];

    if (!symbol || !date || !isValidDateString({ date })) continue;

    const side = sideRaw?.toUpperCase() === 'S' ? 'sell' : sideRaw?.toUpperCase() === 'B' ? 'buy' : null;
    if (!side) continue;

    const quantity = Number(qtyRaw);
    const price = Number(priceRaw);
    const fees = Number(feesRaw ?? '0');
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    if (!Number.isFinite(fees) || fees < 0) continue;

    const confidenceInt = Number.parseInt(confidenceRaw ?? '80', 10);
    const confidence = Math.min(100, Math.max(0, Number.isFinite(confidenceInt) ? confidenceInt : 80)) / 100;

    rows.push({
      symbol: symbol.toUpperCase(),
      name: name || null,
      date,
      side,
      quantity: qtyRaw!,
      price: priceRaw!,
      fees: feesRaw || '0',
      currency: currencyRaw ? currencyRaw.toUpperCase() : null,
      assetClassHint: normalizeAssetClassHint(assetClassRaw),
      confidence,
    });
  }

  return rows;
}
