/**
 * Enable Banking API Enumerations
 * https://enablebanking.com/docs/api/reference/
 */

/**
 * Account type enumeration
 * https://enablebanking.com/docs/api/reference/#cashaccounttype
 */
export enum CashAccountType {
  /** Current/checking account */
  CACC = 'CACC',
  /** Card account */
  CARD = 'CARD',
  /** Cash payment account */
  CASH = 'CASH',
  /** Loan account */
  LOAN = 'LOAN',
  /** Other account type */
  OTHR = 'OTHR',
  /** Savings account */
  SVGS = 'SVGS',
}

/**
 * Balance type enumeration
 * https://enablebanking.com/docs/api/reference/#balancestatus
 */
export enum BalanceStatus {
  /** Closing available balance */
  CLAV = 'CLAV',
  /** Closing booked balance */
  CLBD = 'CLBD',
  /** Forward available balance */
  FWAV = 'FWAV',
  /** Information balance */
  INFO = 'INFO',
  /** Interim available balance */
  ITAV = 'ITAV',
  /** Interim booked balance */
  ITBD = 'ITBD',
  /** Opening available balance */
  OPAV = 'OPAV',
  /** Opening booked balance */
  OPBD = 'OPBD',
  /** Other balance type */
  OTHR = 'OTHR',
  /** Previously closed booked balance */
  PRCD = 'PRCD',
  /** Value date balance */
  VALU = 'VALU',
  /** Expected balance */
  XPCD = 'XPCD',
}

/**
 * Credit/Debit indicator
 * https://enablebanking.com/docs/api/reference/#creditdebitindicator
 */
export enum CreditDebitIndicator {
  /** Credit transaction */
  CRDT = 'CRDT',
  /** Debit transaction */
  DBIT = 'DBIT',
}

/**
 * Transaction status enumeration
 * https://enablebanking.com/docs/api/reference/#transactionstatus
 */
export enum TransactionStatus {
  /** Booked/accounted transaction */
  BOOK = 'BOOK',
  /** Pending transaction */
  PDNG = 'PDNG',
  /** Other transaction status */
  OTHR = 'OTHR',
}

/**
 * Address type enumeration
 * https://enablebanking.com/docs/api/reference/#addresstype
 */
export enum AddressType {
  /** Business address */
  Business = 'Business',
  /** Correspondence address */
  Correspondence = 'Correspondence',
  /** Delivery address */
  DeliveryTo = 'DeliveryTo',
  /** Mail to address */
  MailTo = 'MailTo',
  /** PO Box address */
  POBox = 'POBox',
  /** Postal address */
  Postal = 'Postal',
  /** Residential address */
  Residential = 'Residential',
  /** Statement address */
  Statement = 'Statement',
}

/**
 * PSU (Payment Service User) type
 * https://enablebanking.com/docs/api/reference/#psutype
 */
export enum PSUType {
  Personal = 'personal',
  Business = 'business',
}

/**
 * Authentication approach enumeration
 * https://enablebanking.com/docs/api/reference/#authenticationapproach
 */
export enum AuthenticationApproach {
  /** Decoupled authentication */
  DECOUPLED = 'DECOUPLED',
  /** Embedded authentication */
  EMBEDDED = 'EMBEDDED',
  /** Redirect authentication */
  REDIRECT = 'REDIRECT',
}

/**
 * Payment status enumeration
 * https://enablebanking.com/docs/api/reference/#paymentstatus
 */
export enum PaymentStatus {
  /** Pending */
  PDNG = 'PDNG',
  /** Accepted and completed */
  ACCC = 'ACCC',
  /** Accepted customer profile */
  ACCP = 'ACCP',
  /** Accepted with reservations */
  ACRS = 'ACRS',
  /** Received */
  RCVD = 'RCVD',
  /** Rejected */
  RJCT = 'RJCT',
  /** Cancelled */
  CANC = 'CANC',
  /** Failed */
  FAILD = 'FAILD',
}

/**
 * Payment type enumeration
 * https://enablebanking.com/docs/api/reference/#paymenttype
 */
export enum PaymentType {
  SEPA = 'SEPA',
  INSTANT_SEPA = 'INSTANT_SEPA',
  DOMESTIC = 'DOMESTIC',
  INTERNATIONAL = 'INTERNATIONAL',
  CROSS_BORDER = 'CROSS_BORDER',
}

/**
 * Service type enumeration
 */
export enum ServiceType {
  /** Account Information Service */
  AIS = 'AIS',
  /** Payment Initiation Service */
  PIS = 'PIS',
}

/**
 * Environment type enumeration
 */
export enum EnvironmentType {
  SANDBOX = 'SANDBOX',
  PRODUCTION = 'PRODUCTION',
}

/**
 * Account usage enumeration
 * https://enablebanking.com/docs/api/reference/#usage
 */
export enum Usage {
  AGRT = 'AGRT',
  CASH = 'CASH',
  CRLC = 'CRLC',
  DIVI = 'DIVI',
  DVPC = 'DVPC',
  EPAY = 'EPAY',
  FEXP = 'FEXP',
  FWIP = 'FWIP',
  GOVI = 'GOVI',
  GSCB = 'GSCB',
  HEDG = 'HEDG',
  HLTI = 'HLTI',
  HSPC = 'HSPC',
  ICCD = 'ICCD',
  IDPC = 'IDPC',
  INTC = 'INTC',
  ISTO = 'ISTO',
  LCOL = 'LCOL',
  LOAN = 'LOAN',
  NRLC = 'NRLC',
  OTHR = 'OTHR',
  RLTI = 'RLTI',
  SALA = 'SALA',
  SECU = 'SECU',
  SSBE = 'SSBE',
  SUPP = 'SUPP',
  TRAD = 'TRAD',
  TREA = 'TREA',
  VATX = 'VATX',
}

/**
 * Service level code for payments
 * https://enablebanking.com/docs/api/reference/#servicelevelcode
 * @public
 */
export enum ServiceLevelCode {
  CDQC = 'CDQC',
  PRPT = 'PRPT',
  SECU = 'SECU',
  URGP = 'URGP',
}

/**
 * Charge bearer code for payments
 * https://enablebanking.com/docs/api/reference/#chargebearercode
 */
export enum ChargeBearerCode {
  /** Creditor pays charges */
  CRED = 'CRED',
  /** Debtor pays charges */
  DEBT = 'DEBT',
  /** Shared charges */
  SHAR = 'SHAR',
  /** Service level */
  SLEV = 'SLEV',
}

/**
 * Frequency code for standing orders
 * https://enablebanking.com/docs/api/reference/#frequencycode
 */
export enum FrequencyCode {
  /** Ad-hoc */
  ADHO = 'ADHO',
  /** Daily */
  DAIL = 'DAIL',
  /** Fortnightly */
  FTNL = 'FTNL',
  /** Monthly */
  MNTL = 'MNTL',
  /** Quarterly */
  QURT = 'QURT',
  /** Semi-annually */
  SEMI = 'SEMI',
  /** Ten days */
  TEND = 'TEND',
  /** Twice monthly */
  TMNL = 'TMNL',
  /** Twice weekly */
  TWKE = 'TWKE',
  /** Upon request */
  UPTP = 'UPTP',
  /** Weekly */
  WKLY = 'WKLY',
  /** Yearly */
  YRAL = 'YRAL',
}

/**
 * Execution rule for standing orders
 * https://enablebanking.com/docs/api/reference/#executionrule
 */
export enum ExecutionRule {
  /** Following business day */
  FWNG = 'FWNG',
  /** One-time */
  ONET = 'ONET',
}

/**
 * Rate type for exchange rates
 * https://enablebanking.com/docs/api/reference/#ratetype
 */
export enum RateType {
  AGRD = 'AGRD',
  CCIR = 'CCIR',
  CFXR = 'CFXR',
  CUSB = 'CUSB',
  EFRT = 'EFRT',
  ESMT = 'ESMT',
  ICIR = 'ICIR',
  OMDQ = 'OMDQ',
  PREA = 'PREA',
  REAL = 'REAL',
  SPOT = 'SPOT',
}

/**
 * Reference number scheme enumeration
 * https://enablebanking.com/docs/api/reference/#referencenumberscheme
 */
export enum ReferenceNumberScheme {
  BBAN = 'BBAN',
  CPAN = 'CPAN',
  DING = 'DING',
  ESRD = 'ESRD',
  GASN = 'GASN',
  IBAN = 'IBAN',
  INAC = 'INAC',
  ORIT = 'ORIT',
  PBNK = 'PBNK',
  SCOR = 'SCOR',
  SEBG = 'SEBG',
  CRDT = 'CRDT',
  DIVI = 'DIVI',
  GEVI = 'GEVI',
  LEVL = 'LEVL',
  OTHR = 'OTHR',
  PREF = 'PREF',
  RTIN = 'RTIN',
  SUBS = 'SUBS',
  TAXD = 'TAXD',
  TRAD = 'TRAD',
}

/**
 * Transactions fetch strategy
 * https://enablebanking.com/docs/api/reference/#transactionsfetchstrategy
 * @public
 */
export enum TransactionsFetchStrategy {
  SINCE_LAST_REFERENCE = 'SINCE_LAST_REFERENCE',
  BY_DATE_RANGE = 'BY_DATE_RANGE',
  SINCE_LAST_REFERENCE_OR_BY_DATE_RANGE = 'SINCE_LAST_REFERENCE_OR_BY_DATE_RANGE',
}
