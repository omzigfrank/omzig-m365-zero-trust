# Testing Patterns

**Analysis Date:** 2026-03-23

## Test Framework

**Runner:**
- Vitest (all packages and apps)
- `apps/api`: v2.0.0 — config at `apps/api/vitest.config.ts`
- `apps/web`: v2.0.0 — config at `apps/web/vitest.config.ts`
- `packages/audit`: config at `packages/audit/vitest.config.ts`
- `packages/db`: config at `packages/db/vitest.config.ts`

**Assertion Library:**
- Vitest built-in (`expect`) — no separate assertion library

**Run Commands:**
```bash
pnpm test                    # Run all tests via turbo
cd apps/api && pnpm test     # API tests only (vitest run)
cd apps/web && pnpm test     # Web tests only
cd packages/audit && pnpm test  # Audit package tests only
```

## Test File Organization

**Location:**
- API and audit packages: centralized in `src/__tests__/` directories (not co-located)
- Web app: mix — component tests in `src/__tests__/`, hook tests in `src/hooks/__tests__/`
- DB package: `src/__tests__/tenant-isolation.test.ts`
- Audit remediation: co-located subfolder `src/remediation/__tests__/`

**Naming:**
- Unit/integration: `{subject}.test.ts` or `{subject}.test.tsx`
- Test helpers: `helpers.ts` (no `.test.` suffix, not picked up as test file)
- Global setup: `setup.ts` (registered in `vitest.config.ts` `setupFiles`)
- Fixtures: `src/__tests__/fixtures/graph-responses.ts`

**Structure:**
```
apps/api/src/
  __tests__/
    setup.ts                    # Global mocks (mssql, @azure/*)
    helpers.ts                  # createTestAppWithAuth, createTestAppWithRbac
    auth.test.ts
    rbac.test.ts
    tenant-provisioning.test.ts
    ...

apps/web/src/
  __tests__/
    TenantDashboard.test.tsx
    ActionQueue.test.tsx
    ...
  hooks/__tests__/
    useAudit.test.ts

packages/audit/src/
  __tests__/
    fixtures/
      graph-responses.ts        # Shared Graph API mock responses
    evaluators.test.ts
    fact-collector.test.ts
    ...
  remediation/__tests__/
    remediation-registry.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
// API tests — import app lazily after mocks are set
import { describe, it, expect } from 'vitest';

const createTestApp = async () => {
  const { createApp } = await import('../app.js');
  return createApp();
};

describe('Auth middleware', () => {
  it('rejects requests without Authorization header with 401', async () => {
    const app = await createTestApp();
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiResponse;
    expect(body.error!.code).toBe('UNAUTHORIZED');
  });
});
```

**Patterns:**
- Setup: `beforeEach` resets mocks via `vi.clearAllMocks()` and sets `process.env` values
- Teardown: `afterEach` calls `cleanup()` (React Testing Library) and `vi.resetModules()` when dynamic imports are used
- Evaluator tests: two canonical fixture factories (`createPassingFacts()` + `createFailingFacts()`) used across all control tests in a file

## Mocking

**Framework:** Vitest `vi.mock()`, `vi.fn()`, `vi.stubGlobal()`

**Global setup mocks (apps/api/src/__tests__/setup.ts):**
External Azure/SQL modules that cannot be imported in test env are mocked globally at the setupFiles level:
```typescript
vi.mock('mssql', () => ({
  default: {
    ConnectionPool: vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      close: vi.fn(),
      request: vi.fn().mockReturnValue({ query: vi.fn() }),
    })),
  },
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({})),
  ManagedIdentityCredential: vi.fn().mockImplementation(() => ({})),
}));
```

**Per-test module mocks:**
```typescript
// Mock workspace packages
vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockResolvedValue({ update: mockUpdate, insert: mockInsert }),
  migrateTenantDb: vi.fn().mockResolvedValue(undefined),
  tenants: { id: 'tenants.id' },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((col, val) => ({ col, val })),
}));
```

**React component mocks (web tests):**
```typescript
// Mock Next.js router
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Mock hooks at module path
vi.mock('@/hooks/useTenants', () => ({
  useTenants: () => mockHookReturn,
}));

// Mock AuthGuard to pass-through children
vi.mock('@/components/layout/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
```

**Fetch mocking (hook tests):**
```typescript
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

mockFetch.mockResolvedValueOnce({
  ok: true,
  status: 200,
  json: async () => ({ data: { ... }, meta: { correlationId: 'c1', timestamp: '...' } }),
});
```

**What to Mock:**
- All external Azure SDK packages (`@azure/identity`, `@azure/keyvault-secrets`, `@azure/keyvault-keys`, `@azure/msal-node`)
- `mssql` (SQL Server client)
- `next/navigation` router in React component tests
- All custom hooks when testing page-level components (test the hook separately)
- `fetch` globally when testing API client modules (audit-api, tenant-api)
- `@omzig/db` in API service tests

**What NOT to Mock:**
- Shared types and constants from `@omzig/shared` (pure TypeScript, no side effects)
- Evaluator functions themselves — test them directly with fixture data
- `RateLimiter`, `TokenManager`, `ProgressEmitter` classes — test real implementations
- `zod` schemas — test real validation

## Fixtures and Factories

**Graph API Fixtures (`packages/audit/src/__tests__/fixtures/graph-responses.ts`):**
```typescript
// Exported named constants matching real Graph API response shapes
export const mockOrganizationResponse = { value: [{ id: 'tenant-id-12345', ... }] };
export const mockCAPolicies = { value: [ ... ] };
export const mockBatchResponse = { responses: [ { id: 'organization', status: 200, body: mockOrganizationResponse }, ... ] };
```

**AuditFacts Factories (inline in evaluator test files):**
```typescript
function createPassingFacts(): AuditFacts {
  const facts = createEmptyFacts();
  facts.organization = { available: true, tenantId: 't1', displayName: 'Test', primaryDomain: 'test.com' };
  facts.conditionalAccess = { available: true, policies: [ ... ] };
  // ... all facts populated for passing scenario
  return facts;
}

function createFailingFacts(): AuditFacts {
  const facts = createEmptyFacts();
  // ... all facts populated for failing scenario
  return facts;
}
```

**React Component Fixture Pattern:**
```typescript
function makeTenant(overrides: Partial<TenantSummary> = {}): TenantSummary {
  return {
    id: 't1',
    displayName: 'Acme Corp',
    // ... all required fields with defaults
    ...overrides,
  };
}

const FIXTURE_TENANTS: TenantSummary[] = [
  makeTenant(),
  makeTenant({ id: 't2', displayName: 'Beta LLC', health: 'yellow' }),
];
```

**Location:**
- Audit fixtures: `packages/audit/src/__tests__/fixtures/graph-responses.ts`
- Inline factories per-test-file for React components and API tests

## Coverage

**Requirements:** No coverage threshold enforced in any `vitest.config.ts`

**View Coverage:**
```bash
# No coverage config detected — run manually with:
cd apps/api && npx vitest run --coverage
cd packages/audit && npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Evaluators: Pure function tests with inline fixture data. No mocks needed — evaluators receive `AuditFacts` objects.
- Pipeline classes (`RateLimiter`, `TokenManager`, `ProgressEmitter`): Direct instantiation tests.
- Middleware: Hono app constructed inline with `createTestAppWithAuth` helper and tested via `app.request()`.
- React components: Rendered with `@testing-library/react` `render()`, queried with `screen.getBy*`.

**Integration Tests:**
- API routes with DB access: Mocked at `@omzig/db` module boundary. Tests the route handler + middleware chain together using Hono's built-in test client (`app.request()`).
- Provisioning service: Mocked `mssql` + `@omzig/db` at module level, then dynamically imports the service after mocks are in place.

**Integration Tests (real infra, opt-in):**
- `packages/db/src/__tests__/tenant-isolation.test.ts`: Requires `SQL_TEST_SERVER=1` env var and a running SQL Server instance. Uses `describe.skipIf(!process.env.SQL_TEST_SERVER)(...)` pattern to skip by default.

**E2E Tests:**
- Not present. No Playwright, Cypress, or similar framework detected.

## Common Patterns

**Testing Hono Routes (API):**
```typescript
// Use lazy import to ensure mocks apply before module resolution
const createTestApp = async () => {
  const { createApp } = await import('../app.js');
  return createApp();
};

it('returns 401 without auth', async () => {
  const app = await createTestApp();
  const res = await app.request('/api/auth/me');
  expect(res.status).toBe(401);
  const body = (await res.json()) as ApiResponse;
  expect(body.error!.code).toBe('UNAUTHORIZED');
});
```

**Testing Authenticated Routes:**
```typescript
// Use helpers.ts factory to create app with injected JWT payload
const { createTestAppWithAuth } = await import('./helpers.js');
const app = createTestAppWithAuth({
  oid: 'user-123',
  preferred_username: 'user@example.com',
  roles: ['Admin'],
  amr: ['pwd', 'mfa'],
});
const res = await app.request('/api/auth/me');
expect(res.status).toBe(200);
```

**Async Testing:**
```typescript
// Services that throw on error
await expect(triggerAudit('tenant-1')).rejects.toThrow('Access denied');

// Async class methods
await limiter.checkThreshold();
expect(limiter.getStats().delayed).toBe(1);
```

**Error Path Testing:**
```typescript
// Mock fetch for error response
mockFetch.mockResolvedValueOnce({
  ok: false,
  status: 403,
  json: async () => ({ error: { code: 'FORBIDDEN', message: 'Access denied' }, meta: { ... } }),
});
const { triggerAudit } = await import('@/lib/audit-api');
await expect(triggerAudit('tenant-1')).rejects.toThrow('Access denied');
```

**Parameterized Tests (it.each):**
```typescript
const cases: [TenantHealth, string][] = [
  ['green', 'bg-emerald-500'],
  ['yellow', 'bg-amber-500'],
  ['red', 'bg-red-500'],
];

it.each(cases)('renders %s health with class %s', (health, expectedClass) => {
  render(<HealthDot health={health} />);
  const dot = screen.getByLabelText(`Health: ${health}`);
  expect(dot.className).toContain(expectedClass);
});
```

**Dynamic Import Pattern (services with mocks):**
```typescript
// Mock modules BEFORE importing the module under test
vi.mock('../services/keyvault.js', () => ({ storeTenantToken: mockStoreTenantToken }));

it('provisions tenant', async () => {
  // Dynamic import ensures mock is applied
  const { provisionTenant } = await import('../services/tenant-provisioning.js');
  await provisionTenant('tenant-1', 'm365-tid', 'token-value', 'user-1');
  expect(mockConnect).toHaveBeenCalled();
});
```

---

*Testing analysis: 2026-03-23*
