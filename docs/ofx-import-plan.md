# OFX import plan

Status: proposed implementation plan
Research date: 2026-08-31

## Goal

Add a manual OFX file importer. A signed-in user can upload an OFX or QFX file, review the accounts and transactions in it, map each source account to a new or existing account, review duplicates, and run a background import with progress and import-history support.

This is a file import. It does not connect to a financial institution or run later syncs.

## Proposed first-release scope

- Accept one `.ofx` or `.qfx` file per import.
- Support OFX 1.x SGML and OFX 2.x XML files.
- Support bank statements (`STMTRS`) and credit-card statements (`CCSTMTRS`).
- Support several bank or credit-card statements in one file.
- Import ordinary statement transactions (`STMTTRN`).
- Use the statement currency (`CURDEF`) as the local account currency.
- Use `FITID` as the primary transaction identity. Use the current date, amount, type, and description matcher only as a fallback.
- Import OFX transfers as ordinary income or expense rows. Do not infer internal transfers because one file often contains only one side.
- Keep investment, loan, tax, bill-payment, and online-banking message sets out of scope. An investment-only or loan-only file must fail with a clear message.
- Keep OFX correction records (`CORRECTFITID` and `CORRECTACTION`) out of scope. Block these files instead of silently applying a replacement or deletion with the wrong result.
- Do not create categories from OFX transaction types. Resolve the `NAME` field as a Payee and let current Payee rules or later AI categorization apply.

The official OFX work group states that OFX 1.x uses SGML and OFX 2.x uses XML. It also defines `FITID` as unique within a financial institution and account, and intended for duplicate detection. See the [OFX work group page](https://financialdataexchange.org/about-fdx/ofx-work-group/) and [OFX Banking 2.3 specification](https://www.financialdataexchange.org/common/Uploaded%20files/OFX%20files/OFX%20Banking%20Specification%20v2.3.pdf).

## Main architecture decision

Use the fixed-format import pipeline, but use the leased upload cache from the Microsoft Money importer.

```text
raw OFX bytes
    |
    v
upload + decode + parse once
    |
    v
short-lived parsed-result cache ---- lease heartbeat
    |                  |
    |                  +--> account mapping + duplicate review
    v
claim upload for one job
    |
    v
queued execute --> transactions + batch metadata --> import history
```

Do not send `fileContent` on every request. Old OFX files can declare legacy encodings, so the backend must receive raw bytes and decode them from the OFX header. The upload route must discard the raw bytes after parsing. Later requests and the BullMQ job carry only an opaque `uploadId`.

This design has these benefits:

- It preserves OFX header and character-set data that `File.text()` can lose.
- It does not retain a full bank file in BullMQ job data for 24 hours or on failed jobs for seven days.
- Duplicate review and execute use the same parsed rows and stable row indices.
- The existing lease, claim, expiry, disk-permission, and cleanup behavior can be reused.

The current upload cache is local to one backend process. OFX will have the same deployment limit as the Microsoft Money importer. If API requests and import workers later run in different containers, move both caches to shared encrypted storage as a separate architecture change.

## Data contracts

Add `packages/shared/src/types/ofx-import.ts` and export it from the shared types index.

The main parse contracts should be:

- `OfxParseResult`: accounts, transactions, warnings, date range, format version, and financial-institution display name.
- `OfxParseAccount`: opaque `sourceAccountKey`, masked display name, suggested local name, statement type, currency, transaction count, net imported amount, and optional ledger balance and balance date.
- `OfxParseTransaction`: row index, opaque `sourceTransactionKey`, source account key, date, signed decimal amount, income or expense type, Payee name, note, OFX transaction type, and optional check or reference number.
- `OfxAccountMapping`: keyed by `sourceAccountKey`, with `create-new`, `link-existing`, and `skip` actions.
- Upload, duplicate-detection, execute, summary, and progress request/response types.

Do not return a full account number to the frontend. Derive `sourceAccountKey` as a SHA-256 digest over the financial-institution scope and the OFX account identity. Show only the final four account characters when available. Add a suffix when two masked display names collide.

Derive `sourceTransactionKey` as a namespaced digest over:

```text
financial institution identity + source account identity + FITID
```

Store this value in `Transactions.originalId`. This respects the OFX scope rule and avoids collisions when one local account receives files from two institutions that used the same raw `FITID`.

Extend `ImportSource` with `ofx`. Add an OFX SSE event and progress type. Add OFX to the import-history source-label map.

## Parser implementation

Add `packages/backend/src/services/import-export/ofx-import/` with small modules for header parsing, decoding, OFX syntax parsing, dates, amounts, mapping, and validation.

### File and syntax handling

1. Accept a raw `application/octet-stream` body with a defined maximum size, initially 10 MB.
2. Read the ASCII-compatible OFX header before decoding the body.
3. Validate `OFXHEADER`, `DATA`, `VERSION`, `ENCODING`, `CHARSET`, and `COMPRESSION`. Reject compression other than `NONE`.
4. Decode UTF-8, US-ASCII, ISO-8859-1, and Windows-1252 labels. Reject unknown encodings with a clear message.
5. Parse OFX 2.x as XML. Reject `DOCTYPE` and custom entity declarations, limit nesting and expanded content, keep tag values as strings, and use an allowlist of statement paths.
6. Normalize OFX 1.x SGML leaf tags into a safe XML form, then use the same typed extraction path. The normalizer must be bounded and covered by fixtures; do not use a broad regular expression over the complete file.
7. Reject an empty file, a file without an `OFX` root, an unsupported message set, and a file over the row cap.

Add `fast-xml-parser` as a direct backend dependency only after dependency approval. The repository already has version `5.10.1` as a transitive dependency. That version is MIT licensed and is the active release in the [upstream repository](https://github.com/NaturalIntelligence/fast-xml-parser/releases). A direct dependency is still required because production code must not rely on another package's private dependency tree. Configure its security limits explicitly; the upstream project has published several entity-expansion advisories for older releases.

### Statement mapping

- Bank account identity: `ORG`/`FID`, `BANKID`, optional `BRANCHID`, `ACCTID`, and `ACCTTYPE`.
- Credit-card identity: `ORG`/`FID` and `ACCTID` from `CCACCTFROM`.
- Account currency: `CURDEF`. Reject a link to a local account with another currency.
- Transaction date: prefer `DTPOSTED`, with OFX offset parsing. Use `DTUSER` only when `DTPOSTED` is absent and report a warning.
- Amount: parse `TRNAMT` as a decimal with `Money`; never parse money through binary floating-point arithmetic.
- Direction: negative amount is expense and positive amount is income. Use `TRNTYPE` to retain direction for a zero amount.
- Payee: `NAME`, with a safe fallback to `PAYEE/NAME` when present.
- Note: `MEMO`; use `NAME` only when `MEMO` is empty.
- Payment type: map `CHECK`, `DEBIT`, `ATM`, `POS`, `DIRECTDEBIT`, `CREDIT`, `DIRECTDEP`, `XFER`, `FEE`, and other defined values to the closest current `PAYMENT_TYPES` value. Keep the raw OFX type in metadata.
- Optional source data: keep check number, reference number, and transaction type under `externalData.ofx`. Do not keep the raw file or full account number.

When a row has no `FITID`, keep it importable with an aggregated warning and use only fallback duplicate detection. When one account contains the same `FITID` twice, collapse byte-equivalent repeats. Fail parsing when the repeated `FITID` has conflicting transaction data.

## Duplicate and idempotency design

Extend `ParsedTransactionRow` with an optional `originalId`. Complete the documented but missing `originalId` tier in `core/duplicates/find-duplicates.ts`:

1. Query linked accounts for matching `(accountId, originalId)` values.
2. Return these matches as `matchType: 'originalId'` with full confidence.
3. Run the current account/day/amount/description matcher only for rows with no ID match.

Keep this core change provider-neutral and add unit tests. It improves the contract that `DuplicateMatch` already exposes without changing CSV or Wallet rows, because their `originalId` remains absent.

Add a partial unique database index for OFX rows on `(accountId, originalId)` where the import source is `ofx` and `originalId` is not null. This protects against two separately uploaded copies that execute at the same time. Create a new migration at implementation time because this plan starts from `dev`; first check again for a related unmerged migration as required by the repository rules.

The execute service must still recheck IDs before each write. Treat a concurrent unique-index conflict as a skipped duplicate, not as a failed financial row.

## Backend API and services

Add these authenticated endpoints under `/api/v1/import/ofx`:

| Method | Path                 | Purpose                                                                          |
| ------ | -------------------- | -------------------------------------------------------------------------------- |
| `POST` | `/upload`            | Accept raw bytes, parse, cache the result, return `uploadId`, result, and lease. |
| `POST` | `/detect-duplicates` | Read the cached result and compare mapped existing accounts.                     |
| `POST` | `/execute`           | Validate and claim the upload, then return `jobId`.                              |
| `GET`  | `/status/:jobId`     | Return queued, running, completed, or failed progress.                           |

Use the strict route to controller to service structure. Reuse `createStatusController`, `createImportJobQueue`, the base-currency lock, `createPayeesIfNeeded`, account balance reconciliation, and import batch metadata.

The execute service should:

1. Validate that every source account has an explicit mapping.
2. Remove skipped accounts and their rows.
3. Add every needed user currency.
4. Verify ownership and matching currency for linked accounts.
5. Create new accounts with an inferred account category: bank checking as current account, savings and money market as savings, and credit card as credit card. Add an optional provider callback to `createAccountsIfNeeded` instead of copying that resolver.
6. Use zero opening balance while rows are written. Let the current reconcile phase apply the user's optional target balance for new accounts. Show the OFX ledger balance as a suggested value, but do not apply it without user confirmation.
7. Resolve Payees from source names. Do not create categories or tags.
8. Create each row with an absolute `Money` amount, source direction, mapped payment type, `originalId: sourceTransactionKey`, `rawMerchantName`, and:

   ```ts
   externalData: {
     importDetails: { batchId, importedAt, source: ImportSource.ofx },
     ofx: { transactionType, checkNumber, referenceNumber }
   }
   ```

9. Keep planned-transaction matching and Payee defaults active, as the other importers do.
10. Reconcile linked-account balances through the existing `recalculateBalance` setting.
11. Delete the cached parse result after a completed import. Let a failed import keep it until the lease expires so the user can inspect the error and retry only when the claim policy permits it.

Add the raw upload path to the binary body middleware. Add the OFX routes to route setup. Add the queue and worker to test shutdown so Jest exits cleanly.

## Frontend flow

Add a four-step wizard based on the Budget Bakers and Microsoft Money importers:

1. **Upload**: one `.ofx` or `.qfx` file, raw-byte upload, format and size validation, and lease display.
2. **Map accounts**: create, link, or skip each parsed account. Filter link targets by currency. Show masked account identity, account type, transaction count, date range, and optional ledger balance.
3. **Review**: show transactions to import, skipped accounts, parser warnings, and duplicates. Mark every detected duplicate to skip by default and let the user override it.
4. **Results**: show queue progress, created and linked accounts, imported and skipped transactions, errors, balance changes, and a link to the batch.

OFX has no useful category structure, so do not add a category mapping step.

Generalize `account-mapping-table.vue` so a row can have a stable `mappingKey` that differs from its display name. Existing importers can default this key to `name`; OFX uses the opaque account key. This avoids using a masked or repeated name as a data key.

Add:

- `packages/frontend/src/api/import-ofx.ts`
- `packages/frontend/src/stores/import-ofx.ts` and focused store tests
- `packages/frontend/src/pages/import-export/ofx-import/`
- route name and lazy route
- an OFX row in Settings > Data Management > Import
- English i18n keys through the required i18n workflow
- import-history source mapping
- analytics event value for `ofx`

Use the existing lease composable, import progress composable, resolve helpers, duplicate table, balance toggle, result components, and container-query layout.

## Verification plan

### Parser unit tests

- OFX 1.x SGML bank statement.
- OFX 2.x XML bank statement.
- QFX credit-card statement.
- Several accounts and currencies in one file.
- UTF-8, ISO-8859-1, and Windows-1252 text.
- Full OFX dates with positive and negative offsets, fractions, and named zones.
- Negative, positive, zero, and high-precision amounts with currency rounding.
- `NAME`, `MEMO`, nested `PAYEE`, check number, and reference number mapping.
- Duplicate, missing, and conflicting `FITID` values.
- Missing required tags, malformed SGML/XML, unknown encoding, compressed input, prohibited DTD/entity input, deep nesting, oversized input, and row cap.
- Investment-only, loan-only, and correction-record files.

Use sanitized repository fixtures. Do not add real bank files, account numbers, names, or transaction details.

### Shared duplicate tests

- Original ID match wins even when the date or description differs.
- Original IDs are scoped to the mapped account.
- Rows without an original ID keep the current exact and fuzzy behavior.
- No linked account causes no database duplicate query.

### Backend E2E tests

Every new endpoint must use HTTP test helpers. Cover:

- Upload happy path, empty file, wrong media type, oversized file, and expired or foreign upload IDs.
- Duplicate detection by `FITID` and fallback fields.
- Execute into new and linked accounts.
- Multi-account mapping, skipped account, currency mismatch, and ownership checks.
- Missing `FITID`, concurrent duplicate protection, and a second upload of the same file.
- Payee resolution, planned-row merge, balance reconciliation on and off, partial row failure, queue progress, import history, and batch deletion.
- Lease claim, retry after a failed job, cache cleanup, and worker shutdown.

### Frontend unit and component tests

- File extension, size, and raw upload behavior.
- Lease refresh, expiry, claim, and reset behavior.
- Opaque mapping keys with duplicate display names.
- Exact account auto-match without cross-currency targets.
- Duplicate skip defaults and override.
- Wizard navigation, execution errors, job completion, and cache refresh.
- Narrow and wide account mapping layouts.

### Required checks

Use the repository test-runner subagent for tests and the linter subagent for lint checks during implementation. Run focused tests first, then:

- shared and backend type checks
- frontend type check
- backend unit tests for the parser and duplicate core
- frontend unit tests for the OFX store and components
- one serial backend E2E run for all OFX endpoint files
- backend and frontend lint

Report every skipped or failed check.

## Delivery order

1. Add sanitized fixtures, parser types, raw upload, cache, and parser unit tests.
2. Add `FITID` duplicate support and the OFX-only unique index.
3. Add account mapping, execute service, queue, endpoints, and backend E2E tests.
4. Add the frontend wizard, route, import list entry, history label, i18n, and frontend tests.
5. Run full focused verification and update `docs/csv-import-architecture.html` so OFX appears as another fixed-format importer.

Keep these as separate review units. The parser and duplicate-key behavior are the highest-risk units and should land before the UI.

## Decisions to confirm before implementation

1. Should the first release include `.qfx` as an OFX alias? Proposed default: yes.
2. Is bank plus credit-card support sufficient, with investment and loan statements excluded? Proposed default: yes.
3. Should a file that contains OFX correction records be blocked until correction handling exists? Proposed default: yes.
4. Should OFX transfers remain ordinary rows instead of being paired as internal transfers? Proposed default: yes.
5. Should the OFX ledger balance only prefill a user-editable target, instead of changing an account automatically? Proposed default: yes.
