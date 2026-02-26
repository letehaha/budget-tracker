import { describe, expect, it } from '@jest/globals';
import { SettingsSchema } from '@models/UserSettings.model';
import * as helpers from '@tests/helpers';

describe('Update user settings', () => {
  it('updates empty settings and returns new value right away', async () => {
    const newSettings: SettingsSchema = {
      locale: 'en',
      stats: { expenses: { excludedCategories: [10] } },
    };

    const updatedUserSettings = await helpers.updateUserSettings({
      raw: true,
      settings: newSettings,
    });

    expect(updatedUserSettings).toStrictEqual(newSettings);

    const useSettings = await helpers.getUserSettings({ raw: true });

    expect(useSettings).toStrictEqual(newSettings);
  });

  it.each([
    { locale: 'en' as const, stats: { expenses: { excludedCategories: [20] } } },
    { locale: 'en' as const, stats: { expenses: { excludedCategories: [] } } },
  ])('overrides existing settings', async (newSettings: SettingsSchema) => {
    await helpers.updateUserSettings({
      raw: true,
      settings: { locale: 'en', stats: { expenses: { excludedCategories: [10] } } },
    });

    const updatedUserSettings = await helpers.updateUserSettings({
      raw: true,
      settings: newSettings,
    });

    expect(updatedUserSettings).toStrictEqual(newSettings);

    const useSettings = await helpers.getUserSettings({ raw: true });

    expect(useSettings).toStrictEqual(newSettings);
  });

  it('throws error when excluded categories do not exist', async () => {
    const nonExistentCategoryId = 999;
    const newSettings: SettingsSchema = {
      locale: 'en',
      stats: {
        expenses: {
          excludedCategories: [nonExistentCategoryId],
        },
      },
    };

    const updater = await helpers.updateUserSettings({
      settings: newSettings,
    });

    expect(updater.statusCode).toBe(422);
  });

  it('accepts valid category IDs', async () => {
    const category = await helpers.addCustomCategory({
      name: 'test',
      color: '#FF0000',
      raw: true,
    });
    const newSettings: SettingsSchema = {
      locale: 'en',
      stats: {
        expenses: {
          excludedCategories: [category.id],
        },
      },
    };

    const updatedSettings = await helpers.updateUserSettings({
      raw: true,
      settings: newSettings,
    });

    // Use toMatchObject because addCustomCategory marks an onboarding task complete,
    // which adds an onboarding object to settings that we want to ignore in this test
    expect(updatedSettings).toMatchObject(newSettings);
  });

  it('handles mixed valid and invalid category IDs', async () => {
    const category = await helpers.addCustomCategory({
      name: 'test',
      color: '#FF0000',
      raw: true,
    });
    const nonExistentId = 999;
    const newSettings: SettingsSchema = {
      locale: 'en',
      stats: {
        expenses: {
          excludedCategories: [category.id, nonExistentId],
        },
      },
    };

    const updater = await helpers.updateUserSettings({
      settings: newSettings,
    });

    expect(updater.statusCode).toBe(422);
  });

  it('handles empty excluded categories array', async () => {
    const newSettings: SettingsSchema = {
      locale: 'en',
      stats: {
        expenses: {
          excludedCategories: [],
        },
      },
    };

    const updatedSettings = await helpers.updateUserSettings({
      raw: true,
      settings: newSettings,
    });

    expect(updatedSettings).toStrictEqual(newSettings);
  });

  it('saves and returns dashboard widgets with custom config field', async () => {
    const newSettings: SettingsSchema = {
      locale: 'en',
      stats: { expenses: { excludedCategories: [] } },
      dashboard: {
        widgets: [
          { widgetId: 'subscriptions-overview', colSpan: 1, rowSpan: 1, config: { type: 'subscription' } },
          { widgetId: 'balance-trend', colSpan: 2, rowSpan: 1 },
        ],
      },
    };

    const updatedSettings = await helpers.updateUserSettings({
      raw: true,
      settings: newSettings,
    });

    expect(updatedSettings).toStrictEqual(newSettings);

    // Verify it persists on re-fetch
    const fetchedSettings = await helpers.getUserSettings({ raw: true });
    expect(fetchedSettings.dashboard?.widgets[0]?.config).toStrictEqual({ type: 'subscription' });
    expect(fetchedSettings.dashboard?.widgets[1]?.config).toBeUndefined();
  });

  it('saves dashboard widget without config field (backwards compatible)', async () => {
    const newSettings: SettingsSchema = {
      locale: 'en',
      stats: { expenses: { excludedCategories: [] } },
      dashboard: {
        widgets: [{ widgetId: 'balance-trend', colSpan: 2, rowSpan: 1 }],
      },
    };

    const updatedSettings = await helpers.updateUserSettings({
      raw: true,
      settings: newSettings,
    });

    expect(updatedSettings).toStrictEqual(newSettings);
    expect(updatedSettings.dashboard?.widgets[0]?.config).toBeUndefined();
  });

  describe('spike detection config in dashboard widgets', () => {
    it('saves widget with valid spike detection config', async () => {
      const newSettings: SettingsSchema = {
        locale: 'en',
        stats: { expenses: { excludedCategories: [] } },
        dashboard: {
          widgets: [
            {
              widgetId: 'balance-trend',
              colSpan: 2,
              rowSpan: 1,
              config: {
                spikesEnabled: true,
                spikePercentThreshold: 5,
                spikeAbsoluteThreshold: 1000,
                spikeMaxCount: 15,
              },
            },
          ],
        },
      };

      const updatedSettings = await helpers.updateUserSettings({
        raw: true,
        settings: newSettings,
      });

      expect(updatedSettings).toStrictEqual(newSettings);

      // Verify persistence
      const fetched = await helpers.getUserSettings({ raw: true });
      expect(fetched.dashboard?.widgets[0]?.config).toStrictEqual({
        spikesEnabled: true,
        spikePercentThreshold: 5,
        spikeAbsoluteThreshold: 1000,
        spikeMaxCount: 15,
      });
    });

    it('saves widget with partial spike config (only some keys)', async () => {
      const newSettings: SettingsSchema = {
        locale: 'en',
        stats: { expenses: { excludedCategories: [] } },
        dashboard: {
          widgets: [
            {
              widgetId: 'balance-trend',
              colSpan: 2,
              rowSpan: 1,
              config: {
                spikesEnabled: false,
              },
            },
          ],
        },
      };

      const updatedSettings = await helpers.updateUserSettings({
        raw: true,
        settings: newSettings,
      });

      expect(updatedSettings).toStrictEqual(newSettings);
      expect(updatedSettings.dashboard?.widgets[0]?.config).toStrictEqual({
        spikesEnabled: false,
      });
    });

    it('saves widget with spike config mixed with other config keys', async () => {
      const newSettings: SettingsSchema = {
        locale: 'en',
        stats: { expenses: { excludedCategories: [] } },
        dashboard: {
          widgets: [
            {
              widgetId: 'balance-trend',
              colSpan: 2,
              rowSpan: 1,
              config: {
                spikesEnabled: true,
                spikePercentThreshold: 10,
                someOtherKey: 'value',
              },
            },
          ],
        },
      };

      const updatedSettings = await helpers.updateUserSettings({
        raw: true,
        settings: newSettings,
      });

      expect(updatedSettings).toStrictEqual(newSettings);
    });

    it('saves widget with boundary spike config values', async () => {
      const newSettings: SettingsSchema = {
        locale: 'en',
        stats: { expenses: { excludedCategories: [] } },
        dashboard: {
          widgets: [
            {
              widgetId: 'balance-trend',
              colSpan: 2,
              rowSpan: 1,
              config: {
                spikePercentThreshold: 1,
                spikeAbsoluteThreshold: 1,
                spikeMaxCount: 1,
              },
            },
          ],
        },
      };

      const updatedSettings = await helpers.updateUserSettings({
        raw: true,
        settings: newSettings,
      });

      expect(updatedSettings).toStrictEqual(newSettings);

      // Also test upper boundaries
      const upperSettings: SettingsSchema = {
        locale: 'en',
        stats: { expenses: { excludedCategories: [] } },
        dashboard: {
          widgets: [
            {
              widgetId: 'balance-trend',
              colSpan: 2,
              rowSpan: 1,
              config: {
                spikePercentThreshold: 50,
                spikeAbsoluteThreshold: 10000,
                spikeMaxCount: 20,
              },
            },
          ],
        },
      };

      const upperResult = await helpers.updateUserSettings({
        raw: true,
        settings: upperSettings,
      });

      expect(upperResult).toStrictEqual(upperSettings);
    });

    it('rejects spikePercentThreshold below minimum (1)', async () => {
      const res = await helpers.updateUserSettings({
        settings: {
          locale: 'en',
          stats: { expenses: { excludedCategories: [] } },
          dashboard: {
            widgets: [
              {
                widgetId: 'balance-trend',
                colSpan: 2,
                rowSpan: 1,
                config: { spikePercentThreshold: 0 },
              },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects spikePercentThreshold above maximum (50)', async () => {
      const res = await helpers.updateUserSettings({
        settings: {
          locale: 'en',
          stats: { expenses: { excludedCategories: [] } },
          dashboard: {
            widgets: [
              {
                widgetId: 'balance-trend',
                colSpan: 2,
                rowSpan: 1,
                config: { spikePercentThreshold: 51 },
              },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects spikeAbsoluteThreshold above maximum (10000)', async () => {
      const res = await helpers.updateUserSettings({
        settings: {
          locale: 'en',
          stats: { expenses: { excludedCategories: [] } },
          dashboard: {
            widgets: [
              {
                widgetId: 'balance-trend',
                colSpan: 2,
                rowSpan: 1,
                config: { spikeAbsoluteThreshold: 10001 },
              },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects non-integer spikeMaxCount', async () => {
      const res = await helpers.updateUserSettings({
        settings: {
          locale: 'en',
          stats: { expenses: { excludedCategories: [] } },
          dashboard: {
            widgets: [
              {
                widgetId: 'balance-trend',
                colSpan: 2,
                rowSpan: 1,
                config: { spikeMaxCount: 5.5 },
              },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects spikeMaxCount above maximum (20)', async () => {
      const res = await helpers.updateUserSettings({
        settings: {
          locale: 'en',
          stats: { expenses: { excludedCategories: [] } },
          dashboard: {
            widgets: [
              {
                widgetId: 'balance-trend',
                colSpan: 2,
                rowSpan: 1,
                config: { spikeMaxCount: 21 },
              },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(422);
    });

    it('allows widgets without spike keys in config (no validation triggered)', async () => {
      const newSettings: SettingsSchema = {
        locale: 'en',
        stats: { expenses: { excludedCategories: [] } },
        dashboard: {
          widgets: [
            {
              widgetId: 'some-other-widget',
              colSpan: 1,
              rowSpan: 1,
              config: { customKey: 'any-value', anotherKey: 42 },
            },
          ],
        },
      };

      const updatedSettings = await helpers.updateUserSettings({
        raw: true,
        settings: newSettings,
      });

      expect(updatedSettings).toStrictEqual(newSettings);
    });
  });
});
