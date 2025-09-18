# Rate Limiting Middleware

This middleware provides Redis-based rate limiting for API endpoints.

## Features

- **Redis-backed**: Uses Redis for distributed rate limiting
- **Configurable**: Custom time windows and attempt limits
- **User-aware**: Rate limiting by user ID or IP address
- **Standard headers**: Returns RFC-compliant rate limit headers
- **Graceful degradation**: Allows requests if Redis is unavailable

## Usage

### Pre-configured Middleware

```typescript
import { apiRateLimit, authRateLimit, priceSyncRateLimit } from '@middlewares/rate-limit';

// 5-minute window, 1 attempt per user
router.post('/expensive-operation', authenticateJwt, priceSyncRateLimit, handler);

// 1-minute window, 60 attempts per user
router.get('/api-data', authenticateJwt, apiRateLimit, handler);

// 15-minute window, 5 attempts per IP
router.post('/auth/login', authRateLimit, handler);
```

### Custom Rate Limiting

```typescript
import { createRateLimit } from '@middlewares/rate-limit';

const customRateLimit = createRateLimit({
  windowSeconds: 3600, // 1 hour
  maxAttempts: 10,
  keyGenerator: (req) => `custom:${req.user.id}:${req.path}`,
});

router.post('/custom-endpoint', authenticateJwt, customRateLimit, handler);
```

## Configuration Options

- `windowSeconds`: Time window in seconds
- `maxAttempts`: Maximum attempts allowed in the window (default: 1)
- `keyGenerator`: Function to generate rate limit keys (optional)

## Response Headers

When rate limited (429 status), the middleware sets:

- `Retry-After`: Seconds until the rate limit resets
- `X-RateLimit-Limit`: Maximum attempts allowed
- `X-RateLimit-Remaining`: Always 0 when rate limited
- `X-RateLimit-Reset`: Timestamp when rate limit resets

## Error Response

```json
{
  "status": "error",
  "response": {
    "code": 429,
    "statusText": "Too many requests. Please try again later.",
    "details": {
      "retryAfter": 250,
      "resetTime": "2024-01-01T12:05:00.000Z"
    }
  }
}
```

## Redis Key Format

Keys are automatically formatted as: `rate_limit:{custom-key}`

Examples:

- `rate_limit:price-sync:user:123`
- `rate_limit:api:user:456`
- `rate_limit:auth:ip:192.168.1.1`

## Manual Rate Limit Management

```typescript
import { RateLimitService } from '@services/common/rate-limit.service';

// Check current status
const status = await RateLimitService.getRateLimitStatus('price-sync:user:123');
// { count: 1, ttl: 250 }

// Reset rate limit
await RateLimitService.resetRateLimit('price-sync:user:123');
```
