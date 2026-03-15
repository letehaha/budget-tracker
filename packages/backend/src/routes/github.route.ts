import * as githubController from '@controllers/github.controller';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Public endpoint - no authentication required
router.get(
  '/activity',
  validateEndpoint(githubController.getGitHubActivity.schema),
  githubController.getGitHubActivity.handler,
);

export default router;
