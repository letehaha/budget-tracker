const FALLBACK = 'user';

// Hard cap to keep usernames short enough that, after retry-suffix is
// appended (`-${8 hex chars}` = 9 extra chars), the total stays well under
// the Users.username varchar(255) DB limit.
const MAX_LENGTH = 64;

/**
 * Reduce an arbitrary user-provided string (OAuth `name`, email prefix, etc.)
 * to a URL-safe identity slug. Returns the literal `'user'` when the input
 * slugifies to empty (e.g. emoji-only or non-Latin scripts that don't
 * survive ASCII filtering).
 */
export function slugifyUsername(input: string | null | undefined): string {
  if (typeof input !== 'string') return FALLBACK;

  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks (U+0300-U+036F)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) return FALLBACK;

  return slug.slice(0, MAX_LENGTH).replace(/-+$/g, '') || FALLBACK;
}
