import { z } from 'zod';

// Domain string: no protocol, no spaces, no slashes, max 253 chars (RFC 1035).
// null is valid – the user explicitly wants no logo while keeping manual source.
export const logoDomainSchema = z
  .string()
  .trim()
  .max(253)
  .regex(/^[^\s/]+$/, 'logoDomain must not contain spaces or slashes')
  .nullable();
