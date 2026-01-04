/**
 * Mock implementation of better-auth/node for Jest tests.
 * This provides the toNodeHandler function that wraps the better-auth handler.
 */
import type { NextFunction, Request, Response } from 'express';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toNodeHandler(auth: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Convert Express request/response to Web API Request/Response
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      const headers = new Headers();
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      });

      const webRequest = new Request(url.toString(), {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
      });

      // Call the better-auth handler
      const webResponse = await auth.handler(webRequest);

      // Convert Web Response back to Express response
      webResponse.headers.forEach((value: string, key: string) => {
        res.setHeader(key, value);
      });

      res.status(webResponse.status);

      const body = await webResponse.text();
      if (body) {
        res.send(body);
      } else {
        res.end();
      }
    } catch (error) {
      next(error);
    }
  };
}
