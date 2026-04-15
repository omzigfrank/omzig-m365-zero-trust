/**
 * Remediation consent client-side service -- Phase 7 Plan 02.
 *
 * Wraps the MSAL acquireTokenSilent -> acquireTokenPopup fallback for the
 * five remediation scope bundles. Emits the access token for the caller to
 * POST to /api/tenants/:tenantId/remediations/consent, which then exchanges
 * it via OBO for a long-lived refresh token.
 *
 * CRITICAL (research §2.2): this flow MUST use acquireTokenPopup, NOT
 * acquireTokenRedirect. The wizard state and current page context must be
 * preserved so the user returns to the in-progress remediation flow after
 * granting consent. Redirect would lose the in-memory state. See the useAuth
 * hook for the audit-side pattern, which DOES use redirect because audits
 * start from a static button (no wizard state). Remediation is different --
 * the user is mid-workflow inside a drawer.
 */

import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

export const SCOPE_BUNDLES = {
  conditionalAccess: ['Policy.ReadWrite.ConditionalAccess', 'Policy.Read.All'],
  authMethods: ['Policy.ReadWrite.AuthenticationMethod'],
  authPolicy: ['Policy.ReadWrite.Authorization'],
  roles: ['RoleManagement.ReadWrite.Directory'],
  securityDefaults: ['Policy.ReadWrite.SecurityDefaults'],
} as const;

export type ScopeBundleName = keyof typeof SCOPE_BUNDLES;

export interface EnsureConsentResult {
  accessToken: string;
  /** True if a consent popup was shown during this call. */
  interactionRequired: boolean;
}

/**
 * Ensure the user has granted consent for the given scope bundle in the
 * active tenant context. Silently acquires the access token if consent is
 * already in place; otherwise prompts via acquireTokenPopup.
 *
 * @throws the underlying MSAL error if the user cancels the popup or the
 * request fails for a reason other than InteractionRequiredAuthError.
 */
export async function ensureRemediationConsent(
  msalInstance: IPublicClientApplication,
  bundle: ScopeBundleName,
  account?: AccountInfo,
): Promise<EnsureConsentResult> {
  const resolvedAccount = account ?? msalInstance.getAllAccounts()[0];
  if (!resolvedAccount) {
    throw new Error(
      'ensureRemediationConsent: no active MSAL account. Sign in first.',
    );
  }

  const scopes = [...SCOPE_BUNDLES[bundle]];

  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes,
      account: resolvedAccount,
    });
    return { accessToken: result.accessToken, interactionRequired: false };
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      // Popup (NOT redirect) -- preserve the caller's in-memory state.
      const popupResult = await msalInstance.acquireTokenPopup({
        scopes,
        account: resolvedAccount,
      });
      return {
        accessToken: popupResult.accessToken,
        interactionRequired: true,
      };
    }
    throw err;
  }
}
