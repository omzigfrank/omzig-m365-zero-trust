import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { ApiResponse } from '@omzig/shared';

describe('RBAC middleware - requireRole', () => {
  it('allows Owner when requireRole("Owner") is set', async () => {
    const { createTestAppWithRbac } = await import('./helpers.js');
    const app = createTestAppWithRbac(['Owner'], {
      oid: 'user-owner',
      preferred_username: 'owner@example.com',
      name: 'Owner',
      roles: ['Owner'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/protected');
    expect(res.status).toBe(200);
  });

  it('rejects Admin when only Owner is allowed', async () => {
    const { createTestAppWithRbac } = await import('./helpers.js');
    const app = createTestAppWithRbac(['Owner'], {
      oid: 'user-admin',
      preferred_username: 'admin@example.com',
      name: 'Admin',
      roles: ['Admin'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/protected');
    expect(res.status).toBe(403);

    const body = (await res.json()) as ApiResponse;
    expect(body.error!.code).toBe('INSUFFICIENT_ROLE');
  });

  it('rejects Analyst when only Owner is allowed', async () => {
    const { createTestAppWithRbac } = await import('./helpers.js');
    const app = createTestAppWithRbac(['Owner'], {
      oid: 'user-analyst',
      preferred_username: 'analyst@example.com',
      name: 'Analyst',
      roles: ['Analyst'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/protected');
    expect(res.status).toBe(403);
  });

  it('rejects Read-only when only Owner is allowed', async () => {
    const { createTestAppWithRbac } = await import('./helpers.js');
    const app = createTestAppWithRbac(['Owner'], {
      oid: 'user-readonly',
      preferred_username: 'reader@example.com',
      name: 'Reader',
      roles: ['Read-only'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/protected');
    expect(res.status).toBe(403);
  });

  it('allows both Owner and Admin when requireRole("Owner", "Admin")', async () => {
    const { createTestAppWithRbac } = await import('./helpers.js');

    // Test Owner access
    const appOwner = createTestAppWithRbac(['Owner', 'Admin'], {
      oid: 'user-owner',
      preferred_username: 'owner@example.com',
      name: 'Owner',
      roles: ['Owner'],
      amr: ['pwd', 'mfa'],
    });
    const resOwner = await appOwner.request('/api/protected');
    expect(resOwner.status).toBe(200);

    // Test Admin access
    const appAdmin = createTestAppWithRbac(['Owner', 'Admin'], {
      oid: 'user-admin',
      preferred_username: 'admin@example.com',
      name: 'Admin',
      roles: ['Admin'],
      amr: ['pwd', 'mfa'],
    });
    const resAdmin = await appAdmin.request('/api/protected');
    expect(resAdmin.status).toBe(200);
  });

  it('rejects Analyst when Owner and Admin are allowed', async () => {
    const { createTestAppWithRbac } = await import('./helpers.js');
    const app = createTestAppWithRbac(['Owner', 'Admin'], {
      oid: 'user-analyst',
      preferred_username: 'analyst@example.com',
      name: 'Analyst',
      roles: ['Analyst'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/protected');
    expect(res.status).toBe(403);
  });
});

describe('RBAC middleware - requirePermission', () => {
  it('allows Owner for manage-tenants permission', async () => {
    const { createTestAppWithPermission } = await import('./helpers.js');
    const app = createTestAppWithPermission('manage-tenants', {
      oid: 'user-owner',
      preferred_username: 'owner@example.com',
      name: 'Owner',
      roles: ['Owner'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/protected');
    expect(res.status).toBe(200);
  });

  it('allows Admin for manage-tenants permission', async () => {
    const { createTestAppWithPermission } = await import('./helpers.js');
    const app = createTestAppWithPermission('manage-tenants', {
      oid: 'user-admin',
      preferred_username: 'admin@example.com',
      name: 'Admin',
      roles: ['Admin'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/protected');
    expect(res.status).toBe(200);
  });

  it('rejects Analyst for manage-tenants permission', async () => {
    const { createTestAppWithPermission } = await import('./helpers.js');
    const app = createTestAppWithPermission('manage-tenants', {
      oid: 'user-analyst',
      preferred_username: 'analyst@example.com',
      name: 'Analyst',
      roles: ['Analyst'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/protected');
    expect(res.status).toBe(403);
  });

  it('rejects Read-only for manage-tenants permission', async () => {
    const { createTestAppWithPermission } = await import('./helpers.js');
    const app = createTestAppWithPermission('manage-tenants', {
      oid: 'user-readonly',
      preferred_username: 'reader@example.com',
      name: 'Reader',
      roles: ['Read-only'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/protected');
    expect(res.status).toBe(403);
  });

  it('allows all roles for view-findings permission', async () => {
    const { createTestAppWithPermission } = await import('./helpers.js');

    for (const role of ['Owner', 'Admin', 'Analyst', 'Read-only'] as const) {
      const app = createTestAppWithPermission('view-findings', {
        oid: `user-${role}`,
        preferred_username: `${role}@example.com`,
        name: role,
        roles: [role],
        amr: ['pwd', 'mfa'],
      });

      const res = await app.request('/api/protected');
      expect(res.status).toBe(200);
    }
  });
});

describe('RBAC middleware - Per-tenant role overrides', () => {
  it('upgrades Read-only base to Analyst for a specific tenant', async () => {
    const { createTestAppWithRbac, setTenantOverride } = await import('./helpers.js');

    // Set an override: user is Analyst for tenant-x
    setTenantOverride('user-readonly', 'tenant-x', 'Analyst');

    const app = createTestAppWithRbac(['Analyst'], {
      oid: 'user-readonly',
      preferred_username: 'reader@example.com',
      name: 'Reader',
      roles: ['Read-only'],
      amr: ['pwd', 'mfa'],
    });

    // Without tenant header -> base role (Read-only) -> should be rejected
    const resNoTenant = await app.request('/api/protected');
    expect(resNoTenant.status).toBe(403);

    // With tenant header -> override to Analyst -> should pass
    const resWithTenant = await app.request('/api/protected', {
      headers: { 'X-Tenant-Id': 'tenant-x' },
    });
    expect(resWithTenant.status).toBe(200);
  });

  it('downgrades Admin base to Read-only for a specific tenant', async () => {
    const { createTestAppWithRbac, setTenantOverride } = await import('./helpers.js');

    // Set an override: user is Read-only for tenant-y
    setTenantOverride('user-admin', 'tenant-y', 'Read-only');

    const app = createTestAppWithRbac(['Admin'], {
      oid: 'user-admin',
      preferred_username: 'admin@example.com',
      name: 'Admin',
      roles: ['Admin'],
      amr: ['pwd', 'mfa'],
    });

    // Without tenant header -> base role (Admin) -> should pass
    const resNoTenant = await app.request('/api/protected');
    expect(resNoTenant.status).toBe(200);

    // With tenant header -> override to Read-only -> should be rejected
    const resWithTenant = await app.request('/api/protected', {
      headers: { 'X-Tenant-Id': 'tenant-y' },
    });
    expect(resWithTenant.status).toBe(403);
  });
});
