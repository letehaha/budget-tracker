import { AccountModel } from '../db-models';
import { SecurityModel } from './security.model';

export interface HoldingModel {
  accountId: number;
  securityId: number;

  /**
   * The identifier of the portfolio associated with this holding.
   * Used for portfolio-based investment management.
   */
  portfolioId: number;
  value: string;
  refValue: string;
  quantity: string;
  costBasis: string;
  refCostBasis: string;
  currencyCode: string;
  excluded: boolean;
  account?: AccountModel;
  security?: SecurityModel;
  createdAt: Date;
  updatedAt: Date;
}
