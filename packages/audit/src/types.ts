/**
 * Core types for the audit engine.
 * Defines the AuditFacts structure (15 Graph API data areas),
 * evaluator function signatures, control definitions, and progress messages.
 */

// ========================================================================
// AuditFacts: 15 data areas collected from Microsoft Graph API
// Ported from TenantFactCollector.ps1
// ========================================================================

export interface OrganizationFacts {
  available: boolean;
  tenantId: string | null;
  displayName: string | null;
  primaryDomain: string | null;
  error?: string;
}

export interface ConditionalAccessFacts {
  available: boolean;
  totalPolicies: number;
  enabledCount: number;
  reportOnlyCount: number;
  disabledCount: number;
  policies: ConditionalAccessPolicy[];
  error?: string;
}

export interface ConditionalAccessPolicy {
  id: string;
  displayName: string;
  state: string;
  conditions: {
    clientAppTypes?: string[];
    users?: {
      includeUsers?: string[];
      includeRoles?: string[];
      includeGroups?: string[];
      excludeUsers?: string[];
      excludeRoles?: string[];
      excludeGroups?: string[];
    };
    userRiskLevels?: string[];
    signInRiskLevels?: string[];
    platforms?: unknown;
    locations?: unknown;
  } | null;
  grantControls: {
    operator?: string;
    builtInControls?: string[];
    authenticationStrength?: unknown;
  } | null;
  sessionControls: unknown;
}

export interface NamedLocationsFacts {
  available: boolean;
  totalLocations: number;
  locations: Array<{ id: string; displayName: string; isTrusted: boolean }>;
  error?: string;
}

export interface MfaFacts {
  available: boolean;
  totalUsers: number;
  registeredUsers: number;
  percentage: number;
  error?: string;
}

export interface AuthMethodsFacts {
  available: boolean;
  migrationState: string | null;
  smsEnabled: boolean;
  voiceEnabled: boolean;
  microsoftAuthEnabled: boolean;
  fido2Enabled: boolean;
  error?: string;
}

export interface AuthorizationPolicyFacts {
  available: boolean;
  defaultUserRoleAllowedToCreateApps: boolean;
  allowInvitesFrom: string | null;
  guestUserRoleId: string | null;
  error?: string;
}

export interface AdminConsentPolicyFacts {
  available: boolean;
  enabled: boolean;
  error?: string;
}

export interface PasswordPolicyFacts {
  available: boolean;
  passwordValidityPeriodInDays: number | null;
  passwordNotificationWindowInDays: number | null;
  error?: string;
}

export interface AdminRolesFacts {
  available: boolean;
  globalAdminCount: number;
  globalAdminRoleId: string | null;
  error?: string;
}

export interface RoleAssignmentsFacts {
  available: boolean;
  totalAssignments: number;
  eligibleAssignments: number;
  activeAssignments: number;
  error?: string;
}

export interface DevicesFacts {
  available: boolean;
  totalDevices: number;
  compliantDevices: number;
  nonCompliantDevices: number;
  error?: string;
}

export interface LicensesFacts {
  available: boolean;
  hasQualifyingSku: boolean;
  hasP2: boolean;
  hasIntune: boolean;
  hasDefenderO365: boolean;
  hasDefenderEndpt: boolean;
  licenses: Array<{
    skuPartNumber: string;
    friendlyName: string;
    total: number;
    consumed: number;
    available: number;
  }>;
  error?: string;
}

export interface SecurityDefaultsFacts {
  available: boolean;
  enabled: boolean;
  error?: string;
}

export interface DomainsFacts {
  available: boolean;
  totalDomains: number;
  customDomainCount: number;
  hasOnlyOnmicrosoft: boolean;
  error?: string;
}

export interface AppRegistrationsFacts {
  available: boolean;
  totalApps: number;
  error?: string;
}

export interface SensitivityLabelsFacts {
  available: boolean;
  totalLabels: number;
  error?: string;
}

/**
 * Phase 7 addition: Break-glass emergency access group facts.
 *
 * Surfaces whether a conventionally-named break-glass group exists in the
 * tenant and whether it is excluded from enabled Conditional Access policies.
 * Used by CA-policy-creating executors (block legacy auth, require admin MFA)
 * as a prerequisite check -- REMED-07 prevents lockouts by refusing to
 * deploy a CA policy in a tenant with no break-glass escape hatch.
 *
 * Conventional display names searched (prefix match):
 *   - "Break-Glass"
 *   - "BreakGlass"
 *   - "Emergency-Access"
 */
export interface BreakGlassFacts {
  available: boolean;
  /** Conventional displayName discovered, if any. */
  groupName: string | null;
  /** Graph group object ID, null if no matching group was found. */
  groupId: string | null;
  /** Number of members in the break-glass group. 0 if not found. */
  memberCount: number;
  /**
   * True iff the break-glass group ID appears in
   * conditions.users.excludeGroups of at least one ENABLED CA policy.
   */
  excludedFromCaPolicies: boolean;
  error?: string;
}

/**
 * Complete tenant configuration snapshot from Microsoft Graph API.
 * 15 data areas covering all Entra ID evaluation needs.
 */
export interface AuditFacts {
  organization: OrganizationFacts;
  conditionalAccess: ConditionalAccessFacts;
  namedLocations: NamedLocationsFacts;
  mfa: MfaFacts;
  authMethods: AuthMethodsFacts;
  authorizationPolicy: AuthorizationPolicyFacts;
  adminConsentPolicy: AdminConsentPolicyFacts;
  passwordPolicy: PasswordPolicyFacts;
  adminRoles: AdminRolesFacts;
  roleAssignments: RoleAssignmentsFacts;
  devices: DevicesFacts;
  licenses: LicensesFacts;
  securityDefaults: SecurityDefaultsFacts;
  domains: DomainsFacts;
  appRegistrations: AppRegistrationsFacts;
  sensitivityLabels: SensitivityLabelsFacts;
  // --- Phase 7 Plan 01 addition ---
  breakGlass: BreakGlassFacts;
}

// ========================================================================
// Evaluator types
// ========================================================================

export type EvaluatorRating = 'pass' | 'fail' | 'warn' | 'na';

export interface EvaluatorResult {
  rating: EvaluatorRating;
  message: string;
  action?: string;
  settingName?: string;
  currentValue?: string;
  expectedValue?: string;
  requiredPermission?: string;
}

export type EvaluatorFn = (facts: AuditFacts) => EvaluatorResult;

// ========================================================================
// Control definition
// ========================================================================

export type RequirementLevel = 'SHALL' | 'SHALL NOT' | 'SHOULD' | 'SHOULD NOT' | 'MAY';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface ControlDefinition {
  id: string;
  product: string;
  description: string;
  requirementLevel: RequirementLevel;
  severity: Severity;
  nist80053: string;
  nistCsf?: string;
  nist800207Tenet?: string;
  /** URL to the official government documentation for this control */
  referenceUrl?: string;
  evaluator: EvaluatorFn;
  requiredPermissions: string[];
}

// ========================================================================
// Audit progress message (for SignalR push)
// ========================================================================

export interface AuditProgressMessage {
  auditId: string;
  tenantId: string;
  completed: number;
  total: number;
  currentCheck: string;
  status: 'running' | 'complete' | 'error';
}

// ========================================================================
// Helper: create empty facts
// ========================================================================

export function createEmptyFacts(): AuditFacts {
  return {
    organization: { available: false, tenantId: null, displayName: null, primaryDomain: null },
    conditionalAccess: {
      available: false,
      totalPolicies: 0,
      enabledCount: 0,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [],
    },
    namedLocations: { available: false, totalLocations: 0, locations: [] },
    mfa: { available: false, totalUsers: 0, registeredUsers: 0, percentage: 0 },
    authMethods: {
      available: false,
      migrationState: null,
      smsEnabled: false,
      voiceEnabled: false,
      microsoftAuthEnabled: false,
      fido2Enabled: false,
    },
    authorizationPolicy: {
      available: false,
      defaultUserRoleAllowedToCreateApps: true,
      allowInvitesFrom: null,
      guestUserRoleId: null,
    },
    adminConsentPolicy: { available: false, enabled: false },
    passwordPolicy: {
      available: false,
      passwordValidityPeriodInDays: null,
      passwordNotificationWindowInDays: null,
    },
    adminRoles: { available: false, globalAdminCount: 0, globalAdminRoleId: null },
    roleAssignments: {
      available: false,
      totalAssignments: 0,
      eligibleAssignments: 0,
      activeAssignments: 0,
    },
    devices: { available: false, totalDevices: 0, compliantDevices: 0, nonCompliantDevices: 0 },
    licenses: {
      available: false,
      hasQualifyingSku: false,
      hasP2: false,
      hasIntune: false,
      hasDefenderO365: false,
      hasDefenderEndpt: false,
      licenses: [],
    },
    securityDefaults: { available: false, enabled: false },
    domains: { available: false, totalDomains: 0, customDomainCount: 0, hasOnlyOnmicrosoft: true },
    appRegistrations: { available: false, totalApps: 0 },
    sensitivityLabels: { available: false, totalLabels: 0 },
    breakGlass: {
      available: false,
      groupName: null,
      groupId: null,
      memberCount: 0,
      excludedFromCaPolicies: false,
    },
  };
}
