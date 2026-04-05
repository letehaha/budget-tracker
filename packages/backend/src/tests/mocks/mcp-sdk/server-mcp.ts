/**
 * Mock implementation of @modelcontextprotocol/sdk/server/mcp.js for Jest tests.
 */

type ToolHandler = (args: Record<string, unknown>, extra: Record<string, unknown>) => Promise<unknown>;
type PromptHandler = (...args: unknown[]) => unknown;

export class McpServer {
  private tools = new Map<string, ToolHandler>();
  private prompts = new Map<string, PromptHandler>();

  constructor(_info: { name: string; version: string }, _options?: { capabilities?: Record<string, unknown> }) {}

  tool(name: string, description: string, schema: Record<string, unknown>, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }

  prompt(name: string, description: string, handler: PromptHandler): void {
    this.prompts.set(name, handler);
  }

  async connect(_transport: unknown): Promise<void> {}
  async close(): Promise<void> {}
}
