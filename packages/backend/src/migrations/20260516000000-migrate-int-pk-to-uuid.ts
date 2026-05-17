import { QueryInterface, QueryTypes, Transaction } from 'sequelize';

/**
 * Big-bang migration that converts integer primary keys (and the foreign keys
 * pointing at them) to UUIDs for every "user data" entity in the system.
 *
 * Out of scope (intentionally kept on INTEGER / natural keys):
 *   - Users.id              (auth-coupled; FKs preserved as INTEGER)
 *   - Currencies.code       (natural ISO key)
 *   - ExchangeRates         (composite natural key)
 *   - MerchantCategoryCodes (reference table, INTEGER MCC code)
 *   - SecurityCurrencyCache (natural symbol key)
 *
 * The migration runs inside a single SERIALIZABLE transaction. If any step
 * fails, the entire conversion rolls back and the schema is left untouched.
 *
 * Existing rows receive a fresh `gen_random_uuid()` (UUIDv4). New rows
 * inserted by the application after this migration use UUIDv7 (time-ordered)
 * via `defaultValue: () => uuidv7()` in each model's `@Column` decorator.
 */

// PK tables: integer `id` PK → UUID PK.
// (Holdings and PortfolioBalances are not listed here — they only have a
// composite PK with no surrogate `id`, so they live in COMPOSITE_PK_TABLES.)
const PK_TABLES = [
  'Accounts',
  'AccountGroupings',
  'AccountGroups',
  'Balances',
  'BankDataProviderConnections',
  'Budgets',
  'Categories',
  'InvestmentTransactions',
  'PortfolioTransfers',
  'Portfolios',
  'RefundTransactions',
  'Securities',
  'SecurityPricings',
  'TagReminders',
  'Tags',
  'TransactionGroups',
  'Transactions',
  'UserMerchantCategoryCodes',
  'UserSettings',
  'UsersCurrencies',
] as const;

// Tables with no surrogate `id` PK that nonetheless contain integer FKs to
// the tables above. Their composite primary key must be dropped and rebuilt.
type CompositePkTable = { table: string; pkColumns: string[] };
const COMPOSITE_PK_TABLES: CompositePkTable[] = [
  // PK cols overlap exactly with FK cols being flipped.
  { table: 'BudgetCategories', pkColumns: ['budgetId', 'categoryId'] },
  {
    table: 'BudgetTransactions',
    pkColumns: ['budgetId', 'transactionId'],
  },
  {
    table: 'TransactionGroupItems',
    pkColumns: ['groupId', 'transactionId'],
  },
  { table: 'TransactionTags', pkColumns: ['tagId', 'transactionId'] },
  // Holdings PK = (portfolioId, securityId) — both flipped.
  { table: 'Holdings', pkColumns: ['portfolioId', 'securityId'] },
  // Mixed: TransferSuggestionDismissals PK = (userId(INT keep), expenseTransactionId, incomeTransactionId).
  // Two of the three PK columns flip; the userId column stays INTEGER.
  {
    table: 'TransferSuggestionDismissals',
    pkColumns: ['userId', 'expenseTransactionId', 'incomeTransactionId'],
  },
  // SubscriptionTransactions PK = (subscriptionId UUID, transactionId INT). Only transactionId flips.
  {
    table: 'SubscriptionTransactions',
    pkColumns: ['subscriptionId', 'transactionId'],
  },
  // PortfolioBalances PK = (portfolioId INT, currencyCode STRING). Only portfolioId flips.
  {
    table: 'PortfolioBalances',
    pkColumns: ['portfolioId', 'currencyCode'],
  },
];

// Columns that semantically reference a PK table's id but lack a real
// FOREIGN KEY constraint in the live DB, so the information_schema query
// won't pick them up. Listed explicitly so they're converted alongside the
// real FKs.
type ImplicitFk = {
  child_table: string;
  child_column: string;
  parent_table: string;
  is_nullable: 'YES' | 'NO';
};
const IMPLICIT_FK_COLUMNS: ImplicitFk[] = [
  // Self-reference on Categories — declared as a plain integer column in the
  // original migration without a FK constraint.
  { child_table: 'Categories', child_column: 'parentId', parent_table: 'Categories', is_nullable: 'YES' },
  // Users.defaultCategoryId points to Categories.id but the original column was
  // declared without a FK constraint.
  { child_table: 'Users', child_column: 'defaultCategoryId', parent_table: 'Categories', is_nullable: 'YES' },
];

type FkInfo = {
  constraint_name: string;
  child_table: string;
  child_column: string;
  parent_table: string;
  parent_column: string;
  delete_rule: string;
  update_rule: string;
  is_nullable: 'YES' | 'NO';
};

const TEMP_SUFFIX = '__uuid_tmp';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;
    const t: Transaction = await sequelize.transaction();

    try {
      // pgcrypto provides gen_random_uuid() on every supported Postgres version.
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;', { transaction: t });

      // ---------------------------------------------------------------
      // 1. Snapshot every FK constraint that points at a PK-table being
      //    converted. We need the delete/update rules so we can rebuild
      //    the constraint after the type swap.
      // ---------------------------------------------------------------
      const allFks: FkInfo[] = await sequelize.query(
        `
        SELECT
          tc.constraint_name,
          tc.table_name           AS child_table,
          kcu.column_name         AS child_column,
          ccu.table_name          AS parent_table,
          ccu.column_name         AS parent_column,
          rc.delete_rule,
          rc.update_rule,
          c.is_nullable
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema    = tc.table_schema
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name  = tc.constraint_name
         AND rc.constraint_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema    = tc.table_schema
        JOIN information_schema.columns c
          ON c.table_name        = kcu.table_name
         AND c.column_name       = kcu.column_name
         AND c.table_schema      = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name IN (:tables)
          AND ccu.column_name = 'id'
        `,
        {
          replacements: { tables: PK_TABLES as unknown as string[] },
          type: QueryTypes.SELECT,
          transaction: t,
        },
      );

      // ---------------------------------------------------------------
      // 2. Add a fresh UUID column on each PK table, backfilled with
      //    gen_random_uuid() so every existing row gets an identity.
      // ---------------------------------------------------------------
      for (const table of PK_TABLES) {
        await sequelize.query(
          `ALTER TABLE "${table}"
             ADD COLUMN "id${TEMP_SUFFIX}" UUID NOT NULL DEFAULT gen_random_uuid();`,
          { transaction: t },
        );
        // Build a unique index now so the rebuilt PK can re-use it later.
        await sequelize.query(
          `CREATE UNIQUE INDEX "${table}_id${TEMP_SUFFIX}_uniq"
             ON "${table}" ("id${TEMP_SUFFIX}");`,
          { transaction: t },
        );
      }

      // ---------------------------------------------------------------
      // 3. For every captured FK constraint:
      //    a. Add a parallel UUID column on the child table.
      //    b. Backfill it via JOIN to the parent table's new UUID id.
      //    c. Drop the old FK constraint so we can drop the old column.
      // ---------------------------------------------------------------
      for (const fk of allFks) {
        const childTmp = `${fk.child_column}${TEMP_SUFFIX}`;
        await sequelize.query(`ALTER TABLE "${fk.child_table}" ADD COLUMN "${childTmp}" UUID;`, { transaction: t });
        await sequelize.query(
          `UPDATE "${fk.child_table}" AS c
              SET "${childTmp}" = p."id${TEMP_SUFFIX}"
              FROM "${fk.parent_table}" AS p
             WHERE c."${fk.child_column}" = p."id";`,
          { transaction: t },
        );
        await sequelize.query(
          `ALTER TABLE "${fk.child_table}"
             DROP CONSTRAINT "${fk.constraint_name}";`,
          { transaction: t },
        );
      }

      // ---------------------------------------------------------------
      // 3b. Convert implicit FK columns that lack a real FK constraint.
      //     Same backfill pattern, just no constraint to drop.
      // ---------------------------------------------------------------
      for (const fk of IMPLICIT_FK_COLUMNS) {
        const childTmp = `${fk.child_column}${TEMP_SUFFIX}`;
        await sequelize.query(`ALTER TABLE "${fk.child_table}" ADD COLUMN "${childTmp}" UUID;`, { transaction: t });
        await sequelize.query(
          `UPDATE "${fk.child_table}" AS c
              SET "${childTmp}" = p."id${TEMP_SUFFIX}"
              FROM "${fk.parent_table}" AS p
             WHERE c."${fk.child_column}" = p."id";`,
          { transaction: t },
        );
      }

      // ---------------------------------------------------------------
      // 4. Discover the actual primary-key constraint name for every PK table
      //    and composite-PK table. Historical migrations named these
      //    inconsistently (PascalCase, snake_case, camelCase) so hard-coding
      //    `${table}_pkey` is not safe.
      // ---------------------------------------------------------------
      const allPkOwners = [...PK_TABLES, ...COMPOSITE_PK_TABLES.map((c) => c.table)];
      const pkRows: { table_name: string; constraint_name: string }[] = await sequelize.query(
        `
        SELECT tc.table_name, tc.constraint_name
          FROM information_schema.table_constraints tc
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_name IN (:tables)
        `,
        {
          replacements: { tables: allPkOwners },
          type: QueryTypes.SELECT,
          transaction: t,
        },
      );
      const pkNameByTable = new Map(pkRows.map((r) => [r.table_name, r.constraint_name]));

      // ---------------------------------------------------------------
      // 5. Drop the composite primary keys on join tables. They reference
      //    columns we're about to delete, so the PK must come off first.
      //
      //    A table may be listed in COMPOSITE_PK_TABLES even when the live
      //    database has drifted and is missing the PK (e.g. PortfolioBalances).
      //    In that case we simply skip the drop — step 10 still adds the
      //    correct composite PK after the FK columns are converted, which
      //    incidentally repairs the drift.
      // ---------------------------------------------------------------
      for (const composite of COMPOSITE_PK_TABLES) {
        const pkName = pkNameByTable.get(composite.table);
        if (!pkName) continue;
        await sequelize.query(`ALTER TABLE "${composite.table}" DROP CONSTRAINT "${pkName}";`, {
          transaction: t,
        });
      }

      // ---------------------------------------------------------------
      // 6. Drop the primary key on every PK table so we can replace the
      //    `id` column with the new UUID version.
      // ---------------------------------------------------------------
      for (const table of PK_TABLES) {
        const pkName = pkNameByTable.get(table);
        if (!pkName) {
          throw new Error(`Could not find primary key constraint for "${table}"`);
        }
        await sequelize.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${pkName}";`, {
          transaction: t,
        });
        // Drop the auto-increment sequence default so the column can be removed cleanly.
        await sequelize.query(`ALTER TABLE "${table}" ALTER COLUMN "id" DROP DEFAULT;`, { transaction: t });
      }

      // ---------------------------------------------------------------
      // 7. Drop old INTEGER columns (parent `id` and every captured child FK).
      // ---------------------------------------------------------------
      for (const fk of allFks) {
        await sequelize.query(`ALTER TABLE "${fk.child_table}" DROP COLUMN "${fk.child_column}";`, { transaction: t });
      }
      for (const fk of IMPLICIT_FK_COLUMNS) {
        await sequelize.query(`ALTER TABLE "${fk.child_table}" DROP COLUMN "${fk.child_column}";`, { transaction: t });
      }
      for (const table of PK_TABLES) {
        await sequelize.query(`ALTER TABLE "${table}" DROP COLUMN "id";`, { transaction: t });
      }

      // ---------------------------------------------------------------
      // 8. Rename the UUID temp columns to their canonical names.
      // ---------------------------------------------------------------
      for (const table of PK_TABLES) {
        await sequelize.query(`ALTER TABLE "${table}" RENAME COLUMN "id${TEMP_SUFFIX}" TO "id";`, { transaction: t });
        // Keep `DEFAULT gen_random_uuid()` so bulk INSERTs that don't run the
        // model-level `@BeforeCreate` UUIDv7 hook (Sequelize's `bulkCreate` skips
        // individual hooks unless `individualHooks: true`) still receive an id.
        // For non-bulk creates the application-level hook still fires first and
        // its UUIDv7 value wins, so the DB default is a safety net rather than
        // the primary source of ids.
        // The unique index we built earlier now uses the canonical name implicitly
        // via the rename above (PG renames index references), but we drop it so the
        // upcoming PRIMARY KEY can create its own index without conflict.
        await sequelize.query(`DROP INDEX IF EXISTS "${table}_id${TEMP_SUFFIX}_uniq";`, { transaction: t });
      }
      for (const fk of allFks) {
        await sequelize.query(
          `ALTER TABLE "${fk.child_table}"
             RENAME COLUMN "${fk.child_column}${TEMP_SUFFIX}" TO "${fk.child_column}";`,
          { transaction: t },
        );
      }
      for (const fk of IMPLICIT_FK_COLUMNS) {
        await sequelize.query(
          `ALTER TABLE "${fk.child_table}"
             RENAME COLUMN "${fk.child_column}${TEMP_SUFFIX}" TO "${fk.child_column}";`,
          { transaction: t },
        );
      }

      // ---------------------------------------------------------------
      // 9. Restore NOT NULL on child FK columns that were NOT NULL before.
      // ---------------------------------------------------------------
      for (const fk of allFks) {
        if (fk.is_nullable === 'NO') {
          await sequelize.query(`ALTER TABLE "${fk.child_table}" ALTER COLUMN "${fk.child_column}" SET NOT NULL;`, {
            transaction: t,
          });
        }
      }
      for (const fk of IMPLICIT_FK_COLUMNS) {
        if (fk.is_nullable === 'NO') {
          await sequelize.query(`ALTER TABLE "${fk.child_table}" ALTER COLUMN "${fk.child_column}" SET NOT NULL;`, {
            transaction: t,
          });
        }
      }

      // ---------------------------------------------------------------
      // 10. Re-add primary key constraints on every PK table.
      // ---------------------------------------------------------------
      for (const table of PK_TABLES) {
        await sequelize.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_pkey" PRIMARY KEY ("id");`, {
          transaction: t,
        });
      }

      // ---------------------------------------------------------------
      // 11. Re-add the composite primary keys we dropped earlier.
      // ---------------------------------------------------------------
      for (const composite of COMPOSITE_PK_TABLES) {
        const cols = composite.pkColumns.map((c) => `"${c}"`).join(', ');
        await sequelize.query(
          `ALTER TABLE "${composite.table}" ADD CONSTRAINT "${composite.table}_pkey" PRIMARY KEY (${cols});`,
          { transaction: t },
        );
      }

      // ---------------------------------------------------------------
      // 12. Re-create the FK constraints with their original rules.
      // ---------------------------------------------------------------
      for (const fk of allFks) {
        await sequelize.query(
          `ALTER TABLE "${fk.child_table}"
             ADD CONSTRAINT "${fk.constraint_name}"
             FOREIGN KEY ("${fk.child_column}")
             REFERENCES "${fk.parent_table}" ("id")
             ON UPDATE ${fk.update_rule}
             ON DELETE ${fk.delete_rule};`,
          { transaction: t },
        );
      }

      // ---------------------------------------------------------------
      // 13. Update the polymorphic-share CHECK constraints. The original
      // shape required `resourceId ~ '^[0-9]+$'` for `account` rows when
      // account ids were integers. Now they are UUIDs — relax the regex
      // to accept UUID strings while keeping the household branch
      // (resourceId = ownerUserId::text) on the numeric pattern.
      // ---------------------------------------------------------------
      const RESOURCE_TYPE_SHAPE_UUID = `
        ("resourceType" = 'account' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        OR
        ("resourceType" = 'household' AND "resourceId" ~ '^[0-9]+$' AND "resourceId" = "ownerUserId"::text)
      `;
      await sequelize.query(
        `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_type_shape";`,
        { transaction: t },
      );
      await sequelize.query(
        `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_type_shape";`,
        { transaction: t },
      );
      await sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_type_shape"
         CHECK (${RESOURCE_TYPE_SHAPE_UUID});`,
        { transaction: t },
      );
      await sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_type_shape"
         CHECK (${RESOURCE_TYPE_SHAPE_UUID});`,
        { transaction: t },
      );

      // ---------------------------------------------------------------
      // 14. Convert denormalized array columns that store transaction
      // ids without a real FK constraint. These cannot be discovered via
      // information_schema (no FK), and their values become orphaned by
      // the PK swap anyway — flip the column type and reset to empty.
      // ---------------------------------------------------------------
      await sequelize.query(
        `ALTER TABLE "SubscriptionCandidates"
           ALTER COLUMN "sampleTransactionIds" DROP DEFAULT,
           ALTER COLUMN "sampleTransactionIds" TYPE uuid[] USING ARRAY[]::uuid[],
           ALTER COLUMN "sampleTransactionIds" SET DEFAULT ARRAY[]::uuid[];`,
        { transaction: t },
      );

      // ---------------------------------------------------------------
      // 15. Re-create unique indexes that were attached to the old INT
      // FK column and therefore implicitly dropped when the column was
      // replaced. Sequelize `upsert` derives its ON CONFLICT clause from
      // these constraints, so missing them breaks every upsert path.
      // ---------------------------------------------------------------
      await sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "security_pricing_unique_security_date_idx"
         ON "SecurityPricings" ("securityId", "date");`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * Down migration is intentionally unsupported. Converting UUIDs back to
   * monotonically-increasing integer IDs is lossy (the original integer
   * values are gone) and reversing it would silently re-key every row,
   * breaking external references (e.g. analytics, backups, audit trails).
   *
   * If you need to roll back, restore from a database backup taken before
   * this migration ran.
   */
  down: async (): Promise<void> => {
    throw new Error(
      'Down migration not supported for INT-to-UUID conversion. Restore from a pre-migration backup instead.',
    );
  },
};
