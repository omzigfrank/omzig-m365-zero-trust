/**
 * Vitest global setup for @omzig/api tests.
 *
 * Mocks external modules that are not available in the test environment:
 * - mssql: Used by tenant-provisioning.ts for direct SQL to master DB
 * - @azure/msal-node: Used by oauth-consent.ts for MSAL token exchange
 * - @azure/identity: Used by keyvault.ts for DefaultAzureCredential
 * - @azure/keyvault-secrets: Used by keyvault.ts for secret storage
 * - @azure/keyvault-keys: Used by keyvault.ts for encryption
 *
 * These mocks prevent test failures when importing app.ts (which transitively
 * imports all route files and their service dependencies).
 */
import { vi } from 'vitest';

vi.mock('mssql', () => ({
  default: {
    ConnectionPool: vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      close: vi.fn(),
      request: vi.fn().mockReturnValue({
        query: vi.fn(),
      }),
    })),
  },
  ConnectionPool: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    close: vi.fn(),
    request: vi.fn().mockReturnValue({
      query: vi.fn(),
    }),
  })),
}));
