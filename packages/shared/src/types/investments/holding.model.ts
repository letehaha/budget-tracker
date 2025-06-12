import { AccountModel } from '../db-models';
import { SecurityModel } from './security.model';

export interface HoldingModel {
  accountId: number;
  securityId: number;
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
