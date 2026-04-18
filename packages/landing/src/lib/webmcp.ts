/**
 * WebMCP — expose landing-page actions to browser-based AI agents.
 * https://webmachinelearning.github.io/webmcp/
 *
 * `navigator.modelContext` is a draft API (not shipped in most browsers yet).
 * The feature-detect ensures this is a no-op where unsupported.
 */

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
}

interface ModelContextApi {
  provideContext: (context: { tools: WebMcpTool[] }) => void;
}

declare global {
  interface Navigator {
    modelContext?: ModelContextApi;
  }
}

const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {} as Record<string, unknown> };

const GITHUB_URL = 'https://github.com/letehaha/budget-tracker';

function findTryDemoButton(): HTMLButtonElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.trim().startsWith('Try Demo'),
    ) ?? null
  );
}

export function initWebMcp(): void {
  if (typeof navigator === 'undefined') return;
  if (!navigator.modelContext?.provideContext) return;

  navigator.modelContext.provideContext({
    tools: [
      {
        name: 'navigate_to_sign_up',
        description: 'Navigate the user to the MoneyMatter sign-up page so they can create a free account.',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        execute: () => {
          window.location.href = '/sign-up';
          return { navigatedTo: '/sign-up' };
        },
      },
      {
        name: 'open_github_repository',
        description: 'Open the MoneyMatter open-source repository on GitHub in a new tab.',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        execute: () => {
          window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
          return { opened: GITHUB_URL };
        },
      },
      {
        name: 'start_demo',
        description:
          'Start the no-signup demo with sample data on the landing homepage. Only works on the homepage (/); returns an error otherwise.',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        execute: () => {
          const button = findTryDemoButton();
          if (!button) {
            return { started: false, error: 'Demo button not found — user is not on the landing homepage.' };
          }
          button.click();
          return { started: true };
        },
      },
      {
        name: 'get_product_summary',
        description: 'Return a concise summary of MoneyMatter (what it is, pricing, deployment options, source code).',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        execute: () => ({
          name: 'MoneyMatter',
          tagline: 'Your finances. Your server. Zero data harvesting.',
          description:
            'Free, open-source budget tracking app. Bank sync, AI-assisted categorization, budgets, investment tracking, and full export. Self-host or use the hosted cloud — either way, data is never sold or shared.',
          pricing: 'Free',
          cloudSignUpUrl: 'https://moneymatter.app/sign-up',
          sourceCodeUrl: GITHUB_URL,
          license: 'CC-BY-NC-SA-4.0',
        }),
      },
      {
        name: 'get_mcp_connection_info',
        description:
          'Return the MoneyMatter MCP server endpoint and OAuth discovery URLs so the user can connect an AI agent to their financial data.',
        inputSchema: EMPTY_OBJECT_SCHEMA,
        execute: () => ({
          mcpEndpoint: 'https://mcp.moneymatter.app/mcp',
          transport: 'streamable-http',
          serverCard: 'https://moneymatter.app/.well-known/mcp/server-card.json',
          oauthProtectedResource: 'https://moneymatter.app/.well-known/oauth-protected-resource',
          oauthAuthorizationServer: 'https://moneymatter.app/.well-known/oauth-authorization-server',
          scopes: ['finance:read', 'profile:read', 'offline_access'],
          connectSkill: 'https://moneymatter.app/skills/connect-moneymatter/SKILL.md',
        }),
      },
    ],
  });
}
