# Enable Banking Integration

## Overview

Enable Banking is a PSD2 API aggregator that provides access to over 6,000 banks across Europe via OAuth 2.0 authorization and JWT authentication.

## Key Characteristics

### Authentication

- **Token Type:** JWT (RS256) signed with RSA private key
- **Authentication Method:** `Authorization: Bearer <jwt>` header on all API requests
- **JWT Lifetime:** 1 hour (regenerated per API call)
- **User Action Required:** OAuth 2.0 flow - user redirects to bank portal for consent
- **Session Expiry:** 90-360 days (bank dependent), then re-authorization required
- **Security:** Private key encrypted in DB, used only for JWT signing

### API Constraints

- **Rate Limiting:** Handled by Enable Banking service (no specific limit)
- **Response Caching:** None - fresh data fetched on each request
- **Transaction History:** Fetched by date range with automatic pagination
- **Historical Data:** Unique per bank, usually fro 1 year and up to no limit

## Connection Flow

### 1. User Initiates Connection

```
POST /bank-data-providers/enablebanking/connect
{
  "providerType": "enable_banking",
  "credentials": {
    "appId": "your-app-id",
    "privateKey": "-----BEGIN PRIVATE KEY-----\n...",
    "bankName": "Nordea",
    "bankCountry": "FI",
    "redirectUrl": "http://localhost:8100/bank-callback"
  }
}
```

**What happens:**

1. Validates `appId` and `privateKey` via test API call
2. Generates unique `state` parameter for CSRF protection
3. Calculates consent validity period (typically 90 days)
4. Calls Enable Banking API to create authorization, receives `authorization_id` and `authUrl`
5. Creates **pending** connection in database with encrypted credentials
6. Returns `authUrl` to frontend for user redirect

**Error handling:**

- Invalid credentials → `ForbiddenError`
- Invalid private key format → `ValidationError`

### 2. User Authorizes at Bank

- User logs in at their bank's portal
- User approves consent request
- Bank redirects back to `redirectUrl` with `code` and `state` parameters

### 3. OAuth Callback Handling

```
POST /bank-data-providers/enablebanking/callback
{
  "connectionId": 123,
  "params": {
    "code": "auth-code-from-bank",
    "state": "state-from-redirect"
  }
}
```

**What happens:**

1. Validates `state` parameter (CSRF protection)
2. Exchanges `code` for `session_id` via Enable Banking API
3. Updates connection record:
   - Stores `session_id` in encrypted credentials
   - Stores available account UIDs in metadata
   - Marks connection as `isActive: true`
   - Clears `state` from metadata

**Error handling:**

- OAuth errors (e.g., `access_denied`) → `BadRequestError`

## Account Sync Process

- Fetches session details using `session_id` to get account UIDs
- For each account UID, fetches in parallel:
  - Account details (`/accounts/{uid}/details`)
  - Account balances (`/accounts/{uid}/balances`)
- Maps to application's `ProviderAccount` format
- **Balance priority:** ITAV > ITBD > CLAV > first available
- Creates new accounts or updates existing ones by `externalId` (account UID)

## Transaction Sync Process

- **No queue system** - synchronous, direct fetching
- Determines date range:
  - Existing account: from most recent transaction to now
  - New account: negotiates the lookback with the bank — 1095 days first, then 730, 365 and 90 as the ASPSP rejects each window
- Automatic pagination via `continuation_key`
- Generates unique `externalId` via SHA256 hash of transaction fields
- Matches an incoming payload against stored rows with the four-tier matcher (entry_reference → originalId/pendingHash → IBAN fingerprint → pending upgrade); see `../../docs/architecture.md`
- Saves new transactions to database
- Updates account balance after sync

## Technical Details

### Error Handling

- **API Errors:** Centralized in `EnableBankingApiClient`
  - 401/403 → `ForbiddenError`
  - 4xx → `BadRequestError`
- **OAuth Errors:** Caught during callback → `BadRequestError`
- **Sync Errors:** Transaction sync failures update account status to `FAILED` with error message

### Queue System

- **None** - all operations are synchronous
- Can lead to long-running requests for initial historical syncs

### Balance Updates

1. During `connectSelectedAccounts` - fetched and stored when accounts are created
2. After `syncTransactions` - re-fetched for accuracy

### Data Storage

- **Connection:** Encrypted `appId`, `privateKey`, `sessionId`; metadata includes bank info and consent dates
- **Accounts:** Linked via `bankDataProviderConnectionId`, stores Enable Banking `uid` as `externalId`
- **Transactions:** SHA256 hashed `originalId`, full raw transaction in `externalData` JSONB

### Transaction Deduplication

When the payload carries an `entry_reference`, the hash is SHA256 of the account external id plus that reference — nothing else.

Otherwise SHA256 is generated from:

- account external id (`identification_hash`)
- `transaction_amount.amount`
- `transaction_amount.currency`
- `credit_debit_indicator`
- one date, picked by priority: `transaction_date` > `value_date` > `booking_date`
- `debtor_account.iban`
- `creditor_account.iban`

Remittance text is not hashed — banks rewrite it between the pending and booked copies. Ensures stable IDs even when bank's `transaction_id` is missing or changes.

### File Structure

```
enablebanking/
├── api-client.ts              # HTTP client, API calls, error handling
├── aspsp.service.ts           # Bank/country listing utilities
├── enablebanking.provider.ts  # Core business logic, data mapping
├── utils/
│   ├── balances.ts                # Balance payload shaping for logs
│   ├── candidate-selection.ts     # IBAN gate + nearest-date pick
│   ├── candidate-selection.unit.ts # Unit tests for candidate selection
│   ├── consent.ts                 # Consent validity end date
│   ├── constants.ts               # Lookback schedule + match window sizes
│   ├── jwt-utils.ts               # JWT generation, key validation
│   ├── plan-edit-merge.ts         # Pure edit-preservation policy for reconcile
│   ├── plan-edit-merge.unit.ts    # Unit tests for the merge policy
│   ├── transaction-hash.ts        # Transaction hashing + date priority
│   ├── transaction-hash.unit.ts   # Unit tests for hashing
│   ├── transaction-metadata.ts    # Stored-row externalData accessors/predicates
│   └── transaction-metadata.unit.ts # Unit tests for the accessors
├── enablebanking-dedup.e2e.ts # E2E: matcher tiers + reconciliation
├── enablebanking-flow.e2e.ts  # E2E: connect → sync flow
├── types.ts                   # TypeScript interfaces
└── docs/
    └── details.md            # This file
```

### Key Dependencies

- **axios:** HTTP client for Enable Banking API
- **crypto:** JWT signing and transaction hashing

## Features & Limitations

### ✅ Supported

- OAuth 2.0 connection flow
- Multi-bank support (6,000+ European banks)
- Account listing and sync
- Transaction sync with automatic pagination
- Re-authorization flow for expired sessions
- Direct, synchronous data fetching

### ❌ Not Supported

- Webhooks (not supported by Enable Banking)
- Real-time updates (polling-based only)

## Key Differences from Monobank

| Feature          | Enable Banking              | Monobank               |
| ---------------- | --------------------------- | ---------------------- |
| Authentication   | OAuth + Private Key         | API Token              |
| Rate Limiting    | No specific limit           | 60 seconds per request |
| Connection Flow  | Multi-step OAuth            | Single-step            |
| Session Expiry   | Usually from 90 to 360 days | Never                  |
| Queue System     | No                          | Yes (BullMQ)           |
| Transaction Sync | Synchronous, full range     | Async, 31-day chunks   |
| Caching          | No caching                  | 15 min client info     |
| Multi-bank       | Yes (6,000+ banks)          | Single bank only       |
