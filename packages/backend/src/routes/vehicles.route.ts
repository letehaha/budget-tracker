import createVehicle from '@controllers/vehicles/create-vehicle';
import deleteVehicle from '@controllers/vehicles/delete-vehicle';
import getVehicle from '@controllers/vehicles/get-vehicle';
import getVehicles from '@controllers/vehicles/get-vehicles';
import overrideVehicleValue from '@controllers/vehicles/override-vehicle-value';
import updateVehicle from '@controllers/vehicles/update-vehicle';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getVehicles.schema), getVehicles.handler);
router.get('/:id', authenticateSession, validateEndpoint(getVehicle.schema), getVehicle.handler);
router.post(
  '/',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createVehicle.schema),
  createVehicle.handler,
);
router.patch(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateVehicle.schema),
  updateVehicle.handler,
);
router.post(
  '/:id/value',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(overrideVehicleValue.schema),
  overrideVehicleValue.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteVehicle.schema),
  deleteVehicle.handler,
);

export default router;
