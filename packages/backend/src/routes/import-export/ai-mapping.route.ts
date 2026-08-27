import { aiMapCategoriesController } from '@controllers/import-export/ai-map-categories.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

/**
 * Ask AI to match imported source category names to the user's existing categories
 * POST /import/ai-map-categories
 */
router.post(
  '/ai-map-categories',
  authenticateSession,
  validateEndpoint(aiMapCategoriesController.schema),
  aiMapCategoriesController.handler,
);

export default router;
