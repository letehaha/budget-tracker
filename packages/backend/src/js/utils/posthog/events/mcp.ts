import { trackEvent } from '../index';

/**
 * Track MCP tool usage.
 */
export function trackMcpToolUsed({
  userId,
  tool,
  clientId,
}: {
  userId: string | number;
  tool: string;
  clientId?: string;
}): void {
  trackEvent({
    userId,
    event: 'mcp_tool_used',
    properties: {
      tool_name: tool,
      ...(clientId && { client_id: clientId }),
    },
  });
}
