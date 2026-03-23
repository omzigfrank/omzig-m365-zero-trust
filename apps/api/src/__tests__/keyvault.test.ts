import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @azure/keyvault-secrets before importing the module under test
const mockGetSecret = vi.fn();
const mockSetSecret = vi.fn();
const mockGetKey = vi.fn();
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();

vi.mock('@azure/keyvault-secrets', () => ({
  SecretClient: vi.fn().mockImplementation(() => ({
    getSecret: mockGetSecret,
    setSecret: mockSetSecret,
  })),
}));

vi.mock('@azure/keyvault-keys', () => ({
  KeyClient: vi.fn().mockImplementation(() => ({
    getKey: mockGetKey,
  })),
  CryptographyClient: vi.fn().mockImplementation(() => ({
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
  })),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({})),
}));

describe('KeyVault Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env var
    process.env.KEY_VAULT_URL = 'https://test-vault.vault.azure.net';
    process.env.KEY_VAULT_KEY_NAME = 'omzig-encryption-key';
  });

  afterEach(() => {
    delete process.env.KEY_VAULT_URL;
    delete process.env.KEY_VAULT_KEY_NAME;
    vi.resetModules();
  });

  describe('getSecret', () => {
    it('returns the value of a stored secret', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: 'my-secret-value',
        name: 'test-secret',
      });

      const { getSecret } = await import('../services/keyvault.js');
      const result = await getSecret('test-secret');

      expect(result).toBe('my-secret-value');
      expect(mockGetSecret).toHaveBeenCalledWith('test-secret');
    });

    it('throws with KEYVAULT_ERROR code when Key Vault is unavailable', async () => {
      mockGetSecret.mockRejectedValueOnce(new Error('Network error'));

      const { getSecret } = await import('../services/keyvault.js');

      await expect(getSecret('test-secret')).rejects.toThrow('KEYVAULT_ERROR');
    });
  });

  describe('setSecret', () => {
    it('stores a value that can be retrieved', async () => {
      mockSetSecret.mockResolvedValueOnce({
        name: 'test-secret',
        value: 'stored-value',
      });

      const { setSecret } = await import('../services/keyvault.js');
      await setSecret('test-secret', 'stored-value');

      expect(mockSetSecret).toHaveBeenCalledWith('test-secret', 'stored-value');
    });

    it('throws with KEYVAULT_ERROR code when Key Vault is unavailable', async () => {
      mockSetSecret.mockRejectedValueOnce(new Error('Service unavailable'));

      const { setSecret } = await import('../services/keyvault.js');

      await expect(setSecret('test-secret', 'value')).rejects.toThrow('KEYVAULT_ERROR');
    });
  });

  describe('getTenantToken', () => {
    it('returns the decrypted token for a tenant', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: 'tenant-token-value',
        name: 'tenant-token-abc123',
      });

      const { getTenantToken } = await import('../services/keyvault.js');
      const result = await getTenantToken('abc123');

      expect(result).toBe('tenant-token-value');
      expect(mockGetSecret).toHaveBeenCalledWith('tenant-token-abc123');
    });
  });

  describe('storeTenantToken', () => {
    it('encrypts and stores a tenant token', async () => {
      mockSetSecret.mockResolvedValueOnce({
        name: 'tenant-token-abc123',
        value: 'token-value',
      });

      const { storeTenantToken } = await import('../services/keyvault.js');
      await storeTenantToken('abc123', 'token-value');

      expect(mockSetSecret).toHaveBeenCalledWith('tenant-token-abc123', 'token-value');
    });
  });

  describe('encryptValue / decryptValue', () => {
    it('encrypts a value and can decrypt it back', async () => {
      const plaintext = 'sensitive-data-123';
      const cipherBuffer = Buffer.from('encrypted-bytes');

      mockEncrypt.mockResolvedValueOnce({
        result: cipherBuffer,
      });
      mockDecrypt.mockResolvedValueOnce({
        result: Buffer.from(plaintext, 'utf-8'),
      });

      const { encryptValue, decryptValue } = await import('../services/keyvault.js');

      const encrypted = await encryptValue(plaintext);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = await decryptValue(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });
});

describe('Tenant DB Provisioning Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KEY_VAULT_URL = 'https://test-vault.vault.azure.net';
    process.env.KEY_VAULT_KEY_NAME = 'omzig-encryption-key';
    process.env.SQL_SERVER_HOST = 'localhost';
    process.env.CONTROL_PLANE_DB_NAME = 'omzig_control_plane';
  });

  afterEach(() => {
    delete process.env.KEY_VAULT_URL;
    delete process.env.KEY_VAULT_KEY_NAME;
    delete process.env.SQL_SERVER_HOST;
    delete process.env.CONTROL_PLANE_DB_NAME;
    vi.resetModules();
  });

  it('exports provisionTenantDatabase function', async () => {
    const mod = await import('../services/tenant-db.js');
    expect(typeof mod.provisionTenantDatabase).toBe('function');
  });

  it('exports deprovisionTenantDatabase function', async () => {
    const mod = await import('../services/tenant-db.js');
    expect(typeof mod.deprovisionTenantDatabase).toBe('function');
  });
});

describe('Tenant Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('exports withTenantDb middleware function', async () => {
    const mod = await import('../middleware/tenant.js');
    expect(typeof mod.withTenantDb).toBe('function');
  });
});
