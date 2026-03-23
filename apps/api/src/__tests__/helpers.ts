import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { requireMfa } from '../middleware/mfa.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { errorHandler, notFoundHandler } from '../middleware/error.js';
import { authRoutes } from '../routes/auth.js';
import { setTenantRoleOverride } from '../services/user.js';
import type { Role, Permission } from '@omzig/shared';

/**
 * JWT payload shape from Entra ID.
 * Used in test helpers to simulate authenticated requests.
 */
export interface TestJwtPayload {
  oid: string;
  preferred_username: string;
  name: string;
  roles?: string[];
  amr?: string[];
  [key: string]: unknown;
}

/**
 * Middleware that injects a mock JWT payload into the context.
 * Simulates successful JWK validation without calling the real JWKS endpoint.
 */
function mockJwtMiddleware(payload: TestJwtPayload) {
  return createMiddleware(async (c, next) => {
    c.set('jwtPayload', payload);
    await next();
  });
}

/**
 * Create a Hono app with mock JWT context for testing auth routes.
 * The JWT payload is injected directly, skipping real JWKS validation.
 */
export function createTestAppWithAuth(payload: TestJwtPayload): Hono {
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  // Mount auth middleware chain: mock JWT -> MFA check
  app.use('/api/*', mockJwtMiddleware(payload));
  app.use('/api/*', requireMfa());

  // Mount auth routes
  app.route('/api/auth', authRoutes);

  return app;
}

/**
 * Create a Hono app with RBAC middleware for testing role enforcement.
 * Injects JWT payload, MFA middleware, and RBAC role check on /api/protected.
 */
export function createTestAppWithRbac(
  allowedRoles: Role[],
  payload: TestJwtPayload,
): Hono {
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  // Auth chain
  app.use('/api/*', mockJwtMiddleware(payload));
  app.use('/api/*', requireMfa());

  // Protected route with role check
  app.get('/api/protected', requireRole(...allowedRoles), (c) => {
    return c.json({ data: 'ok' }, 200);
  });

  return app;
}

/**
 * Create a Hono app with permission-based RBAC middleware for testing.
 */
export function createTestAppWithPermission(
  permission: Permission,
  payload: TestJwtPayload,
): Hono {
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  // Auth chain
  app.use('/api/*', mockJwtMiddleware(payload));
  app.use('/api/*', requireMfa());

  // Protected route with permission check
  app.get('/api/protected', requirePermission(permission), (c) => {
    return c.json({ data: 'ok' }, 200);
  });

  return app;
}

/**
 * Set a per-tenant role override for testing.
 * Uses the in-memory store from user service.
 */
export function setTenantOverride(
  entraObjectId: string,
  tenantId: string,
  role: Role,
): void {
  setTenantRoleOverride(entraObjectId, tenantId, role);
}
