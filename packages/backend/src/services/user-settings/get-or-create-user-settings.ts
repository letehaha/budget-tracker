import UserSettings, { DEFAULT_SETTINGS, type SettingsSchema } from '@models/user-settings.model';

import { insertOrAdopt } from '../common/run-in-savepoint';

/**
 * Fetch the caller's single UserSettings row, creating it lazily if absent.
 *
 * On a fresh user two concurrent first-writes can both observe no row. The
 * unique `userId` index turns that into a constraint violation on the loser's
 * INSERT; `insertOrAdopt` isolates the INSERT in a savepoint and, on violation,
 * adopts the winner's row instead of aborting the surrounding transaction.
 * Must run inside an ambient (CLS) transaction — every caller is
 * `withTransaction`-wrapped.
 *
 * @returns `[row, created]` like `findOrCreate`; `created` is true only when
 *   this call's own INSERT won the race.
 */
export const getOrCreateUserSettings = async ({
  userId,
  defaults = DEFAULT_SETTINGS,
  lock = false,
}: {
  userId: number;
  /** Settings JSONB to seed a fresh row. Ignored when a row already exists. */
  defaults?: SettingsSchema;
  /** SELECT ... FOR UPDATE so a concurrent read-modify-write serializes. */
  lock?: boolean;
}): Promise<[UserSettings, boolean]> => {
  const findOptions = { where: { userId }, ...(lock ? { lock: true as const } : {}) };

  const existing = await UserSettings.findOne(findOptions);
  if (existing) return [existing, false];

  let created = false;
  const row = await insertOrAdopt({
    insert: async () => {
      const inserted = await UserSettings.create({ userId, settings: defaults });
      created = true;
      return inserted;
    },
    adopt: () => UserSettings.findOne(findOptions),
  });

  return [row, created];
};
