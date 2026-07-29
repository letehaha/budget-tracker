import type { DemoEndReason } from '@/common/const/demo';

// Breadcrumb written when a demo session ends. The next sign-in reads it to link a new
// account back to that demo.
const DEMO_ORIGIN_KEY = 'demo-origin';
// Set once a non-demo account signs in on this device. Lives here so every auth entry
// point can write it for the attribution gate below.
const DEVICE_SIGN_IN_KEY = 'demo-origin-device-signed-in';
// Ignore a signup further than this from the demo.
const DEMO_ORIGIN_TTL_MS = 24 * 60 * 60 * 1000;

interface DemoOrigin {
  endedAt: number;
  reason: DemoEndReason;
}

// `localStorage` throws when it is blocked (private browsing, storage-partitioned frame)
// or out of quota. Everything here is analytics-only and runs inside logout and sign-in,
// so each access degrades to a no-op rather than aborting those flows.
function safeGetItem({ key }: { key: string }): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem({ key, value }: { key: string; value: string }): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A lost write only costs attribution data points, never a broken auth flow.
  }
}

function safeRemoveItem({ key }: { key: string }): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // A breadcrumb that can't be cleared still expires on its own via the TTL.
  }
}

export function markDemoOrigin({ reason }: { reason: DemoEndReason }): void {
  const origin: DemoOrigin = { endedAt: Date.now(), reason };
  safeSetItem({ key: DEMO_ORIGIN_KEY, value: JSON.stringify(origin) });
}

/**
 * Whether a non-demo account has signed in on this device.
 * `consumeDemoOriginProperties` gates attribution on it.
 */
export function hasSignedInOnDevice(): boolean {
  return safeGetItem({ key: DEVICE_SIGN_IN_KEY }) !== null;
}

export function markSignedInOnDevice(): void {
  safeSetItem({ key: DEVICE_SIGN_IN_KEY, value: 'true' });
}

/**
 * `posthog.reset()` on logout leaves the demo visitor and the new account on unrelated
 * distinct IDs; this is the only bridge for a conversion rate. Clears the breadcrumb
 * regardless of `isFirstSignInOnDevice`, since it describes one demo session, not the device.
 */
export function consumeDemoOriginProperties({
  isFirstSignInOnDevice,
}: {
  isFirstSignInOnDevice: boolean;
}): Record<string, unknown> {
  const stored = safeGetItem({ key: DEMO_ORIGIN_KEY });
  if (!stored) return {};

  safeRemoveItem({ key: DEMO_ORIGIN_KEY });
  if (!isFirstSignInOnDevice) return {};

  let origin: DemoOrigin;
  try {
    origin = JSON.parse(stored) as DemoOrigin;
  } catch {
    return {};
  }

  if (typeof origin?.endedAt !== 'number') return {};

  const elapsedMs = Date.now() - origin.endedAt;
  if (elapsedMs < 0 || elapsedMs > DEMO_ORIGIN_TTL_MS) return {};

  return {
    came_from_demo: true,
    demo_end_reason: origin.reason,
    minutes_since_demo: Math.round(elapsedMs / 60_000),
  };
}
