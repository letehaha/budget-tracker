import { logger } from '@js/utils/logger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpAuthInfo, verifyMcpToken } from '@services/mcp/auth';
import { createMcpServer } from '@services/mcp/server';
import {
  getSession,
  registerSession,
  removeSession,
  startSessionCleanup,
  touchSession,
} from '@services/mcp/transport-manager';
import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const router = Router();

// Start the idle session cleanup interval
startSessionCleanup();

interface AuthenticatedRequest extends Request {
  mcpAuthInfo?: McpAuthInfo;
}

/**
 * Authenticate MCP requests via OAuth bearer token.
 * Returns 401 if the token is missing, invalid, or expired.
 */
async function authenticateMcpRequest(req: AuthenticatedRequest, res: Response): Promise<boolean> {
  try {
    const authInfo = await verifyMcpToken({
      authorizationHeader: req.headers.authorization,
    });

    req.mcpAuthInfo = authInfo;
    return true;
  } catch {
    const baseURL = process.env.BETTER_AUTH_URL || 'https://localhost:8081';
    const resourceMetadataUrl = `${baseURL}/.well-known/oauth-protected-resource`;

    res
      .status(401)
      .set('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`)
      .json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      });
    return false;
  }
}

/**
 * Lookup an existing session transport by session ID from the request header.
 * Returns the transport if found, or sends a 400 error and returns null.
 */
function resolveSessionTransport({
  req,
  res,
}: {
  req: AuthenticatedRequest;
  res: Response;
}): StreamableHTTPServerTransport | null {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Missing session ID' },
      id: null,
    });
    return null;
  }

  const session = getSession({ sessionId });
  if (!session) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid or expired session ID' },
      id: null,
    });
    return null;
  }

  // Verify the session belongs to the authenticated user
  if (session.userId !== req.mcpAuthInfo?.extra?.userId) {
    res.status(403).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Session does not belong to authenticated user' },
      id: null,
    });
    return null;
  }

  touchSession({ sessionId });
  return session.transport;
}

/**
 * POST /api/v1/mcp — Handle MCP JSON-RPC requests (initialization + tool calls)
 */
// oxlint-disable-next-line oxc/no-async-endpoint-handlers -- handler has internal try/catch for all async operations
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!(await authenticateMcpRequest(req, res))) return;

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    // Reuse existing transport for established sessions
    if (sessionId) {
      const session = getSession({ sessionId });

      if (session) {
        // Verify session belongs to authenticated user
        if (session.userId !== req.mcpAuthInfo!.extra.userId) {
          res.status(403).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Session does not belong to authenticated user' },
            id: null,
          });
          return;
        }

        touchSession({ sessionId });
        await session.transport.handleRequest(req, res, req.body);
        return;
      }
    }

    // New session — must be an initialization request
    if (!sessionId && req.body?.method === 'initialize') {
      const userId = req.mcpAuthInfo!.extra.userId;

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          registerSession({ sessionId: sid, transport, userId });
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) removeSession({ sessionId: sid });
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Invalid request — no session and not initialization
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid request. Send an initialization request first.' },
      id: null,
    });
  } catch (error) {
    logger.error('MCP POST handler error', { error: (error as Error).message });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

/**
 * GET /api/v1/mcp — SSE stream for server-to-client notifications
 */
// oxlint-disable-next-line oxc/no-async-endpoint-handlers -- handler has internal try/catch for all async operations
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!(await authenticateMcpRequest(req, res))) return;

  const transport = resolveSessionTransport({ req, res });
  if (!transport) return;

  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    logger.error('MCP GET handler error', { error: (error as Error).message });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

/**
 * DELETE /api/v1/mcp — Terminate an MCP session
 */
// oxlint-disable-next-line oxc/no-async-endpoint-handlers -- handler has internal try/catch for all async operations
router.delete('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!(await authenticateMcpRequest(req, res))) return;

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  const transport = resolveSessionTransport({ req, res });
  if (!transport) return;

  try {
    await transport.handleRequest(req, res);
    if (sessionId) removeSession({ sessionId });
  } catch (error) {
    logger.error('MCP DELETE handler error', { error: (error as Error).message });
    if (sessionId) removeSession({ sessionId });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

export default router;
