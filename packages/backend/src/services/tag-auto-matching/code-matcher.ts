import TagAutoMatchRules from '@models/tag-auto-match-rules.model';
import Fuse from 'fuse.js';

interface TransactionForMatching {
  id: number;
  note: string | null;
}

interface CodeMatchResult {
  transactionId: number;
  ruleId: string;
  tagId: number;
}

const FUSE_THRESHOLD = 0.4;

/**
 * Runs code-based fuzzy matching of transaction notes against code-based rules.
 * Returns a list of (transactionId, ruleId, tagId) matches.
 *
 * Strategy: create a Fuse instance with all transactions, then search each rule's
 * pattern against it. This is more efficient than creating a Fuse instance per rule.
 */
export function runCodeMatching({
  transactions,
  rules,
}: {
  transactions: TransactionForMatching[];
  rules: TagAutoMatchRules[];
}): CodeMatchResult[] {
  // Filter out transactions with no note
  const txsWithNotes = transactions.filter((tx) => tx.note && tx.note.trim().length > 0);

  if (txsWithNotes.length === 0 || rules.length === 0) {
    return [];
  }

  const fuseItems = txsWithNotes.map((tx) => ({
    id: tx.id,
    note: tx.note!,
  }));

  const fuse = new Fuse(fuseItems, {
    keys: ['note'],
    threshold: FUSE_THRESHOLD,
    includeScore: true,
    isCaseSensitive: false,
  });

  const results: CodeMatchResult[] = [];

  for (const rule of rules) {
    if (!rule.codePattern) continue;

    const matches = fuse.search(rule.codePattern);

    for (const match of matches) {
      results.push({
        transactionId: match.item.id,
        ruleId: rule.id,
        tagId: rule.tagId,
      });
    }
  }

  return results;
}
