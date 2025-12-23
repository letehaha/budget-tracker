import { logger } from '@js/utils/logger';
import { authenticateJwt } from '@middlewares/passport';
import { Router } from 'express';

import { getUserAccountsSyncStatus } from '../services/bank-data-providers/sync/get-user-sync-status';
import { SSE_EVENT_TYPES, sseManager } from '../services/common/sse';

const router = Router({});

const KEEPALIVE_INTERVAL_MS = 30000; // 30 seconds

/**
 * SSE Events endpoint
 *
 * Establishes a Server-Sent Events connection for real-time updates.
 * Requires authentication via JWT token in Authorization header.
 */
router.get('/events', authenticateJwt, async (req, res) => {
  const userId = (req.user as { id: number }).id;
  // Reuse requestId from middleware as connection ID for tracing
  const connectionId = (req as { requestId?: string }).requestId ?? 'unknown';

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Flush headers immediately
  res.flushHeaders();

  // Send initial connection success message
  try {
    res.write(': connected\n\n');
  } catch {
    // Connection closed immediately - nothing to do
    logger.warn(`[SSE] Connection ${connectionId} closed before setup for user ${userId}`);
    return;
  }

  // Register client with SSE manager
  sseManager.addClient({ userId, res, connectionId });

  // Send initial sync status if there's an active sync
  try {
    const syncStatus = await getUserAccountsSyncStatus(userId);
    const hasActiveSync = syncStatus.summary.syncing > 0 || syncStatus.summary.queued > 0;

    if (hasActiveSync) {
      res.write(`event: ${SSE_EVENT_TYPES.SYNC_STATUS_CHANGED}\n`);
      res.write(`data: ${JSON.stringify(syncStatus)}\n\n`);
    }
  } catch (err) {
    logger.error({ message: '[SSE] Failed to send initial sync status', error: err as Error });
  }

  // Set up keepalive interval for this specific connection
  const keepaliveInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      // Connection failed - cleanup will happen in 'close' handler
      clearInterval(keepaliveInterval);
    }
  }, KEEPALIVE_INTERVAL_MS);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(keepaliveInterval);
    sseManager.removeClient({ userId, res, connectionId });
  });
});

export default router;
