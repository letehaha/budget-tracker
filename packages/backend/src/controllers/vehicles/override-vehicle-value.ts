import { decimalMoney, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransaction } from '@root/serializers';
import { serializeVehicle } from '@root/serializers/vehicles.serializer';
import { overrideVehicleValue } from '@services/vehicles/override-vehicle-value.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z.object({
    targetValue: decimalMoney().refine((m) => !m.isNegative(), { message: 'targetValue must be >= 0' }),
    note: z.string().max(500).optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const { adjustment, vehicle } = await overrideVehicleValue({
    userId: user.id,
    vehicleId: params.id,
    targetValue: body.targetValue,
    note: body.note,
  });

  return {
    data: {
      vehicle: vehicle ? serializeVehicle(vehicle) : null,
      transaction: adjustment.transaction ? serializeTransaction(adjustment.transaction) : null,
      previousBalance: adjustment.previousBalance.toNumber(),
      newBalance: adjustment.newBalance.toNumber(),
    },
  };
});
