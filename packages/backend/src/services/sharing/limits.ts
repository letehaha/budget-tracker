import { SHARING_LIMITS } from '@bt/shared/types';

/**
 * Per-environment cap on the number of pending invitations a single owner can have for
 * one resource. Lower in test so cap-boundary cases stay cheap to exercise; the dev/prod
 * value is the real abuse-prevention limit. See PRD F11.
 */
export const getMaxPendingInvitationsPerResource = (): number =>
  process.env.NODE_ENV === 'test'
    ? SHARING_LIMITS.maxPendingInvitationsPerResourceTest
    : SHARING_LIMITS.maxPendingInvitationsPerResource;

/**
 * Per-environment cap on the number of invitations a single owner can send in any 24h
 * window across all their resources. Test value is tighter so the boundary is cheap to
 * exercise; dev/prod uses the PRD F11 figure (30).
 */
export const getMaxSendInvitationsPerOwnerPer24h = (): number =>
  process.env.NODE_ENV === 'test'
    ? SHARING_LIMITS.sendInvitationsPerOwnerPer24hTest
    : SHARING_LIMITS.sendInvitationsPerOwnerPer24h;
