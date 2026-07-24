import createDealController from '@controllers/venture/deals/create-deal.controller';
import deleteDealController from '@controllers/venture/deals/delete-deal.controller';
import getDealMetricsController from '@controllers/venture/deals/get-deal-metrics.controller';
import getDealController from '@controllers/venture/deals/get-deal.controller';
import listDealsController from '@controllers/venture/deals/list-deals.controller';
import updateDealController from '@controllers/venture/deals/update-deal.controller';
import appendLinksController from '@controllers/venture/events/append-links.controller';
import createEventController from '@controllers/venture/events/create-event.controller';
import deleteEventController from '@controllers/venture/events/delete-event.controller';
import deleteLinkController from '@controllers/venture/events/delete-link.controller';
import getEventController from '@controllers/venture/events/get-event.controller';
import listEventsController from '@controllers/venture/events/list-events.controller';
import replaceLinksController from '@controllers/venture/events/replace-links.controller';
import updateEventController from '@controllers/venture/events/update-event.controller';
import createPlatformController from '@controllers/venture/platforms/create-platform.controller';
import deletePlatformController from '@controllers/venture/platforms/delete-platform.controller';
import getPlatformController from '@controllers/venture/platforms/get-platform.controller';
import listPlatformsController from '@controllers/venture/platforms/list-platforms.controller';
import updatePlatformController from '@controllers/venture/platforms/update-platform.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.use(authenticateSession);

// Platforms
router.get('/platforms', validateEndpoint(listPlatformsController.schema), listPlatformsController.handler);
router.get('/platforms/:id', validateEndpoint(getPlatformController.schema), getPlatformController.handler);
router.post(
  '/platforms',
  checkBaseCurrencyLock,
  validateEndpoint(createPlatformController.schema),
  createPlatformController.handler,
);
router.put(
  '/platforms/:id',
  checkBaseCurrencyLock,
  validateEndpoint(updatePlatformController.schema),
  updatePlatformController.handler,
);
router.delete(
  '/platforms/:id',
  checkBaseCurrencyLock,
  validateEndpoint(deletePlatformController.schema),
  deletePlatformController.handler,
);

// Deals
router.get('/deals', validateEndpoint(listDealsController.schema), listDealsController.handler);
router.get('/deals/:id', validateEndpoint(getDealController.schema), getDealController.handler);
router.get('/deals/:id/metrics', validateEndpoint(getDealMetricsController.schema), getDealMetricsController.handler);
router.post(
  '/deals',
  checkBaseCurrencyLock,
  validateEndpoint(createDealController.schema),
  createDealController.handler,
);
router.put(
  '/deals/:id',
  checkBaseCurrencyLock,
  validateEndpoint(updateDealController.schema),
  updateDealController.handler,
);
router.delete(
  '/deals/:id',
  checkBaseCurrencyLock,
  validateEndpoint(deleteDealController.schema),
  deleteDealController.handler,
);

// Events
router.get('/deals/:dealId/events', validateEndpoint(listEventsController.schema), listEventsController.handler);
router.post(
  '/deals/:dealId/events',
  checkBaseCurrencyLock,
  validateEndpoint(createEventController.schema),
  createEventController.handler,
);
router.get('/events/:id', validateEndpoint(getEventController.schema), getEventController.handler);
router.put(
  '/events/:id',
  checkBaseCurrencyLock,
  validateEndpoint(updateEventController.schema),
  updateEventController.handler,
);
router.delete(
  '/events/:id',
  checkBaseCurrencyLock,
  validateEndpoint(deleteEventController.schema),
  deleteEventController.handler,
);

// Event links
router.post(
  '/events/:id/links',
  checkBaseCurrencyLock,
  validateEndpoint(appendLinksController.schema),
  appendLinksController.handler,
);
router.put(
  '/events/:id/links',
  checkBaseCurrencyLock,
  validateEndpoint(replaceLinksController.schema),
  replaceLinksController.handler,
);
router.delete(
  '/events/:id/links/:linkId',
  checkBaseCurrencyLock,
  validateEndpoint(deleteLinkController.schema),
  deleteLinkController.handler,
);

export default router;
