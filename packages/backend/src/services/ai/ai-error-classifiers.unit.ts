// The classifiers decide what a user is told about their own endpoint, so a
// misfire either hides a real problem or blames the wrong thing.

import { describe, expect, it } from '@jest/globals';
import { ValidationError } from '@js/errors';
import { APICallError, RetryError } from 'ai';

import {
  buildModelNotServedMessage,
  getHttpStatus,
  isConnectionError,
  isModelNotFoundError,
  isNonApiResponseError,
  unwrapRetryError,
} from './ai-error-classifiers';

/** What a tunnel with nothing behind it, or a plain web server, answers with. */
const HTML_ERROR_PAGE = '<html><body>The endpoint is offline (ERR_NGROK_3200)</body></html>';

function buildApiCallError({
  statusCode,
  isRetryable,
  message = 'api call failed',
  responseBody,
}: {
  statusCode?: number;
  isRetryable?: boolean;
  message?: string;
  responseBody?: string;
}): APICallError {
  return new APICallError({
    message,
    url: 'https://custom-llm.example/v1/chat/completions',
    requestBodyValues: {},
    statusCode,
    isRetryable,
    responseBody,
  });
}

function buildRetryError({ errors }: { errors: unknown[] }): RetryError {
  return new RetryError({
    message: 'Failed after 3 attempts',
    reason: 'maxRetriesExceeded',
    errors,
  });
}

describe('unwrapRetryError', () => {
  it('returns the error underneath a RetryError', () => {
    const cause = buildApiCallError({ statusCode: 404 });

    expect(unwrapRetryError({ error: buildRetryError({ errors: [new TypeError('fetch failed'), cause] }) })).toBe(
      cause,
    );
  });

  it('returns anything that is not a RetryError untouched', () => {
    const error = new Error('boom');

    expect(unwrapRetryError({ error })).toBe(error);
  });

  it('returns the wrapper when it carries no cause', () => {
    const error = buildRetryError({ errors: [] });

    expect(unwrapRetryError({ error })).toBe(error);
  });

  // The guard can refuse the second attempt of a call whose first attempt was a
  // retryable network failure, which is how a rebound DNS record surfaces.
  it('exposes a blocked-address rejection the SDK retried over', () => {
    const blocked = new ValidationError({ message: 'blocked' });
    const error = buildRetryError({ errors: [new TypeError('fetch failed'), blocked] });

    expect(unwrapRetryError({ error })).toBeInstanceOf(ValidationError);
  });
});

describe('isConnectionError', () => {
  it('treats an APICallError without a status code as unreachable', () => {
    expect(isConnectionError({ error: buildApiCallError({ isRetryable: true }) })).toBe(true);
  });

  it('treats an answered request as reachable', () => {
    expect(isConnectionError({ error: buildApiCallError({ statusCode: 401 }) })).toBe(false);
  });

  it.each(['fetch failed', 'Failed to fetch'])('treats a %p TypeError as unreachable', (message) => {
    expect(isConnectionError({ error: new TypeError(message) })).toBe(true);
  });

  // AbortSignal.timeout rejects with a DOMException named TimeoutError; an
  // explicit abort uses AbortError. Both mean no answer arrived.
  it.each(['TimeoutError', 'AbortError'])('treats a %s abort as unreachable', (name) => {
    const error = Object.assign(new Error('The operation was aborted'), { name });
    expect(isConnectionError({ error })).toBe(true);
  });

  it('unwraps a RetryError to classify its last cause', () => {
    expect(isConnectionError({ error: buildRetryError({ errors: [buildApiCallError({ isRetryable: true })] }) })).toBe(
      true,
    );
    expect(isConnectionError({ error: buildRetryError({ errors: [buildApiCallError({ statusCode: 500 })] }) })).toBe(
      false,
    );
  });

  it('returns false for an unrelated plain error', () => {
    expect(isConnectionError({ error: new Error('boom') })).toBe(false);
  });
});

describe('isNonApiResponseError', () => {
  it('treats an HTML error page as a non-API answer', () => {
    const error = buildApiCallError({ statusCode: 404, responseBody: HTML_ERROR_PAGE });

    expect(isNonApiResponseError({ error })).toBe(true);
  });

  it('treats an answer with an empty body as a non-API answer', () => {
    expect(isNonApiResponseError({ error: buildApiCallError({ statusCode: 502, responseBody: '' }) })).toBe(true);
  });

  // Cloudflare and nginx answer rate limits with their own page, so a non-JSON 429 is a
  // limiter in front of a working API — a temporary error, not a broken endpoint.
  it.each(['', HTML_ERROR_PAGE])('does not treat a 429 with body %p as a non-API answer', (responseBody) => {
    expect(isNonApiResponseError({ error: buildApiCallError({ statusCode: 429, responseBody }) })).toBe(false);
  });

  it('treats a JSON error body as an API answer', () => {
    const error = buildApiCallError({
      statusCode: 404,
      responseBody: JSON.stringify({ error: { message: 'model not found', code: 'model_not_found' } }),
    });

    expect(isNonApiResponseError({ error })).toBe(false);
  });

  // Nothing answered, so there is no response to judge — that is a connection failure.
  it('returns false when the request never reached a server', () => {
    expect(isNonApiResponseError({ error: buildApiCallError({ isRetryable: true }) })).toBe(false);
  });

  // An absent body (unlike an empty one) carries no evidence either way.
  it('returns false when the failure carries no body at all to judge', () => {
    expect(isNonApiResponseError({ error: buildApiCallError({ statusCode: 404 }) })).toBe(false);
  });

  it('unwraps a RetryError to classify its last cause', () => {
    const error = buildRetryError({ errors: [buildApiCallError({ statusCode: 404, responseBody: HTML_ERROR_PAGE })] });

    expect(isNonApiResponseError({ error })).toBe(true);
  });

  it('returns false for an error the SDK did not raise', () => {
    expect(isNonApiResponseError({ error: new Error('boom') })).toBe(false);
  });
});

describe('getHttpStatus', () => {
  it('reports the status the endpoint answered with', () => {
    expect(getHttpStatus({ error: buildApiCallError({ statusCode: 503 }) })).toBe(503);
  });

  it('reports nothing for an error that never got an answer', () => {
    expect(getHttpStatus({ error: new TypeError('fetch failed') })).toBeUndefined();
  });
});

describe('isModelNotFoundError', () => {
  it('treats any 404 as a missing model', () => {
    expect(isModelNotFoundError({ error: buildApiCallError({ statusCode: 404 }) })).toBe(true);
  });

  // An offline tunnel answers 404 for every path, including one no model was ever asked of
  it('does not treat a 404 web page as a missing model', () => {
    const error = buildApiCallError({ statusCode: 404, responseBody: HTML_ERROR_PAGE });

    expect(isModelNotFoundError({ error })).toBe(false);
  });

  it.each([
    'model_not_found',
    'model "llama3.2" not found, try pulling it first',
    'The model `qwen2.5` does not exist',
    'unknown model requested',
  ])('treats a 400 saying %p as a missing model', (message) => {
    expect(isModelNotFoundError({ error: buildApiCallError({ statusCode: 400, message }) })).toBe(true);
  });

  it('treats a 422 with an explicit marker as a missing model', () => {
    const error = buildApiCallError({ statusCode: 422, message: 'model not found' });
    expect(isModelNotFoundError({ error })).toBe(true);
  });

  // A user may name their model "v1" or "chat", which appears in plenty of
  // unrelated error text — the model name alone must never be the signal.
  it('does not treat a 400 that merely echoes the request path as a missing model', () => {
    const error = buildApiCallError({ statusCode: 400, message: 'Invalid request body sent to /v1/chat/completions' });
    expect(isModelNotFoundError({ error })).toBe(false);
  });

  it('does not treat a 500 mentioning the model as a missing model', () => {
    const error = buildApiCallError({ statusCode: 500, message: 'model not found' });
    expect(isModelNotFoundError({ error })).toBe(false);
  });

  it('unwraps a RetryError to classify its last cause', () => {
    const error = buildRetryError({ errors: [buildApiCallError({ statusCode: 404 })] });
    expect(isModelNotFoundError({ error })).toBe(true);
  });

  it('returns false for an error the SDK did not raise', () => {
    expect(isModelNotFoundError({ error: new Error('model not found') })).toBe(false);
  });
});

describe('buildModelNotServedMessage', () => {
  it('names the model without its provider prefix', () => {
    expect(buildModelNotServedMessage({ modelId: 'custom/llama3.2' })).toContain('"llama3.2"');
  });
});
