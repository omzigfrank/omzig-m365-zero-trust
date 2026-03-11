/**
 * Authentication Methods area collector.
 * Parses:
 *   - /policies/authenticationMethodsPolicy (batch result)
 *   - /reports/authenticationMethods/userRegistrationDetails (standalone paginated -- PITFALL 7)
 *
 * The MFA registration endpoint is paginated and CANNOT be batched reliably.
 * It must be collected as a standalone call with @odata.nextLink following.
 */

import type { AuthMethodsFacts, MfaFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface AuthMethodConfig {
  id: string;
  state: string;
}

interface AuthMethodsPolicyResponse {
  policyMigrationState?: string;
  authenticationMethodConfigurations?: AuthMethodConfig[];
}

interface MfaRegistrationResponse {
  value?: Array<{
    id: string;
    isMfaRegistered: boolean;
    userPrincipalName?: string;
  }>;
}

export function parseAuthenticationMethods(
  authMethodsData: unknown,
  mfaData: unknown,
): { authMethods: AuthMethodsFacts; mfa: MfaFacts } {
  // Parse auth methods policy
  const authMethods: AuthMethodsFacts = {
    available: false,
    migrationState: null,
    smsEnabled: false,
    voiceEnabled: false,
    microsoftAuthEnabled: false,
    fido2Enabled: false,
  };

  if (!isBatchError(authMethodsData) && authMethodsData) {
    const policy = authMethodsData as AuthMethodsPolicyResponse;
    authMethods.available = true;
    authMethods.migrationState = policy.policyMigrationState ?? null;

    if (policy.authenticationMethodConfigurations) {
      for (const method of policy.authenticationMethodConfigurations) {
        const isEnabled = method.state === 'enabled';
        switch (method.id) {
          case 'Sms':
            authMethods.smsEnabled = isEnabled;
            break;
          case 'Voice':
            authMethods.voiceEnabled = isEnabled;
            break;
          case 'MicrosoftAuthenticator':
            authMethods.microsoftAuthEnabled = isEnabled;
            break;
          case 'Fido2':
            authMethods.fido2Enabled = isEnabled;
            break;
        }
      }
    }
  } else if (isBatchError(authMethodsData)) {
    authMethods.error = `Graph API error: status ${(authMethodsData as { status: number }).status}`;
  }

  // Parse MFA registration details (standalone paginated call -- PITFALL 7)
  const mfa: MfaFacts = {
    available: false,
    totalUsers: 0,
    registeredUsers: 0,
    percentage: 0,
  };

  if (mfaData && !isBatchError(mfaData)) {
    const mfaResponse = mfaData as MfaRegistrationResponse;
    if (mfaResponse.value) {
      mfa.available = true;
      mfa.totalUsers = mfaResponse.value.length;
      mfa.registeredUsers = mfaResponse.value.filter((u) => u.isMfaRegistered).length;
      mfa.percentage =
        mfa.totalUsers > 0 ? Math.round((mfa.registeredUsers / mfa.totalUsers) * 100 * 10) / 10 : 0;
    }
  }

  return { authMethods, mfa };
}
