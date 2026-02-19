/**
 * Payment Types
 * https://enablebanking.com/docs/api/reference/
 */
import { ASPSP } from './aspsp';
import {
  AmountType,
  ContactDetails,
  FinancialInstitutionIdentification,
  GenericIdentification,
  PartyIdentification,
  ReferenceNumber,
  StatusReasonInformation,
} from './common';
import { ChargeBearerCode, ExecutionRule, FrequencyCode, PSUType, PaymentStatus, PaymentType } from './enums';

/**
 * Payment identification
 * https://enablebanking.com/docs/api/reference/#paymentidentification
 * @public
 */
export interface PaymentIdentification {
  /** Instruction identification */
  instruction_id?: string;
  /** End-to-end identification */
  end_to_end_id?: string;
}

/**
 * Beneficiary information
 * https://enablebanking.com/docs/api/reference/#beneficiary
 * @public
 */
export interface Beneficiary {
  /** Creditor party identification */
  creditor?: PartyIdentification;
  /** Creditor account */
  creditor_account: GenericIdentification;
  /** Creditor's financial institution */
  creditor_agent?: FinancialInstitutionIdentification;
}

/**
 * Regulatory reporting
 * https://enablebanking.com/docs/api/reference/#regulatoryreporting
 * @public
 */
export interface RegulatoryReporting {
  /** Reporting authority */
  authority?: string;
  /** Reporting details */
  details?: string[];
}

/**
 * Credit transfer transaction
 * https://enablebanking.com/docs/api/reference/#credittransfertransaction
 * @public
 */
export interface CreditTransferTransaction {
  /** Payment amount and currency */
  instructed_amount: AmountType;
  /** Recipient details */
  beneficiary: Beneficiary;
  /** Payment reference identifiers */
  payment_id?: PaymentIdentification;
  /** Desired execution date */
  requested_execution_date?: string;
  /** Payment reference number */
  reference_number?: ReferenceNumber;
  /** Standing order end date */
  end_date?: string;
  /** Standing order execution rule */
  execution_rule?: ExecutionRule;
  /** Standing order frequency */
  frequency?: FrequencyCode;
  /** Originating party */
  ultimate_debtor?: PartyIdentification;
  /** Final recipient party */
  ultimate_creditor?: PartyIdentification;
  /** Regulatory reporting codes */
  regulatory_reporting?: RegulatoryReporting[];
  /** Payment details/reference (unstructured) */
  remittance_information?: string[];
}

/**
 * Payment request resource
 * https://enablebanking.com/docs/api/reference/#paymentrequestresource
 * @public
 */
export interface PaymentRequestResource {
  /** Payment transaction details */
  credit_transfer_transaction: CreditTransferTransaction[];
  /** Payer's account identification */
  debtor_account?: GenericIdentification;
  /** Payer contact information */
  debtor_contact_details?: ContactDetails;
  /** Fee allocation specification */
  charge_bearer?: ChargeBearerCode;
  /** ISO 4217 debtor account currency */
  currency_of_debtor_account?: string;
}

/**
 * Request to create a payment
 * https://enablebanking.com/docs/api/reference/#createpaymentrequest
 * @public
 */
export interface CreatePaymentRequest {
  /** Payment type */
  payment_type: PaymentType;
  /** Payment details */
  payment_request: PaymentRequestResource;
  /** Bank selection */
  aspsp: ASPSP;
  /** State parameter for CSRF protection */
  state: string;
  /** Callback URL after authorization */
  redirect_url: string;
  /** PSU type */
  psu_type: PSUType;
  /** Specific authentication method to use */
  auth_method?: string;
  /** Pre-filled credentials for embedded flow */
  credentials?: Record<string, string>;
  /** Preferred language (ISO 639-1) */
  language?: string;
  /** Webhook URL for payment status updates */
  webhook_url?: string;
}

/**
 * Response from creating a payment
 * https://enablebanking.com/docs/api/reference/#createpaymentresponse
 * @public
 */
export interface CreatePaymentResponse {
  /** URL to redirect user for payment authorization */
  url: string;
  /** Payment ID for tracking */
  payment_id: string;
}

/**
 * Response from GET /payments/{payment_id}
 * https://enablebanking.com/docs/api/reference/#getpaymentresponse
 * @public
 */
export interface GetPaymentResponse {
  /** Payment ID */
  payment_id: string;
  /** Payment status */
  status: PaymentStatus;
  /** Payment details */
  payment_details?: PaymentRequestResource;
  /** Whether status is final */
  final_status?: boolean;
  /** Status reason information */
  status_reason_information?: StatusReasonInformation;
}
