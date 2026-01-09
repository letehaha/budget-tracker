// Bootstrap file - loads env vars and initializes early services.
// This file must be imported first in app.ts.
import { initPostHog } from '@js/utils/posthog';
import { initSentry } from '@js/utils/sentry';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables first
const envPath = path.join(__dirname, `../../../.env.${process.env.NODE_ENV}`);
dotenv.config({ path: envPath });

// Initialize monitoring services early (after env vars are loaded)
// Note: imports are hoisted, but these function calls execute after dotenv.config()
initSentry();
initPostHog();
