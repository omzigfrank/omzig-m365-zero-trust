import { drizzle } from 'drizzle-orm/node-mssql';
import { migrate } from 'drizzle-orm/node-mssql/migrator';
import mssql from 'mssql';
import path from 'node:path';

import * as controlPlaneSchema from './control-plane/schema.js';
import * as tenantSchema from './tenant/schema.js';

/**
 * Build MSSQL connection config for migration.
 * Uses Azure AD Default authentication in production, SQL auth for local dev.
 */
function buildMigrationConfig(databaseName: string): mssql.config {
  const server = process.env.SQL_SERVER_HOST;
  if (!server) {
    throw new Error('SQL_SERVER_HOST environment variable is required');
  }

  const baseConfig: mssql.config = {
    server,
    port: parseInt(process.env.SQL_SERVER_PORT || '1433', 10),
    database: databaseName,
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

  // Use Azure AD Default authentication for production
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

  // Local development: use SQL auth
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
 * Run Drizzle migrations on the control plane database.
 * Called on API startup to ensure schema is up-to-date.
 */
export async function migrateControlPlane(): Promise<void> {
  const dbName = process.env.CONTROL_PLANE_DB_NAME;
  if (!dbName) {
    throw new Error('CONTROL_PLANE_DB_NAME environment variable is required');
  }

  console.log(`[migrate] Starting control plane migrations on database: ${dbName}`);

  const config = buildMigrationConfig(dbName);
  const pool = new mssql.ConnectionPool(config);
  await pool.connect();

  try {
    const db = drizzle({
      client: pool,
      schema: controlPlaneSchema,
    });

    const migrationsFolder = path.resolve(__dirname, '..', 'drizzle', 'control-plane');
    await migrate(db, { migrationsFolder });

    console.log(`[migrate] Control plane migrations complete on database: ${dbName}`);
  } finally {
    await pool.close();
  }
}

/**
 * Run Drizzle migrations on a specific tenant database.
 * Called during tenant provisioning to set up the tenant schema.
 */
export async function migrateTenantDb(databaseName: string): Promise<void> {
  console.log(`[migrate] Starting tenant migrations on database: ${databaseName}`);

  const config = buildMigrationConfig(databaseName);
  const pool = new mssql.ConnectionPool(config);
  await pool.connect();

  try {
    const db = drizzle({
      client: pool,
      schema: tenantSchema,
    });

    const migrationsFolder = path.resolve(__dirname, '..', 'drizzle', 'tenant');
    await migrate(db, { migrationsFolder });

    console.log(`[migrate] Tenant migrations complete on database: ${databaseName}`);
  } finally {
    await pool.close();
  }
}
