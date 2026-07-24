import { describe, expect, it } from '@jest/globals';

import { describeRestoreError } from './describe-restore-error';

/**
 * `describeRestoreError` is the pure translator from a raw restore failure into
 * the user-facing message the failed job surfaces. Sequelize hides the offending
 * table/column behind a bare "Validation error", so the important behavior is
 * exactly what these tests assert: the field list and the Postgres
 * constraint/detail get pulled into the message, while the original error is
 * carried as `cause` (and its stack preserved) for Sentry.
 */
describe('describeRestoreError', () => {
  it('surfaces the field list and pg constraint/detail from a Sequelize unique-constraint error', () => {
    const original = Object.assign(new Error('Validation error'), {
      name: 'SequelizeUniqueConstraintError',
      errors: [{ path: 'email', message: 'email must be unique' }],
      parent: {
        table: 'users',
        constraint: 'users_email_key',
        detail: 'Key (email)=(a@b.com) already exists.',
      },
    });

    const result = describeRestoreError({ err: original });

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('Backup restore failed:');
    // Name + message prefix (name is not the default `Error`).
    expect(result.message).toContain('SequelizeUniqueConstraintError: Validation error');
    // Extracted field list.
    expect(result.message).toContain('[email: email must be unique]');
    // Extracted Postgres table / constraint / detail.
    expect(result.message).toContain('table=users');
    expect(result.message).toContain('constraint=users_email_key');
    expect(result.message).toContain('detail=Key (email)=(a@b.com) already exists.');
    // The raw error is carried through for the failed-job logger / Sentry.
    expect(result.cause).toBe(original);
    expect(result.stack).toBe(original.stack);
  });

  it('lists notNull violation fields, falling back to `?` for a field with no path', () => {
    const original = Object.assign(new Error('notNull Violation: accounts.name cannot be null'), {
      name: 'SequelizeValidationError',
      errors: [
        { path: 'name', message: 'accounts.name cannot be null' },
        // A validation item with no `path` still renders (as `?`) rather than being dropped.
        { message: 'currencyCode cannot be null' },
      ],
    });

    const result = describeRestoreError({ err: original });

    expect(result.message).toContain('SequelizeValidationError: notNull Violation: accounts.name cannot be null');
    expect(result.message).toContain('[name: accounts.name cannot be null]');
    expect(result.message).toContain('[?: currencyCode cannot be null]');
  });

  it('reads table/constraint/detail from a raw pg error surfaced via `original`', () => {
    const original = Object.assign(new Error('insert or update violates foreign key constraint'), {
      name: 'SequelizeForeignKeyConstraintError',
      original: {
        table: 'transactions',
        constraint: 'transactions_account_fk',
        detail: 'Key (accountId)=(7) is not present in table "accounts".',
      },
    });

    const result = describeRestoreError({ err: original });

    expect(result.message).toContain('table=transactions');
    expect(result.message).toContain('constraint=transactions_account_fk');
    expect(result.message).toContain('detail=Key (accountId)=(7) is not present in table "accounts".');
    // No `errors` array on this error → no bracketed field list is emitted.
    expect(result.message).not.toContain('[');
  });

  it('wraps a non-Error input into a plain failure message without a cause', () => {
    const result = describeRestoreError({ err: 'boom' });

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Backup restore failed: boom');
    // The non-Error path never sets a `cause`.
    expect(result.cause).toBeUndefined();
  });
});
