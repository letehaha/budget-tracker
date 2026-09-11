import { ref } from 'vue';

vi.mock('@/composable/data-queries/user-settings', () => ({
  useUserSettings: vi.fn(),
}));

import { useUserSettings } from '@/composable/data-queries/user-settings';

import { useMapPickerSetting } from './use-map-picker-setting';

const mount = (mapPicker?: boolean) => {
  const patchAsync = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useUserSettings).mockReturnValue({
    data: ref(mapPicker === undefined ? {} : { ui: { transactionForm: { mapPicker } } }),
    patchAsync,
    isPatching: ref(false),
  } as unknown as ReturnType<typeof useUserSettings>);
  return { ...useMapPickerSetting(), patchAsync };
};

describe('useMapPickerSetting', () => {
  it('is off until the setting is saved', () => {
    expect(mount().enabled.value).toBe(false);
    expect(mount(true).enabled.value).toBe(true);
    expect(mount(false).enabled.value).toBe(false);
  });

  it('patches only the map picker key', async () => {
    const { setEnabled, patchAsync } = mount();

    await setEnabled({ value: true });
    expect(patchAsync).toHaveBeenLastCalledWith({ ui: { transactionForm: { mapPicker: true } } });

    await setEnabled({ value: false });
    expect(patchAsync).toHaveBeenLastCalledWith({ ui: { transactionForm: { mapPicker: false } } });
  });

  it('propagates a failed patch', async () => {
    const { setEnabled, patchAsync } = mount();
    patchAsync.mockRejectedValueOnce(new Error('patch failed'));

    await expect(setEnabled({ value: true })).rejects.toThrow('patch failed');
  });
});
