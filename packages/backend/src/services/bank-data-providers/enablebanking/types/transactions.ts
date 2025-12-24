/**
 * Transaction Types
 * https://enablebanking.com/docs/api/reference/
 */
import {
  AccountIdentification,
  AmountType,
  BankTransactionCode,
  ExchangeRate,
  FinancialInstitutionIdentification,
  PartyIdentification,
  ReferenceNumber,
} from './common';
import { CreditDebitIndicator, TransactionStatus } from './enums';

/**
 * Transaction from Enable Banking
 * https://enablebanking.com/docs/api/reference/#transaction
 */
export interface EnableBankingTransaction {
  /** Monetary sum of the transaction */
  transaction_amount: AmountType;

  /** Accounting flow of the transaction (credit or debit) */
  credit_debit_indicator: CreditDebitIndicator;

  /** Transaction status */
  status: TransactionStatus;

  /**
   * Unique transaction identifier provided by ASPSP.
   * Unique and immutable for accounts with the same identification hashes.
   * Can be used for matching transactions across multiple PSU sessions.
   * Note: NOT globally unique - same references may occur for different accounts.
   */
  entry_reference?: string;

  /**
   * Merchant Category Code (MCC) conform to ISO 18245.
   * Related to the type of services or goods the merchant provides.
   */
  merchant_category_code?: string;

  /** Identification of the party receiving funds */
  creditor?: PartyIdentification;

  /** Creditor's account identification */
  creditor_account?: AccountIdentification;

  /** Creditor's financial institution */
  creditor_agent?: FinancialInstitutionIdentification;

  /** Identification of the party sending funds */
  debtor?: PartyIdentification;

  /** Debtor's account identification */
  debtor_account?: AccountIdentification;

  /** Debtor's financial institution */
  debtor_agent?: FinancialInstitutionIdentification;

  /** Bank transaction code for categorization */
  bank_transaction_code?: BankTransactionCode;

  /**
   * Booking date (ISO 8601).
   * Date at which the transaction has been recorded on books.
   */
  booking_date?: string;

  /**
   * Value date (ISO 8601).
   * Date at which funds become available (credit) or cease to be available (debit).
   */
  value_date?: string;

  /**
   * Transaction date (ISO 8601).
   * - For card transactions: date of the transaction
   * - For credit transfers: acquiring date
   * - For direct debits: receiving date
   */
  transaction_date?: string;

  /**
   * Payment details. May contain free text, reference number, or both.
   * When it contains a reference number (ISO 11649 or local scheme),
   * it's also available in reference_number field.
   */
  remittance_information?: string[];

  /** Structured reference number */
  reference_number?: ReferenceNumber;

  /** Funds on the account after execution of the transaction */
  balance_after_transaction?: AmountType;

  /** Exchange rate information for currency conversion */
  exchange_rate?: ExchangeRate;

  /**
   * Identification used for fetching transaction details.
   * Cannot be used to uniquely identify transactions.
   * May change if the transaction list is retrieved again.
   * Null if fetching transaction details is not supported.
   */
  transaction_id?: string | null;

  /** Additional note/memo for the transaction */
  note?: string;
}

/**
 * Response from /accounts/{uid}/transactions endpoint
 * https://enablebanking.com/docs/api/reference/#haltransactions
 */
export interface HalTransactions {
  /** List of transactions */
  transactions: EnableBankingTransaction[];
  /** Continuation key for pagination */
  continuation_key?: string;
}

/**
 * Query parameters for fetching transactions
 */
export interface TransactionsQuery {
  /** Start date (ISO 8601) */
  date_from?: string;
  /** End date (ISO 8601) */
  date_to?: string;
  /** Continuation key for pagination */
  continuation_key?: string;
}

/**
 * Response from transactions endpoint
 * @deprecated Use HalTransactions instead
 */
export interface TransactionsResponse extends HalTransactions {}
