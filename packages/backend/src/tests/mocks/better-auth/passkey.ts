/**
 * Mock implementation of @better-auth/passkey for Jest tests.
 */

interface PasskeyConfig {
  rpID?: string;
  rpName?: string;
  origin?: string;
}

/**
 * Creates a passkey plugin for better-auth.
 * This is a simplified mock that provides the essential API shape.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function passkey(config?: PasskeyConfig) {
  return {
    id: 'passkey',
    init: () => ({}),
  };
}
