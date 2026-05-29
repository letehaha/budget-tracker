/**
 * Venture Platform Serializers
 *
 * Shapes VenturePlatforms rows for API responses. Drops persistence-only
 * fields (createdAt, updatedAt, deletedAt) so the wire matches the shared
 * VenturePlatformModel contract consumed by the frontend.
 */
import type { VenturePlatformModel } from '@bt/shared/types';
import type VenturePlatforms from '@models/venture/venture-platforms.model';

export function serializeVenturePlatform(platform: VenturePlatforms): VenturePlatformModel {
  return {
    id: platform.id,
    userId: platform.userId,
    name: platform.name,
    website: platform.website,
    description: platform.description,
    defaultEntryFeePct: platform.defaultEntryFeePct,
    defaultMgmtFeePct: platform.defaultMgmtFeePct,
    defaultCarryPct: platform.defaultCarryPct,
    defaultHurdlePct: platform.defaultHurdlePct,
  };
}

export function serializeVenturePlatforms(platforms: VenturePlatforms[]): VenturePlatformModel[] {
  return platforms.map(serializeVenturePlatform);
}
