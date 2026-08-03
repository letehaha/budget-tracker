import type { RefreshResourceLeaseResponse } from '@bt/shared/types';
import { ResourceLeaseType } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { refreshResourceLease } from '@services/common/resource-lease-registry';
import { z } from 'zod';

/**
 * Id of a leased resource. Every lease id is minted with `randomUUID`, so
 * anything else is rejected here rather than reaching a lookup.
 */
const resourceLeaseIdSchema = z.uuid();

/**
 * Extends a lease while the user is still working with the resource. A miss is
 * the ordinary 404 the resource's own endpoints return, which is how a client
 * learns the resource is gone before it tries to use it.
 */
export const refreshResourceLeaseController = createController(
  z.object({
    body: z.object({
      type: z.enum(ResourceLeaseType),
      id: resourceLeaseIdSchema,
    }),
  }),
  async ({ user, body }) => {
    const data: RefreshResourceLeaseResponse = await refreshResourceLease({
      userId: user.id,
      type: body.type,
      id: body.id,
    });
    return { data };
  },
);
