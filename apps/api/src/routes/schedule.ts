import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import type { ApiResponse } from '@omzig/shared';
import { ERROR_CODES } from '@omzig/shared';
import { getControlPlaneDb, tenants, users } from '@omzig/db';
import { requireRole } from '../middleware/rbac.js';
import { computeNextRun } from '../services/scheduler.js';

/**
 * Tenant scan-schedule routes.
 *
 * GET  /api/tenants/:tenantId/schedule -- read current schedule
 * PATCH /api/tenants/:tenantId/schedule -- update schedule (Admin)
 *
 * Phase 6 Plan 01: Scheduled Scans (TENANT-05, TENANT-06)
 */
export const scheduleRoutes = new Hono();

// ---- Validation ----

const patchSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'disabled']),
});

// ---- Helpers ----

async function resolveOrgId(jwtPayload: Record<string, unknown>): Promise<string | null> {
  const entraObjectId = jwtPayload.oid as string;
  const db = await getControlPlaneDb();
  const rows = await db.select().from(users).where(eq(users.entraObjectId, entraObjectId));
  if (rows.length === 0) return null;
  return rows[0].orgId;
}

function notFound(message: string): ApiResponse {
  return {
    error: { code: ERROR_CODES.TENANT_NOT_FOUND, message },
    meta: { correlationId: crypto.randomUUID(), timestamp: new Date().toISOString() },
  };
}

function orgNotFound(): ApiResponse {
  return {
    error: { code: ERROR_CODES.ORG_NOT_FOUND, message: 'User organization not found' },
    meta: { correlationId: crypto.randomUUID(), timestamp: new Date().toISOString() },
  };
}

// ---- Routes ----

/**
 * GET /tenants/:tenantId/schedule
 *
 * Returns the current schedule frequency and next run time for the tenant.
 * Accessible to any authenticated user in the tenant's org.
 */
scheduleRoutes.get('/tenants/:tenantId/schedule', async (c) => {
  const tenantId = c.req.param('tenantId');
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const orgId = await resolveOrgId(jwtPayload);
  if (!orgId) return c.json(orgNotFound(), 404);

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
    return c.json(notFound(`Tenant "${tenantId}" not found`), 404);
  }

  const tenant = rows[0];
  const response: ApiResponse<{ frequency: string | null; nextRunAt: string | null }> = {
    data: {
      frequency: tenant.scheduleFrequency ?? null,
      nextRunAt: tenant.scheduleNextRunAt
        ? new Date(tenant.scheduleNextRunAt).toISOString()
        : null,
    },
    meta: { correlationId: crypto.randomUUID(), timestamp: new Date().toISOString() },
  };
  return c.json(response, 200);
});

/**
 * PATCH /tenants/:tenantId/schedule
 *
 * Body: { frequency: 'daily' | 'weekly' | 'disabled' }
 *
 * - 'daily'/'weekly' sets scheduleFrequency and computes scheduleNextRunAt
 * - 'disabled' clears both columns
 *
 * Requires Owner or Admin role.
 */
scheduleRoutes.patch(
  '/tenants/:tenantId/schedule',
  requireRole('Owner', 'Admin'),
  async (c) => {
    const tenantId = c.req.param('tenantId');
    const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
    const orgId = await resolveOrgId(jwtPayload);
    if (!orgId) return c.json(orgNotFound(), 404);

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      const response: ApiResponse = {
        error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' },
        meta: { correlationId: crypto.randomUUID(), timestamp: new Date().toISOString() },
      };
      return c.json(response, 400);
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const response: ApiResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        meta: { correlationId: crypto.randomUUID(), timestamp: new Date().toISOString() },
      };
      return c.json(response, 400);
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
      return c.json(notFound(`Tenant "${tenantId}" not found`), 404);
    }

    const { frequency } = parsed.data;
    let newFrequency: 'daily' | 'weekly' | null = null;
    let newNextRunAt: Date | null = null;

    if (frequency === 'daily' || frequency === 'weekly') {
      newFrequency = frequency;
      newNextRunAt = computeNextRun(frequency, new Date());
    }

    await db
      .update(tenants)
      .set({
        scheduleFrequency: newFrequency,
        scheduleNextRunAt: newNextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    const response: ApiResponse<{ frequency: string | null; nextRunAt: string | null }> = {
      data: {
        frequency: newFrequency,
        nextRunAt: newNextRunAt ? newNextRunAt.toISOString() : null,
      },
      meta: { correlationId: crypto.randomUUID(), timestamp: new Date().toISOString() },
    };
    return c.json(response, 200);
  },
);
