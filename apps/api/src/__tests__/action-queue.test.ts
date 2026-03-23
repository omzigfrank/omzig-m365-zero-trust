import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ApiResponse, ActionQueueItem } from '@omzig/shared';

/**
 * Action queue route tests.
 *
 * Tests GET /api/action-queue (computed items from tenant data)
 * and POST /api/action-queue/:itemId/dismiss (idempotent dismiss).
 */

// ---- Mock state ----

let tenantQueryResult: any[] = [];
let userQueryResult: any[] = [];
let dismissalQueryResult: any[] = [];
let insertCalls: any[] = [];

// Track which table is queried
const USERS_TABLE = Symbol('users');
const TENANTS_TABLE = Symbol('tenants');
const DISMISSALS_TABLE = Symbol('actionQueueDismissals');
const ORGS_TABLE = Symbol('organizations');

function createMockDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => ({
        where: vi.fn().mockImplementation(() => {
          if (table === USERS_TABLE) return Promise.resolve(userQueryResult);
          if (table === DISMISSALS_TABLE) return Promise.resolve(dismissalQueryResult);
          return Promise.resolve(tenantQueryResult);
        }),
      })),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: any) => {
        insertCalls.push(vals);
        return Promise.resolve();
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => Promise.resolve()),
      })),
    })),
    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => Promise.resolve()),
    })),
  };
}

let mockDb: ReturnType<typeof createMockDb>;

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(async () => mockDb),
  tenants: TENANTS_TABLE,
  users: USERS_TABLE,
  actionQueueDismissals: DISMISSALS_TABLE,
  organizations: ORGS_TABLE,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  sql: vi.fn(),
}));

// ---- Test helpers ----

function mockJwtMiddleware(payload: Record<string, unknown>) {
  return createMiddleware(async (c, next) => {
    c.set('jwtPayload', payload);
    await next();
  });
}

function mockMfaMiddleware() {
  return createMiddleware(async (_c, next) => {
    await next();
  });
}

const defaultPayload = {
  oid: 'test-user-oid',
  preferred_username: 'admin@example.com',
  name: 'Test Admin',
  roles: ['Admin'],
  amr: ['pwd', 'mfa'],
};

async function createTestApp(payload = defaultPayload) {
  const { actionQueueRoutes } = await import('../routes/action-queue.js');

  const app = new Hono();
  app.use('/api/*', mockJwtMiddleware(payload));
  app.use('/api/*', mockMfaMiddleware());
  app.route('/api/action-queue', actionQueueRoutes);

  return app;
}

// ---- Setup ----

beforeEach(() => {
  vi.clearAllMocks();
  tenantQueryResult = [];
  userQueryResult = [];
  dismissalQueryResult = [];
  insertCalls = [];
  mockDb = createMockDb();

  // Default user lookup
  userQueryResult = [
    {
      id: 'user-1',
      orgId: 'org-1',
      entraObjectId: 'test-user-oid',
      email: 'admin@example.com',
      displayName: 'Test Admin',
      baseRole: 'Admin',
    },
  ];
});

// ================================================================
// GET /api/action-queue
// ================================================================

describe('GET /api/action-queue', () => {
  it('returns items sorted by severity (critical > high > warning) then by createdAt descending', async () => {
    const now = Date.now();
    tenantQueryResult = [
      {
        id: 'tenant-1',
        displayName: 'Client A',
        status: 'active',
        criticalFindingsCount: 3,
        lastAuditAt: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 days ago (not stale)
        createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'tenant-2',
        displayName: 'Client B',
        status: 'needs_reauth',
        criticalFindingsCount: 0,
        lastAuditAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
        createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'tenant-3',
        displayName: 'Client C',
        status: 'active',
        criticalFindingsCount: 0,
        lastAuditAt: new Date(now - 10 * 24 * 60 * 60 * 1000), // 10 days ago (stale)
        createdAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ActionQueueItem[]>;
    expect(body.data).toBeDefined();

    const items = body.data!;
    // Should have: critical_findings (critical), needs_reauth (high), stale_audit (warning)
    expect(items.length).toBe(3);
    expect(items[0].severity).toBe('critical');
    expect(items[0].type).toBe('critical_findings');
    expect(items[1].severity).toBe('high');
    expect(items[1].type).toBe('needs_reauth');
    expect(items[2].severity).toBe('warning');
    expect(items[2].type).toBe('stale_audit');
  });

  it('returns critical_findings items for tenants with criticalFindingsCount > 0', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        displayName: 'Client A',
        status: 'active',
        criticalFindingsCount: 5,
        lastAuditAt: new Date(),
        createdAt: new Date(),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ActionQueueItem[]>;
    const items = body.data!;
    const criticalItem = items.find((i) => i.type === 'critical_findings');
    expect(criticalItem).toBeDefined();
    expect(criticalItem!.severity).toBe('critical');
    expect(criticalItem!.count).toBe(5);
    expect(criticalItem!.tenantId).toBe('tenant-1');
    expect(criticalItem!.tenantName).toBe('Client A');
    expect(criticalItem!.id).toBe('critical-tenant-1');
    expect(criticalItem!.linkTo).toBe('/tenants/tenant-1');
  });

  it('returns needs_reauth items for tenants with status needs_reauth', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-2',
        displayName: 'Client B',
        status: 'needs_reauth',
        criticalFindingsCount: 0,
        lastAuditAt: new Date(),
        createdAt: new Date(),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ActionQueueItem[]>;
    const items = body.data!;
    const reauthItem = items.find((i) => i.type === 'needs_reauth');
    expect(reauthItem).toBeDefined();
    expect(reauthItem!.severity).toBe('high');
    expect(reauthItem!.tenantId).toBe('tenant-2');
    expect(reauthItem!.id).toBe('status-tenant-2-needs_reauth');
  });

  it('returns stale_audit items for tenants with lastAuditAt > 7 days ago', async () => {
    const now = Date.now();
    tenantQueryResult = [
      {
        id: 'tenant-3',
        displayName: 'Client C',
        status: 'active',
        criticalFindingsCount: 0,
        lastAuditAt: new Date(now - 8 * 24 * 60 * 60 * 1000), // 8 days ago
        createdAt: new Date(),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ActionQueueItem[]>;
    const items = body.data!;
    const staleItem = items.find((i) => i.type === 'stale_audit');
    expect(staleItem).toBeDefined();
    expect(staleItem!.severity).toBe('warning');
    expect(staleItem!.tenantId).toBe('tenant-3');
    expect(staleItem!.id).toBe('status-tenant-3-stale_audit');
  });

  it('returns stale_audit for active tenants with null lastAuditAt', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-4',
        displayName: 'Client D',
        status: 'active',
        criticalFindingsCount: 0,
        lastAuditAt: null,
        createdAt: new Date(),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ActionQueueItem[]>;
    const items = body.data!;
    const staleItem = items.find((i) => i.type === 'stale_audit');
    expect(staleItem).toBeDefined();
    expect(staleItem!.severity).toBe('warning');
  });

  it('excludes items that have a matching dismiss record for the current user', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        displayName: 'Client A',
        status: 'active',
        criticalFindingsCount: 3,
        lastAuditAt: new Date(),
        createdAt: new Date(),
      },
    ];
    dismissalQueryResult = [
      {
        id: 'dismiss-1',
        orgId: 'org-1',
        userId: 'user-1',
        itemKey: 'critical-tenant-1',
        dismissedAt: new Date(),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ActionQueueItem[]>;
    const items = body.data!;
    // The critical_findings item for tenant-1 should be filtered out
    expect(items.find((i) => i.id === 'critical-tenant-1')).toBeUndefined();
  });

  it('includes dismissed items with dismissed=true flag when includeDismissed=true', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        displayName: 'Client A',
        status: 'active',
        criticalFindingsCount: 3,
        lastAuditAt: new Date(),
        createdAt: new Date(),
      },
    ];
    dismissalQueryResult = [
      {
        id: 'dismiss-1',
        orgId: 'org-1',
        userId: 'user-1',
        itemKey: 'critical-tenant-1',
        dismissedAt: new Date(),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue?includeDismissed=true');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ActionQueueItem[]>;
    const items = body.data!;
    const criticalItem = items.find((i) => i.id === 'critical-tenant-1');
    expect(criticalItem).toBeDefined();
    expect(criticalItem!.dismissed).toBe(true);
  });

  it('returns empty array when no action items exist', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        displayName: 'Client A',
        status: 'active',
        criticalFindingsCount: 0,
        lastAuditAt: new Date(), // recent, not stale
        createdAt: new Date(),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ActionQueueItem[]>;
    expect(body.data).toEqual([]);
  });

  it('returns 404 when user org not found', async () => {
    userQueryResult = [];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue');

    expect(res.status).toBe(404);
  });
});

// ================================================================
// POST /api/action-queue/:itemId/dismiss
// ================================================================

describe('POST /api/action-queue/:itemId/dismiss', () => {
  it('creates a dismiss record and returns 200', async () => {
    dismissalQueryResult = []; // No existing dismissal

    const app = await createTestApp();
    const res = await app.request('/api/action-queue/critical-tenant-1/dismiss', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toEqual({ ok: true });
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0].itemKey).toBe('critical-tenant-1');
    expect(insertCalls[0].orgId).toBe('org-1');
    expect(insertCalls[0].userId).toBe('user-1');
  });

  it('returns 200 for already-dismissed item (idempotent)', async () => {
    dismissalQueryResult = [
      {
        id: 'dismiss-1',
        orgId: 'org-1',
        userId: 'user-1',
        itemKey: 'critical-tenant-1',
        dismissedAt: new Date(),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue/critical-tenant-1/dismiss', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toEqual({ ok: true });
    // Should NOT have inserted a new row
    expect(insertCalls.length).toBe(0);
  });

  it('returns 404 when user org not found', async () => {
    userQueryResult = [];

    const app = await createTestApp();
    const res = await app.request('/api/action-queue/critical-tenant-1/dismiss', {
      method: 'POST',
    });

    expect(res.status).toBe(404);
  });
});
