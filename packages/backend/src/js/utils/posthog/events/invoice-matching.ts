import { trackEvent } from '../index';

/** Fired once per uploaded invoice, whether or not anything matched. */
export function trackInvoiceMatchRequested({
  userId,
  transactionType,
  candidatesCount,
  topScore,
  provider,
  modelId,
  usedJev,
}: {
  userId: string | number;
  transactionType: string;
  candidatesCount: number;
  topScore: number;
  provider: string;
  modelId: string;
  usedJev: boolean;
}): void {
  trackEvent({
    userId,
    event: 'invoice_match_requested',
    properties: {
      transaction_type: transactionType,
      candidates_count: candidatesCount,
      top_score: topScore,
      provider,
      model_id: modelId,
      used_jev: usedJev,
    },
  });
}
