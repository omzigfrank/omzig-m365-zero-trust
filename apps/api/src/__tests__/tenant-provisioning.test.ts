import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock mssql ConnectionPool
const mockQuery = vi.fn().mockResolvedValue({});
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockRequest = vi.fn().mockReturnValue({ query: mockQuery });

vi.mock('mssql', () => ({
  default: {
    ConnectionPool: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      close: mockClose,
      request: mockRequest,
    })),
  },
}));

// Mock @omzig/db
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn().mockResolvedValue(undefined);
const mockInsertValues = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockWhere });

const mockGetControlPlaneDb = vi.fn().mockResolvedValue({
  update: mockUpdate,
  insert: mockInsert,
});

const mockMigrateTenantDb = vi.fn().mockResolvedValue(undefined);

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: (...args: unknown[]) => mockGetControlPlaneDb(...args),
  migrateTenantDb: (...args: unknown[]) => mockMigrateTenantDb(...args),
  tenants: { id: 'tenants.id' },
  tenantUserAccess: { id: 'tenantUserAccess.id' },
}));

// Mock drizzle-orm eq
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((col, val) => ({ col, val })),
  sql: (strings: TemplateStringsArray) => strings.join(''),
}));

// Mock keyvault
const mockStoreTenantToken = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/keyvault.js', () => ({
  storeTenantToken: (...args: unknown[]) => mockStoreTenantToken(...args),
}));

describe('Tenant Provisioning Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SQL_SERVER_HOST = 'localhost';
    process.env.SQL_SERVER_PORT = '1433';
    process.env.ELASTIC_POOL_NAME = 'test-elastic-pool';
  });

  afterEach(() => {
    delete process.env.SQL_SERVER_HOST;
    delete process.env.SQL_SERVER_PORT;
    delete process.env.ELASTIC_POOL_NAME;
    vi.resetModules();
  });

  describe('provisionTenant', () => {
    it('creates database with elastic pool via T-SQL', async () => {
      const { provisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      await provisionTenant('tenant-1', 'm365-tid', 'token-value', 'user-1');

      // Should connect to master and execute CREATE DATABASE
      expect(mockConnect).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE DATABASE'),
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ELASTIC_POOL'),
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('test-elastic-pool'),
      );
    });

    it('runs migrateTenantDb on the new database', async () => {
      const { provisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      await provisionTenant('tenant-1', 'm365-tid', 'token-value', 'user-1');

      expect(mockMigrateTenantDb).toHaveBeenCalledWith(
        expect.stringMatching(/^t_[a-f0-9]{16}$/),
      );
    });

    it('stores token in Key Vault via storeTenantToken', async () => {
      const { provisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      await provisionTenant('tenant-1', 'm365-tid', 'token-value', 'user-1');

      expect(mockStoreTenantToken).toHaveBeenCalledWith('tenant-1', 'token-value');
    });

    it('updates tenant record to active with database name', async () => {
      const { provisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      await provisionTenant('tenant-1', 'm365-tid', 'token-value', 'user-1');

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          m365TenantId: 'm365-tid',
        }),
      );
    });

    it('grants the onboarding user access', async () => {
      const { provisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      await provisionTenant('tenant-1', 'm365-tid', 'token-value', 'user-1');

      expect(mockInsert).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          tenantId: 'tenant-1',
          grantedBy: 'user-1',
        }),
      );
    });

    it('returns the database name and tenant ID', async () => {
      const { provisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      const result = await provisionTenant('tenant-1', 'm365-tid', 'tok', 'user-1');

      expect(result.tenantId).toBe('tenant-1');
      expect(result.databaseName).toMatch(/^t_[a-f0-9]{16}$/);
    });

    it('generates opaque database name (UUID-based)', async () => {
      const { provisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      const result = await provisionTenant('tid', 'm365', 'tok', 'uid');

      // DB name format: t_ followed by 16 hex chars
      expect(result.databaseName).toMatch(/^t_[a-f0-9]{16}$/);
    });

    it('closes master pool in finally block even on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('CREATE DATABASE failed'));

      const { provisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      await expect(
        provisionTenant('tid', 'm365', 'tok', 'uid'),
      ).rejects.toThrow('CREATE DATABASE failed');

      // Master pool should still be closed
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('deprovisionTenant', () => {
    it('sets isDeleted=true and status=suspended', async () => {
      const { deprovisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      await deprovisionTenant('tenant-to-delete');

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: true,
          status: 'suspended',
        }),
      );
    });

    it('sets deletedAt to current date', async () => {
      const { deprovisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      await deprovisionTenant('tenant-to-delete');

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: expect.any(Date),
        }),
      );
    });

    it('does NOT drop database (30-day retention)', async () => {
      const { deprovisionTenant } = await import(
        '../services/tenant-provisioning.js'
      );

      await deprovisionTenant('tenant-to-delete');

      // Should NOT call any DROP DATABASE query
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('DROP DATABASE'),
      );
    });
  });
});
