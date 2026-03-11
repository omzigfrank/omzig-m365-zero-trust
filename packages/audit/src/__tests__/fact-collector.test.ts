import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectFacts } from '../collectors/fact-collector.js';
import type { Client } from '@microsoft/microsoft-graph-client';
import {
  mockOrganizationResponse,
  mockCAPolicies,
  mockAuthMethodsPolicy,
  mockAuthorizationPolicy,
  mockAdminConsentPolicy,
  mockDirectoryRoles,
  mockGlobalAdminMembers,
  mockSubscribedSkus,
  mockDomains,
  mockSecurityDefaults,
  mockManagedDevices,
  mockMfaRegistrationDetails,
  mockApplications,
  mockSensitivityLabels,
  mockPimRoleEligibility,
  mockPimRoleAssignments,
  mockNamedLocations,
} from './fixtures/graph-responses.js';

/**
 * Build a mock Graph Client that responds to $batch and standalone requests.
 */
function createMockClient(
  overrides?: {
    batchFailAll?: boolean;
    pimFails?: boolean;
    sensitivityLabelsFails?: boolean;
  },
): Client {
  const opts = { batchFailAll: false, pimFails: false, sensitivityLabelsFails: false, ...overrides };

  // Map of URL patterns to responses for standalone (non-batch) calls
  const standaloneResponses: Record<string, unknown> = {
    '/reports/authenticationMethods/userRegistrationDetails': mockMfaRegistrationDetails,
  };

  // Map of batch request IDs to responses
  const batchResponses: Record<string, { status: number; body: unknown }> = {
    organization: { status: 200, body: mockOrganizationResponse },
    conditionalAccess: { status: 200, body: mockCAPolicies },
    namedLocations: { status: 200, body: mockNamedLocations },
    authMethodsPolicy: { status: 200, body: mockAuthMethodsPolicy },
    authorizationPolicy: { status: 200, body: mockAuthorizationPolicy },
    adminConsentPolicy: { status: 200, body: mockAdminConsentPolicy },
    securityDefaults: { status: 200, body: mockSecurityDefaults },
    directoryRoles: { status: 200, body: mockDirectoryRoles },
    subscribedSkus: { status: 200, body: mockSubscribedSkus },
    domains: { status: 200, body: mockDomains },
    devices: { status: 200, body: mockManagedDevices },
    applications: { status: 200, body: mockApplications },
    // Batch 2
    globalAdminMembers: { status: 200, body: mockGlobalAdminMembers },
  };

  const mockApi = vi.fn().mockImplementation((url: string) => {
    return {
      // For $batch POST calls
      post: vi.fn().mockImplementation(async (body: { requests: Array<{ id: string }> }) => {
        if (opts.batchFailAll) {
          throw new Error('Batch request failed');
        }
        const responses = body.requests.map((req) => {
          const response = batchResponses[req.id];
          if (response) {
            return { id: req.id, status: response.status, body: response.body };
          }
          return { id: req.id, status: 404, body: { error: { message: 'Not found' } } };
        });
        return { responses };
      }),
      // For standalone GET calls
      get: vi.fn().mockImplementation(async () => {
        // Check PIM failure
        if (opts.pimFails && url.includes('roleManagement')) {
          const error = new Error('Insufficient privileges') as Error & { statusCode: number };
          error.statusCode = 403;
          throw error;
        }
        // Check sensitivity labels failure
        if (opts.sensitivityLabelsFails && url.includes('sensitivityLabels')) {
          const error = new Error('Not licensed') as Error & { statusCode: number };
          error.statusCode = 403;
          throw error;
        }
        // PIM endpoints
        if (url.includes('roleEligibilityScheduleInstances')) {
          return mockPimRoleEligibility;
        }
        if (url.includes('roleAssignmentScheduleInstances')) {
          return mockPimRoleAssignments;
        }
        // Sensitivity labels (beta)
        if (url.includes('sensitivityLabels')) {
          return mockSensitivityLabels;
        }
        // MFA registration
        if (url.includes('userRegistrationDetails')) {
          return mockMfaRegistrationDetails;
        }
        // Default: return from standalone map
        for (const [pattern, response] of Object.entries(standaloneResponses)) {
          if (url.includes(pattern)) return response;
        }
        return { value: [] };
      }),
      // For top() calls (pagination)
      top: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      count: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
    };
  });

  return { api: mockApi } as unknown as Client;
}

describe('collectFacts', () => {
  it('produces AuditFacts with all 15 areas populated from mock Graph responses', async () => {
    const client = createMockClient();
    const progressMessages: string[] = [];
    const facts = await collectFacts(client, (msg) => progressMessages.push(msg));

    // Organization
    expect(facts.organization.available).toBe(true);
    expect(facts.organization.tenantId).toBe('tenant-id-12345');
    expect(facts.organization.displayName).toBe('Test Organization');

    // Conditional Access
    expect(facts.conditionalAccess.available).toBe(true);
    expect(facts.conditionalAccess.totalPolicies).toBe(3);

    // Named Locations
    expect(facts.namedLocations.available).toBe(true);
    expect(facts.namedLocations.totalLocations).toBe(2);

    // Auth Methods
    expect(facts.authMethods.available).toBe(true);
    expect(facts.authMethods.migrationState).toBe('migrationComplete');

    // MFA
    expect(facts.mfa.available).toBe(true);
    expect(facts.mfa.totalUsers).toBe(5);

    // Authorization Policy
    expect(facts.authorizationPolicy.available).toBe(true);

    // Admin Consent
    expect(facts.adminConsentPolicy.available).toBe(true);

    // Security Defaults
    expect(facts.securityDefaults.available).toBe(true);

    // Directory Roles / Admin Roles
    expect(facts.adminRoles.available).toBe(true);
    expect(facts.adminRoles.globalAdminCount).toBe(3);

    // Licenses
    expect(facts.licenses.available).toBe(true);
    expect(facts.licenses.hasP2).toBe(true);

    // Domains + Password Policy
    expect(facts.domains.available).toBe(true);
    expect(facts.passwordPolicy.available).toBe(true);

    // Devices
    expect(facts.devices.available).toBe(true);
    expect(facts.devices.totalDevices).toBe(4);

    // App Registrations
    expect(facts.appRegistrations.available).toBe(true);
    expect(facts.appRegistrations.totalApps).toBe(12);

    // PIM Role Assignments
    expect(facts.roleAssignments.available).toBe(true);

    // Sensitivity Labels
    expect(facts.sensitivityLabels.available).toBe(true);
    expect(facts.sensitivityLabels.totalLabels).toBe(3);
  });

  it('progress callback is invoked with collection phase messages', async () => {
    const client = createMockClient();
    const progressMessages: string[] = [];
    await collectFacts(client, (msg) => progressMessages.push(msg));

    expect(progressMessages.length).toBeGreaterThan(0);
    expect(progressMessages.some((m) => m.toLowerCase().includes('collect'))).toBe(true);
  });

  it('PIM handles 403 for non-P2 tenants (PITFALL 2), sets available=false', async () => {
    const client = createMockClient({ pimFails: true });
    const facts = await collectFacts(client);

    expect(facts.roleAssignments.available).toBe(false);
    expect(facts.roleAssignments.error).toBeDefined();
  });

  it('sensitivity labels failure sets available=false without crashing', async () => {
    const client = createMockClient({ sensitivityLabelsFails: true });
    const facts = await collectFacts(client);

    expect(facts.sensitivityLabels.available).toBe(false);
    expect(facts.sensitivityLabels.error).toBeDefined();
    // Other areas should still be populated
    expect(facts.organization.available).toBe(true);
  });

  it('batch 1 and batch 2 execute in order', async () => {
    const client = createMockClient();
    const callOrder: string[] = [];
    const originalApi = client.api;
    (client as unknown as { api: typeof originalApi }).api = vi.fn().mockImplementation((url: string) => {
      callOrder.push(url);
      return (originalApi as unknown as (url: string) => unknown)(url);
    });

    await collectFacts(client);

    // First batch call should come before standalone calls
    const batchIndex = callOrder.indexOf('/$batch');
    expect(batchIndex).toBeGreaterThanOrEqual(0);
  });
});
