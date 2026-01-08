/**
 * Mock implementation of better-auth for Jest tests.
 * Re-exports from the actual package where possible, mocks ESM-only parts.
 */
import { requestContext } from '@common/request-context';

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

// Session storage for tracking users across signup/session calls
// Map of session token -> user object
const sessionStore = new Map<string, { id: string; email: string; name?: string }>();

/**
 * Extracts the session token value from a cookie string.
 */
function extractSessionToken(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const match = cookie.match(/bt_auth\.session_token=([^;]+)/);
  return match?.[1] ?? null;
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

        // Extract locale from Accept-Language header for locale-aware signup
        // Note: supertest sends headers in lowercase
        const acceptLanguage = request.headers.get('Accept-Language') || request.headers.get('accept-language');
        const locale = acceptLanguage?.split(',')[0]?.split('-')[0] || 'en';

        const newUser = { id: `test-user-${Date.now()}`, email: body.email, name: body.name };
        const sessionToken = `test-token-${newUser.id}`;

        // Store session for later lookup
        sessionStore.set(sessionToken, newUser);

        // Call databaseHooks.user.create.after if provided
        // This enables locale-aware category creation during signup
        if (config.databaseHooks?.user?.create?.after) {
          // Run within AsyncLocalStorage context with the detected locale
          await requestContext.run({ locale }, async () => {
            await config.databaseHooks!.user!.create!.after!(newUser);
          });
        }

        return new Response(
          JSON.stringify({
            user: newUser,
            session: { id: 'test-session-id', token: sessionToken },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': `bt_auth.session_token=${sessionToken}; Path=/; HttpOnly`,
            },
          },
        );
      }

      if (path === '/sign-in/email' && request.method === 'POST') {
        const body = await request.json();
        const user = { id: 'test-user-id', email: body.email };
        const sessionToken = 'test-token';

        // Store session for later lookup
        sessionStore.set(sessionToken, user);

        return new Response(
          JSON.stringify({
            user,
            session: { id: 'test-session-id', token: sessionToken },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': `bt_auth.session_token=${sessionToken}; Path=/; HttpOnly`,
            },
          },
        );
      }

      if (path === '/get-session' && request.method === 'GET') {
        const cookie = request.headers.get('Cookie');
        const sessionToken = extractSessionToken(cookie || undefined);

        if (sessionToken) {
          const user = sessionStore.get(sessionToken);
          if (user) {
            return new Response(
              JSON.stringify({
                user,
                session: { id: 'test-session-id', token: sessionToken },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          }
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
        const sessionToken = extractSessionToken(cookie);

        if (sessionToken) {
          const user = sessionStore.get(sessionToken);
          if (user) {
            return {
              user,
              session: { id: 'test-session-id', token: sessionToken },
            };
          }
        }
        return null;
      },
    },
  };
}
