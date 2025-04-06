import { getCurrentRequestId } from '@common/lib/cls/logging';
import { getCurrentSessionId } from '@common/lib/cls/session-id';
import winston, { format, transports } from 'winston';
import LokiTransport from 'winston-loki';

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
  extra?: Record<string, unknown>,
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
  } else {
    messageResult = 'Default error message from logger';
  }

  if (showLogsInTests) {
    winstonLogger.error({
      message: messageResult,
      requestId: getCurrentRequestId() ?? null,
      ...(extra ?? {}),
    });
  }
}

const logger = {
  info: createLogger('info'),
  warn: createLogger('warn'),
  error: loggerErrorHandler,
};

export { logger };
