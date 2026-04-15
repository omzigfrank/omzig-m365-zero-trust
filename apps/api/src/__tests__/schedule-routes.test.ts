import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ApiResponse } from '@omzig/shared';

/**
 * Schedule route tests.
 *
 * Tests GET and PATCH /api/tenants/:tenantId/schedule with mocked DB.
 */

// ---- Mock state ----

let tenantQueryResult: any[] = [];
let userQueryResult: any[] = [];
let updateCalls: any[] = [];

const USERS_TABLE = Symbol('users');
const TENANTS_TABLE = Symbol('tenants');

function createMockDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => ({
        where: vi.fn().mockImplementation(() => {
          if (table === USERS_TABLE) return Promise.resolve(userQueryResult);
          return Promise.resolve(tenantQueryResult);
        }),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: any) => {
        updateCalls.push(vals);
        return {
          where: vi
            .fn()
            .mockImplementation(() => Promise.resolve({ rowsAffected: 1 })),
        };
      }),
    })),
  };
}

let mockDb: ReturnType<typeof createMockDb>;

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(async () => mockDb),
  tenants: TENANTS_TABLE,
  users: USERS_TABLE,
  auditRuns: Symbol('auditRuns'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  lte: vi.fn((...args: any[]) => args),
  isNotNull: vi.fn((...args: any[]) => args),
  sql: vi.fn(),
}));

// Avoid pulling in the real audit pipeline / signalr through scheduler import
vi.mock('@omzig/audit', () => ({
  runAuditPipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/signalr.js', () => ({
  pushAuditProgress: vi.fn().mockResolvedValue(undefined),
}));

// ---- Test helpers ----

function mockJwtMiddleware(payload: Record<string, unknown>) {
  return createMiddleware(async (c, next) => {
    c.set('jwtPayload', payload);
    await next();
  });
}

const adminPayload = {
  oid: 'admin-oid',
  preferred_username: 'admin@example.com',
  name: 'Admin User',
  roles: ['Admin'],
  amr: ['pwd', 'mfa'],
};

const analystPayload = {
  oid: 'analyst-oid',
  preferred_username: 'analyst@example.com',
  name: 'Analyst User',
  roles: ['Analyst'],
  amr: ['pwd', 'mfa'],
};

async function createTestApp(payload = adminPayload) {
  const { scheduleRoutes } = await import('../routes/schedule.js');

  const app = new Hono();
  app.use('/api/*', mockJwtMiddleware(payload));
  app.route('/api', scheduleRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantQueryResult = [];
  userQueryResult = [];
  updateCalls = [];
  mockDb = createMockDb();

  userQueryResult = [
    {
      id: 'user-1',
      orgId: 'org-1',
      entraObjectId: 'admin-oid',
      email: 'admin@example.com',
      displayName: 'Admin User',
      baseRole: 'Admin',
    },
    {
      id: 'user-2',
      orgId: 'org-1',
      entraObjectId: 'analyst-oid',
      email: 'analyst@example.com',
      displayName: 'Analyst User',
      baseRole: 'Analyst',
    },
  ];
});

// ================================================================
// GET /api/tenants/:tenantId/schedule
// ================================================================

describe('GET /api/tenants/:tenantId/schedule', () => {
  it('returns current schedule state', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        orgId: 'org-1',
        status: 'active',
        isDeleted: false,
        scheduleFrequency: 'daily',
        scheduleNextRunAt: new Date('2026-04-15T10:00:00Z'),
      },
    ];
    // Filter user lookup to admin only for this test
    userQueryResult = userQueryResult.filter((u) => u.entraObjectId === 'admin-oid');

    const app = await createTestApp();
    const res = await app.request('/api/tenants/tenant-1/schedule');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeDefined();
    expect(body.data.frequency).toBe('daily');
    expect(body.data.nextRunAt).toBeDefined();
  });

  it('returns null fields when no schedule set', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        orgId: 'org-1',
        status: 'active',
        isDeleted: false,
        scheduleFrequency: null,
        scheduleNextRunAt: null,
      },
    ];
    userQueryResult = userQueryResult.filter((u) => u.entraObjectId === 'admin-oid');

    const app = await createTestApp();
    const res = await app.request('/api/tenants/tenant-1/schedule');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data.frequency).toBeNull();
    expect(body.data.nextRunAt).toBeNull();
  });

  it('returns 404 for non-existent tenant', async () => {
    tenantQueryResult = [];
    userQueryResult = userQueryResult.filter((u) => u.entraObjectId === 'admin-oid');

    const app = await createTestApp();
    const res = await app.request('/api/tenants/nope/schedule');

    expect(res.status).toBe(404);
  });
});

// ================================================================
// PATCH /api/tenants/:tenantId/schedule
// ================================================================

describe('PATCH /api/tenants/:tenantId/schedule', () => {
  function setupActiveTenant() {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        orgId: 'org-1',
        status: 'active',
        isDeleted: false,
        scheduleFrequency: null,
        scheduleNextRunAt: null,
      },
    ];
    userQueryResult = userQueryResult.filter((u) => u.entraObjectId === 'admin-oid');
  }

  it('sets daily frequency and computes next run', async () => {
    setupActiveTenant();
    const app = await createTestApp();

    const res = await app.request('/api/tenants/tenant-1/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: 'daily' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data.frequency).toBe('daily');
    expect(body.data.nextRunAt).toBeDefined();

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].scheduleFrequency).toBe('daily');
    expect(updateCalls[0].scheduleNextRunAt).toBeInstanceOf(Date);
    // Should be ~24h in the future
    const delta = (updateCalls[0].scheduleNextRunAt as Date).getTime() - Date.now();
    expect(delta).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(delta).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it('sets weekly frequency and computes next run ~7d out', async () => {
    setupActiveTenant();
    const app = await createTestApp();

    const res = await app.request('/api/tenants/tenant-1/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: 'weekly' }),
    });

    expect(res.status).toBe(200);
    expect(updateCalls[0].scheduleFrequency).toBe('weekly');
    const delta = (updateCalls[0].scheduleNextRunAt as Date).getTime() - Date.now();
    expect(delta).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(delta).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });

  it("disabled clears scheduleFrequency and scheduleNextRunAt", async () => {
    setupActiveTenant();
    const app = await createTestApp();

    const res = await app.request('/api/tenants/tenant-1/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: 'disabled' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data.frequency).toBeNull();
    expect(body.data.nextRunAt).toBeNull();

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].scheduleFrequency).toBeNull();
    expect(updateCalls[0].scheduleNextRunAt).toBeNull();
  });

  it('rejects invalid frequency value with 400', async () => {
    setupActiveTenant();
    const app = await createTestApp();

    const res = await app.request('/api/tenants/tenant-1/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: 'hourly' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent tenant', async () => {
    tenantQueryResult = [];
    userQueryResult = userQueryResult.filter((u) => u.entraObjectId === 'admin-oid');

    const app = await createTestApp();
    const res = await app.request('/api/tenants/nope/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: 'daily' }),
    });

    expect(res.status).toBe(404);
  });

  it('rejects Analyst role with 403', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        orgId: 'org-1',
        status: 'active',
        isDeleted: false,
        scheduleFrequency: null,
        scheduleNextRunAt: null,
      },
    ];
    userQueryResult = userQueryResult.filter((u) => u.entraObjectId === 'analyst-oid');

    const app = await createTestApp(analystPayload);
    const res = await app.request('/api/tenants/tenant-1/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: 'daily' }),
    });

    expect(res.status).toBe(403);
  });
});
