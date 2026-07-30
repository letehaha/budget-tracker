import { DEMO_EXPIRY_HOURS } from '@bt/shared/const/demo';
import { USER_ROLES, type UserModel } from '@bt/shared/types';
import { addHours } from 'date-fns';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

type DemoExpiryUser = Pick<UserModel, 'role' | 'createdAt'>;

/**
 * Demo accounts expire a fixed window after `createdAt`. Anchoring to that field, not a
 * client-side flag, keeps the countdown correct across a reload and any session start flow.
 */
export function getDemoExpiresAt({ user }: { user: DemoExpiryUser | null | undefined }): number | null {
  if (!user || user.role !== USER_ROLES.demo) return null;
  return addHours(new Date(user.createdAt), DEMO_EXPIRY_HOURS).getTime();
}

interface DemoTimeRemaining {
  hours: number;
  minutes: number;
}

/** Returns null past `expiresAt` so the caller can hide the countdown. */
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
