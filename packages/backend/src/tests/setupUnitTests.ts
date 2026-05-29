/**
 * Setup file for unit tests.
 * Mocks external dependencies like Redis to prevent connection attempts and sets
 * stable defaults for env vars that are read at module-evaluation time elsewhere
 * (e.g., `APPLICATION_JWT_SECRET` in `common/utils/encryption.ts`).
 */
import { vi } from 'vitest';

if (!process.env.APPLICATION_JWT_SECRET) {
  process.env.APPLICATION_JWT_SECRET = 'unit-test-secret';
}

// Mock the redis-client module to prevent actual Redis connections in unit tests
vi.mock('@root/redis-client', () => ({
  redisClient: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue([]),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(-1),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
    status: 'ready',
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  },
  redisReady: Promise.resolve(),
  REDIS_KEY_PREFIX: undefined,
}));
