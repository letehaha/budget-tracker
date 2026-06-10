import type { UserSettingsSchema } from '@/api/user-settings';
import { describe, expect, it } from 'vitest';

import { patchTransactionsTableSettings } from './user-settings';

describe('patchTransactionsTableSettings', () => {
  it('stubs required column fields when nothing is stored yet', () => {
    const result = patchTransactionsTableSettings({ settings: {}, patch: { extraFilters: ['type'] } });

    expect(result.ui?.transactionsTable).toEqual({
      visibleColumns: [],
      columnOrder: [],
      extraFilters: ['type'],
    });
  });

  it('keeps stored values over the stubs and applies the patch on top', () => {
    const settings: UserSettingsSchema = {
      ui: {
        transactionsTable: {
          visibleColumns: ['date', 'amount'],
          columnOrder: ['date', 'amount', 'note'],
          mobileView: 'table',
          extraFilters: ['tags'],
        },
      },
    };

    const result = patchTransactionsTableSettings({ settings, patch: { mobileView: 'list' } });

    expect(result.ui?.transactionsTable).toEqual({
      visibleColumns: ['date', 'amount'],
      columnOrder: ['date', 'amount', 'note'],
      mobileView: 'list',
      extraFilters: ['tags'],
    });
  });

  it('preserves unrelated settings and does not mutate the input', () => {
    const settings: UserSettingsSchema = {
      includeCreditLimitInStats: true,
      ui: { transactionsTable: { visibleColumns: ['date'], columnOrder: ['date'] } },
    };

    const result = patchTransactionsTableSettings({ settings, patch: { extraFilters: ['note'] } });

    expect(result.includeCreditLimitInStats).toBe(true);
    expect(settings.ui?.transactionsTable?.extraFilters).toBeUndefined();
    expect(result.ui?.transactionsTable?.extraFilters).toEqual(['note']);
  });
});
