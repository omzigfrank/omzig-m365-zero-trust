# Coding Conventions

**Analysis Date:** 2026-03-23

## Naming Patterns

**Files:**
- Source files: kebab-case, descriptive of purpose: `gdap-verification.ts`, `fact-collector.ts`, `aad-3-mfa.ts`
- Test files: mirror source name with `.test.ts` or `.test.tsx` suffix
- Evaluator files: prefixed with framework+index: `aad-3-mfa.ts`, `nist-80053/ia-identification.ts`
- Route files: plural noun kebab-case: `tenants.ts`, `audits.ts`, `action-queue.ts`

**React Components:**
- PascalCase filenames matching the exported component: `TenantCard.tsx`, `ZtaMaturityRadar.tsx`
- Named exports (not default) for all components except Next.js pages
- Next.js pages use default export: `export default function TenantDashboardPage()`

**Functions:**
- camelCase for all functions and methods
- Evaluators follow pattern `evaluateAAD_3_1`, `evaluateNIST_CSF_PR_AA_01` — framework prefix + control ID
- Route factories: `tenantsRoutes`, `auditsRoutes`, `authRoutes` (camelCase noun + "Routes")
- Middleware factories: `requireAuth()`, `requireRole()`, `requireMfa()`, `requirePermission()` (verb + noun)
- Service functions: verb + noun: `verifyGdapRelationship()`, `collectFacts()`, `provisionTenant()`, `storeTenantToken()`

**Variables:**
- camelCase: `jwtPayload`, `effectiveRole`, `correlationId`
- Constants: SCREAMING_SNAKE_CASE for module-level: `ERROR_CODES`, `ROLE_HIERARCHY`, `POLL_INTERVAL_MS`, `TENET_SHORT_LABELS`
- React hook state: camelCase matching domain: `[state, setState]`, `[loading, setLoading]`

**Types/Interfaces:**
- PascalCase: `ApiResponse`, `TenantSummary`, `GdapVerificationResult`, `AuditFacts`, `EvaluatorResult`
- `type` keyword for unions/aliases; `interface` for object shapes
- Generic type parameter: `ApiResponse<T = unknown>`

## Code Style

**Formatting:**
- No Prettier or ESLint config files detected at any workspace level
- 2-space indentation used consistently throughout all files
- Single quotes for imports in TypeScript source files
- Double quotes in TSX/React files (JSX attribute style)
- Trailing commas in multi-line objects and arrays
- Semicolons used throughout

**TypeScript:**
- Strict mode implied by tsconfig base (`@omzig/tsconfig/node.json`)
- `type` imports used consistently: `import type { ApiResponse } from '@omzig/shared'`
- All evaluator functions typed via `EvaluatorFn` alias from `packages/audit/src/evaluators/types.ts`
- Explicit return types on exported functions (especially middleware factories)
- `as const` on literal arrays: `['RS256'] as const`

## Import Organization

**Order (observed pattern):**
1. External packages (`hono`, `vitest`, `react`, `zod`, `drizzle-orm`)
2. Workspace packages (`@omzig/shared`, `@omzig/db`, `@omzig/audit`)
3. Internal relative imports (`../middleware/auth.js`, `./areas/organization.js`)

**Path Aliases:**
- `@/` maps to `apps/web/src/` (configured in `apps/web/vitest.config.ts` and `tsconfig.json`)
- No aliases in API or packages; use relative paths there

**Node.js ESM Note:**
- All relative imports use `.js` extension in source files even for `.ts` sources: `import { ... } from '../routes/auth.js'`
- This is required for ESM compatibility and must be followed for all new imports

## Error Handling

**API Error Pattern:**
All API error responses use the shared `ApiResponse` shape from `packages/shared/src/types/api.ts`:
```typescript
const body: ApiResponse = {
  error: {
    code: ERROR_CODES.UNAUTHORIZED,
    message: 'Human-readable message',
    details: err instanceof Error ? err.message : undefined,
    correlationId,
  },
  meta: {
    correlationId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  },
};
return c.json(body, 401);
```

**Error Codes:**
Always use `ERROR_CODES` constants from `packages/shared/src/constants/errors.ts`. Never use raw string literals for error codes.

**Service Layer:**
Services throw typed `Error` objects with descriptive messages. Callers (route handlers) wrap in try/catch and convert to `ApiResponse`. Example from `apps/api/src/services/gdap-verification.ts`:
```typescript
if (response.status === 404) {
  throw new Error(`GDAP relationship not found: "${relationshipId}". Verify the relationship ID in Partner Center.`);
}
```

**Evaluator Error Pattern:**
Evaluators in `packages/audit` never throw. They return `EvaluatorResult` with `rating: 'fail'` or `rating: 'na'` when data is unavailable, including `requiredPermission` when the issue is a Graph API permission:
```typescript
if (!facts.conditionalAccess.available) {
  return {
    rating: 'fail',
    message: 'Could not retrieve CA policies.',
    settingName: 'Conditional Access - MFA Requirement',
    currentValue: 'Unknown',
    expectedValue: 'CA policy requiring MFA for all users',
    requiredPermission: 'Policy.Read.All',
  };
}
```

**Global Error Handler:**
Unhandled errors bubble to Hono's `onError` in `apps/api/src/middleware/error.ts`, which logs with correlationId and returns sanitized `ApiResponse` (stack trace only in dev).

## Logging

**Framework:** `console.error` directly (no logging library)

**Patterns:**
- Error handler logs: `console.error('[${correlationId}] Unhandled error:', err.message, isDev ? err.stack : '')`
- No `console.log` or `console.info` in production source — logging is minimal and tied to error handling
- Dev-only details are gated: `isDev ? err.stack : undefined`
- Never log tokens, secrets, or auth payloads

## Comments

**When to Comment:**
- Every exported function, interface, and module gets a JSDoc block
- Inline comments explain non-obvious decisions: `// Verify relationship is active (Pitfall 4: non-active relationships can't be used)`
- Evaluators always include the spec reference: `/** MS.AAD.3.1v1 — Phishing-resistant MFA SHALL be required for all users. */`
- Complex pipeline steps use section banners: `// =====================================================================`

**JSDoc/TSDoc:**
Used consistently on:
- All exported service functions with `@param`, `@returns`, `@throws`
- All exported interfaces and types
- Middleware factory functions explaining auth chain behavior
- Evaluator functions with spec citation

## Function Design

**Size:** Functions stay focused on a single concern. Evaluator functions in `packages/audit` are typically 20-60 lines. Route handlers delegate to services rather than containing business logic.

**Parameters:** Options objects used when a function takes 3+ related parameters. Simple typed params for ≤3 args.

**Return Values:**
- Async functions always return `Promise<T>` with explicit type
- Evaluator functions always return `EvaluatorResult` (never void or throw)
- Middleware factories return `MiddlewareHandler` (Hono type)

## Module Design

**Exports:**
- Named exports throughout; no default exports except Next.js pages
- Each `index.ts` re-exports from sibling modules: `packages/audit/src/evaluators/entra-id/index.ts`
- Evaluator maps are exported as `Map<string, EvaluatorFn>`: `entraIdEvaluators`

**Barrel Files:**
- `packages/audit/src/index.ts` — public API of the audit package
- `packages/shared/src/index.ts` — re-exports all shared types and constants
- Each evaluator family has an `index.ts` exporting the evaluator map

**React Components:**
- Each component is a named export from its own file
- Props interface defined inline in the same file, named `${ComponentName}Props`
- Client components marked with `"use client"` directive at top of file
- `SCREAMING_SNAKE_CASE` constants defined at module scope (outside component): `STEP_LABELS`, `TENET_SHORT_LABELS`, `MATURITY_COLORS`

---

*Convention analysis: 2026-03-23*
