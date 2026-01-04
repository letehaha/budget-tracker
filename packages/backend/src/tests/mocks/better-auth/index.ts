/**
 * Mock implementation of better-auth for Jest tests.
 * Re-exports from the actual package where possible, mocks ESM-only parts.
 */

// Types and non-ESM exports can come from actual package
// For now, provide a basic mock that supports our test scenarios

interface BetterAuthConfig {
  database: unknown;
  basePath?: string;
  user?: { modelName?: string };
  session?: { modelName?: string; expiresIn?: number; updateAge?: number };
  account?: { modelName?: string };
  emailAndPassword?: {
    enabled?: boolean;
    password?: {
      hash?: (password: string) => Promise<string>;
      verify?: (params: { password: string; hash: string }) => Promise<boolean>;
    };
  };
  socialProviders?: Record<string, unknown>;
  plugins?: unknown[];
  advanced?: Record<string, unknown>;
  databaseHooks?: {
    user?: {
      create?: {
        after?: (user: unknown) => Promise<void>;
      };
    };
  };
}

interface AuthInstance {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (params: { headers: unknown }) => Promise<{ user: unknown; session: unknown } | null>;
  };
}

/**
 * Creates a better-auth instance.
 * This is a simplified mock that provides the essential API shape.
 */
export function betterAuth(config: BetterAuthConfig): AuthInstance {
  // Store config for later use
  const basePath = config.basePath || '/api/auth';

  return {
    handler: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const path = url.pathname.replace(basePath, '');

      // Basic routing for auth endpoints
      if (path === '/sign-up/email' && request.method === 'POST') {
        const body = await request.json();
        // In real implementation, this would create a user
        return new Response(
          JSON.stringify({
            user: { id: 'test-user-id', email: body.email, name: body.name },
            session: { id: 'test-session-id', token: 'test-token' },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': 'bt_auth.session_token=test-token; Path=/; HttpOnly',
            },
          },
        );
      }

      if (path === '/sign-in/email' && request.method === 'POST') {
        const body = await request.json();
        return new Response(
          JSON.stringify({
            user: { id: 'test-user-id', email: body.email },
            session: { id: 'test-session-id', token: 'test-token' },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': 'bt_auth.session_token=test-token; Path=/; HttpOnly',
            },
          },
        );
      }

      if (path === '/get-session' && request.method === 'GET') {
        const cookie = request.headers.get('Cookie');
        if (cookie?.includes('bt_auth.session_token')) {
          return new Response(
            JSON.stringify({
              user: { id: 'test-user-id', email: 'test@test.local' },
              session: { id: 'test-session-id', token: 'test-token' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ session: null, user: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/sign-out' && request.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'bt_auth.session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
          },
        });
      }

      // Default: not found
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    api: {
      getSession: async ({ headers }: { headers: unknown }) => {
        // Check for session cookie in headers
        const headerObj = headers as Record<string, string | undefined>;
        const cookie = headerObj.cookie || headerObj.Cookie;
        if (cookie?.includes('bt_auth.session_token')) {
          return {
            user: { id: 'test-user-id', email: 'test@test.local' },
            session: { id: 'test-session-id', token: 'test-token' },
          };
        }
        return null;
      },
    },
  };
}
