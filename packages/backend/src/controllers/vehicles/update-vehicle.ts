import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicle } from '@root/serializers/vehicles.serializer';
import { updateVehicle } from '@services/vehicles/update-vehicle.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z.object({
    name: z.string().min(1).max(200).trim().optional(),
    make: z.string().min(1).max(100).trim().optional(),
    model: z.string().min(1).max(100).trim().optional(),
    trim: z.string().max(100).nullable().optional(),
    year: z
      .number()
      .int()
      .min(1900)
      .max(new Date().getFullYear() + 1)
      .optional(),
    vehicleClass: z.nativeEnum(VEHICLE_CLASS).optional(),
    depreciationPreset: z.nativeEnum(DEPRECIATION_PRESET).optional(),
    customAnnualRatePct: z.number().min(0).max(100).nullable().optional(),
    salvageFloorPct: z.number().min(0).max(100).optional(),
    currentMileage: z.number().int().min(0).nullable().optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const vehicle = await updateVehicle({
    userId: user.id,
    vehicleId: params.id,
    ...body,
  });
  return { data: vehicle ? serializeVehicle(vehicle) : null };
});
