import type { DemoEndReason } from './posthog';

// Breadcrumb left on the device when a demo session ends, so the real account that may
// follow can be attributed back to it.
const DEMO_ORIGIN_KEY = 'demo-origin';
// A signup further than this from the demo is treated as unrelated to it.
const DEMO_ORIGIN_TTL_MS = 24 * 60 * 60 * 1000;

interface DemoOrigin {
  endedAt: number;
  reason: DemoEndReason;
}

export function markDemoOrigin({ reason }: { reason: DemoEndReason }): void {
  const origin: DemoOrigin = { endedAt: Date.now(), reason };
  localStorage.setItem(DEMO_ORIGIN_KEY, JSON.stringify(origin));
}

/**
 * Reads and clears the breadcrumb, returning person properties that link a fresh
 * account back to the demo session it followed.
 *
 * `posthog.reset()` on logout and the server-side deletion of the demo user leave the
 * demo visitor and the account they sign up with as two unrelated distinct IDs, so
 * conversion is not otherwise computable.
 *
 * `isFirstSignInOnDevice` gates the attribution: someone returning to an account they
 * already use on this device, having poked at the demo in between, is not a conversion.
 * The breadcrumb is consumed either way — it describes one demo session, not a standing
 * property of the device.
 */
export function consumeDemoOriginProperties({
  isFirstSignInOnDevice,
}: {
  isFirstSignInOnDevice: boolean;
}): Record<string, unknown> {
  const stored = localStorage.getItem(DEMO_ORIGIN_KEY);
  if (!stored) return {};

  localStorage.removeItem(DEMO_ORIGIN_KEY);
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
