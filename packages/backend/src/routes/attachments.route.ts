import { FEATURES } from '@bt/shared/types';
import { deleteAttachmentController, getAttachmentFileController } from '@controllers/attachments.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { requireFeature } from '@middlewares/entitlements';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Downloading stays ungated so a lapsed user can still reach their own files.
router.get(
  '/:id/file',
  authenticateSession,
  validateEndpoint(getAttachmentFileController.schema),
  getAttachmentFileController.handler,
);

router.delete(
  '/:id',
  authenticateSession,
  requireFeature(FEATURES.attachments),
  validateEndpoint(deleteAttachmentController.schema),
  deleteAttachmentController.handler,
);

export default router;
