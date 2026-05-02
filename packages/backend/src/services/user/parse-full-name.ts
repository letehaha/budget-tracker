// Each name field is varchar(255) in the DB; cap well below that so a single
// pathological OAuth input can't blow up the insert.
const MAX_FIELD_LENGTH = 100;

const cap = (value: string): string => value.slice(0, MAX_FIELD_LENGTH);

/**
 * Splits an OAuth-style full name into first / middle / last components.
 *
 * Conventions:
 *  - 0 tokens (empty / whitespace-only / non-string): returns {}
 *  - 1 token: { firstName }
 *  - 2 tokens: { firstName, lastName }
 *  - 3+ tokens: { firstName, middleName: <everything in between>, lastName }
 *
 * Original casing is preserved — this is a "display" representation,
 * unlike `slugifyUsername` which produces a normalized identity slug.
 *
 * Punctuation is left alone (e.g. "Mary-Jane" stays as-is). Leading/trailing
 * whitespace is trimmed; runs of inner whitespace collapse to single spaces.
 *
 * Each output field is capped at 100 chars so a pathologically long input
 * never overflows the DB column (Users.firstName/lastName are varchar(255)).
 */
export function parseFullName(input: string | null | undefined): {
  firstName?: string;
  middleName?: string;
  lastName?: string;
} {
  if (typeof input !== 'string') return {};

  const trimmed = input.trim();
  if (!trimmed) return {};

  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: cap(parts[0]!) };
  if (parts.length === 2) return { firstName: cap(parts[0]!), lastName: cap(parts[1]!) };

  return {
    firstName: cap(parts[0]!),
    middleName: cap(parts.slice(1, -1).join(' ')),
    lastName: cap(parts[parts.length - 1]!),
  };
}
