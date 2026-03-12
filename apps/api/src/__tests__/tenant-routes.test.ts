import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ApiResponse } from '@omzig/shared';

/**
 * Tenant route and wizard-state route tests.
 *
 * Tests all tenant CRUD endpoints, onboarding endpoints,
 * and wizard-state endpoints with mocked DB and services.
 */

// ---- Mock state ----

let tenantQueryResult: any[] = [];
let userQueryResult: any[] = [];
let wizardQueryResult: any[] = [];
let insertCalls: any[] = [];
let updateCalls: any[] = [];
let deleteCalls: any[] = [];
let updateRowsAffected = 1;

// Service mocks
const mockBuildConsentUrl = vi.fn().mockReturnValue('https://login.microsoftonline.com/test-consent-url');
const mockVerifyGdapRelationship = vi.fn().mockResolvedValue({
  customerTenantId: 'customer-tenant-id',
  customerDisplayName: 'Customer Org',
  roles: [{ roleDefinitionId: 'role-1' }],
  expiresAt: '2027-01-01T00:00:00Z',
});
const mockProvisionTenant = vi.fn().mockResolvedValue({
  databaseName: 't_abc123',
  tenantId: 'tenant-1',
});
const mockDeprovisionTenant = vi.fn().mockResolvedValue(undefined);

// ---- Mocks ----

vi.mock('../services/oauth-consent.js', () => ({
  buildConsentUrl: (...args: any[]) => mockBuildConsentUrl(...args),
}));

vi.mock('../services/gdap-verification.js', () => ({
  verifyGdapRelationship: (...args: any[]) => mockVerifyGdapRelationship(...args),
}));

vi.mock('../services/tenant-provisioning.js', () => ({
  provisionTenant: (...args: any[]) => mockProvisionTenant(...args),
  deprovisionTenant: (...args: any[]) => mockDeprovisionTenant(...args),
}));

// Mock table references (unique symbols so we can identify which table is queried)
const USERS_TABLE = Symbol('users');
const TENANTS_TABLE = Symbol('tenants');
const WIZARD_TABLE = Symbol('setupWizardState');
const ORGS_TABLE = Symbol('organizations');
const ACCESS_TABLE = Symbol('tenantUserAccess');

/**
 * Creates a fresh mock DB instance.
 * Each call to select().from(table).where() returns data based on the table symbol.
 */
function createMockDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => ({
        where: vi.fn().mockImplementation(() => {
          if (table === USERS_TABLE) return Promise.resolve(userQueryResult);
          if (table === WIZARD_TABLE) return Promise.resolve(wizardQueryResult);
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
      set: vi.fn().mockImplementation((vals: any) => {
        updateCalls.push(vals);
        return {
          where: vi.fn().mockImplementation(() =>
            Promise.resolve({ rowsAffected: updateRowsAffected }),
          ),
        };
      }),
    })),
    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        deleteCalls.push(true);
        return Promise.resolve();
      }),
    })),
  };
}

let mockDb: ReturnType<typeof createMockDb>;

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(async () => mockDb),
  tenants: TENANTS_TABLE,
  users: USERS_TABLE,
  setupWizardState: WIZARD_TABLE,
  organizations: ORGS_TABLE,
  tenantUserAccess: ACCESS_TABLE,
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
  const { tenantsRoutes } = await import('../routes/tenants.js');
  const { wizardStateRoutes } = await import('../routes/wizard-state.js');

  const app = new Hono();
  app.use('/api/*', mockJwtMiddleware(payload));
  app.use('/api/*', mockMfaMiddleware());
  app.route('/api/tenants', tenantsRoutes);
  app.route('/api/wizard-state', wizardStateRoutes);

  return app;
}

// ---- Setup ----

beforeEach(() => {
  vi.clearAllMocks();
  tenantQueryResult = [];
  userQueryResult = [];
  wizardQueryResult = [];
  insertCalls = [];
  updateCalls = [];
  deleteCalls = [];
  updateRowsAffected = 1;
  mockDb = createMockDb();

  // Default user lookup - always finds user in org-1
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
// Tenant Route Tests
// ================================================================

describe('GET /api/tenants', () => {
  it('returns array of TenantSummary objects for user org', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        displayName: 'Client A',
        m365TenantId: 'm365-1',
        status: 'active',
        connectionMethod: 'oauth',
        primaryDomain: 'clienta.com',
        lastAuditAt: new Date('2026-03-10'),
        lastAuditScore: 75,
        isDeleted: false,
        createdAt: new Date('2026-01-01'),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/tenants');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe('tenant-1');
    expect(body.data[0].health).toBe('green'); // score 75 >= 70
    expect(body.meta?.correlationId).toBeDefined();
  });

  it('returns empty array when all tenants are deleted', async () => {
    tenantQueryResult = [];

    const app = await createTestApp();
    const res = await app.request('/api/tenants');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toEqual([]);
  });
});

describe('POST /api/tenants', () => {
  it('creates a pending tenant record and returns tenant ID', async () => {
    const app = await createTestApp();
    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'New Client',
        primaryDomain: 'newclient.com',
        contactEmail: 'admin@newclient.com',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeDefined();
    expect(body.data.status).toBe('pending');
    expect(body.data.id).toBeDefined();
    expect(typeof body.data.id).toBe('string');
  });

  it('rejects invalid displayName (too short)', async () => {
    const app = await createTestApp();
    const res = await app.request('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'ab',
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/tenants/:id', () => {
  it('returns single TenantSummary', async () => {
    tenantQueryResult = [
      {
        id: 'tenant-1',
        displayName: 'Client A',
        m365TenantId: 'm365-1',
        status: 'active',
        connectionMethod: 'oauth',
        primaryDomain: 'clienta.com',
        lastAuditAt: new Date('2026-03-10'),
        lastAuditScore: 55,
        isDeleted: false,
        createdAt: new Date('2026-01-01'),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/tenants/tenant-1');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data.id).toBe('tenant-1');
    expect(body.data.health).toBe('yellow'); // score 55 is 40-69
  });

  it('returns 404 for non-existent tenant', async () => {
    tenantQueryResult = [];

    const app = await createTestApp();
    const res = await app.request('/api/tenants/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/tenants/:id/onboard/oauth', () => {
  it('returns consent URL for pending tenant', async () => {
    tenantQueryResult = [
      { id: 'tenant-1', status: 'pending', isDeleted: false },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/tenants/tenant-1/onboard/oauth', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data.consentUrl).toBeDefined();
    expect(mockBuildConsentUrl).toHaveBeenCalledWith('tenant-1');
  });
});

describe('POST /api/tenants/:id/onboard/gdap', () => {
  it('returns GDAP verification result', async () => {
    tenantQueryResult = [
      { id: 'tenant-1', status: 'pending', isDeleted: false, displayName: 'Client A' },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/tenants/tenant-1/onboard/gdap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relationshipId: 'gdap-rel-1' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data.customerTenantId).toBe('customer-tenant-id');
    expect(body.data.customerDisplayName).toBe('Customer Org');
  });
});

describe('POST /api/tenants/:id/provision', () => {
  it('provisions tenant and returns active status', async () => {
    tenantQueryResult = [
      { id: 'tenant-1', status: 'pending', isDeleted: false },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/tenants/tenant-1/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        m365TenantId: 'm365-customer',
        token: 'refresh-token-xyz',
        connectionMethod: 'oauth',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data.databaseName).toBe('t_abc123');
    expect(body.data.status).toBe('active');
    expect(mockProvisionTenant).toHaveBeenCalledWith(
      'tenant-1',
      'm365-customer',
      'refresh-token-xyz',
      'test-user-oid',
    );
  });
});

describe('DELETE /api/tenants/:id', () => {
  it('soft-deletes tenant with status suspended', async () => {
    tenantQueryResult = [
      { id: 'tenant-1', status: 'active', isDeleted: false },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/tenants/tenant-1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data.id).toBe('tenant-1');
    expect(body.data.status).toBe('suspended');
    expect(mockDeprovisionTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('returns 404 for non-existent tenant', async () => {
    tenantQueryResult = [];

    const app = await createTestApp();
    const res = await app.request('/api/tenants/nonexistent', {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
  });
});

// ================================================================
// Wizard State Route Tests
// ================================================================

describe('GET /api/wizard-state', () => {
  it('returns null when no state exists', async () => {
    wizardQueryResult = [];

    const app = await createTestApp();
    const res = await app.request('/api/wizard-state');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeNull();
  });

  it('returns wizard state when row exists', async () => {
    wizardQueryResult = [
      {
        id: 'ws-1',
        orgId: 'org-1',
        currentStep: 3,
        totalSteps: 5,
        stepsCompleted: '[{"step":1,"data":{"tenantId":"t1"},"completedAt":"2026-03-10"}]',
        isComplete: false,
        updatedAt: new Date('2026-03-10'),
      },
    ];

    const app = await createTestApp();
    const res = await app.request('/api/wizard-state');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeDefined();
    expect(body.data.currentStep).toBe(3);
    expect(Array.isArray(body.data.stepsCompleted)).toBe(true);
    expect(body.data.stepsCompleted[0].step).toBe(1);
  });
});

describe('PATCH /api/wizard-state', () => {
  it('creates new row on first call (upsert)', async () => {
    wizardQueryResult = []; // No existing row

    const app = await createTestApp();
    const res = await app.request('/api/wizard-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentStep: 2,
        stepsCompleted: [{ step: 1, data: { tenantId: 't1' }, completedAt: '2026-03-10' }],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeDefined();
    expect(body.data.currentStep).toBe(2);
    expect(insertCalls.length).toBe(1); // Inserted new row
  });

  it('updates existing row with optimistic locking', async () => {
    wizardQueryResult = [
      {
        id: 'ws-1',
        orgId: 'org-1',
        currentStep: 2,
        totalSteps: 5,
        stepsCompleted: '[]',
        isComplete: false,
        updatedAt: new Date('2026-03-10'),
      },
    ];
    updateRowsAffected = 1; // Update succeeds

    const app = await createTestApp();
    const res = await app.request('/api/wizard-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentStep: 3,
        stepsCompleted: [{ step: 1, data: {} }, { step: 2, data: {} }],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeDefined();
    expect(body.data.currentStep).toBe(3);
    expect(updateCalls.length).toBe(1); // Updated existing row
  });

  it('returns 409 on concurrent modification', async () => {
    wizardQueryResult = [
      {
        id: 'ws-1',
        orgId: 'org-1',
        currentStep: 2,
        totalSteps: 5,
        stepsCompleted: '[]',
        isComplete: false,
        updatedAt: new Date('2026-03-10'),
      },
    ];
    updateRowsAffected = 0; // Optimistic lock failure

    const app = await createTestApp();
    const res = await app.request('/api/wizard-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentStep: 3,
        stepsCompleted: [{ step: 1, data: {} }],
      }),
    });

    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/wizard-state', () => {
  it('removes the wizard state row', async () => {
    const app = await createTestApp();
    const res = await app.request('/api/wizard-state', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeNull();
  });
});
