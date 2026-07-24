type SequelizeLike = {
  name?: string;
  message?: string;
  errors?: Array<{ message?: string; path?: string }>;
  parent?: { constraint?: string; detail?: string; table?: string };
  original?: { constraint?: string; detail?: string; table?: string };
};

/**
 * Turn a restore failure into an actionable message. Sequelize renders a bare
 * "Validation error" for unique/notNull failures, hiding which table and column
 * broke; a user whose restore fails needs to know that, so we pull the field
 * list and the Postgres constraint/detail out of the error.
 */
export function describeRestoreError({ err }: { err: unknown }): Error {
  if (!(err instanceof Error)) return new Error(`Backup restore failed: ${String(err)}`);

  const e = err as Error & SequelizeLike;
  const parts: string[] = [e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : (e.message ?? '')];

  if (Array.isArray(e.errors)) {
    for (const item of e.errors) parts.push(`[${item.path ?? '?'}${item.message ? `: ${item.message}` : ''}]`);
  }
  const pg = e.parent ?? e.original;
  if (pg?.table) parts.push(`table=${pg.table}`);
  if (pg?.constraint) parts.push(`constraint=${pg.constraint}`);
  if (pg?.detail) parts.push(`detail=${pg.detail}`);

  // Keep the detailed user-facing message but carry the original error so the
  // failed-job logger / Sentry still get the real stack for a non-Sequelize bug
  // (a plain wrapper would report only this function's frames).
  const wrapped = new Error(`Backup restore failed: ${parts.filter(Boolean).join(' ')}`, { cause: err });
  if (e.stack) wrapped.stack = e.stack;
  return wrapped;
}
