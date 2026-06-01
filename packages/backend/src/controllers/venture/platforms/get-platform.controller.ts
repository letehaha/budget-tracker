import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVenturePlatform } from '@root/serializers';
import { getVenturePlatform } from '@services/venture/platforms/get.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
  }),
  async ({ user, params }) => {
    const platform = await getVenturePlatform({
      userId: user.id,
      platformId: params.id,
    });
    return { data: serializeVenturePlatform(platform) };
  },
);
