import { ValidationError } from '@js/errors';
import { type SettingsPatchSchema, type SettingsSchema, ZodSettingsSchema } from '@models/user-settings.model';
import mergeWith from 'lodash/mergeWith';

import { withTransaction } from '../common/with-transaction';
import { getOrCreateUserSettings } from './get-or-create-user-settings';

/**
 * Applies a partial settings update: only keys present in `patch` change. Use it
 * for slice updates like `ui.transactionsTable.mobileView`; the full update
 * endpoint sends the whole object and loses concurrent writes from other tabs.
 * The merged result is validated against `ZodSettingsSchema`.
 */
export const patchUserSettings = withTransaction(
  async ({ userId, patch }: { userId: number; patch: SettingsPatchSchema }): Promise<SettingsSchema> => {
    // Onboarding and AI custom endpoints are owned by their own endpoints, which
    // apply merge semantics and validation this wholesale merge cannot.
    const { onboarding: _onboarding, ai, ...patchRest } = patch as Record<string, unknown>;
    const safePatch: Record<string, unknown> = { ...patchRest };
    if (ai && typeof ai === 'object') {
      const { customEndpoints: _customEndpoints, ...aiRest } = ai as Record<string, unknown>;
      safePatch.ai = aiRest;
    }

    // Ensure the row exists (race-safe), then serialize the read-modify-write:
    // FOR UPDATE when it already existed, or exclusive-by-being-uncommitted
    // (guarded by the unique index) when this call inserted it. A bare FOR
    // UPDATE can't help the first write for a fresh user — no row to lock yet.
    const [existing] = await getOrCreateUserSettings({ userId, lock: true });

    const base = existing.settings as Record<string, unknown>;
    // Empty target keeps `base` unmutated. lodash recurses objects, replaces
    // primitives/null and skips `undefined`, so an absent key never erases. The
    // customizer replaces arrays wholesale: a patch array is the full list.
    const merged = mergeWith({}, base, safePatch, (_current, incoming) =>
      Array.isArray(incoming) ? incoming : undefined,
    );

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
