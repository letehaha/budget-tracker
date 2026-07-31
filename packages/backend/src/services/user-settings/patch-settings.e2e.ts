import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema } from '@models/user-settings.model';
import * as helpers from '@tests/helpers';
import { getTestUserId, readStoredEndpoints } from '@tests/helpers/user-settings';

const SEEDED_ENDPOINT_NAME = 'Home Ollama';
/** Link-local metadata address — the outbound URL guard rejects it. */
const SMUGGLED_BASE_URL = 'http://169.254.169.254';

/**
 * Writes an endpoint straight into settings so the test starts from the state a
 * successful create through the dedicated route would leave behind.
 */
async function seedCustomEndpoint({ userId }: { userId: number }): Promise<void> {
  const [settings] = await UserSettings.findOrCreate({
    where: { userId },
    defaults: { settings: DEFAULT_SETTINGS },
  });

  const now = new Date().toISOString();
  settings.settings = {
    ...settings.settings,
    ai: {
      ...(settings.settings.ai ?? { apiKeys: [], featureConfigs: [] }),
      customEndpoints: [
        {
          id: generateRandomRecordId(),
          name: SEEDED_ENDPOINT_NAME,
          baseUrl: 'https://llm.example.com/v1',
          defaultModel: 'llama3',
          createdAt: now,
          status: 'valid' as const,
          lastValidatedAt: now,
        },
      ],
    },
  };

  await settings.save();
}

/**
 * Shaped like a stored endpoint, but with a base URL the outbound guard rejects
 * and an id the delete route can never match.
 */
function buildSmuggledEndpoint() {
  const now = new Date().toISOString();

  return {
    id: 'smuggled-not-a-uuid',
    name: 'Metadata',
    baseUrl: SMUGGLED_BASE_URL,
    defaultModel: 'gpt-4o-mini',
    createdAt: now,
    status: 'valid' as const,
    lastValidatedAt: now,
  };
}

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

  describe('ai.customEndpoints is not patchable here', () => {
    it('drops a smuggled endpoint while still applying the rest of the patch', async () => {
      const response = await helpers.patchUserSettings({
        patch: {
          includeCreditLimitInStats: true,
          ai: { customEndpoints: [buildSmuggledEndpoint()] },
        },
      });
      expect(response.statusCode).toBe(200);

      const patched = response.body.response;
      expect(patched.includeCreditLimitInStats).toBe(true);
      expect(patched.ai?.customEndpoints ?? []).toHaveLength(0);

      const listed = await helpers.getAiCustomEndpoints({ raw: true });
      expect(listed).toHaveLength(0);

      const stored = await readStoredEndpoints({ userId: await getTestUserId() });
      expect(stored).toHaveLength(0);
    });

    it('keeps stored endpoints when a patch tries to replace the array', async () => {
      const userId = await getTestUserId();
      await seedCustomEndpoint({ userId });

      const response = await helpers.patchUserSettings({
        patch: { ai: { customEndpoints: [buildSmuggledEndpoint()] } },
      });
      expect(response.statusCode).toBe(200);

      const stored = await readStoredEndpoints({ userId });
      expect(stored).toHaveLength(1);
      expect(stored[0]!.name).toBe(SEEDED_ENDPOINT_NAME);
      expect(stored.some((endpoint) => endpoint.baseUrl === SMUGGLED_BASE_URL)).toBe(false);

      const listed = await helpers.getAiCustomEndpoints({ raw: true });
      expect(listed).toHaveLength(1);
      expect(listed[0]!.name).toBe(SEEDED_ENDPOINT_NAME);
    });

    it('still patches sibling ai keys and leaves stored endpoints alone', async () => {
      const userId = await getTestUserId();
      await seedCustomEndpoint({ userId });

      const patched = await helpers.patchUserSettings({
        raw: true,
        patch: { ai: { customInstructions: 'Prefer concise answers' } },
      });

      expect(patched.ai?.customInstructions).toBe('Prefer concise answers');
      expect(patched.ai?.customEndpoints).toHaveLength(1);

      const stored = await readStoredEndpoints({ userId });
      expect(stored).toHaveLength(1);
      expect(stored[0]!.name).toBe(SEEDED_ENDPOINT_NAME);
    });
  });
});
