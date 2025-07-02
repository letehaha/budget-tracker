import { PortfolioModel } from './portfolio-models';
import { SecurityModel } from './security.model';

export interface HoldingModel {
  portfolioId: number;
  securityId: number;
  value: string;
  refValue: string;
  quantity: string;
  costBasis: string;
  refCostBasis: string;
  currencyCode: string;
  excluded: boolean;
  security?: SecurityModel;
  portfolio?: PortfolioModel;
  createdAt: Date;
  updatedAt: Date;
}
