import { RESOURCE_TYPES, ResourceType } from '@bt/shared/types';
import { ConflictError } from '@js/errors';
import ResourceShares from '@models/resource-shares.model';
import { getEntitlementsByUserId } from '@services/entitlements/resolve-entitlements.service';
import { Op } from 'sequelize';

/**
 * Seats come from the owner's plan, so the cap moves with their subscription. Only
 * accepted shares count; pending invitations are free. `voice` picks who is being told:
 * the owner sending an invitation, or the recipient accepting one.
 */
export const assertSeatAvailable = async ({
  ownerUserId,
  resourceType,
  resourceId,
  voice,
}: {
  ownerUserId: number;
  resourceType: ResourceType;
  resourceId: number | string;
  voice: 'owner' | 'recipient';
}): Promise<void> => {
  const acceptedCount = await ResourceShares.count({
    where: {
      resourceType,
      resourceId: String(resourceId),
      acceptedAt: { [Op.not]: null },
    },
  });

  const { seats } = await getEntitlementsByUserId({ userId: ownerUserId });
  if (acceptedCount < seats) return;

  const target = resourceType === RESOURCE_TYPES.household ? 'household member(s)' : 'recipient(s)';
  throw new ConflictError({
    message:
      voice === 'owner'
        ? `Your plan allows ${seats} ${target}; upgrade to add more.`
        : `This resource is full — the owner's plan allows ${seats} active ${target}.`,
  });
};
