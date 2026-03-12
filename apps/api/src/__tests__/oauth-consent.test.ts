import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @azure/msal-node
const mockAcquireTokenByCode = vi.fn();
vi.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: vi.fn().mockImplementation(() => ({
    acquireTokenByCode: mockAcquireTokenByCode,
  })),
}));

describe('OAuth Consent Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OAUTH_CLIENT_ID = 'test-client-id';
    process.env.OAUTH_CLIENT_SECRET = 'test-client-secret-32-chars-long!!';
    process.env.OAUTH_REDIRECT_URI = 'https://api.example.com/api/oauth/callback';
  });

  afterEach(() => {
    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;
    delete process.env.OAUTH_REDIRECT_URI;
    vi.resetModules();
  });

  describe('GRAPH_SCOPES', () => {
    it('contains graph default scope and offline_access', async () => {
      const { GRAPH_SCOPES } = await import('../services/oauth-consent.js');
      expect(GRAPH_SCOPES).toContain('https://graph.microsoft.com/.default');
      expect(GRAPH_SCOPES).toContain('offline_access');
    });
  });

  describe('buildConsentUrl', () => {
    it('returns URL containing client_id', async () => {
      const { buildConsentUrl } = await import('../services/oauth-consent.js');
      const url = buildConsentUrl('session-123');
      expect(url).toContain('client_id=test-client-id');
    });

    it('returns URL with response_type=code', async () => {
      const { buildConsentUrl } = await import('../services/oauth-consent.js');
      const url = buildConsentUrl('session-123');
      expect(url).toContain('response_type=code');
    });

    it('returns URL with redirect_uri', async () => {
      const { buildConsentUrl } = await import('../services/oauth-consent.js');
      const url = buildConsentUrl('session-123');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain(encodeURIComponent('https://api.example.com/api/oauth/callback'));
    });

    it('returns URL with graph scope and offline_access', async () => {
      const { buildConsentUrl } = await import('../services/oauth-consent.js');
      const url = buildConsentUrl('session-123');
      expect(url).toContain('scope=');
      expect(url).toContain('graph.microsoft.com');
      expect(url).toContain('offline_access');
    });

    it('returns URL with prompt=admin_consent', async () => {
      const { buildConsentUrl } = await import('../services/oauth-consent.js');
      const url = buildConsentUrl('session-123');
      expect(url).toContain('prompt=admin_consent');
    });

    it('returns URL with HMAC-signed state parameter', async () => {
      const { buildConsentUrl } = await import('../services/oauth-consent.js');
      const url = buildConsentUrl('session-123');
      expect(url).toContain('state=');
      // State should be base64 encoded
      const stateMatch = url.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
    });

    it('uses authorize endpoint (not adminconsent endpoint)', async () => {
      const { buildConsentUrl } = await import('../services/oauth-consent.js');
      const url = buildConsentUrl('session-123');
      expect(url).toContain('login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
    });
  });

  describe('verifyStateHmac', () => {
    it('returns decoded wizardSessionId for valid state', async () => {
      const { buildConsentUrl, verifyStateHmac } = await import(
        '../services/oauth-consent.js'
      );
      // Build a URL to generate a valid state
      const url = buildConsentUrl('session-456');
      const stateMatch = url.match(/state=([^&]+)/);
      const state = decodeURIComponent(stateMatch![1]);

      const result = verifyStateHmac(state);
      expect(result.wizardSessionId).toBe('session-456');
    });

    it('throws on tampered state signature', async () => {
      const { buildConsentUrl, verifyStateHmac } = await import(
        '../services/oauth-consent.js'
      );
      const url = buildConsentUrl('session-789');
      const stateMatch = url.match(/state=([^&]+)/);
      const state = decodeURIComponent(stateMatch![1]);

      // Tamper with the state by flipping a character
      const tampered = state.slice(0, -2) + 'XX';
      expect(() => verifyStateHmac(tampered)).toThrow();
    });

    it('throws on malformed state', async () => {
      const { verifyStateHmac } = await import('../services/oauth-consent.js');
      expect(() => verifyStateHmac('not-valid-base64!!!')).toThrow();
    });

    it('throws on expired state (>1 hour)', async () => {
      const { verifyStateHmac } = await import('../services/oauth-consent.js');

      // Create a valid but expired state manually
      const clientSecret = process.env.OAUTH_CLIENT_SECRET!;
      const crypto = await import('node:crypto');

      const payload = JSON.stringify({
        wizardSessionId: 'expired-session',
        ts: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      });
      const payloadB64 = Buffer.from(payload).toString('base64');
      const hmac = crypto
        .createHmac('sha256', clientSecret)
        .update(payloadB64)
        .digest('base64');
      const state = Buffer.from(`${payloadB64}|${hmac}`).toString('base64');

      expect(() => verifyStateHmac(state)).toThrow('expired');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('calls acquireTokenByCode and returns accessToken, tenantId, expiresOn', async () => {
      const expiresOn = new Date('2026-03-12T02:00:00Z');
      mockAcquireTokenByCode.mockResolvedValueOnce({
        accessToken: 'mock-access-token',
        account: { tenantId: 'customer-tenant-id' },
        expiresOn,
      });

      const { exchangeCodeForTokens, _resetCca } = await import(
        '../services/oauth-consent.js'
      );
      _resetCca(); // Reset singleton for test

      const result = await exchangeCodeForTokens('auth-code-123');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.tenantId).toBe('customer-tenant-id');
      expect(result.expiresOn).toEqual(expiresOn);
      expect(mockAcquireTokenByCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'auth-code-123',
          redirectUri: 'https://api.example.com/api/oauth/callback',
        }),
      );
    });

    it('throws when no access token is returned', async () => {
      mockAcquireTokenByCode.mockResolvedValueOnce({
        accessToken: null,
        account: null,
      });

      const { exchangeCodeForTokens, _resetCca } = await import(
        '../services/oauth-consent.js'
      );
      _resetCca();

      await expect(exchangeCodeForTokens('bad-code')).rejects.toThrow(
        'Token exchange failed',
      );
    });

    it('throws when no tenant ID in account', async () => {
      mockAcquireTokenByCode.mockResolvedValueOnce({
        accessToken: 'valid-token',
        account: { tenantId: undefined },
      });

      const { exchangeCodeForTokens, _resetCca } = await import(
        '../services/oauth-consent.js'
      );
      _resetCca();

      await expect(exchangeCodeForTokens('code-no-tenant')).rejects.toThrow(
        'no tenant ID',
      );
    });
  });
});
