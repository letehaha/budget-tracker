import { addBreadcrumb, captureException } from '@/lib/sentry';

// After a deploy, hashed chunk filenames change and any code-split import the
// running app tries to load 404s. Vite dispatches `vite:preloadError` for this
// case; we force a hard reload so the user lands on the fresh bundle instead
// of a blank screen. A sessionStorage counter caps how many reloads we'll
// trigger per tab — without it, a chunk that's genuinely missing (CDN issue,
// real bug) would reload-loop the page.

const RELOAD_COUNTER_KEY = 'app:chunk-reload-attempts';
const RELOAD_TIMESTAMP_KEY = 'app:chunk-reload-timestamp';
const MAX_RELOAD_ATTEMPTS = 2;
const COUNTER_RESET_AFTER_MS = 60_000;

export const readCounter = (): number => {
  const stored = window.sessionStorage.getItem(RELOAD_COUNTER_KEY);
  const timestamp = Number(window.sessionStorage.getItem(RELOAD_TIMESTAMP_KEY) ?? 0);
  if (Date.now() - timestamp > COUNTER_RESET_AFTER_MS) return 0;
  return Number(stored ?? 0);
};

const bumpCounter = (next: number) => {
  window.sessionStorage.setItem(RELOAD_COUNTER_KEY, String(next));
  window.sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, String(Date.now()));
};

/**
 * Returns `true` if a reload was triggered, `false` if the cap was reached.
 * On cap exhaustion the original error is sent to Sentry so the genuine
 * deploy/CDN problem is visible instead of the user being silently stranded.
 */
export const reloadWithGuard = (error: Error): boolean => {
  const current = readCounter();
  if (current >= MAX_RELOAD_ATTEMPTS) {
    captureException({
      error,
      context: { reason: 'chunk-reload-cap-exhausted', attempts: current },
    });
    return false;
  }
  bumpCounter(current + 1);
  window.location.reload();
  return true;
};

export const installChunkReloadHandler = () => {
  window.addEventListener('vite:preloadError', (event) => {
    addBreadcrumb({
      category: 'chunk-reload',
      message: 'vite:preloadError caught',
      level: 'warning',
      data: { message: event.payload.message },
    });
    const reloading = reloadWithGuard(event.payload);
    // Only suppress Vite's default rethrow when we're recovering via reload —
    // otherwise let it propagate so global handlers see the underlying error.
    if (reloading) event.preventDefault();
  });
};
