/**
 * Thrown by data-provider clients on non-2xx HTTP responses. Carries the
 * status code so callers can react to known/expected failures (e.g. 402
 * Payment Required on free-tier plans, 429 rate limits) without parsing
 * error messages.
 */
export class ProviderHttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;

  constructor({ provider, status, statusText }: { provider: string; status: number; statusText: string }) {
    super(`${provider} API error: ${status} ${statusText}`);
    this.name = 'ProviderHttpError';
    this.status = status;
    this.statusText = statusText;
  }
}
