import { API_HTTP, API_VER } from '@/api/api-base-url';
import { ApiBaseError } from '@/common/types';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { getCurrentLocale, i18n } from '@/i18n';
import * as errors from '@/js/errors';
import { router } from '@/routes';
import { useAuthStore } from '@/stores';
import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types/api';

type HTTP_METHOD = 'PATCH' | 'POST' | 'PUT' | 'GET' | 'DELETE';
const SESSION_ID_HEADER_KEY = 'X-Session-ID';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiValidResponse = any;

interface ApiRequestConfig {
  method: HTTP_METHOD;
  headers: {
    'Content-Type': string;
    [SESSION_ID_HEADER_KEY]: string;
    'Accept-Language': string;
  };
  body?: string;
  credentials: RequestCredentials;
  signal?: AbortSignal;
}

interface ApiCall {
  endpoint: string;
  method: HTTP_METHOD;
  query?: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string | number, any>;
  options?: {
    needRaw?: boolean;
    /** When true, suppresses error toast notifications for failed requests */
    silent?: boolean;
    /** AbortSignal forwarded to fetch – lets callers cancel in-flight requests. */
    signal?: AbortSignal;
  };
}

export { API_HTTP } from './api-base-url';
const SESSION_ID_KEY = 'session-id';

// Distinguishes the managed cloud deployment from local/self-host setups.
// We only want to show the verbose "is the backend running / check ALLOWED_ORIGINS"
// hint to operators – for cloud users a network failure is almost always transient
// and the technical hint would be more confusing than helpful.
const CLOUD_HOSTNAME = 'moneymatter.app';
const isCloudDeployment = (): boolean => {
  const hostname = window.location.hostname;
  return hostname === CLOUD_HOSTNAME || hostname.endsWith(`.${CLOUD_HOSTNAME}`);
};

// eslint-disable-next-line no-console
console.log('API_HTTP', API_HTTP);
// eslint-disable-next-line no-console
console.log('API_VER', API_VER);

/**
 * API client for making requests to the backend.
 * Authentication is handled via session cookies (managed by better-auth).
 */
class ApiCaller {
  _baseURL: string;

  constructor() {
    this._baseURL = import.meta.env.API_HTTP;
  }

  get<T = Record<string, unknown>>(
    endpoint: ApiCall['endpoint'],
    query: T = {} as T,
    options: ApiCall['options'] = {},
  ) {
    const validQuery: ApiCall['query'] = {};

    for (const key in query) {
      if (query[key]) {
        validQuery[key] = query[key]?.toString() ?? '';
      }
    }

    return this._call({
      method: 'GET',
      endpoint,
      options,
      query: validQuery,
    });
  }

  post(endpoint: ApiCall['endpoint'], data: ApiCall['data'] = undefined, options: ApiCall['options'] = {}) {
    return this._call({
      method: 'POST',
      endpoint,
      options,
      data,
    });
  }

  patch(endpoint: ApiCall['endpoint'], data: ApiCall['data'] = undefined, options: ApiCall['options'] = {}) {
    return this._call({
      method: 'PATCH',
      endpoint,
      options,
      data,
    });
  }

  put(endpoint: ApiCall['endpoint'], data: ApiCall['data'] = undefined, options: ApiCall['options'] = {}) {
    return this._call({
      method: 'PUT',
      endpoint,
      options,
      data,
    });
  }

  delete<TQuery = Record<string, unknown>, TData = Record<string, unknown>>(
    endpoint: ApiCall['endpoint'],
    params?: {
      query?: TQuery;
      data?: TData;
    },
    options: ApiCall['options'] = {},
  ) {
    const validQuery: ApiCall['query'] = {};

    if (params?.query) {
      for (const key in params.query) {
        if (params.query[key]) {
          validQuery[key] = params.query[key]?.toString() ?? '';
        }
      }
    }

    return this._call({
      method: 'DELETE',
      endpoint,
      options,
      query: validQuery,
      data: params?.data as ApiCall['data'],
    });
  }

  /**
   * Performs a request
   *
   * @param {object} opts
   * @param {string} opts.endpoint - endpoint where to make the call to, e.g. `/accounts`
   * @param {object} opts.data - request data (for POST/PUT requests)
   * @param {object} opts.query - request query params. See {@link parseQuery} for details
   * @param {string} opts.method - the http method of request
   * @param {boolean} opts.options.needRaw - defines if raw response should be
   * returned, `true` by default
   *
   * @private
   */
  async _call(opts: ApiCall) {
    // TypeScript is dump and things that URLSearchParams only records with string-only
    // values, but it's not
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let additionalParams = new URLSearchParams(opts.query as any).toString();

    if (additionalParams) {
      additionalParams = `?${additionalParams}`;
    }
    const url = `${API_HTTP}${API_VER}${opts.endpoint}${additionalParams}`;
    const config: ApiRequestConfig = {
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': window.sessionStorage?.getItem(SESSION_ID_KEY) || '',
        'Accept-Language': getCurrentLocale(), // Send current locale to backend
      },
      // Include credentials (cookies) for session-based authentication
      credentials: 'include',
    };

    if (opts.data) {
      config.body = JSON.stringify(opts.data);
    }

    if (opts.options?.signal) {
      config.signal = opts.options.signal;
    }

    let result: Response;

    const { addNotification } = useNotificationCenter();

    const isSilent = opts.options?.silent ?? false;

    // Helper to get translated text with fallback (in case i18n isn't loaded yet)
    const t = (key: string, fallback: string) => {
      const translated = i18n.global.t(key);
      // If translation returns the key itself, use fallback
      return translated === key ? fallback : translated;
    };

    try {
      result = await fetch(url, config);
    } catch (e) {
      // Caller-initiated abort (signal) – rethrow silently so the caller can
      // discard the in-flight request without showing a network error toast.
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e;
      }
      if (e instanceof TypeError && e.toString().includes('Failed to fetch')) {
        // Self-hosters and local devs are the system operators – give them the
        // actionable hint (backend not running, CORS misconfigured). Cloud users
        // can't act on either and should see a generic message.
        const message = isCloudDeployment()
          ? t('errors.api.failedToFetch', 'Failed to connect to server')
          : t(
              'errors.api.failedToFetchSelfHost',
              'Cannot reach the server. The backend may still be starting (~30s after startup), or your ALLOWED_ORIGINS env var does not include this URL.',
            );
        if (!isSilent) {
          addNotification({
            id: 'api-fetching-error',
            text: message,
            type: NotificationType.error,
          });
        }

        throw new errors.NetworkError(message);
      }

      const message = t('errors.api.unexpectedError', 'An unexpected error occurred');
      if (!isSilent) {
        addNotification({
          id: 'unexpected-api-error',
          text: message,
          type: NotificationType.error,
        });
      }

      throw new errors.UnexpectedError(message, {});
    }

    const sessionId = result.headers.get(SESSION_ID_HEADER_KEY);

    if (sessionId) window.sessionStorage?.setItem(SESSION_ID_KEY, sessionId);

    // Handle empty response from backend
    if (result.headers.get('content-length') === '0' || result.status === 204) {
      return undefined;
    }

    let parsed: {
      status: API_RESPONSE_STATUS;
      response: ApiBaseError | ApiValidResponse;
    };

    try {
      parsed = await result.json();
    } catch {
      // Response body is not JSON. Happens for raw infrastructure errors that
      // never reach our `apiResponseMiddleware` envelope – e.g. body-parser's
      // 413 Payload Too Large (plain text) or a gateway HTML 5xx page.
      // Without this, `result.json()` throws a SyntaxError that escapes to the
      // caller and surfaces as "Unexpected token <".
      const message =
        result.status === 413
          ? t('errors.api.payloadTooLarge', 'The request is too large. Please try importing fewer items at a time')
          : `${result.status} ${result.statusText}`.trim() ||
            t('errors.api.unexpectedError', 'An unexpected error occurred');

      throw new errors.ApiErrorResponseError(message, {
        code: result.status === 413 ? API_ERROR_CODES.payloadTooLarge : API_ERROR_CODES.unexpected,
        message,
        statusText: result.statusText,
      });
    }

    const { status, response } = parsed;

    if (status === API_RESPONSE_STATUS.success) {
      return response;
    }

    if (status === API_RESPONSE_STATUS.error) {
      if (response.code === API_ERROR_CODES.unauthorized) {
        useAuthStore().logout();

        router.push('/sign-in');

        addNotification({
          id: 'authorization-error',
          text: t('errors.api.sessionExpired', 'Your session has expired'),
          type: NotificationType.error,
        });

        throw new errors.AuthError(response, url);
      }

      if (response.code === API_ERROR_CODES.unexpected) {
        addNotification({
          id: 'unexpected-error',
          text: t('errors.api.unexpectedError', 'An unexpected error occurred'),
          type: NotificationType.error,
        });
      }

      throw new errors.ApiErrorResponseError(response.message, response);
    }

    return undefined;
  }
}

export const api = new ApiCaller();
