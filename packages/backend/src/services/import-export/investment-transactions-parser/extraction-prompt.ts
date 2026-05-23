/**
 * AI extraction prompts for investment transactions.
 *
 * The prompt branches on asset class so stocks can plug in later without
 * touching the parser pipeline. Crypto is the only supported branch in v1;
 * stocks branch is intentionally a stub that returns an empty prompt and
 * MUST never be reached at runtime — the controller rejects
 * `assetClass: 'securities'` upstream.
 *
 * Output format: CSV (one transaction per line). CSV minimises output tokens
 * vs JSON and matches the statement-parser convention so cost estimation,
 * tokenisation, and parsing stay consistent.
 */
import { ASSET_CLASS } from '@bt/shared/types/investments';

/**
 * System prompt: crypto-flavoured. Tells the AI to extract buy/sell only and
 * to skip every other kind of activity. Future scope is captured as TODO
 * comments — when those categories land, expand the prompt + the executor.
 */
const CRYPTO_TRANSACTIONS_SYSTEM_PROMPT = `You are a crypto exchange / wallet transaction history parser.
Your job is to extract BUY and SELL transactions from any text source the user provides
(exchange CSV export, broker statement, free-text paste).

OUTPUT FORMAT:
Output ONLY CSV — no markdown, no headers, no explanation.
One transaction per line. Columns, in order:

symbol,name,date,side,quantity,price,fees,currency,confidence

COLUMN RULES:
- symbol: ticker as written in the source (e.g. BTC, ETH, SOL). UPPERCASE.
- name: full name if available (e.g. Bitcoin, Ethereum). Empty if unknown.
- date: YYYY-MM-DD (UTC). If the source has a full timestamp, take the date in UTC and discard the time.
- side: B for buy, S for sell.
- quantity: positive decimal number, the amount of the coin transacted (e.g. 0.5 for half a BTC).
- price: positive decimal number, the unit price per coin in the quote currency. If only "total" is shown, divide total by quantity.
- fees: decimal number for any explicit fee, in the same quote currency. 0 if not present.
- currency: the quote currency literal as it appears in the source (USDT, USDC, USD, BUSD, EUR, etc.). Empty if the trade is a crypto/crypto pair (e.g. BTC/ETH).
- confidence: integer 0-100 reflecting how sure you are this is a real buy/sell trade with all fields correct.

WHAT TO EXTRACT:
- Only spot BUY and SELL transactions where one side is a coin and the other is a fiat or USD-pegged stablecoin (USDT/USDC/BUSD/DAI/USD).
- Crypto-to-crypto swaps: emit them anyway but leave currency empty. The server will mark them invalid and let the user fix.

WHAT TO SKIP:
- Deposits / withdrawals (in-kind transfers with no cash flow).
- Staking rewards, airdrops, interest, dividend-like income.
- Internal transfers between user's own wallets.
- Fee-only rows that don't pair with a buy/sell.
- Any row you can't confidently classify.

NUMBER FORMAT:
- Use a dot as the decimal separator.
- No thousands separator (write 1234.56 not 1,234.56).
- Negative numbers are not allowed — quantity, price and fees are ALWAYS positive. Direction is encoded in \`side\`.

EXAMPLE OUTPUT (no headers, no trailing whitespace):
BTC,Bitcoin,2024-01-15,B,0.05,42000,5.25,USDT,98
ETH,Ethereum,2024-01-20,S,1.2,2300,2.30,USDT,95
SOL,Solana,2024-02-01,B,10,95.5,0,USD,90`;

/**
 * Stocks system prompt — TODO: build out when stocks support lands. For now
 * a stub: if any caller hits this path despite the controller-level gate,
 * we fail loud rather than silently extract nothing.
 *
 * TODO(stocks): when implementing, mirror the crypto prompt with stock-specific
 *   conventions (e.g. exchange-prefixed tickers, full-share quantities,
 *   broker-supplied fees by row).
 */
const STOCKS_TRANSACTIONS_SYSTEM_PROMPT = `__NOT_IMPLEMENTED__`;

/**
 * Select the system prompt for an asset class. Throws if the caller asks for
 * an unsupported one — the controller is responsible for rejecting these
 * before we reach the AI client.
 */
export function getSystemPrompt({ assetClass }: { assetClass: ASSET_CLASS }): string {
  switch (assetClass) {
    case ASSET_CLASS.crypto:
      return CRYPTO_TRANSACTIONS_SYSTEM_PROMPT;
    case ASSET_CLASS.stocks:
      return STOCKS_TRANSACTIONS_SYSTEM_PROMPT;
    default:
      throw new Error(`No transactions-import prompt configured for asset class: ${assetClass}`);
  }
}

export function createTextExtractionPrompt({ text }: { text: string }): string {
  return `Extract every BUY/SELL crypto transaction from this source text:

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
    if (cells.length < 9) continue;

    const [symbol, name, date, sideRaw, qtyRaw, priceRaw, feesRaw, currencyRaw, confidenceRaw] = cells;

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
      confidence,
    });
  }

  return rows;
}
