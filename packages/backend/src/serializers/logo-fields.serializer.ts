/**
 * Logo Fields Serializer
 *
 * Projects the denormalized logo columns any logo-bearing entity carries onto
 * its API response.
 */
import type { EntityLogoFields } from '@bt/shared/types';

export function serializeLogoFields({ entity }: { entity: EntityLogoFields }): EntityLogoFields {
  return {
    logoDomain: entity.logoDomain,
    logoInitials: entity.logoInitials,
    logoColor: entity.logoColor,
  };
}
