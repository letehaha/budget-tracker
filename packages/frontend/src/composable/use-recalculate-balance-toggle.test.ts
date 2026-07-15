import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ref, ref } from 'vue';

// The composable reads the persisted default off the user-settings query and
// PATCHes the chosen value back. Mocked so no real settings query fires; tests
// drive `data`/`isLoading`/`isError` and assert on `patchAsync`.
vi.mock('@/composable/data-queries/user-settings', () => ({
  useUserSettings: vi.fn(),
}));

// The failed-persist path reports to Sentry and shows an error toast; both are
// mocked so the tests can assert the fire-and-forget handler ran.
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/components/notification-center', () => ({
  useNotificationCenter: vi.fn(),
}));

// The toast copy is looked up by key; the mock returns the key verbatim.
vi.mock('@/i18n', () => ({
  i18n: { global: { t: (key: string) => key } },
}));

import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { captureException } from '@/lib/sentry';

import { useRecalculateBalanceToggle } from './use-recalculate-balance-toggle';

const mockUseUserSettings = vi.mocked(useUserSettings);
const mockUseNotificationCenter = vi.mocked(useNotificationCenter);
const mockCaptureException = vi.mocked(captureException);

let mockUserSettingsData: Ref<{ import?: { recalculateAccountBalance?: boolean } } | undefined>;
let mockUserSettingsIsLoading: Ref<boolean>;
let mockUserSettingsIsError: Ref<boolean>;
let mockPatchUserSettingsAsync: ReturnType<typeof vi.fn>;
let mockAddErrorNotification: ReturnType<typeof vi.fn>;

/**
 * Builds the toggle over a mocked user-settings query. `persisted: undefined`
 * models settings that have not loaded (or carry no value) yet; tests can flip
 * `mockUserSettingsData` / `mockUserSettingsIsLoading` / `mockUserSettingsIsError`
 * afterwards to simulate a late-arriving load or error.
 */
const setup = ({
  persisted,
  isLoading = false,
  isError = false,
}: { persisted?: boolean; isLoading?: boolean; isError?: boolean } = {}) => {
  mockUserSettingsData = ref(
    persisted === undefined ? undefined : { import: { recalculateAccountBalance: persisted } },
  );
  mockUserSettingsIsLoading = ref(isLoading);
  mockUserSettingsIsError = ref(isError);
  mockPatchUserSettingsAsync = vi.fn(() => Promise.resolve({}));
  mockUseUserSettings.mockReturnValue({
    data: mockUserSettingsData,
    isLoading: mockUserSettingsIsLoading,
    isError: mockUserSettingsIsError,
    patchAsync: mockPatchUserSettingsAsync,
  } as unknown as ReturnType<typeof useUserSettings>);

  return useRecalculateBalanceToggle({ sentryScope: 'test:persist-recalculate-balance' });
};

describe('useRecalculateBalanceToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddErrorNotification = vi.fn();
    mockUseNotificationCenter.mockReturnValue({
      addErrorNotification: mockAddErrorNotification,
    } as unknown as ReturnType<typeof useNotificationCenter>);
  });

  it('defaults to false when the persisted setting is absent', () => {
    const { recalculateBalance } = setup();

    expect(recalculateBalance.value).toBe(false);
  });

  it('reflects the persisted setting once settings load', () => {
    const { recalculateBalance } = setup();
    expect(recalculateBalance.value).toBe(false);

    // Settings arrive after construction (the query resolves late) — the
    // untouched checkbox must follow them.
    mockUserSettingsData.value = { import: { recalculateAccountBalance: true } };

    expect(recalculateBalance.value).toBe(true);
  });

  it('keeps the user toggle over the persisted value, even when settings load later', () => {
    const { recalculateBalance } = setup({ persisted: true });

    recalculateBalance.value = false;
    expect(recalculateBalance.value).toBe(false);

    // A late settings refresh must not clobber the explicit choice.
    mockUserSettingsData.value = { import: { recalculateAccountBalance: true } };
    expect(recalculateBalance.value).toBe(false);
  });

  it('resetOverride() returns the checkbox to the persisted value', () => {
    const { recalculateBalance, resetOverride } = setup({ persisted: true });

    recalculateBalance.value = false;
    resetOverride();

    expect(recalculateBalance.value).toBe(true);
  });

  it('PATCHes the chosen value once when it differs from the persisted one', () => {
    const { recalculateBalance, persistRecalculateBalanceSetting } = setup();

    recalculateBalance.value = true;
    persistRecalculateBalanceSetting();

    expect(mockPatchUserSettingsAsync).toHaveBeenCalledTimes(1);
    expect(mockPatchUserSettingsAsync).toHaveBeenCalledWith({ import: { recalculateAccountBalance: true } });
  });

  it('does not PATCH when the checkbox was never touched', () => {
    const { persistRecalculateBalanceSetting } = setup({ persisted: true });

    persistRecalculateBalanceSetting();

    expect(mockPatchUserSettingsAsync).not.toHaveBeenCalled();
  });

  it('does not PATCH when the toggle matches the persisted value', () => {
    const { recalculateBalance, persistRecalculateBalanceSetting } = setup({ persisted: true });

    recalculateBalance.value = false;
    recalculateBalance.value = true;
    persistRecalculateBalanceSetting();

    expect(mockPatchUserSettingsAsync).not.toHaveBeenCalled();
  });

  it('reports a failed persist to Sentry and shows an error toast without throwing', async () => {
    const rejection = new Error('patch failed');
    const { recalculateBalance, persistRecalculateBalanceSetting } = setup();
    mockPatchUserSettingsAsync.mockImplementationOnce(() => Promise.reject(rejection));

    recalculateBalance.value = true;
    // The import job is already accepted here, so a failed write must never bubble.
    expect(() => persistRecalculateBalanceSetting()).not.toThrow();

    // Let the rejected patch settle so the fire-and-forget `.catch` runs.
    await Promise.resolve();

    expect(mockCaptureException).toHaveBeenCalledWith({
      error: rejection,
      context: { scope: 'test:persist-recalculate-balance' },
    });
    expect(mockAddErrorNotification).toHaveBeenCalledWith('errors.api.unexpectedError');
  });

  describe('settings load state', () => {
    it('marks settings as loading while the query is fetching and the checkbox is untouched', () => {
      const { settingsLoading, settingsLoadFailed } = setup({ isLoading: true });

      expect(settingsLoading.value).toBe(true);
      expect(settingsLoadFailed.value).toBe(false);
    });

    it('marks settings as failed when the query errored and the checkbox is untouched', () => {
      const { settingsLoading, settingsLoadFailed } = setup({ isError: true });

      expect(settingsLoadFailed.value).toBe(true);
      expect(settingsLoading.value).toBe(false);
    });

    it('clears both flags once settings load successfully', () => {
      const { settingsLoading, settingsLoadFailed } = setup({ isLoading: true });
      expect(settingsLoading.value).toBe(true);

      // The query resolves.
      mockUserSettingsIsLoading.value = false;

      expect(settingsLoading.value).toBe(false);
      expect(settingsLoadFailed.value).toBe(false);
    });

    it('drops the loading flag as soon as the user toggles the checkbox', () => {
      const { recalculateBalance, settingsLoading } = setup({ isLoading: true });
      expect(settingsLoading.value).toBe(true);

      recalculateBalance.value = true;

      expect(settingsLoading.value).toBe(false);
    });

    it('drops the failed flag as soon as the user toggles the checkbox', () => {
      const { recalculateBalance, settingsLoadFailed } = setup({ isError: true });
      expect(settingsLoadFailed.value).toBe(true);

      recalculateBalance.value = false;

      expect(settingsLoadFailed.value).toBe(false);
    });
  });
});
