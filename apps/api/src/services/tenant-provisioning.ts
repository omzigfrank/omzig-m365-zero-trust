import crypto from 'node:crypto';
import mssql from 'mssql';
import { eq, sql } from 'drizzle-orm';
import {
  getControlPlaneDb,
  migrateTenantDb,
  tenants,
  tenantUserAccess,
} from '@omzig/db';
import { storeTenantToken } from './keyvault.js';

/**
 * Tenant provisioning service.
 *
 * Handles creating per-tenant databases in the Azure SQL elastic pool,
 * applying schema migrations, storing auth tokens, and managing the
 * tenant lifecycle record.
 *
 * TENANT-08: Per-tenant database isolation (elastic pool)
 * TENANT-01/02: Both OAuth and GDAP converge here after token acquisition
 */

/**
 * Build MSSQL connection config for 'master' database.
 * Replicates the config pattern from @omzig/db connection.ts
 * (not exported, so we replicate the relevant config builder).
 */
function buildMasterConfig(): mssql.config {
  const server = process.env.SQL_SERVER_HOST;
  if (!server) {
    throw new Error('SQL_SERVER_HOST environment variable is required');
  }

  const baseConfig: mssql.config = {
    server,
    port: parseInt(process.env.SQL_SERVER_PORT || '1433', 10),
    database: 'master',
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    pool: {
      max: 2,
      min: 0,
      idleTimeoutMillis: 10000,
    },
  };

  // Use Azure AD Default authentication for production (managed identity)
  if (process.env.NODE_ENV === 'production' || process.env.AZURE_USE_MSI === 'true') {
    return {
      ...baseConfig,
      authentication: {
        type: 'azure-active-directory-default' as const,
        options: {
          clientId: process.env.AZURE_CLIENT_ID,
        },
      },
    };
  }

  // Local development: use SQL auth via env vars
  return {
    ...baseConfig,
    user: process.env.SQL_USERNAME,
    password: process.env.SQL_PASSWORD,
    options: {
      ...baseConfig.options,
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERT === 'true',
    },
  };
}

/**
 * Provision a new tenant database and set the tenant to active.
 *
 * Steps:
 * 1. Generate opaque DB name (UUID-based, no PII leakage)
 * 2. Create database in elastic pool via T-SQL
 * 3. Apply tenant schema migrations
 * 4. Store auth token in Key Vault
 * 5. Update tenant record to 'active' with database info
 * 6. Grant the onboarding user access to the tenant
 *
 * @param tenantId - The pre-created tenant record ID
 * @param m365TenantId - The customer's M365 tenant ID
 * @param token - The auth token (refresh token or credential)
 * @param userId - The user performing the onboarding (gets access granted)
 * @returns The database name and tenant ID
 */
export async function provisionTenant(
  tenantId: string,
  m365TenantId: string,
  token: string,
  userId: string,
): Promise<{ databaseName: string; tenantId: string }> {
  // Step 1: Generate opaque database name
  const dbName = `t_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  // Step 2: Create database in elastic pool via T-SQL on master
  const masterPool = new mssql.ConnectionPool(buildMasterConfig());
  await masterPool.connect();
  try {
    const elasticPoolName = process.env.ELASTIC_POOL_NAME;
    if (elasticPoolName) {
      await masterPool
        .request()
        .query(
          `CREATE DATABASE [${dbName}] (SERVICE_OBJECTIVE = ELASTIC_POOL (name = [${elasticPoolName}]))`,
        );
    } else {
      // Local dev: create without elastic pool
      await masterPool
        .request()
        .query(`CREATE DATABASE [${dbName}]`);
    }
  } finally {
    await masterPool.close();
  }

  // Step 3: Apply tenant schema migrations
  await migrateTenantDb(dbName);

  // Step 4: Store token in Key Vault
  await storeTenantToken(tenantId, token);

  // Step 5: Update tenant record to active
  const db = await getControlPlaneDb();
  const tokenSecretName = `tenant-token-${tenantId}`;

  await db
    .update(tenants)
    .set({
      databaseName: dbName,
      tokenSecretName,
      status: 'active',
      m365TenantId,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  // Step 6: Grant access to the onboarding user
  await db.insert(tenantUserAccess).values({
    id: crypto.randomUUID(),
    userId,
    tenantId,
    roleOverride: null,
    grantedBy: userId,
  });

  return { databaseName: dbName, tenantId };
}

/**
 * Deprovision (soft-delete) a tenant.
 *
 * Sets isDeleted=true, deletedAt=now, status='suspended'.
 * Does NOT drop the database or delete Key Vault secrets.
 * A 30-day retention window applies before hard purge (out of scope).
 *
 * @param tenantId - The tenant ID to deprovision
 */
export async function deprovisionTenant(tenantId: string): Promise<void> {
  const db = await getControlPlaneDb();

  await db
    .update(tenants)
    .set({
      isDeleted: true,
      deletedAt: new Date(),
      status: 'suspended',
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}
