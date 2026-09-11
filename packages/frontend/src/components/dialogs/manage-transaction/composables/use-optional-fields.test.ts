import { ref } from 'vue';

vi.mock('@/composable/data-queries/user-settings', () => ({
  useUserSettings: vi.fn(),
}));

import { useUserSettings } from '@/composable/data-queries/user-settings';

import { useOptionalFields } from './use-optional-fields';

const mount = (optionalFields?: string[]) => {
  const patchAsync = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useUserSettings).mockReturnValue({
    data: ref(optionalFields === undefined ? {} : { ui: { transactionForm: { optionalFields } } }),
    patchAsync,
    isPatching: ref(false),
  } as unknown as ReturnType<typeof useUserSettings>);
  return { ...useOptionalFields(), patchAsync };
};

describe('useOptionalFields', () => {
  it('shows originalAmount by default until the setting is saved once', () => {
    expect(mount().isEnabled('originalAmount')).toBe(true);
    expect(mount([]).isEnabled('originalAmount')).toBe(false);
  });

  it('adds and removes a field against the stored list', async () => {
    const { setEnabled, patchAsync } = mount(['location']);

    await setEnabled({ field: 'externalUrl', value: true });
    expect(patchAsync).toHaveBeenLastCalledWith({
      ui: { transactionForm: { optionalFields: ['location', 'externalUrl'] } },
    });

    await setEnabled({ field: 'location', value: false });
    expect(patchAsync).toHaveBeenLastCalledWith({
      ui: { transactionForm: { optionalFields: [] } },
    });
  });
});
