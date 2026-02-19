/**
 * ASPSP (Bank/Financial Institution) Types
 * https://enablebanking.com/docs/api/reference/
 */
import { AuthenticationApproach, PSUType } from './enums';

/**
 * Authentication method credential field
 * https://enablebanking.com/docs/api/reference/#authcredential
 * @public
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
 * https://enablebanking.com/docs/api/reference/#authmethod
 * @public
 */
export interface AuthMethod {
  /** Authentication approach */
  approach: AuthenticationApproach;
  /** Required credential fields */
  credentials: AuthCredential[];
  /** Whether method is hidden */
  hidden_method: boolean;
  /** Method name/identifier */
  name: string;
  /** PSU type this method supports */
  psu_type: PSUType;
}

/**
 * Sandbox user for testing
 * https://enablebanking.com/docs/api/reference/#sandboxuser
 * @public
 */
export interface SandboxUser {
  /** Test username */
  username?: string;
  /** Test password */
  password?: string;
  /** Additional credentials */
  [key: string]: string | undefined;
}

/**
 * Sandbox information
 * https://enablebanking.com/docs/api/reference/#sandboxinfo
 * @public
 */
export interface SandboxInfo {
  /** Test users for sandbox authentication */
  users?: SandboxUser[];
}

/**
 * ASPSP group information
 * https://enablebanking.com/docs/api/reference/#aspspgroup
 * @public
 */
export interface ASPSPGroup {
  /** Group name */
  name: string;
  /** Group logo URL */
  logo?: string;
}

/**
 * Payment type information for ASPSP
 * @public
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
  /** Payment type */
  payment_type: string;
  /** Priority codes */
  priority_codes: string[];
  /** PSU type */
  psu_type: PSUType;
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
 * ASPSP (Account Servicing Payment Service Provider) - minimal for requests
 * https://enablebanking.com/docs/api/reference/#aspsp
 */
export interface ASPSP {
  /** Bank name (must match exactly) */
  name: string;
  /** Two-letter ISO 3166 country code */
  country: string;
}

/**
 * ASPSP with full data - extended response from /aspsps endpoint
 * https://enablebanking.com/docs/api/reference/#aspspdata
 * @public
 */
export interface ASPSPData extends ASPSP {
  /** Bank logo URL (supports transformation suffixes) */
  logo: string;
  /** Supported PSU types */
  psu_types: PSUType[];
  /** Available authentication methods */
  auth_methods: AuthMethod[];
  /** Maximum consent validity in seconds */
  maximum_consent_validity: number;
  /** Whether bank is in beta */
  beta: boolean;
  /** BIC/SWIFT code */
  bic?: string;
  /** Required PSU headers for data endpoints */
  required_psu_headers?: string[];
  /** Payment information (if bank supports payments) */
  payments?: PaymentInfo[];
  /** Parent group information */
  group?: ASPSPGroup;
  /** Sandbox-specific metadata */
  sandbox?: SandboxInfo;
}

/**
 * Response from /aspsps endpoint
 */
export interface ASPSPsResponse {
  aspsps: ASPSPData[];
}
