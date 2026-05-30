import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteVehicle } from '@services/vehicles/delete-vehicle.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  await deleteVehicle({ userId: user.id, vehicleId: params.id });
  return { data: { id: params.id } };
});
