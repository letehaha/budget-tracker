export interface RawAccountDataResponse {
  accountType: string;
  balances: {
    asset: string;
    free: string;
    locked: string;
    usdPrice: string;
  }[];
  buyerCommission: number;
  canDeposit: boolean;
  canTrade: boolean;
  canWithdraw: boolean;
  makerCommission: number;
  permissions: string[];
  sellerCommission: number;
  takerCommission: number;
  updateTime: number;
}
export interface NormalizedAccountData {
  accountType: string;
  balances: {
    asset: string;
    free: string;
    locked: string;
    price: string;
    total: string;
    precision: number;
  }[];
  buyerCommission: number;
  canDeposit: boolean;
  canTrade: boolean;
  canWithdraw: boolean;
  makerCommission: number;
  permissions: string[];
  sellerCommission: number;
  takerCommission: number;
  updateTime: number;
}

export interface AccountSettings {
  apiKey: string;
  secretKey: string;
  userId: number;
}
