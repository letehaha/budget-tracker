import { NormalizedAccountData, RawAccountDataResponse } from '@/common/types';

export const normalizeAccountData = (response: RawAccountDataResponse): NormalizedAccountData => {
  const formattedBalances = response.balances.map((item) => {
    const precision = item.free.split('.')[1].length;

    return {
      asset: item.asset,
      free: item.free,
      locked: item.locked,
      price: item.usdPrice,
      precision,
      total: (Number(item.free) + Number(item.locked)).toFixed(precision),
    };
  });

  return {
    accountType: response.accountType,
    balances: formattedBalances,
    buyerCommission: response.buyerCommission,
    canDeposit: response.canDeposit,
    canTrade: response.canTrade,
    canWithdraw: response.canWithdraw,
    makerCommission: response.makerCommission,
    permissions: response.permissions,
    sellerCommission: response.sellerCommission,
    takerCommission: response.takerCommission,
    updateTime: response.updateTime,
  };
};
