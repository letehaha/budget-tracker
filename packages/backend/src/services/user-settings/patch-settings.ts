import { ValidationError } from '@js/errors';
import { type SettingsPatchSchema, type SettingsSchema, ZodSettingsSchema } from '@models/user-settings.model';

import { withTransaction } from '../common/with-transaction';
import { getOrCreateUserSettings } from './get-or-create-user-settings';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Recursively merges `patch` into `base`. Plain objects merge key-by-key;
 * arrays, primitives and `null` replace the stored value wholesale (an array
 * in a patch is always the full desired list, never an append). `undefined`
 * values are skipped, so an absent key can never erase stored data.
 */
const deepMerge = ({
  base,
  patch,
}: {
  base: Record<string, unknown>;
  patch: Record<string, unknown>;
}): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    const current = result[key];
    result[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge({ base: current, patch: value }) : value;
  }

  return result;
};

/**
 * Applies a partial settings update: only the keys present in `patch` change,
 * everything else stays as stored. This is what clients should use for slice
 * updates (e.g. `ui.transactionsTable.mobileView`) — sending the whole
 * settings object via the full update endpoint loses concurrent writes from
 * other tabs or in-flight mutations.
 *
 * The merged result is validated against `ZodSettingsSchema`, so a patch can
 * never leave invalid settings behind.
 */
export const patchUserSettings = withTransaction(
  async ({ userId, patch }: { userId: number; patch: SettingsPatchSchema }): Promise<SettingsSchema> => {
    // Onboarding has its own endpoint with dedicated merge semantics.
    // `ZodSettingsPatchSchema` already strips the key; this guards direct
    // service callers the same way the full update service does.
    const { onboarding: _onboarding, ...patchWithoutOnboarding } = patch as Record<string, unknown>;

    // Ensure the row exists (race-safe), then serialize the read-modify-write:
    // FOR UPDATE when it already existed, or exclusive-by-being-uncommitted
    // (guarded by the unique index) when this call inserted it. A bare FOR
    // UPDATE can't help the first write for a fresh user — no row to lock yet.
    const [existing] = await getOrCreateUserSettings({ userId, lock: true });

    const base = existing.settings as Record<string, unknown>;
    const merged = deepMerge({ base, patch: patchWithoutOnboarding });

    const parsed = ZodSettingsSchema.safeParse(merged);
    if (!parsed.success) {
      throw new ValidationError({
        message: 'Patched settings do not match the settings schema',
        details: { issues: parsed.error.issues },
      });
    }

    existing.settings = parsed.data;
    existing.changed('settings', true);
    await existing.save();

    return existing.settings;
  },
);
