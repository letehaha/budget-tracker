# Backend Conventions

## Architecture

Strict **route → controller → service** pattern. No business logic in routes or controllers.

```
src/
├── routes/{feature}.route.ts
├── controllers/{feature}.controller.ts
└── services/{feature}/{action}.service.ts
```

## Path Aliases

Defined in `packages/backend/tsconfig.json`:

- `@routes/*` → `src/routes/*`
- `@controllers/*` → `src/controllers/*`
- `@services/*` → `src/services/*`
- `@models/*` → `src/models/*`
- `@middlewares/*` → `src/middlewares/*`
- `@common/*` → `src/common/*`
- `@js/*` → `src/js/*`
- `@crons/*` → `src/crons/*`
- `@tests/*` → `src/tests/*`
- `@root/*` → `src/*`
- `@bt/shared/*` → `../../shared/src/*`

## Route Layer

```typescript
import { Router } from 'express';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import featureController from '@controllers/feature.controller';

const router = Router();

router.get(
  '/',
  authenticateSession,
  validateEndpoint(featureController.schema),
  featureController.handler,
);

export default router;
```

## Controller Layer

Always use `createController` factory. Keep controllers thin — delegate to services.

```typescript
import { createController } from '@controllers/helpers/controller-factory';
import * as featureService from '@services/feature.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }).optional(), // custom Zod types from @common/lib/zod/custom-types
  query: z.object({}).optional(),
  body: z.object({}).optional(),
});

export default createController(schema, async ({ user, params, query, body }) => {
  const data = await featureService.doSomething({ userId: user.id, ...params });
  return { data }; // return { data, statusCode? }
});
```

## Service Layer

- Always use **object-based parameters** with interfaces
- Use `withTransaction` for data modifications
- Use functions, never classes
- Error types from `@js/errors`: `NotFoundError`, `ValidationError`, `ConflictError`, `NotAllowedError`, `Unauthorized`

```typescript
import { NotFoundError } from '@js/errors';
import * as FeatureModel from '@models/Feature.model';
import { withTransaction } from '@services/common/with-transaction';

interface GetFeatureParams {
  userId: number;
  id: number;
  includeDeleted?: boolean;
}

const getFeatureImpl = async ({ userId, id, includeDeleted = false }: GetFeatureParams) => {
  const result = await FeatureModel.findOne({ where: { id, userId }, paranoid: !includeDeleted });
  if (!result) throw new NotFoundError({ message: 'Resource not found' });
  return result;
};

export const getFeature = withTransaction(getFeatureImpl);
```

## API Response Format

```typescript
// Success
{ status: API_RESPONSE_STATUS.success, response: unknown }

// Error
{ status: API_RESPONSE_STATUS.error, error: { message: string, code?: string, details?: unknown } }
```

## Common Middleware

- `authenticateSession` — authentication (better-auth sessions)
- `validateEndpoint` — request validation via Zod schema

## Shared Types

- API types: `@bt/shared/types/api.ts`
- DB models: `@bt/shared/types/db-models.ts`
- Endpoints: `@bt/shared/types/endpoints.ts`

## E2E Test Helpers

Test helpers live in `packages/backend/src/tests/helpers/`. Always type the return value:

```typescript
import { createInvestmentTransaction as _createInvestmentTransaction } from '@services/investments/transactions/create.service';

export async function createInvestmentTransaction<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: ReturnType<typeof buildInvestmentTransactionPayload>;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _createInvestmentTransaction>>, R>({
    method: 'post',
    url: '/investments/transaction',
    payload,
    raw,
  });
}
```

## Database

- Use Sequelize for all DB operations
- Always use transactions for multi-step operations (`withTransaction`)
- Define proper indexes
