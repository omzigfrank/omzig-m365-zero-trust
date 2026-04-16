/**
 * Phase 8 Plan 01 -- area-recollector tests.
 * Verifies correct API calls per area and unsupported area errors.
 */
import { describe, it, expect, vi } from 'vitest';
import { collectSingleArea } from '../area-recollector.js';
import { AreaRecollectionNotSupported } from '../types.js';

function createMockClient() {
  const getMock = vi.fn().mockResolvedValue({ value: [] });
  const topMock = vi.fn().mockReturnValue({ get: getMock });
  const selectMock = vi.fn().mockReturnValue({ top: topMock, get: getMock });
  const headerMock = vi.fn().mockReturnValue({ top: topMock, get: getMock, select: selectMock });
  const apiMock = vi.fn().mockReturnValue({
    get: getMock,
    top: topMock,
    select: selectMock,
    header: headerMock,
  });
  return {
    client: { api: apiMock } as any,
    apiMock,
    getMock,
    topMock,
    selectMock,
  };
}

describe('collectSingleArea', () => {
  it('conditionalAccess calls /identity/conditionalAccess/policies', async () => {
    const { client, apiMock, getMock } = createMockClient();
    getMock.mockResolvedValue({ value: [] });
    await collectSingleArea(client, 'conditionalAccess');
    expect(apiMock).toHaveBeenCalled();
    const apiUrl = apiMock.mock.calls[0][0];
    expect(apiUrl).toContain('/identity/conditionalAccess/policies');
  });

  it('securityDefaults calls /policies/identitySecurityDefaultsEnforcementPolicy', async () => {
    const { client, apiMock, getMock } = createMockClient();
    getMock.mockResolvedValue({ isEnabled: true });
    await collectSingleArea(client, 'securityDefaults');
    expect(apiMock).toHaveBeenCalled();
    const apiUrl = apiMock.mock.calls[0][0];
    expect(apiUrl).toContain('/policies/identitySecurityDefaultsEnforcementPolicy');
  });

  it('adminRoles calls directoryRoles and makes a second call for GA members', async () => {
    const { client, apiMock, getMock } = createMockClient();
    // First call returns roles with Global Administrator
    getMock
      .mockResolvedValueOnce({
        value: [
          { id: 'ga-role-id', displayName: 'Global Administrator' },
          { id: 'other-id', displayName: 'User Administrator' },
        ],
      })
      // Second call returns GA members
      .mockResolvedValueOnce({
        value: [{ id: 'user1', displayName: 'Admin User' }],
      });
    await collectSingleArea(client, 'adminRoles');
    // Should have called api() at least twice (roles + GA members)
    expect(apiMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('throws AreaRecollectionNotSupported for "organization"', async () => {
    const { client } = createMockClient();
    await expect(collectSingleArea(client, 'organization')).rejects.toThrow(
      AreaRecollectionNotSupported,
    );
  });

  it('throws AreaRecollectionNotSupported for "licenses"', async () => {
    const { client } = createMockClient();
    await expect(collectSingleArea(client, 'licenses')).rejects.toThrow(
      AreaRecollectionNotSupported,
    );
  });

  it('throws AreaRecollectionNotSupported for "breakGlass"', async () => {
    const { client } = createMockClient();
    await expect(collectSingleArea(client, 'breakGlass')).rejects.toThrow(
      AreaRecollectionNotSupported,
    );
  });
});
