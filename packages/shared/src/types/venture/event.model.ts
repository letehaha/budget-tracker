import { CurrencyModel, TransactionModel } from '../db-models';
import { VentureDealModel } from './deal.model';
import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from './enums';

export interface VentureEventModel {
  id: string;
  userId: number;
  dealId: string;
  type: VENTURE_EVENT_TYPE;
  eventDate: string;
  grossAmount: string | null;
  gpCarryAmount: string | null;
  lpNetAmount: string | null;
  refAmount: string | null;
  navAfter: string | null;
  quantityPct: string | null;
  lpNetAmountOverridden: boolean;
  gpCarryOverridden: boolean;
  currencyCode: string;
  cashFlowMode: VENTURE_CASH_FLOW_MODE;
  notes: string | null;
  metaData: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;

  deal?: VentureDealModel;
  currency?: CurrencyModel;
  links?: VentureEventLinkModel[];
}

export interface VentureEventLinkModel {
  id: string;
  ventureEventId: string;
  transactionId: string;
  amount: string;
  currencyCode: string;
  linkedAt: Date;
  metaData: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;

  event?: VentureEventModel;
  transaction?: TransactionModel;
}
