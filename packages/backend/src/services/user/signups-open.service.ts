import { connection } from '@models/index';

/**
 * SYSTEM_MAX_SIGNUPS_ALLOWED caps the CURRENT ba_user count, so deleting a
 * user frees a slot. Unset or non-numeric means unlimited; 0 blocks all signups.
 * The env var is read per call, not at boot, so tests can toggle it.
 */
export async function areSignupsOpen(): Promise<boolean> {
  const raw = process.env.SYSTEM_MAX_SIGNUPS_ALLOWED;
  if (raw === undefined || raw === '') return true;

  const max = Number(raw);
  if (!Number.isFinite(max)) return true;

  const [[row]] = (await connection.sequelize.query('SELECT COUNT(*)::int AS count FROM ba_user')) as [
    [{ count: number }],
    unknown,
  ];
  return row.count < max;
}
