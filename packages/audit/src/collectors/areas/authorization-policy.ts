/**
 * Authorization Policy area collector.
 * Parses:
 *   - /policies/authorizationPolicy (singleton -- PITFALL 6: NOT a collection, direct object)
 *   - /policies/adminConsentRequestPolicy (singleton)
 *
 * PITFALL 6: Unlike most Graph endpoints, authorizationPolicy returns a single object,
 * NOT a { value: [...] } collection wrapper. Handle accordingly.
 */

import type { AuthorizationPolicyFacts, AdminConsentPolicyFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface AuthzPolicyResponse {
  defaultUserRolePermissions?: {
    allowedToCreateApps?: boolean;
  };
  allowInvitesFrom?: string;
  guestUserRoleId?: string;
}

interface AdminConsentResponse {
  isEnabled?: boolean;
}

export function parseAuthorizationPolicy(
  authzData: unknown,
  consentData?: unknown,
): { authorizationPolicy: AuthorizationPolicyFacts; adminConsentPolicy: AdminConsentPolicyFacts } {
  // Parse authorization policy (singleton response -- PITFALL 6)
  const authorizationPolicy: AuthorizationPolicyFacts = {
    available: false,
    defaultUserRoleAllowedToCreateApps: true,
    allowInvitesFrom: null,
    guestUserRoleId: null,
  };

  if (!isBatchError(authzData) && authzData) {
    const policy = authzData as AuthzPolicyResponse;
    authorizationPolicy.available = true;

    if (policy.defaultUserRolePermissions !== undefined) {
      authorizationPolicy.defaultUserRoleAllowedToCreateApps =
        policy.defaultUserRolePermissions.allowedToCreateApps ?? true;
    }

    authorizationPolicy.allowInvitesFrom = policy.allowInvitesFrom ?? null;
    authorizationPolicy.guestUserRoleId = policy.guestUserRoleId ?? null;
  } else if (isBatchError(authzData)) {
    authorizationPolicy.error = `Graph API error: status ${(authzData as { status: number }).status}`;
  }

  // Parse admin consent request policy
  const adminConsentPolicy: AdminConsentPolicyFacts = {
    available: false,
    enabled: false,
  };

  if (consentData && !isBatchError(consentData)) {
    const consent = consentData as AdminConsentResponse;
    adminConsentPolicy.available = true;
    adminConsentPolicy.enabled = consent.isEnabled ?? false;
  }

  return { authorizationPolicy, adminConsentPolicy };
}
