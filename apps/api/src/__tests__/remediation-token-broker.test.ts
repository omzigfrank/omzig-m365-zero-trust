import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for remediation-token-broker.ts
 *
 * Mocks:
 *   - @azure/msal-node: ConfidentialClientApplication
 *   - @omzig/db: getControlPlaneDb, tenantRemediationConsents
 *   - ./keyvault.js: encryptValue, decryptValue, setSecret, getSecret
 */

// ---- Mock state ----

let mockAcquireTokenOnBehalfOfImpl: (args: any) => Promise<any> = async () => ({});
let mockAcquireTokenByRefreshTokenImpl: (args: any) => Promise<any> = async () => ({});
let mockCacheSerializeReturn = '{}';
let mockSetSecretCalls: Array<[string, string]> = [];
let mockGetSecretReturns: Record<string, string> = {};
let mockEncryptReturn = 'encrypted-blob';
let mockDecryptReturns: Record<string, string> = {};

let consentRows: any[] = [];
let consentUpdates: any[] = [];
let consentInserts: any[] = [];

// ---- Mocks ----

vi.mock('@azure/msal-node', () => {
  return {
    ConfidentialClientApplication: class {
      constructor(_config: unknown) {}
      async acquireTokenOnBehalfOf(args: any) {
        return mockAcquireTokenOnBehalfOfImpl(args);
      }
      async acquireTokenByRefreshToken(args: any) {
        return mockAcquireTokenByRefreshTokenImpl(args);
      }
      getTokenCache() {
        return {
          serialize: () => mockCacheSerializeReturn,
        };
      }
    },
  };
});

const CONSENTS_TABLE = Symbol('tenant_remediation_consents');

function createMockDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => Promise.resolve(consentRows)),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: any) => {
        consentUpdates.push(vals);
        return {
          where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
        };
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(async (vals: any) => {
        consentInserts.push(vals);
      }),
    })),
  };
}

let mockDb: ReturnType<typeof createMockDb>;

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(async () => mockDb),
  tenantRemediationConsents: {
    tenantId: 'tenantId',
    scopeBundle: 'scopeBundle',
    revokedAt: 'revokedAt',
    id: 'id',
    refreshTokenSecretName: 'refreshTokenSecretName',
    consentedByUserId: 'consentedByUserId',
    lastUsedAt: 'lastUsedAt',
    consentedAt: 'consentedAt',
    createdAt: 'createdAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  isNull: vi.fn((...args: any[]) => args),
}));

vi.mock('../services/keyvault.js', () => ({
  encryptValue: vi.fn().mockImplementation(async (_v: string) => mockEncryptReturn),
  decryptValue: vi.fn().mockImplementation(async (enc: string) => mockDecryptReturns[enc] ?? 'rt-default'),
  setSecret: vi.fn().mockImplementation(async (name: string, value: string) => {
    mockSetSecretCalls.push([name, value]);
  }),
  getSecret: vi.fn().mockImplementation(async (name: string) => {
    const val = mockGetSecretReturns[name];
    if (val === undefined) throw new Error(`No mock for secret ${name}`);
    return val;
  }),
}));

// ---- Setup ----

beforeEach(() => {
  vi.clearAllMocks();
  mockDb = createMockDb();
  consentRows = [];
  consentUpdates = [];
  consentInserts = [];
  mockSetSecretCalls = [];
  mockGetSecretReturns = {};
  mockDecryptReturns = {};
  mockEncryptReturn = 'encrypted-blob';
  mockCacheSerializeReturn = JSON.stringify({
    RefreshToken: {
      'key-1': { secret: 'rt-obo-secret' },
    },
  });
  mockAcquireTokenOnBehalfOfImpl = async () => ({
    accessToken: 'access-token-obo',
    expiresOn: new Date(Date.now() + 3600 * 1000),
  });
  mockAcquireTokenByRefreshTokenImpl = async () => ({
    accessToken: 'access-token-refreshed',
  });
  process.env.OAUTH_CLIENT_ID = 'client-id-test';
  process.env.OAUTH_CLIENT_SECRET = 'client-secret-test';
});

afterEach(async () => {
  const { _resetRemediationBrokerForTests } = await import(
    '../services/remediation-token-broker.js'
  );
  _resetRemediationBrokerForTests();
});

// ================================================================
// SCOPE_BUNDLES
// ================================================================

describe('SCOPE_BUNDLES', () => {
  it('exports exactly 5 scope bundles keyed by control family', async () => {
    const { SCOPE_BUNDLES } = await import('../services/remediation-token-broker.js');
    const keys = Object.keys(SCOPE_BUNDLES);
    expect(keys).toHaveLength(5);
    expect(keys).toEqual(
      expect.arrayContaining([
        'conditionalAccess',
        'authMethods',
        'authPolicy',
        'roles',
        'securityDefaults',
      ]),
    );
  });

  it('conditionalAccess bundle includes Policy.ReadWrite.ConditionalAccess', async () => {
    const { SCOPE_BUNDLES } = await import('../services/remediation-token-broker.js');
    expect(SCOPE_BUNDLES.conditionalAccess).toContain('Policy.ReadWrite.ConditionalAccess');
  });

  it('roles bundle is RoleManagement.ReadWrite.Directory', async () => {
    const { SCOPE_BUNDLES } = await import('../services/remediation-token-broker.js');
    expect(SCOPE_BUNDLES.roles).toEqual(['RoleManagement.ReadWrite.Directory']);
  });
});

// ================================================================
// exchangeForRemediationRefreshToken
// ================================================================

describe('exchangeForRemediationRefreshToken', () => {
  it('calls acquireTokenOnBehalfOf with the scope bundle + offline_access', async () => {
    const { exchangeForRemediationRefreshToken } = await import(
      '../services/remediation-token-broker.js'
    );
    const oboCalls: any[] = [];
    mockAcquireTokenOnBehalfOfImpl = async (args: any) => {
      oboCalls.push(args);
      return {
        accessToken: 'at',
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
    };

    await exchangeForRemediationRefreshToken('spa-assertion', 'conditionalAccess');

    expect(oboCalls).toHaveLength(1);
    expect(oboCalls[0].oboAssertion).toBe('spa-assertion');
    expect(oboCalls[0].scopes).toContain('Policy.ReadWrite.ConditionalAccess');
    expect(oboCalls[0].scopes).toContain('offline_access');
  });

  it('extracts the refresh token from the serialized MSAL cache', async () => {
    const { exchangeForRemediationRefreshToken } = await import(
      '../services/remediation-token-broker.js'
    );
    mockCacheSerializeReturn = JSON.stringify({
      RefreshToken: { rt1: { secret: 'the-actual-refresh-token' } },
    });

    const result = await exchangeForRemediationRefreshToken('assertion', 'authMethods');
    expect(result.refreshToken).toBe('the-actual-refresh-token');
    expect(result.accessToken).toBe('access-token-obo');
  });

  it('throws when the OBO result has no access token', async () => {
    const { exchangeForRemediationRefreshToken } = await import(
      '../services/remediation-token-broker.js'
    );
    mockAcquireTokenOnBehalfOfImpl = async () => null;
    await expect(
      exchangeForRemediationRefreshToken('assertion', 'conditionalAccess'),
    ).rejects.toThrow(/no access token/i);
  });

  it('throws when the MSAL cache contains no refresh token', async () => {
    const { exchangeForRemediationRefreshToken } = await import(
      '../services/remediation-token-broker.js'
    );
    mockCacheSerializeReturn = '{}';
    await expect(
      exchangeForRemediationRefreshToken('assertion', 'conditionalAccess'),
    ).rejects.toThrow(/refresh token/i);
  });
});

// ================================================================
// storeRemediationConsent
// ================================================================

describe('storeRemediationConsent', () => {
  it('envelope-encrypts the refresh token and stores it in Key Vault with the derived secret name', async () => {
    const { storeRemediationConsent } = await import('../services/remediation-token-broker.js');
    mockEncryptReturn = 'encrypted-blob-xyz';

    await storeRemediationConsent('tenant-42', 'conditionalAccess', 'rt-secret', 'user-1');

    expect(mockSetSecretCalls).toHaveLength(1);
    const [name, value] = mockSetSecretCalls[0];
    expect(name).toBe('remediation-tenant-42-conditionalAccess');
    expect(value).toBe('encrypted-blob-xyz');
  });

  it('revokes prior active consent for the same (tenant, bundle) before inserting the new row', async () => {
    const { storeRemediationConsent } = await import('../services/remediation-token-broker.js');

    await storeRemediationConsent('tenant-42', 'authMethods', 'rt', 'user-1');

    // Update (revoke prior) should have been called
    expect(consentUpdates.length).toBeGreaterThanOrEqual(1);
    expect(consentUpdates[0].revokedAt).toBeInstanceOf(Date);
    // Insert should have been called with the new row
    expect(consentInserts).toHaveLength(1);
    expect(consentInserts[0].tenantId).toBe('tenant-42');
    expect(consentInserts[0].scopeBundle).toBe('authMethods');
    expect(consentInserts[0].refreshTokenSecretName).toBe(
      'remediation-tenant-42-authMethods',
    );
    expect(consentInserts[0].consentedByUserId).toBe('user-1');
  });
});

// ================================================================
// getRemediationAccessToken
// ================================================================

describe('getRemediationAccessToken', () => {
  it('returns null when no active consent row exists', async () => {
    const { getRemediationAccessToken } = await import(
      '../services/remediation-token-broker.js'
    );
    consentRows = [];
    const result = await getRemediationAccessToken('tenant-42', 'conditionalAccess');
    expect(result).toBeNull();
  });

  it('fetches refresh token from Key Vault and exchanges for access token', async () => {
    const { getRemediationAccessToken } = await import(
      '../services/remediation-token-broker.js'
    );
    consentRows = [
      {
        id: 'consent-1',
        refreshTokenSecretName: 'remediation-tenant-42-conditionalAccess',
      },
    ];
    mockGetSecretReturns['remediation-tenant-42-conditionalAccess'] = 'encrypted-rt';
    mockDecryptReturns['encrypted-rt'] = 'plaintext-refresh-token';

    const refreshCalls: any[] = [];
    mockAcquireTokenByRefreshTokenImpl = async (args: any) => {
      refreshCalls.push(args);
      return { accessToken: 'access-token-from-refresh' };
    };

    const result = await getRemediationAccessToken('tenant-42', 'conditionalAccess');
    expect(result).toBe('access-token-from-refresh');
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0].refreshToken).toBe('plaintext-refresh-token');
    expect(refreshCalls[0].scopes).toContain('Policy.ReadWrite.ConditionalAccess');

    // lastUsedAt should have been updated
    expect(
      consentUpdates.some((u) => u.lastUsedAt instanceof Date),
    ).toBe(true);
  });

  it('marks the consent row revoked and returns null on InteractionRequiredAuthError', async () => {
    const { getRemediationAccessToken } = await import(
      '../services/remediation-token-broker.js'
    );
    consentRows = [
      {
        id: 'consent-1',
        refreshTokenSecretName: 'secret-1',
      },
    ];
    mockGetSecretReturns['secret-1'] = 'encrypted';
    mockDecryptReturns['encrypted'] = 'plain-rt';

    mockAcquireTokenByRefreshTokenImpl = async () => {
      const err = new Error('AADSTS65001: consent required');
      err.name = 'InteractionRequiredAuthError';
      throw err;
    };

    const result = await getRemediationAccessToken('tenant-42', 'conditionalAccess');
    expect(result).toBeNull();
    // A revokedAt update should have been issued.
    expect(
      consentUpdates.some((u) => u.revokedAt instanceof Date),
    ).toBe(true);
  });

  it('returns null when Key Vault fetch fails', async () => {
    const { getRemediationAccessToken } = await import(
      '../services/remediation-token-broker.js'
    );
    consentRows = [
      {
        id: 'consent-1',
        refreshTokenSecretName: 'missing-secret',
      },
    ];
    // no mockGetSecretReturns entry -> the mock throws
    const result = await getRemediationAccessToken('tenant-42', 'conditionalAccess');
    expect(result).toBeNull();
  });
});
