import { getCurrentRequestId } from '@common/lib/cls/logging';
import { getCurrentSessionId } from '@common/lib/cls/session-id';
import { CustomError } from '@js/errors';
import winston, { format, transports } from 'winston';
import LokiTransport from 'winston-loki';

import { isSentryEnabled, Sentry } from './sentry';

/**
 * Expected client errors carry a 4xx status. Services often log-and-rethrow
 * their errors, which would otherwise send every validation/not-found failure
 * to Sentry as if it were an app bug. Those are still logged locally; they just
 * don't belong in Sentry. 5xx (including upstream BadGateway/ServiceUnavailable)
 * and any non-CustomError are real and still captured.
 */
const isExpectedClientError = (error: unknown): boolean => error instanceof CustomError && error.httpCode < 500;

const transportsArray: winston.transport[] = [new transports.Console()];
const { GRAFANA_LOKI_HOST, GRAFANA_LOKI_AUTH, GRAFANA_LOKI_USER_ID } = process.env;
const isGrafanaConfigured = Boolean(GRAFANA_LOKI_HOST && GRAFANA_LOKI_AUTH && GRAFANA_LOKI_USER_ID);

if (isGrafanaConfigured && GRAFANA_LOKI_HOST && GRAFANA_LOKI_AUTH && GRAFANA_LOKI_USER_ID) {
  transportsArray.push(
    new LokiTransport({
      host: GRAFANA_LOKI_HOST,
      basicAuth: `${GRAFANA_LOKI_USER_ID}:${GRAFANA_LOKI_AUTH}`,
      labels: {
        service: 'budget-tracker-be',
        env: process.env.NODE_ENV,
      },
      format: winston.format.json(),
      json: true,
      replaceTimestamp: true,
      level: 'debug',
      onConnectionError: (error) => console.log('onConnectionError', error),
    }),
  );
}

const showLogsInTests = process.env.NODE_ENV === 'test' ? process.env.SHOW_LOGS_IN_TESTS === 'true' : true;

const createWinstonLogger = () => {
  const formats = [
    format.errors({ stack: true }),
    format.timestamp(),
    isGrafanaConfigured
      ? format.json() // Loki requires JSON format
      : format.printf((mess) => `[${mess.timestamp}] ${mess.level}: ${mess.message}`),
  ];

  if (!isGrafanaConfigured) formats.push(format.colorize());

  return winston.createLogger({
    level: 'debug',
    format: format.combine(...formats),
    transports: transportsArray,
  });
};

const winstonLogger = createWinstonLogger();

const createLogger =
  (severity: 'info' | 'warn') =>
  (message: string, meta: Record<string, unknown> = {}) => {
    if (showLogsInTests) {
      winstonLogger.log({
        level: severity,
        message,
        requestId: getCurrentRequestId() ?? null,
        sessionId: getCurrentSessionId() ?? null,
        ...meta,
      });
    }

    if (severity === 'warn' && isSentryEnabled()) {
      Sentry.withScope((scope) => {
        scope.setExtras(meta);
        const requestId = getCurrentRequestId();
        const sessionId = getCurrentSessionId();
        if (requestId) scope.setTag('requestId', requestId);
        if (sessionId) scope.setTag('sessionId', sessionId);
        Sentry.captureMessage(message, 'warning');
      });
    }
  };

const formatErrorToString = (error: string | Error) => {
  let message = '';

  if (error instanceof Error && error.stack) {
    // An error object is not 100% like a normal object, so
    // we have to jump through hoops to get needed info out
    // of error objects for logging.
    message = error.stack;
  } else {
    message = String(error);
  }

  return message;
};

function loggerErrorHandler(message: string, extra?: Record<string, unknown>): void;
function loggerErrorHandler(error: Error, extra?: Record<string, unknown>): void;
function loggerErrorHandler(messageParam: { message: string; error?: Error }, extra?: Record<string, unknown>): void;
function loggerErrorHandler(messageParam: { message?: string; error: Error }, extra?: Record<string, unknown>): void;
function loggerErrorHandler(
  messageParam: { message?: string; error?: Error } | string | Error,
  extra: Record<string, unknown> = {},
): void {
  let messageResult: string;

  if (typeof messageParam === 'string') {
    messageResult = messageParam;
  } else if (messageParam instanceof Error) {
    messageResult = formatErrorToString(messageParam);
  } else if (messageParam.message && messageParam.error) {
    messageResult = `${messageParam.message} \n ${formatErrorToString(messageParam.error)}`;
  } else if (messageParam.error) {
    messageResult = formatErrorToString(messageParam.error);
  } else if (messageParam.message) {
    messageResult = messageParam.message;
  } else {
    messageResult = 'Default error message from logger';
  }

  if (showLogsInTests) {
    winstonLogger.error({
      message: messageResult,
      requestId: getCurrentRequestId() ?? null,
      ...extra,
    });
  }

  if (isSentryEnabled()) {
    Sentry.withScope((scope) => {
      scope.setExtras(extra);
      const requestId = getCurrentRequestId();
      const sessionId = getCurrentSessionId();
      if (requestId) scope.setTag('requestId', requestId);
      if (sessionId) scope.setTag('sessionId', sessionId);

      // Extract the Error object for proper stack traces in Sentry
      const errorObj =
        messageParam instanceof Error
          ? messageParam
          : typeof messageParam === 'object' && messageParam.error
            ? messageParam.error
            : null;

      if (errorObj) {
        // A logged 4xx is not a Sentry-worthy bug — the local log above keeps it.
        if (isExpectedClientError(errorObj)) return;

        if (typeof messageParam === 'object' && 'message' in messageParam && messageParam.message) {
          scope.setExtra('errorContext', messageParam.message);
        }
        // Surface CustomError.details so wrapped HTTP/upstream context lands
        // in Sentry — Sentry's default capture only serializes name/message/stack.
        const errorDetails = (errorObj as { details?: unknown }).details;
        if (errorDetails && typeof errorDetails === 'object') {
          scope.setExtras(errorDetails as Record<string, unknown>);
        }
        Sentry.captureException(errorObj);
      } else {
        Sentry.captureMessage(messageResult, 'error');
      }
    });
  }
}

const logger = {
  info: createLogger('info'),
  warn: createLogger('warn'),
  error: loggerErrorHandler,
};

export { logger };
