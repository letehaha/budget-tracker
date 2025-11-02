## Flow description

### Step 1

Create connection and validate credentials

```
POST
/api/bank-data-providers/:providerType/connect
```

Returns connection ID - does NOT create accounts yet

### Step 2

Fetch external available accounts from provider (not saved to DB yet)

```
GET
/api/bank-data-providers/connections/:connectionId/available-accounts
```

User can see what accounts are available before selecting which to sync

### Step 3

User selects which accounts to sync

```
POST
/api/bank-data-providers/connections/:connectionId/sync-selected-accounts

```

Creates only selected accounts in our database

### Step 4

Sync transactions for a specific account

```
POST
/api/bank-data-providers/connections/:connectionId/sync-transactions
```
