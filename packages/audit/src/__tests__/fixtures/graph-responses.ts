/**
 * Mock Graph API response objects for testing.
 * These simulate real Graph API responses with realistic structure.
 */

export const mockOrganizationResponse = {
  value: [
    {
      id: 'tenant-id-12345',
      displayName: 'Test Organization',
      verifiedDomains: [
        { name: 'testorg.onmicrosoft.com', isDefault: false, isVerified: true },
        { name: 'testorg.com', isDefault: true, isVerified: true },
      ],
    },
  ],
};

export const mockCAPolicies = {
  value: [
    {
      id: 'ca-policy-1',
      displayName: 'Block Legacy Auth',
      state: 'enabled',
      conditions: {
        clientAppTypes: ['exchangeActiveSync', 'other'],
        users: { includeUsers: ['All'] },
      },
      grantControls: {
        operator: 'OR',
        builtInControls: ['block'],
      },
      sessionControls: null,
    },
    {
      id: 'ca-policy-2',
      displayName: 'Require MFA for All Users',
      state: 'enabled',
      conditions: {
        clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
        users: { includeUsers: ['All'] },
      },
      grantControls: {
        operator: 'OR',
        builtInControls: ['mfa'],
      },
      sessionControls: null,
    },
    {
      id: 'ca-policy-3',
      displayName: 'Disabled Policy',
      state: 'disabled',
      conditions: {
        clientAppTypes: ['browser'],
        users: { includeUsers: ['All'] },
      },
      grantControls: null,
      sessionControls: null,
    },
  ],
};

export const mockAuthMethodsPolicy = {
  id: 'authenticationMethodsPolicy',
  policyMigrationState: 'migrationComplete',
  authenticationMethodConfigurations: [
    { id: 'Sms', state: 'disabled' },
    { id: 'Voice', state: 'disabled' },
    { id: 'MicrosoftAuthenticator', state: 'enabled' },
    { id: 'Fido2', state: 'enabled' },
    { id: 'TemporaryAccessPass', state: 'enabled' },
  ],
};

export const mockAuthorizationPolicy = {
  id: 'authorizationPolicy',
  defaultUserRolePermissions: {
    allowedToCreateApps: false,
    allowedToCreateSecurityGroups: true,
    allowedToReadBitlockerKeysForOwnedDevice: true,
  },
  allowInvitesFrom: 'adminsAndGuestInviters',
  guestUserRoleId: '2af84b1e-32c8-42b7-82bc-daa8c0e1b7cb',
};

export const mockDirectoryRoles = {
  value: [
    { id: 'role-ga-id', displayName: 'Global Administrator' },
    { id: 'role-ua-id', displayName: 'User Administrator' },
    { id: 'role-sa-id', displayName: 'Security Administrator' },
  ],
};

export const mockGlobalAdminMembers = {
  value: [
    { id: 'user-1', displayName: 'Admin One' },
    { id: 'user-2', displayName: 'Admin Two' },
    { id: 'user-3', displayName: 'Admin Three' },
  ],
};

export const mockSubscribedSkus = {
  value: [
    {
      skuPartNumber: 'SPE_E5',
      prepaidUnits: { enabled: 100 },
      consumedUnits: 75,
    },
    {
      skuPartNumber: 'AAD_PREMIUM_P2',
      prepaidUnits: { enabled: 100 },
      consumedUnits: 75,
    },
    {
      skuPartNumber: 'INTUNE_A',
      prepaidUnits: { enabled: 100 },
      consumedUnits: 50,
    },
  ],
};

export const mockDomains = {
  value: [
    {
      id: 'testorg.com',
      isDefault: true,
      isVerified: true,
      passwordValidityPeriodInDays: 2147483647,
      passwordNotificationWindowInDays: 14,
    },
    {
      id: 'testorg.onmicrosoft.com',
      isDefault: false,
      isVerified: true,
      passwordValidityPeriodInDays: null,
      passwordNotificationWindowInDays: null,
    },
  ],
};

export const mockSecurityDefaults = {
  id: 'identitySecurityDefaultsEnforcementPolicy',
  isEnabled: false,
};

export const mockAdminConsentPolicy = {
  id: 'adminConsentRequestPolicy',
  isEnabled: true,
};

export const mockManagedDevices = {
  value: [
    { id: 'device-1', complianceState: 'compliant' },
    { id: 'device-2', complianceState: 'compliant' },
    { id: 'device-3', complianceState: 'noncompliant' },
    { id: 'device-4', complianceState: 'unknown' },
  ],
};

export const mockMfaRegistrationDetails = {
  value: [
    { id: 'user-1', isMfaRegistered: true, userPrincipalName: 'user1@testorg.com' },
    { id: 'user-2', isMfaRegistered: true, userPrincipalName: 'user2@testorg.com' },
    { id: 'user-3', isMfaRegistered: false, userPrincipalName: 'user3@testorg.com' },
    { id: 'user-4', isMfaRegistered: true, userPrincipalName: 'user4@testorg.com' },
    { id: 'user-5', isMfaRegistered: true, userPrincipalName: 'user5@testorg.com' },
  ],
};

export const mockApplications = {
  '@odata.count': 12,
  value: [{ id: 'app-1' }],
};

export const mockSensitivityLabels = {
  value: [
    { id: 'label-1', name: 'Public' },
    { id: 'label-2', name: 'Internal' },
    { id: 'label-3', name: 'Confidential' },
  ],
};

export const mockPimRoleEligibility = {
  value: [
    { id: 'eligible-1', principalId: 'user-1', roleDefinitionId: 'role-ga-id' },
    { id: 'eligible-2', principalId: 'user-2', roleDefinitionId: 'role-ga-id' },
  ],
};

export const mockPimRoleAssignments = {
  value: [
    { id: 'assign-1', principalId: 'user-1', assignmentType: 'Activated', roleDefinitionId: 'role-ga-id' },
    { id: 'assign-2', principalId: 'user-3', assignmentType: 'Assigned', roleDefinitionId: 'role-ua-id' },
  ],
};

export const mockNamedLocations = {
  value: [
    { id: 'loc-1', displayName: 'Corporate HQ', isTrusted: true },
    { id: 'loc-2', displayName: 'Remote Offices', isTrusted: false },
  ],
};

/**
 * Mock $batch response wrapper.
 * The outer response is always 200; individual responses have their own status.
 */
export const mockBatchResponse = {
  responses: [
    {
      id: 'organization',
      status: 200,
      body: mockOrganizationResponse,
    },
    {
      id: 'conditionalAccess',
      status: 200,
      body: mockCAPolicies,
    },
    {
      id: 'failedRequest',
      status: 403,
      body: {
        error: {
          code: 'Authorization_RequestDenied',
          message: 'Insufficient privileges to complete the operation.',
        },
      },
    },
  ],
};
