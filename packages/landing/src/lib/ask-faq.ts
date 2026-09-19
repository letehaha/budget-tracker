import { config } from './config';
import { trackAnalyticsEvent } from './posthog';

const TOO_MANY_REQUESTS = 429;

// `unknown` marks a question about MoneyMatter that the knowledge base could not answer.
type FaqStatus = 'answered' | 'unknown' | 'off_topic';

export type FaqOutcome = FaqStatus | 'rate_limited' | 'server_error' | 'network';

export type AskFaqResult = { answer: string } | { error: string };

type FaqApiResponse = { response: { answer: string; status: FaqStatus } };

const SERVER_ERROR_MESSAGE = "Couldn't get an answer right now. Please email support@moneymatter.app.";

export async function askFaq({ question }: { question: string }): Promise<AskFaqResult> {
  const startedAt = Date.now();
  const track = ({ outcome, status }: { outcome: FaqOutcome; status?: number }) =>
    trackAnalyticsEvent({
      event: 'landing_faq_asked',
      properties: { question, outcome, duration_ms: Date.now() - startedAt, status },
    });

  let response: Response;

  try {
    response = await fetch(`${config.apiHttp}${config.apiVer}/landing/faq/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    console.error('Failed to ask the FAQ assistant:', error);
    track({ outcome: 'network' });
    return { error: "Couldn't reach the server. Please check your connection and try again." };
  }

  if (!response.ok) {
    const isRateLimited = response.status === TOO_MANY_REQUESTS;

    track({ outcome: isRateLimited ? 'rate_limited' : 'server_error', status: response.status });
    return {
      error: isRateLimited
        ? "That's a lot of questions. Please try again in a few minutes, or email support@moneymatter.app."
        : SERVER_ERROR_MESSAGE,
    };
  }

  try {
    const json: FaqApiResponse = await response.json();
    const { answer, status } = json.response;

    if (!answer) throw new Error('The response carries no answer');

    track({ outcome: status });
    return { answer };
  } catch (error) {
    console.error('Failed to read the FAQ assistant response:', error);
    track({ outcome: 'server_error', status: response.status });
    return { error: SERVER_ERROR_MESSAGE };
  }
}
