// No endpoint hashes an email, so the TS half calls `hashEmail` directly; the SQL half needs a live DB.
import { describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';
import { hashEmail } from '@services/user/signups-open.service';

/** The migration's backfill expression, verbatim (20260912000000-add-billing.ts). */
const sqlEmailHash = async ({ email }: { email: string }): Promise<string> => {
  const [[row]] = (await connection.sequelize.query(
    `SELECT encode(sha256(convert_to(
       CASE
         WHEN split_part(lower(btrim(:email)), '@', 2) IN ('gmail.com', 'googlemail.com')
         THEN replace(regexp_replace(split_part(lower(btrim(:email)), '@', 1), '\\+.*$', ''), '.', '') || '@gmail.com'
         ELSE regexp_replace(split_part(lower(btrim(:email)), '@', 1), '\\+.*$', '') || '@' || split_part(lower(btrim(:email)), '@', 2)
       END, 'UTF8')), 'hex') AS hash`,
    { replacements: { email } },
  )) as [[{ hash: string }], unknown];

  return row.hash;
};

describe('Signup ledger email hashing', () => {
  const fixtures = [
    'plain@example.com',
    'TESTUSER@Example.COM',
    '  spaced@example.com  ',
    'some.one+tag@example.com',
    'Test.User+tag@GMAIL.com',
    'test.user@googlemail.com',
    'testuser@gmail.com',
  ];

  it.each(fixtures)('hashes %s identically in TypeScript and in the migration SQL', async (email) => {
    expect(hashEmail({ email })).toBe(await sqlEmailHash({ email }));
  });

  it('collapses gmail aliases onto one hash', async () => {
    const canonical = hashEmail({ email: 'testuser@gmail.com' });

    expect(hashEmail({ email: 'Test.User+tag@GMAIL.com' })).toBe(canonical);
    expect(hashEmail({ email: 'test.user@googlemail.com' })).toBe(canonical);
    expect(hashEmail({ email: 'some.one@example.com' })).not.toBe(hashEmail({ email: 'someone@example.com' }));
  });
});
