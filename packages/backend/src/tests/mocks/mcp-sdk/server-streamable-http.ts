/**
 * Mock implementation of @modelcontextprotocol/sdk/server/streamableHttp.js for Jest tests.
 */

export class StreamableHTTPServerTransport {
  sessionId: string | null = null;
  onclose: (() => void) | null = null;

  constructor(_options?: Record<string, unknown>) {}

  async handleRequest(_req: unknown, _res: unknown, _body?: unknown): Promise<void> {}
  async close(): Promise<void> {}
}
