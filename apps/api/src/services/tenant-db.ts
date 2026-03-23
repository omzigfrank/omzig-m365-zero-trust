import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  getControlPlaneDb,
  getTenantDb,
  closeTenantDb,
  tenants,
  migrateTenantDb,
} from '@omzig/db';
import type { TenantRef } from '@omzig/shared';
import { storeTenantToken } from './keyvault.js';

/**
 * Tenant database provisioning service.
 *
 * Handles the lifecycle of per-tenant isolated databases within the Azure SQL
 * elastic pool. Each tenant gets a UUID-named database (opaque -- no PII leakage
 * in infrastructure) with its own schema and data.
 *
 * INFRA-04: Elastic Pool isolation
 * AUTH-05: Managed identity for DB access
 */

/**
 * Provision a new tenant database in the elastic pool.
 *
 * Steps:
 * 1. Generate UUID-based database name (opaque, no PII)
 * 2. Create the database (in elastic pool, server handles pool assignment)
 * 3. Run tenant schema migrations
 * 4. Store tenant token in Key Vault
 * 5. Insert tenant record in control plane
 * 6. Return TenantRef
 *
 * @param orgId - The organization ID
 * @param displayName - Human-readable tenant name
 * @param m365TenantId - The M365 tenant ID
 * @param token - The authentication token for the tenant
 * @returns TenantRef with the new tenant's metadata
 */
export async function provisionTenantDatabase(
  orgId: string,
  displayName: string,
  m365TenantId: string,
  token: string,
): Promise<TenantRef> {
  const tenantId = crypto.randomUUID();
  const databaseName = `tenant_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const tokenSecretName = `tenant-token-${tenantId}`;

  // Step 1: Create the database
  // In production, this creates within the elastic pool via raw SQL.
  // For local dev, creates a regular database on the SQL Server.
  const controlDb = await getControlPlaneDb();

  // Create database using raw SQL on the control plane connection
  // Note: Azure SQL elastic pool handles pool assignment automatically
  // In local dev, just creates a regular database
  try {
    // Use the control plane DB connection to execute CREATE DATABASE
    // The actual connection pool gives us access to the underlying mssql pool
    // for raw SQL execution
    await (controlDb as any).execute(
      `IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${databaseName}') CREATE DATABASE [${databaseName}]`,
    );
  } catch (err) {
    // If CREATE DATABASE fails (e.g., permissions), log and rethrow
    console.error(`[tenant-db] Failed to create database "${databaseName}":`, err);
    throw err;
  }

  // Step 2: Run tenant schema migrations
  await migrateTenantDb(databaseName);

  // Step 3: Store tenant token in Key Vault
  await storeTenantToken(tenantId, token);

  // Step 4: Insert tenant record in control plane
  const now = new Date().toISOString();
  await controlDb.insert(tenants).values({
    id: tenantId,
    orgId,
    displayName,
    m365TenantId,
    databaseName,
    tokenSecretName,
  });

  return {
    id: tenantId,
    displayName,
    m365TenantId,
    isDeleted: false,
    createdAt: now,
  };
}

/**
 * Soft-delete a tenant database.
 *
 * Sets isDeleted=true and deletedAt=now() on the tenants table.
 * Does NOT drop the database immediately -- 30-day retention policy.
 * A separate scheduled process handles permanent purge after retention.
 *
 * @param tenantId - The tenant ID to deprovision
 */
export async function deprovisionTenantDatabase(tenantId: string): Promise<void> {
  const controlDb = await getControlPlaneDb();

  await controlDb
    .update(tenants)
    .set({
      isDeleted: true,
      deletedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  console.log(`[tenant-db] Tenant "${tenantId}" soft-deleted. Database retained for 30 days.`);
}
