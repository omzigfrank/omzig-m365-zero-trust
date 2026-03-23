import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Integration tests for tenant database isolation.
 *
 * These tests require a real SQL Server instance. Set the SQL_TEST_SERVER
 * environment variable to enable them. For local development, use Docker:
 *
 *   docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=YourStrong!Passw0rd" \
 *     -p 1433:1433 --name sql-test -d mcr.microsoft.com/mssql/server:2022-latest
 *
 * Then set environment variables:
 *   SQL_TEST_SERVER=1  (enables tests)
 *   SQL_SERVER_HOST=localhost
 *   SQL_USERNAME=sa
 *   SQL_PASSWORD=YourStrong!Passw0rd
 *   CONTROL_PLANE_DB_NAME=omzig_control_plane_test
 */

const SKIP_REASON = 'SQL_TEST_SERVER env var not set - skipping integration tests. Set SQL_TEST_SERVER=1 with a running SQL Server to enable.';

describe.skipIf(!process.env.SQL_TEST_SERVER)('Tenant Database Isolation', () => {
  let getControlPlaneDb: typeof import('../connection.js').getControlPlaneDb;
  let getTenantDb: typeof import('../connection.js').getTenantDb;
  let closeTenantDb: typeof import('../connection.js').closeTenantDb;
  let closeControlPlaneDb: typeof import('../connection.js').closeControlPlaneDb;

  beforeAll(async () => {
    const mod = await import('../connection.js');
    getControlPlaneDb = mod.getControlPlaneDb;
    getTenantDb = mod.getTenantDb;
    closeTenantDb = mod.closeTenantDb;
    closeControlPlaneDb = mod.closeControlPlaneDb;
  });

  afterAll(async () => {
    if (closeControlPlaneDb) {
      await closeControlPlaneDb();
    }
  });

  it('connects to control plane DB and verifies connection works', async () => {
    const db = await getControlPlaneDb();
    expect(db).toBeDefined();
  });

  it('connects to two different tenant DBs producing separate connections', async () => {
    const tenantA = await getTenantDb('tenant_test_a');
    const tenantB = await getTenantDb('tenant_test_b');

    try {
      // Both connections should be valid but distinct
      expect(tenantA.db).toBeDefined();
      expect(tenantB.db).toBeDefined();
      expect(tenantA.pool).not.toBe(tenantB.pool);
    } finally {
      await closeTenantDb(tenantA.pool);
      await closeTenantDb(tenantB.pool);
    }
  });

  it('isolates data between tenant databases', async () => {
    const { auditRuns } = await import('../tenant/schema.js');
    const { eq } = await import('drizzle-orm');

    const tenantA = await getTenantDb('tenant_test_a');
    const tenantB = await getTenantDb('tenant_test_b');

    try {
      // Insert a row in Tenant A
      const testId = crypto.randomUUID();
      await tenantA.db.insert(auditRuns).values({
        id: testId,
        tenantId: 'tenant-a-id',
        triggeredBy: 'test-user',
        status: 'completed',
      });

      // Query Tenant B - should find zero results for tenant-a-id
      const resultsInB = await tenantB.db
        .select()
        .from(auditRuns)
        .where(eq(auditRuns.id, testId));

      expect(resultsInB).toHaveLength(0);

      // Query Tenant A - should find the row
      const resultsInA = await tenantA.db
        .select()
        .from(auditRuns)
        .where(eq(auditRuns.id, testId));

      expect(resultsInA).toHaveLength(1);
      expect(resultsInA[0]!.tenantId).toBe('tenant-a-id');
    } finally {
      await closeTenantDb(tenantA.pool);
      await closeTenantDb(tenantB.pool);
    }
  });

  it('closes connection pool after closeTenantDb', async () => {
    const tenant = await getTenantDb('tenant_test_a');
    expect(tenant.pool.connected).toBe(true);

    await closeTenantDb(tenant.pool);
    expect(tenant.pool.connected).toBe(false);
  });
});

describe('Connection module exports', () => {
  it('exports getControlPlaneDb function', async () => {
    const mod = await import('../connection.js');
    expect(typeof mod.getControlPlaneDb).toBe('function');
  });

  it('exports getTenantDb function', async () => {
    const mod = await import('../connection.js');
    expect(typeof mod.getTenantDb).toBe('function');
  });

  it('exports closeTenantDb function', async () => {
    const mod = await import('../connection.js');
    expect(typeof mod.closeTenantDb).toBe('function');
  });

  it('exports closeControlPlaneDb function', async () => {
    const mod = await import('../connection.js');
    expect(typeof mod.closeControlPlaneDb).toBe('function');
  });
});

describe('Migration module exports', () => {
  it('exports migrateControlPlane function', async () => {
    const mod = await import('../migrate.js');
    expect(typeof mod.migrateControlPlane).toBe('function');
  });

  it('exports migrateTenantDb function', async () => {
    const mod = await import('../migrate.js');
    expect(typeof mod.migrateTenantDb).toBe('function');
  });
});
