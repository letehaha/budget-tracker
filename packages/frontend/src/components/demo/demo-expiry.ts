import { DEMO_EXPIRY_HOURS } from '@bt/shared/const/demo';
import { USER_ROLES, type UserModel } from '@bt/shared/types';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

type DemoExpiryUser = Pick<UserModel, 'role' | 'createdAt'>;

/**
 * Demo accounts expire a fixed window after creation. Anchoring to `createdAt`
 * (instead of a client-side flag) keeps the countdown correct after a reload
 * and regardless of how the demo session was started.
 */
export function getDemoExpiresAt(user: DemoExpiryUser | null | undefined): number | null {
  if (!user || user.role !== USER_ROLES.demo) return null;
  return new Date(user.createdAt).getTime() + DEMO_EXPIRY_HOURS * MS_PER_HOUR;
}

export interface DemoTimeRemaining {
  hours: number;
  minutes: number;
}

/**
 * Splits the time left before `expiresAt` into whole hours/minutes.
 * Returns null once the deadline has passed so the caller can hide the countdown.
 */
export function getDemoTimeRemaining({
  expiresAt,
  now,
}: {
  expiresAt: number | null;
  now: number;
}): DemoTimeRemaining | null {
  if (expiresAt === null) return null;

  const remainingMs = expiresAt - now;
  if (remainingMs <= 0) return null;

  return {
    hours: Math.floor(remainingMs / MS_PER_HOUR),
    minutes: Math.floor((remainingMs % MS_PER_HOUR) / MS_PER_MINUTE),
  };
}
