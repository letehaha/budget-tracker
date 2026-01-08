import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  locale: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Request-scoped context using AsyncLocalStorage.
 * Allows passing locale (and other request-scoped data) through async chains
 * where the Express request object isn't directly available (e.g., better-auth hooks).
 */
export const requestContext = {
  /**
   * Run a function within a request context.
   * All async operations within the callback will have access to the context.
   */
  run: <T>(context: RequestContext, fn: () => T): T => {
    return asyncLocalStorage.run(context, fn);
  },

  /**
   * Get the current locale from the request context.
   * Falls back to 'en' if no context is available.
   */
  getLocale: (): string => {
    return asyncLocalStorage.getStore()?.locale || 'en';
  },

  /**
   * Get the full request context, if available.
   */
  getContext: (): RequestContext | undefined => {
    return asyncLocalStorage.getStore();
  },
};
