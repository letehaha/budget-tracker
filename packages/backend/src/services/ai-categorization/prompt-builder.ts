import { CategoryForCategorization, TransactionForCategorization } from './types';

/**
 * Build the system prompt for transaction categorization
 */
export function buildSystemPrompt({ customInstructions }: { customInstructions?: string } = {}): string {
  let prompt = `You are a financial transaction categorizer. Your task is to analyze transaction data and assign the most appropriate category from the provided list.

RULES:
1. Only use category IDs from the provided list
2. Consider the transaction note/description to determine the category
3. If a category has a parentId, prefer using the more specific child category when appropriate
4. If you cannot confidently determine a category, omit that transaction from your response
5. Output ONLY the categorization results in the exact format specified, nothing else

OUTPUT FORMAT:
Return one line per categorized transaction in this exact format:
transactionId:categoryId

Example:
123:5
456:12
789:3

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
  const header = 'id|amount|currency|account|datetime|note';
  const rows = transactions.map((tx) => {
    // Escape pipe characters in note and truncate if too long
    const note = (tx.note || '').replace(/\|/g, ',').replace(/\n/g, ' ').slice(0, 200);
    return `${tx.id}|${tx.amount}|${tx.currencyCode}|${tx.accountName}|${tx.datetime}|${note}`;
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

Categorize each transaction using the categories above. Output only transactionId:categoryId pairs, one per line.`;
}
