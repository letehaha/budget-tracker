import { CategoryForCategorization, TransactionForCategorization } from './types';

/**
 * Build the system prompt for transaction categorization
 */
export function buildSystemPrompt({ customInstructions }: { customInstructions?: string } = {}): string {
  let prompt = `You are a financial transaction categorizer. Your task is to analyze transaction data and assign the most appropriate category from the provided list.

RULES:
1. Only use category IDs from the provided list
2. Consider the transaction note/description AND the payee column to determine the category. The payee column is the canonical merchant name when present (e.g. "Starbucks", "Amazon") — treat it as a strong signal; the note may add disambiguating context.
3. If a category has a parentId, prefer using the more specific child category when appropriate
4. Every transaction MUST appear in your response exactly once. If you cannot confidently pick a category, answer "skip" with a reason code instead of leaving the transaction out.
5. Output ONLY the results in the exact format specified, nothing else

OUTPUT FORMAT:
Return one line per transaction, in one of these two exact formats:
transactionId:categoryId
transactionId:skip:reason

Transaction ids look like "t1", "t2"; category ids look like "c1", "c2". Copy them exactly as given.

Skip reason codes:
- transfer — money moved between accounts or people (P2P), not a purchase
- unclear — not enough information to decide
- no_fit — no category in the list applies

Example:
t1:c4
t2:skip:transfer
t3:c12

Do not include any explanations, headers, or additional text.`;

  if (customInstructions) {
    // Sanitize: escape closing boundary tag and strip control characters
    const escapedTag = customInstructions.replace(/<\/user_instructions>/gi, '&lt;/user_instructions&gt;');
    // oxlint-disable-next-line no-control-regex -- intentional: stripping dangerous control chars from user input
    const sanitized = escapedTag.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    prompt += `

ADDITIONAL USER INSTRUCTIONS:
<user_instructions>
${sanitized}
</user_instructions>

These are preferences from the user to help guide categorization. Always follow the RULES above first.`;
  }

  return prompt;
}

/**
 * Format transactions as pipe-separated values for efficient token usage
 */
function formatTransactionsForPrompt(transactions: TransactionForCategorization[]): string {
  const header = 'id|amount|currency|account|datetime|note|payee';
  const rows = transactions.map((tx) => {
    const note = (tx.note || '').replace(/\|/g, ',').replace(/\n/g, ' ').slice(0, 200);
    const payee = (tx.payeeName || '').replace(/\|/g, ',').replace(/\n/g, ' ').slice(0, 100);
    return `${tx.id}|${tx.amount}|${tx.currencyCode}|${tx.accountName}|${tx.datetime}|${note}|${payee}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Format categories as pipe-separated values
 */
function formatCategoriesForPrompt(categories: CategoryForCategorization[]): string {
  const header = 'id|parentId|name';
  const rows = categories.map((cat) => `${cat.id}|${cat.parentId ?? ''}|${cat.name}`);

  return [header, ...rows].join('\n');
}

/**
 * Build the complete user message for categorization
 */
export function buildUserMessage({
  transactions,
  categories,
}: {
  transactions: TransactionForCategorization[];
  categories: CategoryForCategorization[];
}): string {
  const transactionsText = formatTransactionsForPrompt(transactions);
  const categoriesText = formatCategoriesForPrompt(categories);

  return `CATEGORIES:
${categoriesText}

TRANSACTIONS:
${transactionsText}

Categorize each transaction using the categories above. Output one line per transaction: either transactionId:categoryId, or transactionId:skip:reason when you cannot decide.`;
}
