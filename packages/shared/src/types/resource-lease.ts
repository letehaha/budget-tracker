/**
 * Lease contract for server-held resources that are deleted once the user stops
 * working with them — a parsed upload waiting for the user to finish a wizard,
 * for example.
 *
 * The server hands out an `expiresAt` that the client extends by calling a
 * refresh endpoint while the user is actually interacting. `maxExpiresAt` is the
 * ceiling no amount of refreshing can push past, so a tab left open overnight
 * still releases the resource.
 *
 * Countdowns must be anchored on the relative durations, not the instants: the
 * instants are only meaningful against the server's clock, so a client running
 * minutes fast would read a lease it was just handed as already dead and never
 * recover. The instants are for display and logging.
 */

export interface ResourceLease {
  /** ISO instant the resource is dropped at unless the client refreshes first. */
  expiresAt: string;
  /** ISO instant that refreshing can never extend beyond. */
  maxExpiresAt: string;
  /** Milliseconds left until `expiresAt`, measured server-side as the response is built. */
  expiresInMs: number;
  /** Milliseconds left until `maxExpiresAt`, measured server-side as the response is built. */
  maxExpiresInMs: number;
}

/**
 * How often an active client should refresh a lease. Every user interaction is
 * throttled down to this cadence, so holding a lease costs one small request per
 * interval no matter how much the user clicks.
 */
export const RESOURCE_LEASE_REFRESH_INTERVAL_MS = 30 * 1000;

/**
 * How long a user must be idle before the UI stops refreshing and starts showing
 * the real countdown. Refreshing and counting down are mutually exclusive, which
 * is what keeps the displayed time from jumping backwards as it ticks.
 */
export const RESOURCE_LEASE_IDLE_AFTER_MS = 2 * 60 * 1000;

/**
 * Kinds of leased resource. The server keeps a registry keyed by these values,
 * so a refresh request names a kind the server already knows rather than
 * anything the caller invents.
 */
export enum ResourceLeaseType {
  msMoneyUpload = 'ms-money-upload',
  ofxUpload = 'ofx-upload',
}

export interface RefreshResourceLeaseRequest {
  type: ResourceLeaseType;
  id: string;
}

export type RefreshResourceLeaseResponse = ResourceLease;
