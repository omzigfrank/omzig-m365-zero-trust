import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock @omzig/db module
const mockControlPlaneSelect = vi.fn();
const mockControlPlaneFrom = vi.fn();
const mockControlPlaneWhere = vi.fn();
const mockTenantPool = {
  connected: true,
  close: vi.fn(),
};

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockResolvedValue({
    select: () => ({
      from: () => ({
        where: mockControlPlaneWhere,
      }),
    }),
  }),
  getTenantDb: vi.fn().mockResolvedValue({
    db: { _isTenantDb: true },
    pool: mockTenantPool,
  }),
  closeTenantDb: vi.fn().mockResolvedValue(undefined),
  tenants: { id: 'id', isDeleted: 'is_deleted', databaseName: 'database_name' },
  tenantUserAccess: { tenantId: 'tenant_id', userId: 'user_id' },
  users: { entraObjectId: 'entra_object_id', orgId: 'org_id' },
}));

describe('withTenantDb middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantPool.close.mockResolvedValue(undefined);
    mockTenantPool.connected = true;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 400 when X-Tenant-Id header is missing', async () => {
    const { withTenantDb } = await import('../middleware/tenant.js');

    const app = new Hono();
    // Simulate authenticated context with jwtPayload
    app.use('*', async (c, next) => {
      c.set('jwtPayload', { oid: 'user-oid-1', preferred_username: 'test@test.com', amr: ['pwd', 'mfa'] });
      await next();
    });
    app.use('/api/tenants/*', withTenantDb());
    app.get('/api/tenants/:id/data', (c) => c.json({ data: 'ok' }));

    const res = await app.request('/api/tenants/t1/data');
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.message).toContain('X-Tenant-Id');
  });

  it('returns 404 when tenant is not found', async () => {
    // Mock tenant not found
    mockControlPlaneWhere.mockResolvedValueOnce([]);

    const { withTenantDb } = await import('../middleware/tenant.js');

    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('jwtPayload', { oid: 'user-oid-1', preferred_username: 'test@test.com', amr: ['pwd', 'mfa'] });
      await next();
    });
    app.use('/api/tenants/*', withTenantDb());
    app.get('/api/tenants/:id/data', (c) => c.json({ data: 'ok' }));

    const res = await app.request('/api/tenants/t1/data', {
      headers: { 'X-Tenant-Id': 'nonexistent-tenant-id' },
    });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('TENANT_NOT_FOUND');
  });

  it('returns 404 when tenant is soft-deleted', async () => {
    // Mock tenant found but deleted
    mockControlPlaneWhere.mockResolvedValueOnce([
      { id: 'tenant-1', isDeleted: true, databaseName: 'tenant_abc123' },
    ]);

    const { withTenantDb } = await import('../middleware/tenant.js');

    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('jwtPayload', { oid: 'user-oid-1', preferred_username: 'test@test.com', amr: ['pwd', 'mfa'] });
      await next();
    });
    app.use('/api/tenants/*', withTenantDb());
    app.get('/api/tenants/:id/data', (c) => c.json({ data: 'ok' }));

    const res = await app.request('/api/tenants/t1/data', {
      headers: { 'X-Tenant-Id': 'tenant-1' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 403 when user has no access to the tenant', async () => {
    // Mock tenant found and active
    mockControlPlaneWhere
      .mockResolvedValueOnce([
        { id: 'tenant-1', isDeleted: false, databaseName: 'tenant_abc123', orgId: 'org-1' },
      ])
      // Mock user lookup (for org check)
      .mockResolvedValueOnce([
        { id: 'user-1', entraObjectId: 'user-oid-1', orgId: 'org-1' },
      ])
      // Mock no tenant access
      .mockResolvedValueOnce([]);

    const { withTenantDb } = await import('../middleware/tenant.js');

    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('jwtPayload', { oid: 'user-oid-1', preferred_username: 'test@test.com', amr: ['pwd', 'mfa'] });
      await next();
    });
    app.use('/api/tenants/*', withTenantDb());
    app.get('/api/tenants/:id/data', (c) => c.json({ data: 'ok' }));

    const res = await app.request('/api/tenants/t1/data', {
      headers: { 'X-Tenant-Id': 'tenant-1' },
    });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error.code).toBe('TENANT_ACCESS_DENIED');
  });

  it('injects tenantDb into request context when access is valid', async () => {
    // Mock tenant found and active
    mockControlPlaneWhere
      .mockResolvedValueOnce([
        { id: 'tenant-1', isDeleted: false, databaseName: 'tenant_abc123', orgId: 'org-1' },
      ])
      // Mock user lookup
      .mockResolvedValueOnce([
        { id: 'user-1', entraObjectId: 'user-oid-1', orgId: 'org-1' },
      ])
      // Mock tenant access exists
      .mockResolvedValueOnce([
        { tenantId: 'tenant-1', userId: 'user-1' },
      ]);

    const { withTenantDb } = await import('../middleware/tenant.js');

    let capturedTenantDb: unknown = null;
    let capturedTenantMeta: unknown = null;

    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('jwtPayload', { oid: 'user-oid-1', preferred_username: 'test@test.com', amr: ['pwd', 'mfa'] });
      await next();
    });
    app.use('/api/tenants/*', withTenantDb());
    app.get('/api/tenants/:id/data', (c) => {
      capturedTenantDb = c.get('tenantDb');
      capturedTenantMeta = c.get('tenantMeta');
      return c.json({ data: 'ok' });
    });

    const res = await app.request('/api/tenants/t1/data', {
      headers: { 'X-Tenant-Id': 'tenant-1' },
    });
    expect(res.status).toBe(200);
    expect(capturedTenantDb).toBeDefined();
    expect(capturedTenantMeta).toBeDefined();
  });

  it('closes tenant DB connection after request completes', async () => {
    // Mock tenant found and active with access
    mockControlPlaneWhere
      .mockResolvedValueOnce([
        { id: 'tenant-1', isDeleted: false, databaseName: 'tenant_abc123', orgId: 'org-1' },
      ])
      .mockResolvedValueOnce([
        { id: 'user-1', entraObjectId: 'user-oid-1', orgId: 'org-1' },
      ])
      .mockResolvedValueOnce([
        { tenantId: 'tenant-1', userId: 'user-1' },
      ]);

    const { withTenantDb } = await import('../middleware/tenant.js');
    const { closeTenantDb } = await import('@omzig/db');

    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('jwtPayload', { oid: 'user-oid-1', preferred_username: 'test@test.com', amr: ['pwd', 'mfa'] });
      await next();
    });
    app.use('/api/tenants/*', withTenantDb());
    app.get('/api/tenants/:id/data', (c) => c.json({ data: 'ok' }));

    await app.request('/api/tenants/t1/data', {
      headers: { 'X-Tenant-Id': 'tenant-1' },
    });

    // Verify closeTenantDb was called with the pool
    expect(closeTenantDb).toHaveBeenCalledWith(mockTenantPool);
  });
});
