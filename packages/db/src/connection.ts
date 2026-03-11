import { drizzle } from 'drizzle-orm/node-mssql';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';

import * as controlPlaneSchema from './control-plane/schema.js';
import * as tenantSchema from './tenant/schema.js';

export type ControlPlaneDb = NodeMsSqlDatabase<typeof controlPlaneSchema>;
export type TenantDb = NodeMsSqlDatabase<typeof tenantSchema>;

/**
 * Build MSSQL connection config.
 * In production, uses Azure AD MSI authentication.
 * For local development, falls back to connection string from environment.
 */
function buildConfig(databaseName: string): mssql.config {
  const server = process.env.SQL_SERVER_HOST;
  if (!server) {
    throw new Error('SQL_SERVER_HOST environment variable is required');
  }

  const baseConfig: mssql.config = {
    server,
    database: databaseName,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  // Use Azure AD MSI for production, SQL auth for local dev
  if (process.env.NODE_ENV === 'production' || process.env.AZURE_USE_MSI === 'true') {
    return {
      ...baseConfig,
      authentication: {
        type: 'azure-active-directory-msi-app-service' as const,
        options: {
          clientId: process.env.AZURE_CLIENT_ID,
        },
      },
    };
  }

  // Local development: use SQL auth via env vars
  return {
    ...baseConfig,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
  };
}

let controlPlanePool: mssql.ConnectionPool | null = null;
let controlPlaneDb: ControlPlaneDb | null = null;

/**
 * Get the control plane database instance (singleton).
 * Connects to the shared control plane DB that stores orgs, users, tenants.
 */
export async function getControlPlaneDb(): Promise<ControlPlaneDb> {
  if (controlPlaneDb) {
    return controlPlaneDb;
  }

  const dbName = process.env.CONTROL_PLANE_DB_NAME;
  if (!dbName) {
    throw new Error('CONTROL_PLANE_DB_NAME environment variable is required');
  }

  const config = buildConfig(dbName);
  controlPlanePool = new mssql.ConnectionPool(config);
  await controlPlanePool.connect();

  controlPlaneDb = drizzle({
    client: controlPlanePool,
    schema: controlPlaneSchema,
  });

  return controlPlaneDb;
}

/**
 * Get a tenant database instance (on-demand, per-request).
 * Each tenant has its own isolated database.
 * Caller must close the pool after the request using closeTenantDb().
 */
export async function getTenantDb(
  databaseName: string,
): Promise<{ db: TenantDb; pool: mssql.ConnectionPool }> {
  const config = buildConfig(databaseName);
  const pool = new mssql.ConnectionPool(config);
  await pool.connect();

  const db = drizzle({
    client: pool,
    schema: tenantSchema,
  });

  return { db, pool };
}

/**
 * Close a tenant database connection pool.
 * Must be called after each request to prevent connection leaks.
 */
export async function closeTenantDb(pool: mssql.ConnectionPool): Promise<void> {
  await pool.close();
}

/**
 * Close the control plane connection pool (for graceful shutdown).
 */
export async function closeControlPlaneDb(): Promise<void> {
  if (controlPlanePool) {
    await controlPlanePool.close();
    controlPlanePool = null;
    controlPlaneDb = null;
  }
}
