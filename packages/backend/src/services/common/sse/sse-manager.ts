import { logger } from '@js/utils/logger';
import { Response } from 'express';

import { SSEEventPayload, SSEEventType } from './types';

interface SSEConnection {
  res: Response;
  connectionId: string;
}

/**
 * SSE Manager - manages SSE connections per user
 *
 * Tracks active connections and provides methods to send events to specific users.
 */
class SSEManager {
  // Map of userId to Set of connections (one user can have multiple connections/tabs)
  private clients: Map<number, Set<SSEConnection>> = new Map();

  /**
   * Add a client connection for a user
   */
  addClient({ userId, res, connectionId }: { userId: number; res: Response; connectionId: string }): void {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }

    this.clients.get(userId)!.add({ res, connectionId });

    logger.info(
      `[SSE] Client connected: user=${userId} conn=${connectionId}. Total: ${this.getConnectionCount(userId)}`,
    );
  }

  /**
   * Remove a client connection for a user
   */
  removeClient({ userId, res, connectionId }: { userId: number; res: Response; connectionId: string }): void {
    const userClients = this.clients.get(userId);

    if (userClients) {
      // Find and remove the connection by res reference
      for (const conn of userClients) {
        if (conn.res === res) {
          userClients.delete(conn);
          break;
        }
      }

      if (userClients.size === 0) {
        this.clients.delete(userId);
      }

      logger.info(
        `[SSE] Client disconnected: user=${userId} conn=${connectionId}. Remaining: ${this.getConnectionCount(userId)}`,
      );
    }
  }

  /**
   * Send an event to all connections of a specific user
   */
  sendToUser({ userId, event, data }: { userId: number; event: SSEEventType; data: SSEEventPayload }): void {
    const userClients = this.clients.get(userId);

    if (!userClients || userClients.size === 0) {
      // No active connections - this is expected, not an error
      return;
    }

    const message = this.formatSSEMessage({ event, data });

    userClients.forEach((conn) => {
      try {
        conn.res.write(message);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error({ message: `[SSE] Error sending to conn=${conn.connectionId} user=${userId}`, error });
        // Remove failed connection
        this.removeClient({ userId, res: conn.res, connectionId: conn.connectionId });
      }
    });

    logger.info(`[SSE] Sent ${event} to ${userClients.size} connection(s) for user ${userId}`);
  }

  /**
   * Get number of active connections for a user
   */
  getConnectionCount(userId: number): number {
    return this.clients.get(userId)?.size ?? 0;
  }

  /**
   * Check if user has any active connections
   */
  hasConnections(userId: number): boolean {
    return this.getConnectionCount(userId) > 0;
  }

  /**
   * Format an SSE message according to spec
   * Format: event: <name>\ndata: <json>\n\n
   */
  private formatSSEMessage({ event, data }: { event: SSEEventType; data: SSEEventPayload }): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}

// Export singleton instance
export const sseManager = new SSEManager();
