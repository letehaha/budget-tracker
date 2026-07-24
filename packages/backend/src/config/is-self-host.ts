/**
 * True when this instance runs as a self-hosted deployment (`IS_SELF_HOST=true`).
 *
 * Read at call time (not a module-load constant) so it reflects the current
 * `process.env` — tests toggle the flag between cases. Only the exact string
 * `'true'` enables it; anything else (unset, empty, `'false'`) is off, matching
 * how cloud runs by default.
 */
export function isSelfHost(): boolean {
  return process.env.IS_SELF_HOST === 'true';
}
