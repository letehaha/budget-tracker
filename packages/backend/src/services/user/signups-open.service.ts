import { isSelfHost } from '@config/is-self-host';
import { logger } from '@js/utils/logger';
import { connection } from '@models/index';
import SignupLedger from '@models/signup-ledger.model';
import { createHash } from 'crypto';

/** Lowercase, drop `+alias`, and for gmail drop dots – all of those deliver to one inbox. */
const normalizeEmail = ({ email }: { email: string }): string => {
  const [rawLocal = '', rawDomain = ''] = email.trim().toLowerCase().split('@');
  let local = rawLocal.replace(/\+.*$/, '');
  let domain = rawDomain;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
};

export const hashEmail = ({ email }: { email: string }): string =>
  createHash('sha256').update(normalizeEmail({ email })).digest('hex');

/**
 * Idempotent. `firstSeenAt` is when this email was first seen, which the trial window is
 * measured from — the ledger outlives account deletion, so re-signing up cannot restart a
 * trial. `created` tells the caller whether this call inserted the row, so a failed signup
 * can free the slot again.
 */
export const recordSignup = async ({ email }: { email: string }): Promise<{ firstSeenAt: Date; created: boolean }> => {
  const [row, created] = await SignupLedger.findOrCreate({
    where: { emailHash: hashEmail({ email }) },
  });
  return { firstSeenAt: row.firstSeenAt, created };
};

export const forgetSignup = async ({ email }: { email: string }): Promise<void> => {
  await SignupLedger.destroy({ where: { emailHash: hashEmail({ email }) } });
};

/**
 * SYSTEM_MAX_SIGNUPS_ALLOWED: on cloud it caps signups ever seen (the ledger), so
 * deleting a user does not free a trial slot. Self-host counts live users, so a
 * "just me" instance can delete and re-create its account. Unset or non-numeric
 * means unlimited; 0 blocks all signups. Read per call so tests can toggle it.
 */
export async function areSignupsOpen(): Promise<boolean> {
  const raw = process.env.SYSTEM_MAX_SIGNUPS_ALLOWED;
  if (raw === undefined || raw === '') return true;

  const max = Number(raw);
  if (!Number.isFinite(max)) {
    logger.error(`SYSTEM_MAX_SIGNUPS_ALLOWED is not a number ("${raw}"); signups stay unlimited.`);
    return true;
  }

  if (!isSelfHost()) return (await SignupLedger.count()) < max;

  const [[row]] = (await connection.sequelize.query('SELECT COUNT(*)::int AS count FROM ba_user')) as [
    [{ count: number }],
    unknown,
  ];
  return row.count < max;
}
