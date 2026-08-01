import { ValidationError } from '@js/errors';
import { type SettingsPatchSchema, ZodSettingsSchema } from '@models/user-settings.model';

import { withTransaction } from '../common/with-transaction';
import { getOrCreateUserSettings } from './get-or-create-user-settings';
import { type RedactedSettingsSchema, redactKeyMaterial } from './redact-key-material';
import { mergeIntoStoredSettings, stripServiceOwnedSlices } from './service-owned-slices';

/**
 * Applies a partial settings update: only keys present in `patch` change. Prefer it over the
 * full update endpoint, which sends the whole object and loses concurrent writes from other
 * tabs.
 */
export const patchUserSettings = withTransaction(
  async ({ userId, patch }: { userId: number; patch: SettingsPatchSchema }): Promise<RedactedSettingsSchema> => {
    const safePatch = stripServiceOwnedSlices({ settings: patch });

    // Ensure the row exists (race-safe), then serialize the read-modify-write:
    // FOR UPDATE when it already existed, or exclusive-by-being-uncommitted
    // (guarded by the unique index) when this call inserted it. A bare FOR
    // UPDATE can't help the first write for a fresh user — no row to lock yet.
    const [existing] = await getOrCreateUserSettings({ userId, lock: true });

    const merged = mergeIntoStoredSettings({ stored: existing.settings, incoming: safePatch });

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

    return redactKeyMaterial({ settings: existing.settings });
  },
);
