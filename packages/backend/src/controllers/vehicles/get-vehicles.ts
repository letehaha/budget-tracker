import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicles } from '@root/serializers/vehicles.serializer';
import { getVehicles } from '@services/vehicles/get-vehicles.service';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const vehicles = await getVehicles({ userId: user.id });
  return { data: serializeVehicles(vehicles) };
});
