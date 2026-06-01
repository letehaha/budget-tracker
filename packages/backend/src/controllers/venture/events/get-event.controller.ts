import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVentureEvent } from '@root/serializers';
import { getVentureEvent } from '@services/venture/events/get.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
  }),
  async ({ user, params }) => {
    const event = await getVentureEvent({ userId: user.id, eventId: params.id });
    return { data: serializeVentureEvent(event) };
  },
);
