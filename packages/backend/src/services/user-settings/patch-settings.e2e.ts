import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import { SettingsSchema } from '@models/user-settings.model';
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

  it('rejects a saved pivot view with an empty or over-long name', async () => {
    const validConfig = {
      rowDimension: 'category' as const,
      granularity: 'monthly' as const,
      measure: 'expense' as const,
      from: '2025-01-01',
      to: '2025-12-31',
    };

    const emptyName = await helpers.patchUserSettings({
      patch: { savedPivotViews: [{ id: generateRandomRecordId(), name: '', config: validConfig }] },
    });
    expect(emptyName.statusCode).toBe(ERROR_CODES.ValidationError);

    const overLongName = await helpers.patchUserSettings({
      patch: { savedPivotViews: [{ id: generateRandomRecordId(), name: 'a'.repeat(121), config: validConfig }] },
    });
    expect(overLongName.statusCode).toBe(ERROR_CODES.ValidationError);
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

  it('rejects a non-boolean import.recalculateAccountBalance value', async () => {
    const response = await helpers.patchUserSettings({
      patch: { import: { recalculateAccountBalance: 'yes' } },
    });
    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
