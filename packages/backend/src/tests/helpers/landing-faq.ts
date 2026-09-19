import type { askLandingFaq as apiAskLandingFaq } from '@services/landing-faq/ask-landing-faq.service';

import { makeRequest } from './common';

export async function askLandingFaq<R extends boolean | undefined = undefined>({
  question,
  headers,
  raw,
}: {
  question: unknown;
  headers?: Record<string, string>;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiAskLandingFaq>>, R>({
    method: 'post',
    url: '/landing/faq/ask',
    payload: { question },
    headers,
    raw,
  });
}
