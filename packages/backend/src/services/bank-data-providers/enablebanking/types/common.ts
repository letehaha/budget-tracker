/**
 * Common/Shared Enable Banking Types
 * https://enablebanking.com/docs/api/reference/
 */
import { AddressType, RateType, ReferenceNumberScheme } from './enums';

/**
 * Amount type with currency
 * https://enablebanking.com/docs/api/reference/#amounttype
 */
export interface AmountType {
  /**
   * Numerical value. ALWAYS positive - direction is determined by CreditDebitIndicator.
   * Represented as decimal string using . (dot) as separator.
   */
  amount: string;
  /** ISO 4217 currency code */
  currency: string;
}

/**
 * Postal address
 * https://enablebanking.com/docs/api/reference/#postaladdress
 */
export interface PostalAddress {
  /** Address lines */
  address_line?: string[];
  /** Address type */
  address_type?: AddressType;
  /** Building number */
  building_number?: string;
  /** Two-letter ISO 3166 country code */
  country?: string;
  /** Country subdivision (state, region, county) */
  country_sub_division?: string;
  /** Department within organization */
  department?: string;
  /** Postal/ZIP code */
  post_code?: string;
  /** Street name */
  street_name?: string;
  /** Sub-department within organization */
  sub_department?: string;
  /** Town/city name */
  town_name?: string;
}

/**
 * Generic identification
 * https://enablebanking.com/docs/api/reference/#genericidentification
 */
export interface GenericIdentification {
  /** The identifier value */
  identification: string;
  /**
   * Name of the identification scheme
   * https://enablebanking.com/docs/api/reference/#schemename
   */
  scheme_name: string;
  /** Entity that assigns the identification */
  issuer?: string;
}

/**
 * Account identification
 * https://enablebanking.com/docs/api/reference/#accountidentification
 */
export interface AccountIdentification {
  /** International Bank Account Number (IBAN) - ISO 13616 */
  iban?: string;
  /** Other identification if IBAN is not provided */
  other?: GenericIdentification;
}

/**
 * Party identification
 * https://enablebanking.com/docs/api/reference/#partyidentification
 */
export interface PartyIdentification {
  /** Party name */
  name?: string;
  /** Party postal address */
  postal_address?: PostalAddress;
}

/**
 * Contact details
 * https://enablebanking.com/docs/api/reference/#contactdetails
 */
export interface ContactDetails {
  /** Email address */
  email?: string;
  /** Phone number */
  phone?: string;
}

/**
 * Clearing system member identification
 * https://enablebanking.com/docs/api/reference/#clearingsystemmemberidentification
 * @public
 */
export interface ClearingSystemMemberIdentification {
  /** Clearing system identification */
  clearing_system_id?: string;
  /** Member identification within the clearing system */
  member_id?: string;
}

/**
 * Financial institution identification
 * https://enablebanking.com/docs/api/reference/#financialinstitutionidentification
 */
export interface FinancialInstitutionIdentification {
  /** Bank Identifier Code (BIC/SWIFT) */
  bic_fi?: string;
  /** Clearing system member identification */
  clearing_system_member_id?: ClearingSystemMemberIdentification;
  /** Institution name */
  name?: string;
}

/**
 * Reference number
 * https://enablebanking.com/docs/api/reference/#referencenumber
 */
export interface ReferenceNumber {
  /** Reference value */
  identification: string;
  /** Reference format classification */
  scheme_name: ReferenceNumberScheme;
}

/**
 * Exchange rate information
 * https://enablebanking.com/docs/api/reference/#exchangerate
 */
export interface ExchangeRate {
  /** Reference currency for the rate */
  unit_currency: string;
  /** Numerical exchange rate value */
  exchange_rate: string;
  /** Classification of rate type */
  rate_type?: RateType;
  /** Related contract reference */
  contract_identification?: string;
  /** Amount in instructed currency */
  instructed_amount?: AmountType;
}

/**
 * Bank transaction code
 * https://enablebanking.com/docs/api/reference/#banktransactioncode
 */
export interface BankTransactionCode {
  /** Arbitrary transaction categorization description */
  description?: string;
  /** Transaction family identifier (domain code) */
  code?: string;
  /** Transaction sub-product family (sub-family code) */
  sub_code?: string;
}

/**
 * Status reason information
 * https://enablebanking.com/docs/api/reference/#statusreasoninformation
 */
export interface StatusReasonInformation {
  /** Machine-readable reason code */
  status_reason_code?: string;
  /** Human-readable reason description */
  status_reason_description?: string;
}
