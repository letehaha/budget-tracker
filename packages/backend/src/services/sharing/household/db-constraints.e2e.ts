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
  describe('ResourceShares', () => {
    it('accepts a valid account row (control)', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const account = await helpers.createAccount({ raw: true });

      const row = await ResourceShares.create({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        resourceType: RESOURCE_TYPES.account,
        resourceId: String(account.id),
        permission: SHARE_PERMISSIONS.read,
        acceptedAt: new Date(),
      });

      expect(row.id).toBeTruthy();
    });

    it('accepts a valid household row where resourceId equals ownerUserId', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const account = await helpers.createAccount({ raw: true });

      const row = await ResourceShares.create({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        resourceType: RESOURCE_TYPES.household,
        resourceId: String(account.userId),
        permission: SHARE_PERMISSIONS.write,
        acceptedAt: new Date(),
      });

      expect(row.id).toBeTruthy();
      expect(row.resourceType).toBe(RESOURCE_TYPES.household);
    });

    it('rejects a household row with permission=manage', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const account = await helpers.createAccount({ raw: true });

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
    });

    it('rejects a household row where resourceId does not equal ownerUserId', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const account = await helpers.createAccount({ raw: true });

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
    });

    it('rejects an account row with a non-numeric resourceId', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const account = await helpers.createAccount({ raw: true });

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
    });

    it('rejects a household row with a non-numeric resourceId', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const account = await helpers.createAccount({ raw: true });

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
    });
  });

  describe('ShareInvitations', () => {
    it('accepts a valid household invitation where resourceId equals ownerUserId', async () => {
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
    });

    it('rejects a household invitation with permission=manage', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const account = await helpers.createAccount({ raw: true });

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
    });

    it('rejects a household invitation where resourceId does not equal ownerUserId', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const account = await helpers.createAccount({ raw: true });

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
    });

    it('rejects an account invitation with a non-numeric resourceId', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const account = await helpers.createAccount({ raw: true });

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
    });
  });
});
