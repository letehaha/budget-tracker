import { API_ERROR_CODES } from '@bt/shared/types';
import { CustomError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

interface McpSession {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
  userId: number;
}

const sessions = new Map<string, McpSession>();

const MAX_SESSIONS = 1000;
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function cleanupIdleSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    const idleTime = now - session.lastActivity;
    if (idleTime > IDLE_TIMEOUT_MS) {
      logger.info(`MCP: Cleaning up idle session ${sessionId}`);
      sessions.delete(sessionId);
      try {
        session.transport.close();
      } catch (err) {
        logger.error(`Failed to close idle MCP session ${sessionId}`, {
          error: (err as Error).message,
        });
      }
    }
  }
}

export function startSessionCleanup() {
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanupIdleSessions, CLEANUP_INTERVAL_MS);
  }
}

export function getSession({ sessionId }: { sessionId: string }): McpSession | undefined {
  return sessions.get(sessionId);
}

export function registerSession({
  sessionId,
  transport,
  userId,
}: {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  userId: number;
}) {
  if (sessions.size >= MAX_SESSIONS) {
    throw new CustomError(503, API_ERROR_CODES.unexpected, 'Maximum number of concurrent MCP sessions reached');
  }

  sessions.set(sessionId, {
    transport,
    lastActivity: Date.now(),
    userId,
  });
}

export function touchSession({ sessionId }: { sessionId: string }) {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
}

export function removeSession({ sessionId }: { sessionId: string }) {
  const session = sessions.get(sessionId);
  if (session) {
    sessions.delete(sessionId);
    try {
      session.transport.close();
    } catch (err) {
      logger.error(`Failed to close MCP session ${sessionId}`, {
        error: (err as Error).message,
      });
    }
  }
}
