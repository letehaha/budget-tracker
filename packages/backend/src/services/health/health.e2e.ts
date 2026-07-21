import { describe, expect, it } from '@jest/globals';
import { app } from '@root/app';
import request from 'supertest';

describe('Health endpoint', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok for an unauthenticated request', async () => {
      // Hit the root-level path (no /api/v1 prefix) directly, without attaching
      // any session cookie — the liveness probe must answer without auth.
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
