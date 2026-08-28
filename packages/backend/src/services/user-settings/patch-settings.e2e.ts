import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import UserSettings, { SettingsSchema } from '@models/user-settings.model';
import * as helpers from '@tests/helpers';

describe('Patch user settings', () => {
  it('creates settings from defaults when the user has none stored yet', async () => {
    const patched = await helpers.patchUserSettings({
      raw: true,
      patch: { ui: { transactionsTable: { mobileView: 'list' } } },
    });

    expect(patched.locale).toBe('en');
    expect(patched.ui?.transactionsTable?.mobileView).toBe('list');

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched).toStrictEqual(patched);
  });

  it('changes only the patched slice and preserves sibling fields', async () => {
    const initialSettings: SettingsSchema = {
      locale: 'en',
      includeCreditLimitInStats: true,
      ui: {
        transactionsTable: {
          visibleColumns: ['date', 'amount'],
          columnOrder: ['date', 'amount', 'note'],
          mobileView: 'table',
        },
      },
    };
    await helpers.updateUserSettings({ raw: true, settings: initialSettings });

    const patched = await helpers.patchUserSettings({
      raw: true,
      patch: { ui: { transactionsTable: { extraFilters: ['type', 'tags'] } } },
    });

    expect(patched.ui?.transactionsTable).toStrictEqual({
      visibleColumns: ['date', 'amount'],
      columnOrder: ['date', 'amount', 'note'],
      mobileView: 'table',
      extraFilters: ['type', 'tags'],
    });
    expect(patched.includeCreditLimitInStats).toBe(true);
    expect(patched.locale).toBe('en');
  });

  it('two patches to different slices do not clobber each other', async () => {
    await helpers.patchUserSettings({
      raw: true,
      patch: { ui: { transactionsTable: { visibleColumns: ['date'], columnOrder: ['date'] } } },
    });
    await helpers.patchUserSettings({
      raw: true,
      patch: { ui: { transactionsTable: { mobileView: 'table' } } },
    });

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.ui?.transactionsTable).toStrictEqual({
      visibleColumns: ['date'],
      columnOrder: ['date'],
      mobileView: 'table',
    });
  });

  it('replaces arrays wholesale instead of appending', async () => {
    await helpers.patchUserSettings({
      raw: true,
      patch: { ui: { transactionsTable: { extraFilters: ['type', 'tags'] } } },
    });
    await helpers.patchUserSettings({
      raw: true,
      patch: { ui: { transactionsTable: { extraFilters: ['note'] } } },
    });

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.ui?.transactionsTable?.extraFilters).toStrictEqual(['note']);
  });

  it('rejects a patch that would make settings invalid and keeps stored value intact', async () => {
    await helpers.updateUserSettings({ raw: true, settings: { locale: 'uk' } });

    const response = await helpers.patchUserSettings({
      patch: { ui: { transactionsTable: { mobileView: 'grid' } } },
    });
    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.locale).toBe('uk');
    expect(fetched.ui).toBeUndefined();
  });

  it('ignores the onboarding key — it has a dedicated endpoint', async () => {
    const patched = await helpers.patchUserSettings({
      raw: true,
      patch: { onboarding: { isDismissed: true }, includeCreditLimitInStats: true },
    });

    expect(patched.onboarding).toBeUndefined();
    expect(patched.includeCreditLimitInStats).toBe(true);
  });

  it('persists a saved pivot view and defaults heatmap to false and showDelta to true when omitted', async () => {
    const viewId = generateRandomRecordId();
    const patched = await helpers.patchUserSettings({
      raw: true,
      patch: {
        savedPivotViews: [
          {
            id: viewId,
            name: 'Monthly expenses by category',
            config: {
              rowDimension: 'category',
              granularity: 'monthly',
              measure: 'expense',
              from: '2025-01-01',
              to: '2025-12-31',
              // heatmap and showDelta intentionally omitted — heatmap defaults to false, showDelta to true.
            },
          },
        ],
      },
    });

    expect(patched.savedPivotViews).toHaveLength(1);
    const patchedView = patched.savedPivotViews![0]!;
    expect(patchedView.id).toBe(viewId);
    expect(patchedView.name).toBe('Monthly expenses by category');
    expect(patchedView.config.rowDimension).toBe('category');
    expect(patchedView.config.granularity).toBe('monthly');
    expect(patchedView.config.measure).toBe('expense');
    expect(patchedView.config.from).toBe('2025-01-01');
    expect(patchedView.config.to).toBe('2025-12-31');
    expect(patchedView.config.heatmap).toBe(false);
    expect(patchedView.config.showDelta).toBe(true);

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.savedPivotViews).toStrictEqual(patched.savedPivotViews);
  });

  it('rejects invalid patch payloads', async () => {
    const validPivotConfig = {
      rowDimension: 'category' as const,
      granularity: 'monthly' as const,
      measure: 'expense' as const,
      from: '2025-01-01',
      to: '2025-12-31',
    };

    const invalidPatches: Record<string, unknown>[] = [
      { savedPivotViews: [{ id: generateRandomRecordId(), name: '', config: validPivotConfig }] },
      { savedPivotViews: [{ id: generateRandomRecordId(), name: 'a'.repeat(121), config: validPivotConfig }] },
      { import: { recalculateAccountBalance: 'yes' } },
      { accounts: { defaultAccountId: 'not-a-uuid' } },
      { accounts: { showArchivedInDropdowns: 'yes' } },
    ];

    for (const patch of invalidPatches) {
      const response = await helpers.patchUserSettings({ patch });
      expect({ patch, statusCode: response.statusCode }).toStrictEqual({
        patch,
        statusCode: ERROR_CODES.ValidationError,
      });
    }
  });

  it('persists the import.recalculateAccountBalance setting and reads it back', async () => {
    const patched = await helpers.patchUserSettings({
      raw: true,
      patch: { import: { recalculateAccountBalance: true } },
    });
    expect(patched.import?.recalculateAccountBalance).toBe(true);

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.import?.recalculateAccountBalance).toBe(true);

    // Toggling back off persists too.
    const toggledOff = await helpers.patchUserSettings({
      raw: true,
      patch: { import: { recalculateAccountBalance: false } },
    });
    expect(toggledOff.import?.recalculateAccountBalance).toBe(false);
  });

  it('persists category mapping presets and reads them back', async () => {
    const preset = {
      fingerprint: 'a'.repeat(64),
      name: 'PKO Bank',
      categoryMapping: {
        Groceries: { action: 'link-existing', categoryId: generateRandomRecordId() },
        Fuel: { action: 'create-new' },
      },
      updatedAt: new Date().toISOString(),
    };

    const patched = await helpers.patchUserSettings({
      raw: true,
      patch: { import: { categoryMappingPresets: [preset] } },
    });
    expect(patched.import?.categoryMappingPresets).toStrictEqual([preset]);

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.import?.categoryMappingPresets).toStrictEqual([preset]);
  });

  it('rejects invalid category mapping presets', async () => {
    const validPreset = { fingerprint: 'a'.repeat(64), categoryMapping: {}, updatedAt: new Date().toISOString() };

    const missingCategoryId = await helpers.patchUserSettings({
      patch: {
        import: {
          categoryMappingPresets: [{ ...validPreset, categoryMapping: { Groceries: { action: 'link-existing' } } }],
        },
      },
    });
    expect(missingCategoryId.statusCode).toBe(ERROR_CODES.ValidationError);

    const blankName = await helpers.patchUserSettings({
      patch: { import: { categoryMappingPresets: [{ ...validPreset, name: '' }] } },
    });
    expect(blankName.statusCode).toBe(ERROR_CODES.ValidationError);

    const overCap = await helpers.patchUserSettings({
      patch: {
        import: {
          categoryMappingPresets: Array.from({ length: 21 }, (_, index) => ({
            ...validPreset,
            fingerprint: `fingerprint-${index}`,
          })),
        },
      },
    });
    expect(overCap.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('persists, merges and clears the accounts slice', async () => {
    const accountId = generateRandomRecordId();

    const patched = await helpers.patchUserSettings({
      raw: true,
      patch: { accounts: { defaultAccountId: accountId, showArchivedInDropdowns: true } },
    });
    expect(patched.accounts).toStrictEqual({ defaultAccountId: accountId, showArchivedInDropdowns: true });

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.accounts).toStrictEqual({ defaultAccountId: accountId, showArchivedInDropdowns: true });

    await helpers.patchUserSettings({
      raw: true,
      patch: { accounts: { showArchivedInDropdowns: false } },
    });

    const afterSiblingPatch = await helpers.getUserSettings({ raw: true });
    expect(afterSiblingPatch.accounts).toStrictEqual({ defaultAccountId: accountId, showArchivedInDropdowns: false });

    const cleared = await helpers.patchUserSettings({
      raw: true,
      patch: { accounts: { defaultAccountId: null } },
    });
    expect(cleared.accounts?.defaultAccountId).toBeNull();

    const afterClear = await helpers.getUserSettings({ raw: true });
    expect(afterClear.accounts?.defaultAccountId).toBeNull();
  });

  /**
   * Supertest requests here can share one transaction through CLS
   * (`with-transaction.ts`), so racing writes cannot be asserted for last-write-wins.
   * The race tests below assert only that a losing racer stays below a 500.
   */
  describe('UserSettings — one row per user', () => {
    it('keeps exactly one row per user when different create-or-fetch endpoints run sequentially', async () => {
      // Every endpoint below get-or-creates the settings row; a dropped unique
      // `userId` index would leave more than one.
      await helpers.patchUserSettings({ raw: true, patch: { locale: 'uk' } });
      await helpers.updateOnboarding({ raw: true, onboardingState: { isDismissed: true } });
      const settings = await helpers.getUserSettings({ raw: true });
      const onboarding = await helpers.getOnboarding({ raw: true });
      await helpers.patchUserSettings({ raw: true, patch: { includeCreditLimitInStats: true } });

      expect(settings.locale).toBe('uk');
      expect(onboarding.isDismissed).toBe(true);

      const { id: userId } = await helpers.getUserInfo({ raw: true });
      const rowCount = await UserSettings.count({ where: { userId } });

      expect(rowCount).toBe(1);
    });

    it('recovers instead of crashing when a settings patch and an onboarding update race on a fresh user', async () => {
      const [patchRes, onboardingRes] = await Promise.all([
        helpers.patchUserSettings({ patch: { locale: 'uk' } }),
        helpers.updateOnboarding({ onboardingState: { isDismissed: true } }),
      ]);

      // A losing racer adopts the winner's row, so neither request reaches a 500.
      expect(patchRes.statusCode).toBeLessThan(500);
      expect(onboardingRes.statusCode).toBeLessThan(500);

      const settings = await helpers.getUserSettings({ raw: true });
      expect(settings.locale).toBeDefined();
    });

    it('recovers instead of crashing when two settings patches race on a fresh user', async () => {
      const [first, second] = await Promise.all([
        helpers.patchUserSettings({ patch: { locale: 'uk' } }),
        helpers.patchUserSettings({ patch: { includeCreditLimitInStats: true } }),
      ]);

      expect(first.statusCode).toBeLessThan(500);
      expect(second.statusCode).toBeLessThan(500);

      const settings = await helpers.getUserSettings({ raw: true });
      expect(settings.locale).toBeDefined();
    });
  });
});
