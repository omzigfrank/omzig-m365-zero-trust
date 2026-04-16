/**
 * Phase 8 Plan 01 Task 2 -- drift API routes tests.
 *
 * Mocks tenant DB, control plane DB, and auth middleware.
 * Tests list, detail, dismiss, config get/patch endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

// ---- Mock state ----

const DRIFT_ALERTS = Symbol('drift_alerts');
const TENANTS = Symbol('tenants');

let driftAlertRows: any[] = [];
let cpTenantRows: any[] = [];
let dismissUpdates: any[] = [];
let configUpdates: any[] = [];

function resetState() {
  driftAlertRows = [];
  cpTenantRows = [{
    id: 'tenant-1',
    driftCheckIntervalMinutes: 15,
    lastDriftPollAt: null,
  }];
  dismissUpdates = [];
  configUpdates = [];
}

function makeMockTenantDb() {
  let queryTable: any = null;
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => {
        queryTable = table;
        return {
          where: vi.fn().mockImplementation(() => {
            if (queryTable === DRIFT_ALERTS) {
              // Supports both direct resolve and chained .orderBy()
              const result: any = Promise.resolve(driftAlertRows);
              result.orderBy = vi.fn().mockImplementation(() => {
                const ordered: any = Promise.resolve(driftAlertRows);
                ordered.limit = vi.fn().mockImplementation(() => ({
                  offset: vi.fn().mockResolvedValue(driftAlertRows),
                }));
                return ordered;
              });
              return result;
            }
            return Promise.resolve([]);
          }),
          orderBy: vi.fn().mockImplementation(() => Promise.resolve(driftAlertRows)),
        };
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: any) => ({
        where: vi.fn().mockImplementation(() => {
          if (vals.dismissedAt) dismissUpdates.push(vals);
          return Promise.resolve();
        }),
      })),
    })),
  };
}

function makeMockCpDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => Promise.resolve(cpTenantRows)),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: any) => ({
        where: vi.fn().mockImplementation(() => {
          configUpdates.push(vals);
          return Promise.resolve();
        }),
      })),
    })),
  };
}

const mockTenantDb = makeMockTenantDb();
const mockCpDb = makeMockCpDb();

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(() => mockCpDb),
  getTenantDb: vi.fn().mockImplementation(() => ({ db: mockTenantDb })),
  driftAlerts: DRIFT_ALERTS,
  tenants: TENANTS,
  tenantUserAccess: Symbol('tenantUserAccess'),
  auditRuns: Symbol('auditRuns'),
  auditFindings: Symbol('auditFindings'),
  remediationJobs: Symbol('remediationJobs'),
  tenantRemediationConsents: Symbol('consents'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => `eq`),
  and: vi.fn((...args: any[]) => args),
  or: vi.fn((...args: any[]) => args),
  isNotNull: vi.fn(() => `isNotNull`),
  isNull: vi.fn(() => `isNull`),
  lte: vi.fn(() => `lte`),
  desc: vi.fn(() => `desc`),
  sql: vi.fn(),
}));

vi.mock('../services/signalr.js', () => ({
  pushDriftAlert: vi.fn(),
  pushAuditProgress: vi.fn(),
  pushRemediationProgress: vi.fn(),
  negotiateSignalR: vi.fn(),
}));

// Import the routes
const { driftRoutes } = await import('../routes/drift.js');

// ---- Test app factory ----

function createTestApp(role: string = 'Admin') {
  const app = new Hono();

  // Inject mock auth context
  app.use('*', createMiddleware(async (c, next) => {
    c.set('jwtPayload', {
      oid: 'test-user-id',
      preferred_username: 'admin@test.com',
      roles: [role],
    });
    c.set('effectiveRole', role);
    c.set('baseRole', role);
    c.set('tenantDb', mockTenantDb);
    c.set('tenantMeta', { id: 'tenant-1', databaseName: 'db-1', orgId: 'org-1' });
    await next();
  }));

  app.route('/api', driftRoutes);
  return app;
}

// ---- Tests ----

describe('drift routes', () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  describe('GET /api/tenants/:tenantId/drift-alerts', () => {
    it('returns paginated list', async () => {
      driftAlertRows = [
        {
          id: 'alert-1',
          tenantId: 'tenant-1',
          area: 'conditionalAccess',
          severity: 'Critical',
          activityType: 'Delete conditional access policy',
          actorUpn: 'admin@test.com',
          diffSummary: '1 item removed',
          detectedAt: new Date(),
          dismissedAt: null,
          dismissedBy: null,
          auditEventId: 'ev-1',
          remediationJobId: null,
        },
      ];
      const app = createTestApp();
      const res = await app.request('/api/tenants/tenant-1/drift-alerts');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.data).toHaveLength(1);
      expect(body.data.data[0].id).toBe('alert-1');
    });
  });

  describe('GET /api/tenants/:tenantId/drift-alerts/:alertId', () => {
    it('returns full detail with snapshots', async () => {
      driftAlertRows = [
        {
          id: 'alert-1',
          area: 'conditionalAccess',
          severity: 'Critical',
          beforeSnapshot: '{"policies":[]}',
          afterSnapshot: '{"policies":[]}',
          diffSummary: 'no drift',
          detectedAt: new Date(),
          dismissedAt: null,
        },
      ];
      const app = createTestApp();
      const res = await app.request('/api/tenants/tenant-1/drift-alerts/alert-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.beforeSnapshot).toBeDefined();
    });

    it('returns 404 for non-existent alert', async () => {
      driftAlertRows = [];
      const app = createTestApp();
      const res = await app.request('/api/tenants/tenant-1/drift-alerts/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/tenants/:tenantId/drift-alerts/:alertId/dismiss', () => {
    it('marks dismissed_at and dismissed_by', async () => {
      driftAlertRows = [{
        id: 'alert-1',
        dismissedAt: null,
      }];
      const app = createTestApp('Analyst');
      const res = await app.request('/api/tenants/tenant-1/drift-alerts/alert-1/dismiss', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      expect(dismissUpdates.length).toBeGreaterThanOrEqual(1);
      expect(dismissUpdates[0].dismissedBy).toBe('admin@test.com');
    });

    it('returns 403 for Read-only role', async () => {
      driftAlertRows = [{ id: 'alert-1', dismissedAt: null }];
      const app = createTestApp('Read-only');
      const res = await app.request('/api/tenants/tenant-1/drift-alerts/alert-1/dismiss', {
        method: 'POST',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/tenants/:tenantId/drift-config', () => {
    it('returns current interval', async () => {
      const app = createTestApp();
      const res = await app.request('/api/tenants/tenant-1/drift-config');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.intervalMinutes).toBe(15);
    });
  });

  describe('PATCH /api/tenants/:tenantId/drift-config', () => {
    it('validates interval range 15-60', async () => {
      const app = createTestApp('Admin');
      const res = await app.request('/api/tenants/tenant-1/drift-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: 5 }),
      });
      expect(res.status).toBe(400);
    });

    it('updates with valid interval', async () => {
      const app = createTestApp('Admin');
      const res = await app.request('/api/tenants/tenant-1/drift-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: 30 }),
      });
      expect(res.status).toBe(200);
      expect(configUpdates.length).toBeGreaterThanOrEqual(1);
      expect(configUpdates[0].driftCheckIntervalMinutes).toBe(30);
    });

    it('requires Admin role (Analyst gets 403)', async () => {
      const app = createTestApp('Analyst');
      const res = await app.request('/api/tenants/tenant-1/drift-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: 30 }),
      });
      expect(res.status).toBe(403);
    });

    it('rejects interval > 60', async () => {
      const app = createTestApp('Admin');
      const res = await app.request('/api/tenants/tenant-1/drift-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: 120 }),
      });
      expect(res.status).toBe(400);
    });
  });
});
