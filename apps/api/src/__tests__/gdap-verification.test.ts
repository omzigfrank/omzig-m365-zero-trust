import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GDAP Verification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('verifyGdapRelationship', () => {
    it('returns customer tenant ID and roles for active relationship', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rel-123',
          displayName: 'Contoso Partnership',
          status: 'active',
          customer: {
            tenantId: 'customer-tenant-abc',
            displayName: 'Contoso Ltd',
          },
          accessDetails: {
            unifiedRoles: [
              { roleDefinitionId: 'role-def-1' },
              { roleDefinitionId: 'role-def-2' },
            ],
          },
          duration: 'P730D',
          endDateTime: '2028-03-01T00:00:00Z',
        }),
      });

      const { verifyGdapRelationship } = await import(
        '../services/gdap-verification.js'
      );

      const result = await verifyGdapRelationship('rel-123', 'valid-token');

      expect(result.customerTenantId).toBe('customer-tenant-abc');
      expect(result.customerDisplayName).toBe('Contoso Ltd');
      expect(result.roles).toHaveLength(2);
      expect(result.roles[0].roleDefinitionId).toBe('role-def-1');
      expect(result.expiresAt).toBe('2028-03-01T00:00:00Z');
    });

    it('calls correct Graph API endpoint with Bearer token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rel-456',
          displayName: 'Test',
          status: 'active',
          customer: { tenantId: 'tid', displayName: 'Test Co' },
          accessDetails: { unifiedRoles: [] },
          duration: 'P365D',
          endDateTime: '2027-01-01T00:00:00Z',
        }),
      });

      const { verifyGdapRelationship } = await import(
        '../services/gdap-verification.js'
      );

      await verifyGdapRelationship('rel-456', 'my-access-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships/rel-456',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-access-token',
          }),
        }),
      );
    });

    it('throws descriptive error on 404 (relationship not found)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const { verifyGdapRelationship } = await import(
        '../services/gdap-verification.js'
      );

      await expect(
        verifyGdapRelationship('nonexistent-rel', 'token'),
      ).rejects.toThrow('GDAP relationship not found');
    });

    it('throws when relationship status is not active (approvalPending)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rel-pending',
          displayName: 'Pending Partnership',
          status: 'approvalPending',
          customer: { tenantId: 'tid', displayName: 'Pending Co' },
          accessDetails: { unifiedRoles: [] },
          duration: 'P365D',
          endDateTime: '2027-01-01T00:00:00Z',
        }),
      });

      const { verifyGdapRelationship } = await import(
        '../services/gdap-verification.js'
      );

      await expect(
        verifyGdapRelationship('rel-pending', 'token'),
      ).rejects.toThrow('not active');
    });

    it('includes guidance for approvalPending status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rel-pending',
          displayName: 'Pending',
          status: 'approvalPending',
          customer: { tenantId: 'tid', displayName: 'Co' },
          accessDetails: { unifiedRoles: [] },
          duration: 'P365D',
          endDateTime: '2027-01-01T00:00:00Z',
        }),
      });

      const { verifyGdapRelationship } = await import(
        '../services/gdap-verification.js'
      );

      await expect(
        verifyGdapRelationship('rel-pending', 'token'),
      ).rejects.toThrow('approve the GDAP request');
    });

    it('includes guidance for expired status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rel-expired',
          displayName: 'Expired',
          status: 'expired',
          customer: { tenantId: 'tid', displayName: 'Co' },
          accessDetails: { unifiedRoles: [] },
          duration: 'P365D',
          endDateTime: '2024-01-01T00:00:00Z',
        }),
      });

      const { verifyGdapRelationship } = await import(
        '../services/gdap-verification.js'
      );

      await expect(
        verifyGdapRelationship('rel-expired', 'token'),
      ).rejects.toThrow('expired');
    });

    it('throws on other HTTP errors with status code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const { verifyGdapRelationship } = await import(
        '../services/gdap-verification.js'
      );

      await expect(
        verifyGdapRelationship('rel-forbidden', 'token'),
      ).rejects.toThrow('Graph API error (403)');
    });
  });
});
