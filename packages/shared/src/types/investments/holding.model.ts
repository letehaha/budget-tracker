import { PortfolioModel } from './portfolio-models';
import { SecurityModel } from './security.model';

export interface HoldingModel {
  portfolioId: number;
  securityId: number;
  quantity: string;
  costBasis: string;
  refCostBasis: string;
  currencyCode: string;
  excluded: boolean;
  security?: SecurityModel;
  portfolio?: PortfolioModel;
  // Dynamic calculated fields (only present when fetched with price data)
  latestPrice?: string;
  priceDate?: Date;
  marketValue?: string;
  refMarketValue?: string;
  // Gain/Loss fields (calculated in real-time)
  unrealizedGainValue?: string;
  unrealizedGainPercent?: string;
  realizedGainValue?: string;
  realizedGainPercent?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
