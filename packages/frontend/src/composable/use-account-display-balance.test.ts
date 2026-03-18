import { type AccountModel } from '@bt/shared/types';
import { type Ref, ref } from 'vue';

import { useAccountDisplayBalance } from './use-account-display-balance';

vi.mock('@/composable/data-queries/user-settings', () => ({
  useUserSettings: vi.fn(),
}));

import { useUserSettings } from '@/composable/data-queries/user-settings';

const mockUseUserSettings = vi.mocked(useUserSettings);

const buildAccount = (overrides: Partial<AccountModel> = {}): Ref<AccountModel> =>
  ref({
    currentBalance: 5000,
    creditLimit: 3000,
    refCurrentBalance: 10000,
    refCreditLimit: 6000,
    ...overrides,
  } as AccountModel);

const setup = ({
  account = buildAccount(),
  includeCreditLimitInStats = false,
}: {
  account?: Ref<AccountModel>;
  includeCreditLimitInStats?: boolean;
} = {}) => {
  mockUseUserSettings.mockReturnValue({
    data: ref({ includeCreditLimitInStats }),
  } as ReturnType<typeof useUserSettings>);

  return useAccountDisplayBalance({ account });
};

describe('useAccountDisplayBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when setting is off', () => {
    it('returns raw balances without adjustment', () => {
      const { displayBalance, displayRefBalance, hasCreditLimitAdjustment } = setup({
        includeCreditLimitInStats: false,
      });

      expect(hasCreditLimitAdjustment.value).toBe(false);
      expect(displayBalance.value).toBe(5000);
      expect(displayRefBalance.value).toBe(10000);
    });
  });

  describe('when setting is on', () => {
    it('subtracts credit limit from balance', () => {
      const { displayBalance, displayRefBalance, hasCreditLimitAdjustment } = setup({
        includeCreditLimitInStats: true,
      });

      expect(hasCreditLimitAdjustment.value).toBe(true);
      expect(displayBalance.value).toBe(2000); // 5000 - 3000
      // displayRefBalance = displayBalance * (refCurrentBalance / currentBalance)
      // = 2000 * (10000 / 5000) = 4000
      expect(displayRefBalance.value).toBe(4000);
    });

    it('does not adjust when creditLimit is 0', () => {
      const account = buildAccount({ creditLimit: 0 });
      const { displayBalance, hasCreditLimitAdjustment } = setup({
        account,
        includeCreditLimitInStats: true,
      });

      expect(hasCreditLimitAdjustment.value).toBe(false);
      expect(displayBalance.value).toBe(5000);
    });

    it('returns 0 for displayRefBalance when currentBalance is 0', () => {
      const account = buildAccount({ currentBalance: 0, refCurrentBalance: 0 });
      const { displayRefBalance } = setup({
        account,
        includeCreditLimitInStats: true,
      });

      expect(displayRefBalance.value).toBe(0);
    });

    it('handles creditLimit exceeding currentBalance (negative display)', () => {
      const account = buildAccount({
        currentBalance: 1000,
        creditLimit: 5000,
        refCurrentBalance: 2000,
      });
      const { displayBalance, displayRefBalance } = setup({
        account,
        includeCreditLimitInStats: true,
      });

      expect(displayBalance.value).toBe(-4000); // 1000 - 5000
      // displayRefBalance = -4000 * (2000 / 1000) = -8000
      expect(displayRefBalance.value).toBe(-8000);
    });

    it('handles creditLimit equal to currentBalance (zero display)', () => {
      const account = buildAccount({
        currentBalance: 3000,
        creditLimit: 3000,
        refCurrentBalance: 6000,
      });
      const { displayBalance, displayRefBalance } = setup({
        account,
        includeCreditLimitInStats: true,
      });

      expect(displayBalance.value).toBe(0);
      // displayRefBalance = 0 * (6000 / 3000) = 0
      expect(displayRefBalance.value).toBe(0);
    });
  });
});
