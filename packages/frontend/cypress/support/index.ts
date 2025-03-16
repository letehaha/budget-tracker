import './commands';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface ResolvedConfigOptions {
      backendBaseURL: string;
      baseUrl: string | null;
      supabaseAuthUrl: string;
      audienceServiceBaseURL: string;
    }

    interface Chainable {
      signInUser(input: { username: string; password: string }): void;
      getNode(dataCy: string, options?: Record<string, unknown>): Cypress.Chainable;
    }
  }
}
