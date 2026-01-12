import { getAllReminders } from '@controllers/tag-reminders';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Get all reminders for the user (across all tags)
router.get('/', authenticateSession, validateEndpoint(getAllReminders.schema), getAllReminders.handler);

export default router;
