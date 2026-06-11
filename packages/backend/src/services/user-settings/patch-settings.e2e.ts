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
});
