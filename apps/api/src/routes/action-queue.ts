import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { ActionQueueItem, ApiResponse } from '@omzig/shared';
import { ERROR_CODES } from '@omzig/shared';
import { getControlPlaneDb, tenants, users, actionQueueDismissals } from '@omzig/db';

/**
 * Action queue routes.
 *
 * Provides cross-tenant action queue endpoints for surfacing
 * critical findings, auth issues, and stale audits across all
 * connected tenants in the user's organization.
 *
 * DASH-10: Cross-tenant action queue
 */
export const actionQueueRoutes = new Hono();

// Severity sort order: critical (0) > high (1) > warning (2)
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  warning: 2,
};

// 7 days in milliseconds
const STALE_AUDIT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

// ---- Helpers ----

/**
 * Resolve the user's orgId and userId from their JWT payload.
 */
async function resolveUser(
  jwtPayload: Record<string, unknown>,
): Promise<{ orgId: string; userId: string } | null> {
  const entraObjectId = jwtPayload.oid as string;
  const db = await getControlPlaneDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.entraObjectId, entraObjectId));

  if (rows.length === 0) return null;
  return { orgId: rows[0].orgId, userId: rows[0].id };
}

/**
 * Compute action queue items from tenant data.
 * Items are generated in-memory from the control plane tenants table.
 */
function computeActionItems(tenantRows: any[]): ActionQueueItem[] {
  const items: ActionQueueItem[] = [];
  const now = Date.now();

  for (const tenant of tenantRows) {
    const tenantId = tenant.id;
    const tenantName = tenant.displayName;

    // Critical findings
    if (tenant.criticalFindingsCount > 0) {
      items.push({
        id: `critical-${tenantId}`,
        type: 'critical_findings',
        tenantId,
        tenantName,
        severity: 'critical',
        message: `${tenant.criticalFindingsCount} critical/high failures in latest audit`,
        count: tenant.criticalFindingsCount,
        linkTo: `/tenants/${tenantId}`,
        createdAt: tenant.lastAuditAt
          ? new Date(tenant.lastAuditAt).toISOString()
          : new Date(tenant.createdAt).toISOString(),
        dismissed: false,
      });
    }

    // Needs re-authentication
    if (tenant.status === 'needs_reauth') {
      items.push({
        id: `status-${tenantId}-needs_reauth`,
        type: 'needs_reauth',
        tenantId,
        tenantName,
        severity: 'high',
        message: 'Tenant needs re-authentication',
        linkTo: `/tenants/${tenantId}`,
        createdAt: new Date(tenant.createdAt).toISOString(),
        dismissed: false,
      });
    }

    // Stale audit (active tenant with lastAuditAt > 7 days ago or null)
    if (tenant.status === 'active') {
      const lastAuditTime = tenant.lastAuditAt
        ? new Date(tenant.lastAuditAt).getTime()
        : 0;
      const isStale =
        !tenant.lastAuditAt || now - lastAuditTime > STALE_AUDIT_THRESHOLD_MS;

      if (isStale) {
        items.push({
          id: `status-${tenantId}-stale_audit`,
          type: 'stale_audit',
          tenantId,
          tenantName,
          severity: 'warning',
          message: 'No audit in over 7 days',
          linkTo: `/tenants/${tenantId}`,
          createdAt: tenant.lastAuditAt
            ? new Date(tenant.lastAuditAt).toISOString()
            : new Date(tenant.createdAt).toISOString(),
          dismissed: false,
        });
      }
    }
  }

  return items;
}

// ---- Routes ----

/**
 * GET /api/action-queue
 *
 * Returns computed action queue items from tenant data.
 * Items are sorted by severity (critical > high > warning) then createdAt desc.
 * Dismissed items are excluded unless ?includeDismissed=true.
 */
actionQueueRoutes.get('/', async (c) => {
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const user = await resolveUser(jwtPayload);

  if (!user) {
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

  // Fetch all non-deleted tenants for the user's org
  const tenantRows = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.orgId, user.orgId), eq(tenants.isDeleted, false)));

  // Compute action items from tenant data
  let items = computeActionItems(tenantRows);

  // Fetch dismiss records for the current user
  const dismissals = await db
    .select()
    .from(actionQueueDismissals)
    .where(
      and(
        eq(actionQueueDismissals.orgId, user.orgId),
        eq(actionQueueDismissals.userId, user.userId),
      ),
    );

  const dismissedKeys = new Set(dismissals.map((d: any) => d.itemKey));

  // Overlay dismiss state
  items = items.map((item) => ({
    ...item,
    dismissed: dismissedKeys.has(item.id),
  }));

  // Filter dismissed unless includeDismissed=true
  const includeDismissed = c.req.query('includeDismissed') === 'true';
  if (!includeDismissed) {
    items = items.filter((item) => !item.dismissed);
  }

  // Sort by severity order, then by createdAt descending
  items.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const response: ApiResponse<ActionQueueItem[]> = {
    data: items,
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * POST /api/action-queue/:itemId/dismiss
 *
 * Creates a dismiss record for the given action queue item.
 * Idempotent: returns 200 if already dismissed.
 */
actionQueueRoutes.post('/:itemId/dismiss', async (c) => {
  const itemId = c.req.param('itemId');
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const user = await resolveUser(jwtPayload);

  if (!user) {
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

  // Check if already dismissed
  const existing = await db
    .select()
    .from(actionQueueDismissals)
    .where(
      and(
        eq(actionQueueDismissals.orgId, user.orgId),
        eq(actionQueueDismissals.userId, user.userId),
        eq(actionQueueDismissals.itemKey, itemId),
      ),
    );

  if (existing.length === 0) {
    // Insert new dismissal
    await db.insert(actionQueueDismissals).values({
      id: crypto.randomUUID(),
      orgId: user.orgId,
      userId: user.userId,
      itemKey: itemId,
    });
  }

  const response: ApiResponse<{ ok: boolean }> = {
    data: { ok: true },
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});
