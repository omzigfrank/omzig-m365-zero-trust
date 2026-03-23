import { describe, it, expect } from 'vitest';
import { parseOrganization } from '../collectors/areas/organization.js';
import { parseConditionalAccess } from '../collectors/areas/conditional-access.js';
import { parseAuthenticationMethods } from '../collectors/areas/authentication-methods.js';
import { parseAuthorizationPolicy } from '../collectors/areas/authorization-policy.js';
import { parseDirectoryRoles } from '../collectors/areas/directory-roles.js';
import { parseSecurityDefaults } from '../collectors/areas/security-defaults.js';
import {
  mockOrganizationResponse,
  mockCAPolicies,
  mockAuthMethodsPolicy,
  mockAuthorizationPolicy as mockAuthzPolicy,
  mockDirectoryRoles,
  mockGlobalAdminMembers,
  mockSecurityDefaults,
  mockMfaRegistrationDetails,
} from './fixtures/graph-responses.js';

// =========================================================================
// Organization
// =========================================================================
describe('organization area collector', () => {
  it('parses /organization collection response and extracts tenantId, displayName, primaryDomain', () => {
    const result = parseOrganization(mockOrganizationResponse);
    expect(result.available).toBe(true);
    expect(result.tenantId).toBe('tenant-id-12345');
    expect(result.displayName).toBe('Test Organization');
    expect(result.primaryDomain).toBe('testorg.com');
  });

  it('sets available=false with error on failure', () => {
    const result = parseOrganization({ error: true, status: 403 });
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles empty organization value array', () => {
    const result = parseOrganization({ value: [] });
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =========================================================================
// Conditional Access
// =========================================================================
describe('conditional-access area collector', () => {
  it('parses policies collection response into typed array', () => {
    const result = parseConditionalAccess(mockCAPolicies);
    expect(result.available).toBe(true);
    expect(result.totalPolicies).toBe(3);
    expect(result.enabledCount).toBe(2);
    expect(result.disabledCount).toBe(1);
    expect(result.policies).toHaveLength(3);
    expect(result.policies[0].displayName).toBe('Block Legacy Auth');
  });

  it('sets available=false with error on failure', () => {
    const result = parseConditionalAccess({ error: true, status: 403 });
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =========================================================================
// Authentication Methods
// =========================================================================
describe('authentication-methods area collector', () => {
  it('parses authenticationMethodsPolicy response', () => {
    const result = parseAuthenticationMethods(mockAuthMethodsPolicy, null);
    expect(result.authMethods.available).toBe(true);
    expect(result.authMethods.migrationState).toBe('migrationComplete');
    expect(result.authMethods.smsEnabled).toBe(false);
    expect(result.authMethods.voiceEnabled).toBe(false);
    expect(result.authMethods.microsoftAuthEnabled).toBe(true);
    expect(result.authMethods.fido2Enabled).toBe(true);
  });

  it('parses MFA registration details (standalone paginated -- PITFALL 7)', () => {
    const result = parseAuthenticationMethods(mockAuthMethodsPolicy, mockMfaRegistrationDetails);
    expect(result.mfa.available).toBe(true);
    expect(result.mfa.totalUsers).toBe(5);
    expect(result.mfa.registeredUsers).toBe(4);
    expect(result.mfa.percentage).toBe(80);
  });

  it('sets available=false with error on failure', () => {
    const result = parseAuthenticationMethods({ error: true, status: 403 }, null);
    expect(result.authMethods.available).toBe(false);
    expect(result.authMethods.error).toBeDefined();
  });
});

// =========================================================================
// Authorization Policy
// =========================================================================
describe('authorization-policy area collector', () => {
  it('correctly parses singleton response (not collection -- PITFALL 6)', () => {
    const result = parseAuthorizationPolicy(mockAuthzPolicy);
    expect(result.authorizationPolicy.available).toBe(true);
    expect(result.authorizationPolicy.defaultUserRoleAllowedToCreateApps).toBe(false);
    expect(result.authorizationPolicy.allowInvitesFrom).toBe('adminsAndGuestInviters');
    expect(result.authorizationPolicy.guestUserRoleId).toBe(
      '2af84b1e-32c8-42b7-82bc-daa8c0e1b7cb',
    );
  });

  it('parses admin consent policy', () => {
    const mockAdminConsent = { id: 'adminConsentRequestPolicy', isEnabled: true };
    const result = parseAuthorizationPolicy(mockAuthzPolicy, mockAdminConsent);
    expect(result.adminConsentPolicy.available).toBe(true);
    expect(result.adminConsentPolicy.enabled).toBe(true);
  });

  it('sets available=false with error on failure', () => {
    const result = parseAuthorizationPolicy({ error: true, status: 404 });
    expect(result.authorizationPolicy.available).toBe(false);
    expect(result.authorizationPolicy.error).toBeDefined();
  });
});

// =========================================================================
// Directory Roles
// =========================================================================
describe('directory-roles area collector', () => {
  it('parses roles collection and extracts Global Administrator role ID', () => {
    const result = parseDirectoryRoles(mockDirectoryRoles, mockGlobalAdminMembers);
    expect(result.available).toBe(true);
    expect(result.globalAdminCount).toBe(3);
    expect(result.globalAdminRoleId).toBe('role-ga-id');
  });

  it('sets available=false with error on failure', () => {
    const result = parseDirectoryRoles({ error: true, status: 403 });
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles missing Global Administrator role', () => {
    const noGARoles = { value: [{ id: 'role-ua', displayName: 'User Administrator' }] };
    const result = parseDirectoryRoles(noGARoles, null);
    expect(result.available).toBe(true);
    expect(result.globalAdminCount).toBe(0);
    expect(result.globalAdminRoleId).toBeNull();
  });
});

// =========================================================================
// Security Defaults
// =========================================================================
describe('security-defaults area collector', () => {
  it('parses identitySecurityDefaultsEnforcementPolicy singleton', () => {
    const result = parseSecurityDefaults(mockSecurityDefaults);
    expect(result.available).toBe(true);
    expect(result.enabled).toBe(false);
  });

  it('handles enabled security defaults', () => {
    const result = parseSecurityDefaults({ isEnabled: true });
    expect(result.available).toBe(true);
    expect(result.enabled).toBe(true);
  });

  it('sets available=false with error on failure', () => {
    const result = parseSecurityDefaults({ error: true, status: 403 });
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });
});
