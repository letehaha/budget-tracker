import { RESOURCE_TYPES, SHARE_INVITATION_STATUSES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import * as helpers from '@tests/helpers';
import { randomBytes } from 'crypto';

/**
 * Schema invariants. The migration adds CHECK constraints to `ResourceShares` and
 * `ShareInvitations` so a service-layer bug cannot poison the tables with shape-violating
 * rows. These tests bypass the service layer and write directly to the model so the
 * assertions track the DB constraint itself, not the validators on top of it.
 */

const POSTGRES_CHECK_VIOLATION_CODE = '23514';

const expectsCheckViolation = (action: () => Promise<unknown>, constraintNameFragment: string) =>
  expect(action()).rejects.toMatchObject({
    name: 'SequelizeDatabaseError',
    original: expect.objectContaining({
      code: POSTGRES_CHECK_VIOLATION_CODE,
      constraint: expect.stringContaining(constraintNameFragment),
    }),
  });

const futureDate = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const uniqueToken = () => randomBytes(32).toString('base64url');

describe('ResourceShares + ShareInvitations CHECK constraint enforcement for household rows', () => {
  it('ResourceShares CHECK constraints accept valid account/household rows and reject bad shapes', async () => {
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
    const account = await helpers.createAccount({ raw: true });

    const accountRow = await ResourceShares.create({
      ownerUserId: account.userId,
      sharedWithUserId: recipientApp.id,
      resourceType: RESOURCE_TYPES.account,
      resourceId: String(account.id),
      permission: SHARE_PERMISSIONS.read,
      acceptedAt: new Date(),
    });

    expect(accountRow.id).toBeTruthy();

    const householdRow = await ResourceShares.create({
      ownerUserId: account.userId,
      sharedWithUserId: recipientApp.id,
      resourceType: RESOURCE_TYPES.household,
      resourceId: String(account.userId),
      permission: SHARE_PERMISSIONS.write,
      acceptedAt: new Date(),
    });

    expect(householdRow.id).toBeTruthy();
    expect(householdRow.resourceType).toBe(RESOURCE_TYPES.household);

    await expectsCheckViolation(
      () =>
        ResourceShares.create({
          ownerUserId: account.userId,
          sharedWithUserId: recipientApp.id,
          resourceType: RESOURCE_TYPES.household,
          resourceId: String(account.userId),
          permission: SHARE_PERMISSIONS.manage,
          acceptedAt: new Date(),
        }),
      'chk_resource_shares_household_permission',
    );

    await expectsCheckViolation(
      () =>
        ResourceShares.create({
          ownerUserId: account.userId,
          sharedWithUserId: recipientApp.id,
          resourceType: RESOURCE_TYPES.household,
          // Off-by-one — should equal ownerUserId.
          resourceId: String(account.userId + 1),
          permission: SHARE_PERMISSIONS.read,
          acceptedAt: new Date(),
        }),
      'chk_resource_shares_type_shape',
    );

    await expectsCheckViolation(
      () =>
        ResourceShares.create({
          ownerUserId: account.userId,
          sharedWithUserId: recipientApp.id,
          resourceType: RESOURCE_TYPES.account,
          resourceId: 'not-a-number',
          permission: SHARE_PERMISSIONS.read,
          acceptedAt: new Date(),
        }),
      'chk_resource_shares_type_shape',
    );

    await expectsCheckViolation(
      () =>
        ResourceShares.create({
          ownerUserId: account.userId,
          sharedWithUserId: recipientApp.id,
          resourceType: RESOURCE_TYPES.household,
          resourceId: 'household-foo',
          permission: SHARE_PERMISSIONS.read,
          acceptedAt: new Date(),
        }),
      'chk_resource_shares_type_shape',
    );
  }, 60_000);

  it('ShareInvitations CHECK constraints accept a valid household invite and reject bad shapes', async () => {
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const account = await helpers.createAccount({ raw: true });

    const row = await ShareInvitations.create({
      ownerUserId: account.userId,
      inviteeEmail: recipient.email,
      inviteeUserId: null,
      resourceType: RESOURCE_TYPES.household,
      resourceId: String(account.userId),
      permission: SHARE_PERMISSIONS.write,
      policy: null,
      token: uniqueToken(),
      status: SHARE_INVITATION_STATUSES.pending,
      expiresAt: futureDate(),
    });

    expect(row.id).toBeTruthy();
    expect(row.resourceType).toBe(RESOURCE_TYPES.household);

    await expectsCheckViolation(
      () =>
        ShareInvitations.create({
          ownerUserId: account.userId,
          inviteeEmail: recipient.email,
          inviteeUserId: null,
          resourceType: RESOURCE_TYPES.household,
          resourceId: String(account.userId),
          permission: SHARE_PERMISSIONS.manage,
          policy: null,
          token: uniqueToken(),
          status: SHARE_INVITATION_STATUSES.pending,
          expiresAt: futureDate(),
        }),
      'chk_share_invitations_household_permission',
    );

    await expectsCheckViolation(
      () =>
        ShareInvitations.create({
          ownerUserId: account.userId,
          inviteeEmail: recipient.email,
          inviteeUserId: null,
          resourceType: RESOURCE_TYPES.household,
          resourceId: String(account.userId + 1),
          permission: SHARE_PERMISSIONS.read,
          policy: null,
          token: uniqueToken(),
          status: SHARE_INVITATION_STATUSES.pending,
          expiresAt: futureDate(),
        }),
      'chk_share_invitations_type_shape',
    );

    await expectsCheckViolation(
      () =>
        ShareInvitations.create({
          ownerUserId: account.userId,
          inviteeEmail: recipient.email,
          inviteeUserId: null,
          resourceType: RESOURCE_TYPES.account,
          resourceId: 'not-a-number',
          permission: SHARE_PERMISSIONS.read,
          policy: null,
          token: uniqueToken(),
          status: SHARE_INVITATION_STATUSES.pending,
          expiresAt: futureDate(),
        }),
      'chk_share_invitations_type_shape',
    );
  }, 60_000);
});
