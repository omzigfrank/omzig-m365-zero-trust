import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jsonwebtoken before any imports
const mockSign = vi.fn().mockReturnValue('mock-jwt-token');
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: (...args: unknown[]) => mockSign(...args),
  },
}));

// Mock global fetch
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 202,
  text: () => Promise.resolve(''),
});

describe('SignalR service', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-stub fetch before each test
    vi.stubGlobal('fetch', mockFetch);
    mockSign.mockReturnValue('mock-jwt-token');
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      text: () => Promise.resolve(''),
    });
    process.env = {
      ...ORIGINAL_ENV,
      SIGNALR_ENDPOINT: 'https://test-signalr.service.signalr.net',
      SIGNALR_ACCESS_KEY: 'dGVzdC1hY2Nlc3Mta2V5LWJhc2U2NA==',
    };
  });

  describe('pushAuditProgress', () => {
    it('generates JWT with audience matching SignalR endpoint URL', async () => {
      const { pushAuditProgress } = await import('../services/signalr.js');

      await pushAuditProgress('user-123', {
        auditId: 'audit-1',
        completedChecks: 5,
        totalChecks: 29,
        currentControl: 'MS.AAD.1.1v1',
        status: 'running',
      });

      expect(mockSign).toHaveBeenCalledWith(
        expect.objectContaining({ aud: expect.stringContaining('test-signalr.service.signalr.net') }),
        expect.any(String),
        expect.objectContaining({ algorithm: 'HS256' }),
      );
    });

    it('sends POST to correct SignalR REST API URL with target auditProgress', async () => {
      const { pushAuditProgress } = await import('../services/signalr.js');

      await pushAuditProgress('user-456', {
        auditId: 'audit-2',
        completedChecks: 10,
        totalChecks: 29,
        currentControl: 'MS.AAD.3.1v1',
        status: 'running',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/hubs/audit/users/user-456'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"target":"auditProgress"'),
        }),
      );

      // Verify body includes the message in arguments
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.target).toBe('auditProgress');
      expect(body.arguments).toHaveLength(1);
      expect(body.arguments[0].auditId).toBe('audit-2');
    });

    it('includes Authorization header with Bearer token', async () => {
      const { pushAuditProgress } = await import('../services/signalr.js');

      await pushAuditProgress('user-123', {
        auditId: 'audit-1',
        completedChecks: 1,
        totalChecks: 29,
        currentControl: 'MS.AAD.1.1v1',
        status: 'running',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-jwt-token',
          }),
        }),
      );
    });

    it('sets JWT expiry to 5 minutes', async () => {
      const { pushAuditProgress } = await import('../services/signalr.js');

      await pushAuditProgress('user-123', {
        auditId: 'audit-1',
        completedChecks: 1,
        totalChecks: 29,
        currentControl: 'MS.AAD.1.1v1',
        status: 'running',
      });

      expect(mockSign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ expiresIn: '5m' }),
      );
    });
  });

  describe('negotiateSignalR', () => {
    it('returns { url, accessToken } with correct hub URL and user-scoped JWT', async () => {
      const { negotiateSignalR } = await import('../services/signalr.js');

      const result = negotiateSignalR('user-789');

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('accessToken');
      expect(result.url).toContain('test-signalr.service.signalr.net');
      expect(result.url).toContain('hub=audit');
      expect(result.accessToken).toBe('mock-jwt-token');
    });

    it('signs JWT with userId as nameid claim for negotiate', async () => {
      const { negotiateSignalR } = await import('../services/signalr.js');

      negotiateSignalR('user-789');

      expect(mockSign).toHaveBeenCalledWith(
        expect.objectContaining({ nameid: 'user-789' }),
        expect.any(String),
        expect.objectContaining({ algorithm: 'HS256', expiresIn: '1h' }),
      );
    });
  });

  describe('missing env vars', () => {
    it('throws descriptive error when SIGNALR_ENDPOINT is missing', async () => {
      delete process.env.SIGNALR_ENDPOINT;

      const { pushAuditProgress } = await import('../services/signalr.js');

      await expect(
        pushAuditProgress('user-123', {
          auditId: 'audit-1',
          completedChecks: 0,
          totalChecks: 29,
          currentControl: '',
          status: 'running',
        }),
      ).rejects.toThrow(/SIGNALR_ENDPOINT/);
    });

    it('throws descriptive error when SIGNALR_ACCESS_KEY is missing', async () => {
      delete process.env.SIGNALR_ACCESS_KEY;

      const { pushAuditProgress } = await import('../services/signalr.js');

      await expect(
        pushAuditProgress('user-123', {
          auditId: 'audit-1',
          completedChecks: 0,
          totalChecks: 29,
          currentControl: '',
          status: 'running',
        }),
      ).rejects.toThrow(/SIGNALR_ACCESS_KEY/);
    });

    it('negotiateSignalR throws when SIGNALR_ENDPOINT is missing', async () => {
      delete process.env.SIGNALR_ENDPOINT;

      const { negotiateSignalR } = await import('../services/signalr.js');

      expect(() => negotiateSignalR('user-123')).toThrow(/SIGNALR_ENDPOINT/);
    });
  });
});

describe('auditFindings schema', () => {
  it('auditFindings table exports from @omzig/db', async () => {
    const { auditFindings } = await import('@omzig/db');
    expect(auditFindings).toBeDefined();
  });

  it('auditFindings has required columns', async () => {
    const { auditFindings } = await import('@omzig/db');

    const expectedColumns = [
      'id',
      'auditRunId',
      'controlId',
      'product',
      'description',
      'requirementLevel',
      'severity',
      'rating',
      'message',
      'action',
      'settingName',
      'currentValue',
      'expectedValue',
      'requiredPermission',
      'nist80053',
      'createdAt',
    ];

    for (const col of expectedColumns) {
      expect(auditFindings).toHaveProperty(col);
    }
  });
});
