import { trackEvent } from '../index';

export type ImportType = 'csv' | 'statement_parser';

/**
 * Track import completion.
 */
export function trackImportCompleted({
  userId,
  importType,
  transactionsCount,
  sessionId,
}: {
  userId: string | number;
  importType: ImportType;
  transactionsCount: number;
  sessionId?: string | null;
}): void {
  trackEvent({
    userId,
    event: 'import_completed',
    properties: {
      import_type: importType,
      transactions_count: transactionsCount,
    },
    sessionId,
  });
}
