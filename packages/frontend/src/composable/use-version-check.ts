import { addBreadcrumb, captureException } from '@/lib/sentry';
import { readonly, ref } from 'vue';

const POLL_INTERVAL_MS = 60_000;
const VERSION_ENDPOINT = '/version.json';

// Module-scope state: this composable is a singleton — polling starts on the
// first call and the same `isStale` ref is shared by every consumer.
const isStale = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let isInitialized = false;

export const fetchRemoteVersion = async (): Promise<string | null> => {
  let response: Response;
  try {
    response = await fetch(VERSION_ENDPOINT, { cache: 'no-store' });
  } catch (error) {
    // Network unreachable / offline — expected, just leave a trail.
    addBreadcrumb({
      category: 'version-check',
      message: 'fetch failed',
      level: 'info',
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return null;
  }
  if (!response.ok) {
    // Non-2xx — likely deploy/proxy misconfig. Surface so we notice instead
    // of silently treating every user as up-to-date.
    captureException({
      error: new Error(`version-check: ${VERSION_ENDPOINT} returned ${response.status}`),
      context: { status: response.status, statusText: response.statusText },
    });
    return null;
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    // 200 with non-JSON body — usually SPA fallback returning index.html.
    captureException({
      error: error instanceof Error ? error : new Error('version-check: JSON parse failed'),
      context: { contentType: response.headers.get('content-type') },
    });
    return null;
  }
  const version = (payload as { version?: unknown })?.version;
  if (typeof version !== 'string') {
    captureException({
      error: new Error('version-check: payload missing version string'),
      context: { payload },
    });
    return null;
  }
  return version;
};

const stopPolling = () => {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
};

export const checkVersion = async () => {
  if (document.visibilityState !== 'visible') return;
  const remote = await fetchRemoteVersion();
  if (!remote) return;
  if (remote !== __APP_VERSION__) {
    isStale.value = true;
    stopPolling();
  }
};

const startPolling = () => {
  if (pollTimer !== null) return;
  pollTimer = setInterval(checkVersion, POLL_INTERVAL_MS);
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') checkVersion();
  };
  document.addEventListener('visibilitychange', visibilityHandler);
};

export const useVersionCheck = () => {
  if (!isInitialized && !import.meta.env.DEV) {
    isInitialized = true;
    startPolling();
  }

  return {
    isStale: readonly(isStale),
  };
};
