import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types/api';
import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { authPool } from '@config/auth';
import { describe, expect, it } from '@jest/globals';
import Accounts from '@models/accounts.model';
import Budgets from '@models/budget.model';
import Categories from '@models/categories.model';
import { connection } from '@models/index';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import MerchantCategoryCodes from '@models/merchant-category-codes.model';
import PayeeIgnoredNames from '@models/payee-ignored-names.model';
import Payees from '@models/payees.model';
import ResourceShares from '@models/resource-shares.model';
import Tags from '@models/tags.model';
import Transactions from '@models/transactions.model';
import UserMerchantCategoryCodes from '@models/user-merchant-category-codes.model';
import UserSettings from '@models/user-settings.model';
import UsersCurrencies from '@models/users-currencies.model';
import Users from '@models/users.model';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEvents from '@models/venture/venture-events.model';
import VenturePlatforms from '@models/venture/venture-platforms.model';
import * as helpers from '@tests/helpers';
import { randomUUID } from 'crypto';

describe('User data wipe (POST /user/wipe-data)', () => {
  it('wipes user-owned data, hard-deletes paranoid models, reseeds defaults, and keeps better-auth records', async () => {
    const userBefore = await Users.findOne({ where: {} });
    expect(userBefore).not.toBeNull();
    const userId = userBefore!.id;
    const authUserId = userBefore!.authUserId;

    const account = await helpers.createAccount({ raw: true });
    const category = await helpers.addCustomCategory({ name: 'Wipe me', color: '#FF00FF', raw: true });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 1000,
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: category.id,
      }),
      raw: true,
    });
    const budget = await helpers.createCustomBudget({ name: 'Wipe budget', limitAmount: 500, raw: true });
    const portfolio = await helpers.createPortfolio({ payload: { name: 'Wipe portfolio' }, raw: true });
    const tag = await helpers.createTag({ payload: { name: 'wipe-tag', color: '#123456' }, raw: true });
    await helpers.createPayee({ payload: helpers.buildPayeePayload({ name: 'Wipe payee' }), raw: true });
    await helpers.addIgnoredName({ rawName: 'Wipe ignored merchant', raw: true });
    await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
    await helpers.updateUserSettings({ settings: { locale: 'uk' } });

    // Venture chain: platform → deal → event. All three use paranoid soft-delete OR have
    // SET-NULL FKs back to their parent, so a naive .destroy() leaves rows behind. The
    // wipe must explicitly hard-delete each layer.
    const platform = await helpers.createVenturePlatform({ payload: { name: 'Wipe platform' }, raw: true });
    const deal = await helpers.createVentureDeal({
      payload: { name: 'Wipe deal', platformId: platform.id, currencyCode: 'USD' },
      raw: true,
    });
    const event = await helpers.createVentureEvent({
      dealId: deal.id,
      payload: {
        type: VENTURE_EVENT_TYPE.nav_update,
        eventDate: '2026-06-24',
        cashFlowMode: VENTURE_CASH_FLOW_MODE.none,
        navAfter: '18500',
      },
      raw: true,
    });

    const wipeRes = await helpers.wipeUserData();
    expect(wipeRes.statusCode).toBe(200);
    expect(wipeRes.body.status).toBe(API_RESPONSE_STATUS.success);

    expect(await Accounts.findAll({ where: { userId } })).toHaveLength(0);
    expect(await Transactions.findAll({ where: { userId } })).toHaveLength(0);
    expect(await Budgets.findAll({ where: { id: budget.id } })).toHaveLength(0);
    expect(await UsersCurrencies.findAll({ where: { userId } })).toHaveLength(0);
    expect(await UserSettings.findAll({ where: { userId } })).toHaveLength(0);

    // Payee library is part of "everything the user owns" — the wipe is a clean slate,
    // so learned payees and the ignore-list must not survive it.
    expect(await Payees.findAll({ where: { userId } })).toHaveLength(0);
    expect(await PayeeIgnoredNames.findAll({ where: { userId } })).toHaveLength(0);

    // Custom category is gone but defaults are reseeded. The user gets a fresh-start state,
    // not an empty-state — opening the app after a wipe shouldn't force them to recreate
    // common categories like Food/Transport.
    expect(await Categories.findByPk(category.id)).toBeNull();
    const categoriesAfter = await Categories.findAll({ where: { userId } });
    expect(categoriesAfter.length).toBeGreaterThan(0);

    // Tags follow the same reseed pattern — custom tag gone, defaults present.
    expect(await Tags.findByPk(tag.id)).toBeNull();
    const tagsAfter = await Tags.findAll({ where: { userId } });
    expect(tagsAfter.length).toBeGreaterThan(0);

    // Paranoid models — must be hard-deleted, not soft-deleted. `paranoid: false` bypasses
    // the default `deletedAt IS NULL` scope so any leftover rows surface. Scope by userId
    // so the assertion catches every owned row regardless of how each helper shaped its
    // response — and so a future model addition that the wipe forgets to handle is caught
    // without needing a hand-rolled per-row check.
    expect(await Portfolios.findAll({ where: { userId }, paranoid: false })).toHaveLength(0);
    expect(await VenturePlatforms.findAll({ where: { userId }, paranoid: false })).toHaveLength(0);
    expect(await VentureDeals.findAll({ where: { userId }, paranoid: false })).toHaveLength(0);
    expect(await VentureEvents.findAll({ where: { userId } })).toHaveLength(0);
    // Avoid unused-var lint on the seeded handles — kept around for debug breakpoints.
    void portfolio;
    void platform;
    void deal;
    void event;

    const userAfter = await Users.findByPk(userId);
    expect(userAfter).not.toBeNull();
    // defaultCategoryId now points at one of the reseeded categories rather than null —
    // the user has a fresh-start default the same way a brand-new signup does.
    expect(userAfter!.defaultCategoryId).not.toBeNull();
    expect(Number(userAfter!.totalBalance)).toBe(0);

    const [baUserRow] = await connection.sequelize.query('SELECT id FROM ba_user WHERE id = :authUserId', {
      replacements: { authUserId },
    });
    expect((baUserRow as { id: string }[]).length).toBe(1);

    const [baSessionRow] = await connection.sequelize.query('SELECT id FROM ba_session WHERE "userId" = :authUserId', {
      replacements: { authUserId },
    });
    expect((baSessionRow as { id: string }[]).length).toBeGreaterThanOrEqual(1);
  });

  it('wipes when UserMerchantCategoryCodes rows reference user categories', async () => {
    // Regression for the FK violation that aborted wipes in production. Now covered by a
    // CASCADE on UMCC.categoryId (migration 20260603000000), but the test stays as
    // integration proof that the cascade works end-to-end.
    const userBefore = await Users.findOne({ where: {} });
    const userId = userBefore!.id;
    const category = await helpers.addCustomCategory({ name: 'MCC-linked', color: '#ABCDEF', raw: true });
    const mcc = await MerchantCategoryCodes.create({ code: '5411', name: 'Grocery stores' });
    await UserMerchantCategoryCodes.create({ userId, categoryId: category.id, mccId: mcc.id });

    const wipeRes = await helpers.wipeUserData();
    expect(wipeRes.statusCode).toBe(200);

    // The custom MCC-linked category is gone. Total category count is > 0 because the
    // wipe reseeds default categories — assert by id, not by total count.
    expect(await Categories.findByPk(category.id)).toBeNull();
    expect(await UserMerchantCategoryCodes.findAll({ where: { userId } })).toHaveLength(0);
  });

  it('wipes when PortfolioTransfers has an orphaned transactionId from a prior failed wipe', async () => {
    // Regression for a production failure: a previous wipe aborted mid-flight and left
    // PortfolioTransfers rows whose transactionId pointed at a Transaction that no longer
    // exists. PT.transactionId is FK with `ON DELETE SET NULL`. When the subsequent wipe
    // destroyed Accounts → cascaded to Transactions, Postgres re-validated the SET NULL
    // chain on PT, tripped on the dangling reference, and aborted the whole wipe.
    //
    // The orphan state isn't reachable through the public API (FK validation blocks
    // INSERT with a non-existent transactionId). Reproduce it by toggling Postgres'
    // session_replication_role to 'replica' for the insert — same row shape that prior
    // crashed wipes left behind.
    const userBefore = await Users.findOne({ where: {} });
    const userId = userBefore!.id;

    const account = await helpers.createAccount({ raw: true });
    const portfolio = await helpers.createPortfolio({ payload: { name: 'PT-orphan portfolio' }, raw: true });

    const orphanTxId = randomUUID();
    const orphanPtId = randomUUID();
    await connection.sequelize.query(
      `SET session_replication_role = 'replica';
       INSERT INTO "PortfolioTransfers"
         (id, "userId", "fromAccountId", "toPortfolioId", amount, "refAmount", "currencyCode", date, "transactionId", "createdAt", "updatedAt")
       VALUES
         (:ptId, :userId, :accountId, :portfolioId, 100, 100, 'USD', '2026-01-01', :txId, NOW(), NOW());
       SET session_replication_role = 'origin';`,
      {
        replacements: {
          ptId: orphanPtId,
          userId,
          accountId: account.id,
          portfolioId: portfolio.id,
          txId: orphanTxId,
        },
      },
    );

    const wipeRes = await helpers.wipeUserData();
    expect(wipeRes.statusCode).toBe(200);
    expect(await PortfolioTransfers.findAll({ where: { userId } })).toHaveLength(0);
  });

  it('converts cross-user transfer legs to out_of_wallet when the owner wipes', async () => {
    // Secondary joins primary's household and uses the write access to push money into
    // primary's account, creating a cross-user transfer pair. When primary wipes, the
    // partner leg on secondary's account must convert to standalone — without the
    // conversion, secondary would be left with a leg pointing at a transferId that no
    // longer exists (orphan half-transfer).
    const primaryAccount = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Primary A', initialBalance: 10000 }),
      raw: true,
    });
    const primaryUser = await helpers.findAppUserByEmail({ email: 'test1@test.local' });

    const secondary = await helpers.provisionSecondUserWithBaseCurrency();
    const { secondaryAccount, secondaryCategoryId } = await helpers.asUser({
      cookies: secondary.cookies,
      fn: async () => {
        const acc = await helpers.createAccount({
          payload: helpers.buildAccountPayload({ name: 'Secondary B', initialBalance: 2000 }),
          raw: true,
        });
        const categories = await helpers.getCategoriesList();
        return { secondaryAccount: acc, secondaryCategoryId: categories[0]!.id };
      },
    });

    const householdInvite = await helpers.createHouseholdInvitation({
      ownerUserId: primaryUser.id,
      inviteeEmail: secondary.email,
    });
    await helpers.asUser({
      cookies: secondary.cookies,
      fn: () => helpers.acceptShareInvitation({ token: householdInvite.token, raw: true }),
    });

    const [secondaryLeg, primaryLeg] = await helpers.asUser({
      cookies: secondary.cookies,
      fn: () =>
        helpers.createTransaction({
          payload: {
            ...helpers.buildTransactionPayload({
              accountId: secondaryAccount.id,
              amount: 5000,
              transactionType: TRANSACTION_TYPES.expense,
              categoryId: secondaryCategoryId,
            }),
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationAmount: 5000,
            destinationAccountId: primaryAccount.id,
          },
          raw: true,
        }),
    });
    expect(secondaryLeg!.transferId).toBeTruthy();
    expect(secondaryLeg!.transferId).toBe(primaryLeg!.transferId);

    // Household membership means primary owns a shared household resource, so the wipe
    // needs an explicit acknowledgement to proceed.
    const wipeRes = await helpers.wipeUserData({ acknowledgeSharing: true });
    expect(wipeRes.statusCode).toBe(200);

    // Primary's leg dies with the account.
    expect(await Transactions.findByPk(primaryLeg!.id)).toBeNull();

    // Secondary's leg survives as a standalone, with its transferId cleared and nature
    // flipped to out_of_wallet. The note carries the counterpart account name as a paper
    // trail of where the funds went.
    const secondaryLegAfter = await Transactions.findByPk(secondaryLeg!.id);
    expect(secondaryLegAfter).not.toBeNull();
    expect(secondaryLegAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
    expect(secondaryLegAfter!.transferId).toBeNull();
    expect(secondaryLegAfter!.note).toContain('Primary A');
  });

  it('returns 409 when user owns shared resources and acknowledgeSharing is false', async () => {
    const account = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: account.id,
      permission: SHARE_PERMISSIONS.read,
      raw: true,
    });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
    });

    const wipeRes = await helpers.wipeUserData();
    expect(wipeRes.statusCode).toBe(409);
    expect(wipeRes.body.response.code).toBe(API_ERROR_CODES.wipeDataSharingAcknowledgementRequired);
    expect(wipeRes.body.response.details).toMatchObject({
      sharedResources: {
        accounts: expect.arrayContaining([
          expect.objectContaining({ id: String(account.id), recipientUserId: expect.any(Number) }),
        ]),
      },
    });

    // Account still exists — the 409 path is a no-op.
    expect(await Accounts.findAll({ where: { id: account.id } })).toHaveLength(1);
  });

  it('wipes when acknowledgeSharing=true even with shared resources', async () => {
    const account = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: account.id,
      permission: SHARE_PERMISSIONS.read,
      raw: true,
    });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
    });

    const wipeRes = await helpers.wipeUserData({ acknowledgeSharing: true });
    expect(wipeRes.statusCode).toBe(200);

    expect(await Accounts.findAll({ where: { id: account.id } })).toHaveLength(0);
    const shares = await ResourceShares.findAll({
      where: { resourceType: RESOURCE_TYPES.account, resourceId: String(account.id) },
    });
    expect(shares).toHaveLength(0);
  });

  it('returns 200 immediately when there are no shared resources, regardless of acknowledgeSharing', async () => {
    await helpers.createAccount({ raw: true });

    // First call without ack — should succeed because nothing is shared.
    const wipeRes = await helpers.wipeUserData();
    expect(wipeRes.statusCode).toBe(200);

    const userAfter = await Users.findOne({ where: {} });
    expect(userAfter).not.toBeNull();
  });

  it('preserves the better-auth session so the user stays logged in', async () => {
    const userBefore = await Users.findOne({ where: {} });
    const authUserId = userBefore!.authUserId;

    await helpers.createAccount({ raw: true });
    const wipeRes = await helpers.wipeUserData();
    expect(wipeRes.statusCode).toBe(200);

    // Subsequent authenticated request on the same cookies still resolves the user.
    const meRes = await helpers.makeRequest({ method: 'get', url: '/user' });
    expect(meRes.statusCode).toBe(200);

    const baUserRow = await authPool.query<{ id: string }>('SELECT id FROM ba_user WHERE id = $1', [authUserId]);
    expect(baUserRow.rows.length).toBe(1);

    const [baSessionRows] = await connection.sequelize.query('SELECT id FROM ba_session WHERE "userId" = :authUserId', {
      replacements: { authUserId },
    });
    expect((baSessionRows as { id: string }[]).length).toBeGreaterThanOrEqual(1);
  });
});
