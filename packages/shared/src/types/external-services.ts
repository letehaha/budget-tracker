import type { Cents } from './money';

/**
 * More info here:
 *
 * @link https://api.monobank.ua/docs/#tag/Kliyentski-personalni-dani/paths/~1personal~1client-info/get
 */
export interface ExternalMonobankClientInfoResponse {
  clientId: string;
  name: string;
  webHookUrl: string;
  permissions: string;
  accounts: {
    id: string;
    sendId: string;
    balance: Cents;
    creditLimit: Cents;
    type: 'black' | 'white' | 'platinum' | 'iron' | 'fop' | 'yellow' | 'eAid';
    currencyCode: number;
    cashbackType: 'None' | 'UAH' | 'Miles';
    maskedPan: string[];
    iban: string;
  }[];
  jars: {
    id: string;
    sendId: string;
    title: string;
    description: string;
    currencyCode: number;
    balance: Cents;
    goal: Cents;
  }[];
}

/**
 * More info
 *
 * @link https://api.monobank.ua/docs/#tag/Kliyentski-personalni-dani/paths/~1personal~1webhook/post
 */
export type ExternalMonobankTransactionResponse = {
  id: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  hold: boolean;
  amount: Cents;
  operationAmount: Cents;
  currencyCode: number;
  commissionRate: Cents;
  cashbackAmount: Cents;
  balance: Cents;
  comment: string;
  receiptId: string;
  invoiceId: string;
  counterEdrpou: string;
  counterIban: string;
  counterName: string;
};
