export enum SECURITY_PROVIDER {
  polygon = 'polygon',
  alphavantage = 'alphavantage',
  fmp = 'fmp',
  // custom provider that uses others for different operations because each provider
  // has limitations on a free plan
  composite = 'composite',
}

export enum ASSET_CLASS {
  cash = 'cash',
  crypto = 'crypto',
  fixed_income = 'fixed_income',
  options = 'options',
  stocks = 'stocks',
  other = 'other',
}

export enum INVESTMENT_TRANSACTION_CATEGORY {
  buy = 'buy',
  sell = 'sell',
  dividend = 'dividend',
  transfer = 'transfer',
  tax = 'tax',
  fee = 'fee',
  cancel = 'cancel',
  other = 'other',
}

export enum PORTFOLIO_TYPE {
  investment = 'investment',
  retirement = 'retirement',
  savings = 'savings',
  other = 'other',
}
