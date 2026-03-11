import { createMiddleware } from 'hono/factory';
import { eq, and } from 'drizzle-orm';
import type { ApiResponse } from '@omzig/shared';
import { ERROR_CODES } from '@omzig/shared';
import {
  getControlPlaneDb,
  getTenantDb,
  closeTenantDb,
  tenants,
  tenantUserAccess,
  users,
} from '@omzig/db';

/**
 * Per-request tenant database context middleware.
 *
 * This middleware:
 * 1. Reads X-Tenant-Id from request header
 * 2. Looks up tenant in control plane DB
 * 3. Verifies the authenticated user has access to this tenant
 * 4. Opens an on-demand connection to the tenant's database
 * 5. Sets tenantDb and tenantMeta on the request context
 * 6. Closes the connection in the finally block (no leaks)
 *
 * This middleware is NOT registered globally -- it's applied only to routes
 * that need tenant context (e.g., /api/tenants/:id/*).
 *
 * Requires: JWT authentication middleware to have run first (jwtPayload in context).
 */
export function withTenantDb() {
  return createMiddleware(async (c, next) => {
    const tenantId = c.req.header('X-Tenant-Id');
    const correlationId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Step 1: Validate header
    if (!tenantId) {
      const body: ApiResponse = {
        error: {
          code: 'MISSING_HEADER',
          message: 'X-Tenant-Id header is required for tenant-scoped operations',
          correlationId,
        },
        meta: { correlationId, timestamp },
      };
      return c.json(body, 400);
    }

    // Step 2: Look up tenant in control plane DB
    const controlDb = await getControlPlaneDb();

    const tenantResults = await controlDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (tenantResults.length === 0) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.TENANT_NOT_FOUND,
          message: `Tenant "${tenantId}" not found`,
          correlationId,
        },
        meta: { correlationId, timestamp },
      };
      return c.json(body, 404);
    }

    const tenant = tenantResults[0]!;

    // Step 3: Check if tenant is soft-deleted
    if (tenant.isDeleted) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.TENANT_NOT_FOUND,
          message: `Tenant "${tenantId}" not found`,
          correlationId,
        },
        meta: { correlationId, timestamp },
      };
      return c.json(body, 404);
    }

    // Step 4: Verify user has access to this tenant
    const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
    const entraObjectId = jwtPayload.oid as string;

    // Look up the user by their Entra object ID
    const userResults = await controlDb
      .select()
      .from(users)
      .where(eq(users.entraObjectId, entraObjectId));

    if (userResults.length === 0) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.TENANT_ACCESS_DENIED,
          message: 'User not found in the platform',
          correlationId,
        },
        meta: { correlationId, timestamp },
      };
      return c.json(body, 403);
    }

    const user = userResults[0]!;

    // Check tenant access
    const accessResults = await controlDb
      .select()
      .from(tenantUserAccess)
      .where(
        and(
          eq(tenantUserAccess.tenantId, tenantId),
          eq(tenantUserAccess.userId, user.id),
        ),
      );

    if (accessResults.length === 0) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.TENANT_ACCESS_DENIED,
          message: `You do not have access to tenant "${tenantId}"`,
          correlationId,
        },
        meta: { correlationId, timestamp },
      };
      return c.json(body, 403);
    }

    // Step 5: Open on-demand connection to tenant database
    const { db: tenantDb, pool: tenantPool } = await getTenantDb(tenant.databaseName);

    // Set context variables for downstream handlers
    c.set('tenantDb', tenantDb);
    c.set('tenantMeta', tenant);

    try {
      // Step 6: Execute downstream handlers
      await next();
    } finally {
      // Step 7: Always close the on-demand connection
      await closeTenantDb(tenantPool);
    }
  });
}
