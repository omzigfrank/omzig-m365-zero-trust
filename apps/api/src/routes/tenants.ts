import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import type { ApiResponse, TenantSummary } from '@omzig/shared';
import { calculateHealth, ERROR_CODES } from '@omzig/shared';
import { getControlPlaneDb, tenants, users } from '@omzig/db';
import { requireRole } from '../middleware/rbac.js';
import { buildConsentUrl } from '../services/oauth-consent.js';
import { verifyGdapRelationship } from '../services/gdap-verification.js';
import { provisionTenant, deprovisionTenant } from '../services/tenant-provisioning.js';

/**
 * Tenant management routes.
 *
 * Provides CRUD endpoints for tenant lifecycle management and
 * onboarding flows (OAuth consent + GDAP verification + provisioning).
 *
 * TENANT-01: OAuth consent flow
 * TENANT-02: GDAP/Lighthouse delegated admin
 * TENANT-03: Multi-tenant dashboard
 * TENANT-07: Tenant removal with soft-delete
 * TENANT-08: Per-tenant database isolation
 */
export const tenantsRoutes = new Hono();

// ---- Validation schemas ----

const createTenantSchema = z.object({
  displayName: z.string().min(3).max(200),
  primaryDomain: z.string().max(255).optional(),
  contactEmail: z.string().email().max(320).optional(),
});

const gdapSchema = z.object({
  relationshipId: z.string().min(1),
});

const provisionSchema = z.object({
  m365TenantId: z.string().min(1),
  token: z.string().min(1),
  connectionMethod: z.enum(['oauth', 'gdap']),
});

// ---- Helpers ----

/**
 * Resolve the user's orgId from their JWT payload by looking up
 * the user in the control plane database.
 */
async function resolveOrgId(jwtPayload: Record<string, unknown>): Promise<string | null> {
  const entraObjectId = jwtPayload.oid as string;
  const db = await getControlPlaneDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.entraObjectId, entraObjectId));

  if (rows.length === 0) return null;
  return rows[0].orgId;
}

/**
 * Map a tenant DB row to a TenantSummary for API response.
 */
function toTenantSummary(row: any): TenantSummary {
  const overallScore = row.lastAuditScore ?? null;
  const status = row.status as TenantSummary['status'];

  return {
    id: row.id,
    displayName: row.displayName,
    m365TenantId: row.m365TenantId,
    status,
    connectionMethod: row.connectionMethod ?? null,
    primaryDomain: row.primaryDomain ?? null,
    health: calculateHealth(overallScore, status),
    overallScore,
    frameworkScores: null, // Populated when lastAuditScore is wired per plan note
    lastAuditAt: row.lastAuditAt ? new Date(row.lastAuditAt).toISOString() : null,
    criticalFindingsCount: 0, // Defaults to 0 until wired
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

// ---- Routes ----

/**
 * GET /api/tenants - List tenants for the authenticated user's org.
 *
 * Returns non-deleted tenants with calculated health and cached scores.
 * Accessible to all authenticated users (filtered by org).
 */
tenantsRoutes.get('/', async (c) => {
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const orgId = await resolveOrgId(jwtPayload);

  if (!orgId) {
    const response: ApiResponse = {
      error: {
        code: ERROR_CODES.ORG_NOT_FOUND,
        message: 'User organization not found',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 404);
  }

  const db = await getControlPlaneDb();
  const rows = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.orgId, orgId), eq(tenants.isDeleted, false)));

  const data: TenantSummary[] = rows.map(toTenantSummary);

  const response: ApiResponse<TenantSummary[]> = {
    data,
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * POST /api/tenants - Create a new pending tenant record.
 *
 * Validates input, generates UUID, inserts with status='pending'.
 * Requires Admin role.
 */
tenantsRoutes.post('/', requireRole('Owner', 'Admin'), async (c) => {
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const orgId = await resolveOrgId(jwtPayload);

  if (!orgId) {
    const response: ApiResponse = {
      error: {
        code: ERROR_CODES.ORG_NOT_FOUND,
        message: 'User organization not found',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 404);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    const response: ApiResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON body',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 400);
  }

  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) {
    const response: ApiResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join(', '),
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 400);
  }

  const id = crypto.randomUUID();
  const db = await getControlPlaneDb();

  await db.insert(tenants).values({
    id,
    orgId,
    displayName: parsed.data.displayName,
    m365TenantId: '',
    status: 'pending',
    primaryDomain: parsed.data.primaryDomain ?? null,
    contactEmail: parsed.data.contactEmail ?? null,
  });

  const response: ApiResponse<{ id: string; status: string }> = {
    data: { id, status: 'pending' },
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 201);
});

/**
 * GET /api/tenants/:id - Get single tenant detail.
 *
 * Returns 404 if tenant not found or deleted.
 */
tenantsRoutes.get('/:id', async (c) => {
  const tenantId = c.req.param('id');
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const orgId = await resolveOrgId(jwtPayload);

  if (!orgId) {
    const response: ApiResponse = {
      error: {
        code: ERROR_CODES.ORG_NOT_FOUND,
        message: 'User organization not found',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 404);
  }

  const db = await getControlPlaneDb();
  const rows = await db
    .select()
    .from(tenants)
    .where(
      and(
        eq(tenants.id, tenantId),
        eq(tenants.orgId, orgId),
        eq(tenants.isDeleted, false),
      ),
    );

  if (rows.length === 0) {
    const response: ApiResponse = {
      error: {
        code: ERROR_CODES.TENANT_NOT_FOUND,
        message: `Tenant "${tenantId}" not found`,
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 404);
  }

  const response: ApiResponse<TenantSummary> = {
    data: toTenantSummary(rows[0]),
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * POST /api/tenants/:id/onboard/oauth - Generate consent URL.
 *
 * Verifies tenant exists and is pending, calls buildConsentUrl,
 * updates connectionMethod to 'oauth'.
 * Requires Admin role.
 */
tenantsRoutes.post(
  '/:id/onboard/oauth',
  requireRole('Owner', 'Admin'),
  async (c) => {
    const tenantId = c.req.param('id');
    const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
    const orgId = await resolveOrgId(jwtPayload);

    if (!orgId) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.ORG_NOT_FOUND,
          message: 'User organization not found',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 404);
    }

    const db = await getControlPlaneDb();
    const rows = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.id, tenantId),
          eq(tenants.orgId, orgId),
          eq(tenants.isDeleted, false),
        ),
      );

    if (rows.length === 0) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.TENANT_NOT_FOUND,
          message: `Tenant "${tenantId}" not found`,
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 404);
    }

    const tenant = rows[0];
    if (tenant.status !== 'pending') {
      const response: ApiResponse = {
        error: {
          code: 'INVALID_STATUS',
          message: `Tenant is "${tenant.status}", expected "pending"`,
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 400);
    }

    const consentUrl = buildConsentUrl(tenantId);

    // Update connection method
    await db
      .update(tenants)
      .set({ connectionMethod: 'oauth', updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));

    const response: ApiResponse<{ consentUrl: string }> = {
      data: { consentUrl },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };

    return c.json(response, 200);
  },
);

/**
 * POST /api/tenants/:id/onboard/gdap - Verify GDAP relationship.
 *
 * Accepts { relationshipId }, verifies via Graph API,
 * updates tenant with customer info.
 * Requires Admin role.
 */
tenantsRoutes.post(
  '/:id/onboard/gdap',
  requireRole('Owner', 'Admin'),
  async (c) => {
    const tenantId = c.req.param('id');
    const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
    const orgId = await resolveOrgId(jwtPayload);

    if (!orgId) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.ORG_NOT_FOUND,
          message: 'User organization not found',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 404);
    }

    const db = await getControlPlaneDb();
    const rows = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.id, tenantId),
          eq(tenants.orgId, orgId),
          eq(tenants.isDeleted, false),
        ),
      );

    if (rows.length === 0) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.TENANT_NOT_FOUND,
          message: `Tenant "${tenantId}" not found`,
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 404);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      const response: ApiResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid JSON body',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 400);
    }

    const parsed = gdapSchema.safeParse(body);
    if (!parsed.success) {
      const response: ApiResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 400);
    }

    try {
      // Use a platform token for GDAP verification
      // In production, this would come from the platform's own credentials
      const accessToken = (jwtPayload.access_token as string) || 'platform-token';
      const result = await verifyGdapRelationship(
        parsed.data.relationshipId,
        accessToken,
      );

      // Update tenant with customer info
      await db
        .update(tenants)
        .set({
          m365TenantId: result.customerTenantId,
          connectionMethod: 'gdap',
          displayName: rows[0].displayName,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));

      const response: ApiResponse = {
        data: {
          customerTenantId: result.customerTenantId,
          customerDisplayName: result.customerDisplayName,
          roles: result.roles,
          expiresAt: result.expiresAt,
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };

      return c.json(response, 200);
    } catch (err) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.GDAP_ERROR,
          message: err instanceof Error ? err.message : 'GDAP verification failed',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 400);
    }
  },
);

/**
 * POST /api/tenants/:id/provision - Create DB and activate tenant.
 *
 * Validates body, verifies tenant is pending, calls provisionTenant.
 * Requires Admin role.
 */
tenantsRoutes.post(
  '/:id/provision',
  requireRole('Owner', 'Admin'),
  async (c) => {
    const tenantId = c.req.param('id');
    const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
    const orgId = await resolveOrgId(jwtPayload);

    if (!orgId) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.ORG_NOT_FOUND,
          message: 'User organization not found',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 404);
    }

    const db = await getControlPlaneDb();
    const rows = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.id, tenantId),
          eq(tenants.orgId, orgId),
          eq(tenants.isDeleted, false),
        ),
      );

    if (rows.length === 0) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.TENANT_NOT_FOUND,
          message: `Tenant "${tenantId}" not found`,
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 404);
    }

    const tenant = rows[0];
    if (tenant.status !== 'pending') {
      const response: ApiResponse = {
        error: {
          code: 'INVALID_STATUS',
          message: `Tenant is "${tenant.status}", expected "pending"`,
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 400);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      const response: ApiResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid JSON body',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 400);
    }

    const parsed = provisionSchema.safeParse(body);
    if (!parsed.success) {
      const response: ApiResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 400);
    }

    try {
      const userId = jwtPayload.oid as string;
      const result = await provisionTenant(
        tenantId,
        parsed.data.m365TenantId,
        parsed.data.token,
        userId,
      );

      const response: ApiResponse<{
        databaseName: string;
        tenantId: string;
        status: string;
      }> = {
        data: {
          databaseName: result.databaseName,
          tenantId: result.tenantId,
          status: 'active',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };

      return c.json(response, 200);
    } catch (err) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.PROVISIONING_ERROR,
          message:
            err instanceof Error ? err.message : 'Tenant provisioning failed',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 500);
    }
  },
);

/**
 * DELETE /api/tenants/:id - Soft-delete a tenant.
 *
 * Sets isDeleted=true, status='suspended' via deprovisionTenant.
 * Requires Admin role.
 */
tenantsRoutes.delete(
  '/:id',
  requireRole('Owner', 'Admin'),
  async (c) => {
    const tenantId = c.req.param('id');
    const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
    const orgId = await resolveOrgId(jwtPayload);

    if (!orgId) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.ORG_NOT_FOUND,
          message: 'User organization not found',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 404);
    }

    const db = await getControlPlaneDb();
    const rows = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.id, tenantId),
          eq(tenants.orgId, orgId),
          eq(tenants.isDeleted, false),
        ),
      );

    if (rows.length === 0) {
      const response: ApiResponse = {
        error: {
          code: ERROR_CODES.TENANT_NOT_FOUND,
          message: `Tenant "${tenantId}" not found`,
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(response, 404);
    }

    await deprovisionTenant(tenantId);

    const response: ApiResponse<{ id: string; status: string }> = {
      data: { id: tenantId, status: 'suspended' },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };

    return c.json(response, 200);
  },
);
