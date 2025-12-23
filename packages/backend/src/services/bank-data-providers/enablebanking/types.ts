/**
 * Enable Banking specific types and interfaces
 * Enable Banking is a PSD2 API aggregator supporting 6000+ banks across Europe
 */

// ============================================================================
// Credentials & Authentication
// ============================================================================

/**
 * Credentials required to connect to Enable Banking
 * These are stored encrypted in the database
 */
export interface EnableBankingCredentials {
  /** Application ID from Enable Banking portal */
  appId: string;
  /** PEM-encoded RSA private key for JWT signing */
  privateKey: string;
  /** Session ID obtained after OAuth flow completion */
  sessionId?: string;
  /** Authorization ID from the initial auth request */
  authorizationId?: string;
}

/**
 * Metadata stored for Enable Banking connection
 */
export interface EnableBankingMetadata {
  /** Selected bank name (e.g., "Nordea") */
  bankName: string;
  /** Bank country code (e.g., "FI", "SE") */
  bankCountry: string;
  /** OAuth state parameter for CSRF protection */
  state?: string;
  /** Authorization URL for user to complete OAuth */
  authUrl?: string;
  /** List of account UIDs available in this session */
  accounts?: string[];
  /** Consent validity period end date (ISO 8601) */
  consentValidUntil?: string;
  /** Consent validity period start date (ISO 8601) */
  consentValidFrom?: string;
  /** Maximum consent validity allowed by bank (in seconds) */
  bankMaxConsentValidity?: number;
}

/**
 * JWT payload for Enable Banking API authentication
 */
export interface EnableBankingJWTPayload {
  /** Issuer - always "enablebanking.com" */
  iss: string;
  /** Audience - always "api.enablebanking.com" */
  aud: string;
  /** Issued at timestamp (seconds) */
  iat: number;
  /** Expiration timestamp (seconds) - max 24 hours from iat */
  exp: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Authentication method credential field
 */
export interface AuthCredential {
  /** Field description */
  description?: string;
  /** Field name */
  name: string;
  /** Whether field is required */
  required: boolean;
  /** Validation regex template */
  template?: string;
  /** Display title */
  title?: string;
}

/**
 * Authentication method
 */
export interface AuthMethod {
  /** Authentication approach (e.g., "REDIRECT", "DECOUPLED") */
  approach: string;
  /** Required credential fields */
  credentials: AuthCredential[];
  /** Whether method is hidden */
  hidden_method: boolean;
  /** Method name/identifier */
  name: string;
  /** PSU type this method supports */
  psu_type: 'personal' | 'business';
}

/**
 * Payment type information
 */
export interface PaymentInfo {
  /** Allowed authentication methods */
  allowed_auth_methods: string[];
  /** Charge bearer values */
  charge_bearer_values: string[];
  /** Creditor account schemas */
  creditor_account_schemas: string[];
  /** Whether creditor agent BIC is required */
  creditor_agent_bic_fi_required: boolean;
  /** Whether creditor agent clearing system member ID is required */
  creditor_agent_clearing_system_member_id_required: boolean;
  /** Whether creditor country is required */
  creditor_country_required: boolean;
  /** Whether creditor name is required */
  creditor_name_required: boolean;
  /** Whether creditor postal address is required */
  creditor_postal_address_required: boolean;
  /** Supported currencies */
  currencies: string[];
  /** Whether debtor account is required */
  debtor_account_required: boolean;
  /** Debtor account schemas */
  debtor_account_schemas: string[];
  /** Whether debtor contact email is required */
  debtor_contact_email_required: boolean;
  /** Whether debtor contact phone is required */
  debtor_contact_phone_required: boolean;
  /** Whether debtor currency is required */
  debtor_currency_required: boolean;
  /** Maximum number of transactions */
  max_transactions: number;
  /** Payment type (e.g., "SEPA") */
  payment_type: string;
  /** Priority codes */
  priority_codes: string[];
  /** PSU type */
  psu_type: 'personal' | 'business';
  /** Reference number schemas */
  reference_number_schemas?: string[];
  /** Whether reference number is supported */
  reference_number_supported: boolean;
  /** Whether regulatory reporting code is required */
  regulatory_reporting_code_required: boolean;
  /** Remittance information lines configuration */
  remittance_information_lines?: Array<{
    max_length: number;
    min_length: number;
    pattern: string;
  }>;
  /** Whether remittance information is required */
  remittance_information_required: boolean;
  /** Maximum period for requested execution date */
  requested_execution_date_max_period?: number;
  /** Whether requested execution date is supported */
  requested_execution_date_supported: boolean;
}

/**
 * ASPSP (Account Servicing Payment Service Provider) - represents a bank
 */
export interface ASPSP {
  /** Available authentication methods */
  auth_methods: AuthMethod[];
  /** Whether bank is in beta */
  beta: boolean;
  /** BIC code */
  bic: string;
  /** Country code (ISO 3166-1 alpha-2) */
  country: string;
  /** Bank logo URL */
  logo: string;
  /** Maximum consent validity in seconds */
  maximum_consent_validity?: number;
  /** Bank name */
  name: string;
  /** Payment information (if bank supports payments) */
  payments?: PaymentInfo[];
  /** Supported PSU types */
  psu_types: Array<'personal' | 'business'>;
  /** Required PSU headers */
  required_psu_headers: string[];
}

/**
 * Response from /aspsps endpoint
 */
export interface ASPSPsResponse {
  aspsps: ASPSP[];
}

/**
 * Request to start authorization flow
 */
export interface StartAuthorizationRequest {
  /** Access scope configuration */
  access: {
    /** Consent validity end date (ISO 8601) */
    valid_until: string;
  };
  /** Bank selection */
  aspsp: {
    /** Bank name (must match ASPSP name exactly) */
    name: string;
    /** Country code */
    country: string;
  };
  /** State parameter for CSRF protection */
  state: string;
  /** Callback URL after authorization */
  redirect_url: string;
  /** PSU type - "personal" or "business" */
  psu_type: 'personal' | 'business';
}

/**
 * Response from starting authorization
 */
export interface StartAuthorizationResponse {
  /** URL to redirect user for authorization */
  url: string;
  /** Authorization ID for tracking */
  authorization_id: string;
}

/**
 * Request to create a session after authorization
 */
export interface CreateSessionRequest {
  /** Authorization code from redirect callback */
  code: string;
}

/**
 * Response from creating a session
 * https://enablebanking.com/docs/api/reference/#authorize-user-session
 */
export interface CreateSessionResponse {
  /** Session ID for subsequent API calls */
  session_id: string;
  /** List of accounts accessible in this session (full account objects) */
  accounts: EnableBankingAccount[];
}

/**
 * Session details
 */
export interface SessionDetails {
  /** Session ID */
  session_id: string;
  /** List of accessible account UIDs */
  accounts: string[];
  /** Session status */
  status?: string;
}

/**
 * Account details from Enable Banking
 */
export interface EnableBankingAccount {
  /** Unique account identifier */
  uid: string;
  /** Account ID (IBAN and other) */
  account_id?: {
    iban?: string;
    other?: string | null;
  };
  /** Account name/label */
  name?: string;
  /** Account details/description */
  details?: string;
  /** Account currency (ISO 4217) */
  currency: string;
  /** Account product name */
  product?: string | null;
  /** Account owner name */
  owner_name?: string;
  /** Account servicer information */
  account_servicer?: {
    bic_fi?: string;
    name?: string;
  };
  /** Account usage */
  usage?: string;
  /** Cash account type */
  cash_account_type?: string;
}

enum AddressType {
  Business = 'Business', // Business address
  Correspondence = 'Correspondence', // Correspondence address
  DeliveryTo = 'DeliveryTo', // Delivery address
  MailTo = 'MailTo', // Mail to address
  POBox = 'POBox', // PO Box address
  Postal = 'Postal', // Postal address
  Residential = 'Residential', // Residential address
  Statement = 'Statement', // Statement address
}

interface PostalAddress {
  address_line: string[];
  address_type: AddressType;
  building_number: string;
  /**
   * Two-letter ISO 3166 code of the country in which a person resides
   * (the place of a person's home). In the case of a company, it is the
   * country from which the affairs of that company are directed
   */
  country: string;
  /**
   * Identifies a subdivision of a country such as state, region, county
   */
  country_sub_division: string;
  /**
   * Identification of a division of a large organisation or building
   */
  department: string;
  /**
   * Identifier consisting of a group of letters and/or numbers that is added to
   * a postal address to assist the sorting of mail
   */
  post_code: string;
  /** Name of a street or thoroughfare */
  street_name: string;
  /** Identification of a sub-division of a large organisation or building */
  sub_department: string;
  /** Name of a built-up area, with defined boundaries, and a local government */
  town_name: string;
}

interface GenericIdentification {
  /** An identifier */
  identification: string;
  /**
   * Name of the identification scheme. Partially based on ISO20022 external code list
   * In fact it's a enum, check here to see the full list https://enablebanking.com/docs/api/reference/#schemename
   */
  scheme_name: string;

  /**
   * Entity that assigns the identification. This could be a country code or any
   * organisation name or identifier that can be recognized by both parties
   */
  issuer?: string;
}

interface AccountIdentification {
  /**
   * International Bank Account Number (IBAN) - identification used internationally
   * by financial institutions to uniquely identify the account of a customer.
   * Further specifications of the format and content of the IBAN can be found in the
   * standard ISO 13616 "Banking and related financial services - International Bank Account Number (IBAN)" version 1997-10-01, or later revisions
   */
  iban?: string;

  /** Other identification if iban is not provided */
  other?: GenericIdentification;
}

interface PartyIdentification {
  name: string;
  postal_address: PostalAddress;
}

/**
 * Balance information
 */
export interface EnableBankingBalance {
  /** Balance name */
  name?: string;
  /** Balance amount */
  balance_amount: {
    /** Amount as string (e.g., "1234.56") */
    amount: string;
    /** Currency code */
    currency: string;
  };
  /** Balance type code (e.g., "ITAV", "ITBD", "CLAV") */
  balance_type: string;
  /** Reference date */
  reference_date?: string | null;
  /** Last change date time */
  last_change_date_time?: string | null;
  /** Last committed transaction */
  last_committed_transaction?: string | null;
}

export interface AmountType {
  /**
   * @example:
   * {
   *   "currency": "EUR",
   *   "amount": "1.23
   * }
   */

  /** ISO 4217 code of the currency of the amount
   * ALWAYS positive value. Direction is determined by `CreditDebitIndicator`
   */
  amount: string;

  /** Numerical value or monetary figure associated with a particular transaction,
   * representing balance on an account, a fee or similar. Represented as a decimal number,
   * using . (dot) as a decimal separator. Allowed precision (number of digits after the
   * decimal separator) varies depending on the currency and is validated differently
   * depending on the context
   */
  currency: string;
}

export enum CreditDebitIndicator {
  CRDT = 'CRDT', // Credit type transaction
  DBIT = 'DBIT', // Debit type transaction
}

interface BankTransactionCode {
  /**
   * Arbitrary transaction categorization description
   */
  description?: boolean;
  /**
   * Specifies the family of a transaction within the domain
   */
  code?: boolean;
  /**
   * Specifies the sub-product family of a transaction within a specific family
   */
  sub_code?: boolean;
}

enum TransactionStatus {
  BOOK = 'BOOK', // Accounted transaction (ISO20022 Closing Booked)
  CNCL = 'CNCL', // Cancelled transaction
  HOLD = 'HOLD', // Account hold
  OTHR = 'OTHR', // Transaction with unknown status or not fitting the other options
  PDNG = 'PDNG', // Instant Balance Transaction (ISO20022 Expected)
  RJCT = 'RJCT', // Rejected transaction
  SCHD = 'SCHD', // Scheduled transaction
}

/**
 * Transaction from Enable Banking
 */
export interface EnableBankingTransaction {
  /**
   * Unique transaction identifier provided by ASPSP. This identifier is both
   * unique and immutable for accounts with the same identification hashes and
   * can be used for matching transactions across multiple PSU authentication
   * sessions. Usually the same identifier is available for transactions in ASPSP's
   * online/mobile interface and is called archive ID or similarly. Please note
   * that this identifier is not globally unique and same entry references are
   * likely to occur for transactions belonging to different accounts.
   */
  entry_reference?: string;

  /**
   * Category code conform to ISO 18245, related to the type of services or goods
   * the merchant provides for the transaction
   */
  merchant_category_code?: string;

  /** Monetary sum of the transaction */
  transaction_amount: AmountType;

  /**
   * Identification of the party receiving funds in the transaction
   */
  creditor?: PartyIdentification;

  /** Identification of the account on which the transaction is credited */
  creditor_account?: AccountIdentification;

  /**
   * Identification of the party sending funds in the transaction
   */
  debtor?: PartyIdentification;

  /** Identification of the account on which the transaction is debited */
  debtor_account?: AccountIdentification;

  /**
   * Allows the account servicer to correctly report a transaction, which in its
   * turn will help account holders to perform their cash management and
   * reconciliation operations
   */
  bank_transaction_code?: BankTransactionCode;

  /** Accounting flow of the transaction */
  credit_debit_indicator: CreditDebitIndicator;

  /** Available transaction status values */
  status: TransactionStatus;

  /**
   * Booking date (ISO 8601). Booking date of the transaction on the account,
   * i.e. the date at which the transaction has been recorded on books
   */
  booking_date?: string;

  /**
   * (ISO 8601) Value date of the transaction on the account, i.e. the date at
   * which funds become available to the account holder (in case of a credit transaction),
   * or cease to be available to the account holder (in case of a debit transaction)
   */
  value_date?: string;

  /**
   * (ISO 8601) Date used for specific purposes:
   * - for card transaction: date of the transaction
   * - for credit transfer: acquiring date of the transaction
   * - for direct debit: receiving date of the transaction
   */
  transaction_date?: string;

  /**
   * Payment details. For credit transfers may contain free text, reference number
   * or both at the same time (in case Extended Remittance Information is supported).
   * When it is known that remittance information contains a reference number
   * (either based on ISO 11649 or a local scheme), the reference number is also
   * available via the reference_number field.
   */
  remittance_information?: string[];

  /** Funds on the account after execution of the transaction */
  balance_after_transaction?: AmountType;

  /**
   * Identification used for fetching transaction details.This value can not be
   * used to uniquely identify transactions and may change if the list of transactions
   * is retrieved again. Null if fetching transaction details is not supported
   */
  transaction_id: string | null;
}

/**
 * Response from transactions endpoint
 */
export interface TransactionsResponse {
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

// ============================================================================
// Helper Types
// ============================================================================

/**
 * OAuth callback parameters
 */
export interface OAuthCallbackParams {
  /** Authorization code */
  code: string;
  /** State parameter (should match the one sent in auth request) */
  state: string;
  /** Error code if authorization failed */
  error?: string;
  /** Error description */
  error_description?: string;
}

/**
 * Connection initialization parameters
 */
export interface EnableBankingConnectionParams {
  /** Application ID */
  appId: string;
  /** Private key (PEM format) */
  privateKey: string;
  /** Selected bank name */
  bankName: string;
  /** Bank country code */
  bankCountry: string;
  /** Optional redirect URL override */
  redirectUrl?: string;
  /** Maximum consent validity in seconds (from bank's ASPSP data) */
  maxConsentValidity?: number;
}
