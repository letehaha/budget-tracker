import createProperty from '@controllers/properties/create-property';
import deleteProperty from '@controllers/properties/delete-property';
import getProperties from '@controllers/properties/get-properties';
import getProperty from '@controllers/properties/get-property';
import updateProperty from '@controllers/properties/update-property';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getProperties.schema), getProperties.handler);
router.get('/:id', authenticateSession, validateEndpoint(getProperty.schema), getProperty.handler);
router.post(
  '/',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createProperty.schema),
  createProperty.handler,
);
router.patch(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateProperty.schema),
  updateProperty.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteProperty.schema),
  deleteProperty.handler,
);

export default router;
