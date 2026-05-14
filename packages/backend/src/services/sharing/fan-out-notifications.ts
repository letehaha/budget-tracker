import { logger } from '@js/utils/logger';

/**
 * Best-effort post-commit notification fan-out. Iterates `targets`, runs `notify` for each,
 * and isolates failures with `logger.error` (stable `code` for ops dashboards). Returns the
 * count of successful notifications so callers can log a per-batch summary if needed.
 *
 * Centralized here because the same try/catch + stable-code shape was duplicated across
 * account-delete cleanup, user-delete fan-out (×3), and expire-invitations.
 */
export async function fanOutNotifications<T>({
  targets,
  notify,
  errorCode,
  errorMessage,
  buildLogContext,
}: {
  targets: T[];
  notify: (target: T) => Promise<unknown>;
  /** Stable code used to group failures in Sentry / log dashboards. */
  errorCode: string;
  /** Human-readable message paired with the error in the structured log. */
  errorMessage: string;
  /** Per-target context fields merged into the failure log line (shareId, userId, …). */
  buildLogContext: (target: T) => Record<string, unknown>;
}): Promise<number> {
  let notifiedCount = 0;
  for (const target of targets) {
    try {
      await notify(target);
      notifiedCount += 1;
    } catch (error) {
      logger.error({ message: errorMessage, error: error as Error }, { code: errorCode, ...buildLogContext(target) });
    }
  }
  return notifiedCount;
}
