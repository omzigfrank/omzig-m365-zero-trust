/**
 * Drift API routes -- Phase 8 Plan 01 Task 2.
 *
 * Five endpoints for drift alert management:
 *   GET    /tenants/:tenantId/drift-alerts          -- paginated list
 *   GET    /tenants/:tenantId/drift-alerts/:alertId  -- detail with snapshots
 *   POST   /tenants/:tenantId/drift-alerts/:alertId/dismiss -- mark dismissed
 *   GET    /tenants/:tenantId/drift-config           -- current config
 *   PATCH  /tenants/:tenantId/drift-config           -- update interval
 *
 * Tenant context (tenantDb, tenantMeta, jwtPayload) injected by upstream middleware.
 */

import { Hono } from 'hono';
import { eq, and, isNull, isNotNull, desc } from 'drizzle-orm';
import { getControlPlaneDb, driftAlerts, tenants } from '@omzig/db';
import type { ApiResponse } from '@omzig/shared';

type DriftEnv = {
  Variables: {
    tenantDb: any;
    tenantMeta: { id: string; databaseName: string; orgId: string };
    jwtPayload: Record<string, unknown>;
    effectiveRole: string;
    baseRole: string;
  };
};

export const driftRoutes = new Hono<DriftEnv>();

// ---- Helpers ----

function envelope<T>(data: T): ApiResponse<T> {
  return {
    data,
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };
}

function errorEnvelope(code: string, message: string): ApiResponse {
  return {
    error: { code, message },
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };
}

// ---- GET /tenants/:tenantId/drift-alerts ----

driftRoutes.get('/tenants/:tenantId/drift-alerts', async (c) => {
  const tenantDb = c.get('tenantDb');

  const page = parseInt(c.req.query('page') ?? '1', 10);
  const pageSize = Math.min(parseInt(c.req.query('pageSize') ?? '20', 10), 100);
  const severityFilter = c.req.query('severity');
  const areaFilter = c.req.query('area');
  const statusFilter = c.req.query('status') ?? 'active';

  // Query drift alerts from tenant DB
  const allRows = await tenantDb
    .select()
    .from(driftAlerts)
    .where(eq(driftAlerts.tenantId, c.req.param('tenantId')))
    .orderBy(desc(driftAlerts.detectedAt));

  // Client-side filtering (Drizzle mssql-core has limited dynamic WHERE composition)
  let filtered = allRows as any[];

  if (statusFilter === 'active') {
    filtered = filtered.filter((r: any) => r.dismissedAt === null);
  } else if (statusFilter === 'dismissed') {
    filtered = filtered.filter((r: any) => r.dismissedAt !== null);
  }

  if (severityFilter) {
    filtered = filtered.filter((r: any) => r.severity === severityFilter);
  }

  if (areaFilter) {
    filtered = filtered.filter((r: any) => r.area === areaFilter);
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  // Exclude beforeSnapshot and afterSnapshot from list results (too large)
  const data = paged.map((r: any) => ({
    id: r.id,
    area: r.area,
    severity: r.severity,
    activityType: r.activityType,
    actorUpn: r.actorUpn,
    diffSummary: r.diffSummary,
    detectedAt: r.detectedAt,
    dismissedAt: r.dismissedAt,
    dismissedBy: r.dismissedBy,
    auditEventId: r.auditEventId,
    remediationJobId: r.remediationJobId,
  }));

  return c.json(envelope({ data, total, page, pageSize }), 200);
});

// ---- GET /tenants/:tenantId/drift-alerts/:alertId ----

driftRoutes.get('/tenants/:tenantId/drift-alerts/:alertId', async (c) => {
  const alertId = c.req.param('alertId');
  const tenantDb = c.get('tenantDb');

  const rows = await tenantDb
    .select()
    .from(driftAlerts)
    .where(eq(driftAlerts.id, alertId));

  if ((rows as any[]).length === 0) {
    return c.json(errorEnvelope('NOT_FOUND', `Drift alert "${alertId}" not found`), 404);
  }

  const alert = (rows as any[])[0];
  return c.json(
    envelope({
      ...alert,
      beforeSnapshot: alert.beforeSnapshot,
      afterSnapshot: alert.afterSnapshot,
    }),
    200,
  );
});

// ---- POST /tenants/:tenantId/drift-alerts/:alertId/dismiss ----

driftRoutes.post('/tenants/:tenantId/drift-alerts/:alertId/dismiss', async (c) => {
  const alertId = c.req.param('alertId');
  const tenantDb = c.get('tenantDb');
  const jwtPayload = c.get('jwtPayload');

  // Require Analyst+ role
  const role = c.get('effectiveRole');
  if (!['Owner', 'Admin', 'Analyst'].includes(role)) {
    return c.json(
      errorEnvelope('INSUFFICIENT_ROLE', `Role '${role}' cannot dismiss drift alerts`),
      403,
    );
  }

  const rows = await tenantDb
    .select()
    .from(driftAlerts)
    .where(eq(driftAlerts.id, alertId));

  if ((rows as any[]).length === 0) {
    return c.json(errorEnvelope('NOT_FOUND', `Drift alert "${alertId}" not found`), 404);
  }

  const alert = (rows as any[])[0];

  // Idempotent: if already dismissed, return current state
  if (alert.dismissedAt) {
    return c.json(envelope({ id: alert.id, dismissedAt: alert.dismissedAt, dismissedBy: alert.dismissedBy }), 200);
  }

  const dismissedBy = (jwtPayload.preferred_username as string) ??
    (jwtPayload.oid as string) ?? 'unknown';

  await tenantDb
    .update(driftAlerts)
    .set({
      dismissedAt: new Date(),
      dismissedBy,
    })
    .where(eq(driftAlerts.id, alertId));

  return c.json(envelope({ id: alertId, dismissedAt: new Date().toISOString(), dismissedBy }), 200);
});

// ---- GET /tenants/:tenantId/drift-config ----

driftRoutes.get('/tenants/:tenantId/drift-config', async (c) => {
  const tenantId = c.req.param('tenantId');
  const cpDb = await getControlPlaneDb();

  const rows = await cpDb
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if ((rows as any[]).length === 0) {
    return c.json(errorEnvelope('NOT_FOUND', `Tenant "${tenantId}" not found`), 404);
  }

  const tenant = (rows as any[])[0];
  return c.json(
    envelope({
      intervalMinutes: tenant.driftCheckIntervalMinutes ?? 15,
      lastPollAt: tenant.lastDriftPollAt?.toISOString() ?? null,
    }),
    200,
  );
});

// ---- PATCH /tenants/:tenantId/drift-config ----

driftRoutes.patch('/tenants/:tenantId/drift-config', async (c) => {
  const tenantId = c.req.param('tenantId');

  // Require Admin role
  const role = c.get('effectiveRole');
  if (!['Owner', 'Admin'].includes(role)) {
    return c.json(
      errorEnvelope('INSUFFICIENT_ROLE', `Role '${role}' cannot modify drift config. Required: Admin`),
      403,
    );
  }

  let body: { intervalMinutes?: number };
  try {
    body = (await c.req.json()) as { intervalMinutes?: number };
  } catch {
    return c.json(errorEnvelope('VALIDATION_ERROR', 'Request body must be valid JSON'), 400);
  }

  if (
    body.intervalMinutes === undefined ||
    typeof body.intervalMinutes !== 'number' ||
    !Number.isInteger(body.intervalMinutes) ||
    body.intervalMinutes < 15 ||
    body.intervalMinutes > 60
  ) {
    return c.json(
      errorEnvelope(
        'VALIDATION_ERROR',
        'intervalMinutes must be an integer between 15 and 60',
      ),
      400,
    );
  }

  const cpDb = await getControlPlaneDb();
  await cpDb
    .update(tenants)
    .set({
      driftCheckIntervalMinutes: body.intervalMinutes,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  return c.json(
    envelope({
      intervalMinutes: body.intervalMinutes,
    }),
    200,
  );
});

// Suppress unused import warnings
void and;
void isNull;
void isNotNull;
