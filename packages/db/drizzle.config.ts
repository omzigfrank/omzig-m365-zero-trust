import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mssql',
  schema: './src/control-plane/schema.ts',
  out: './drizzle',
  dbCredentials: {
    host: process.env.SQL_SERVER_HOST || 'localhost',
    port: parseInt(process.env.SQL_SERVER_PORT || '1433', 10),
    database: process.env.CONTROL_PLANE_DB_NAME || 'omzig_control_plane',
    user: process.env.SQL_USERNAME || 'sa',
    password: process.env.SQL_PASSWORD || '',
    options: {
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERT === 'true',
    },
  },
});
