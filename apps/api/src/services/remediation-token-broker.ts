/**
 * Remediation Token Broker -- Phase 7 Plan 01 Task 3.
 *
 * Handles the just-in-time, per-scope-bundle incremental consent flow
 * for remediation writes. Mirrors oauth-consent.ts but via OBO (on-behalf-of)
 * because SPAs cannot hold refresh tokens -- the backend exchanges a
 * short-lived SPA access token for a long-lived refresh token bound to
 * the requested scope bundle, then envelope-encrypts and stores it in
 * Key Vault per (tenantId, scopeBundle).
 *
 * Five scope bundles (research §6):
 *   conditionalAccess | authMethods | authPolicy | roles | securityDefaults
 *
 * Consent state is tracked in tenant_remediation_consents (control plane).
 * When consent is revoked (InteractionRequiredAuthError from MSAL at
 * refresh time), the row is marked revoked_at=now and the next write for
 * that bundle forces a fresh consent prompt from the UI.
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import { and, eq, isNull } from 'drizzle-orm';
import { getControlPlaneDb, tenantRemediationConsents } from '@omzig/db';
import { encryptValue, decryptValue, setSecret, getSecret } from './keyvault.js';

// Research §6: five scope bundles keyed by control family.
export const SCOPE_BUNDLES = {
  conditionalAccess: ['Policy.ReadWrite.ConditionalAccess', 'Policy.Read.All'],
  authMethods: ['Policy.ReadWrite.AuthenticationMethod'],
  authPolicy: ['Policy.ReadWrite.Authorization'],
  roles: ['RoleManagement.ReadWrite.Directory'],
  securityDefaults: ['Policy.ReadWrite.SecurityDefaults'],
} as const;

export type ScopeBundleName = keyof typeof SCOPE_BUNDLES;

// ---- MSAL instance (lazy) ----

let ccaInstance: ConfidentialClientApplication | null = null;

function getCca(): ConfidentialClientApplication {
  if (!ccaInstance) {
    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET are required');
    }
    ccaInstance = new ConfidentialClientApplication({
      auth: {
        clientId,
        clientSecret,
        authority: 'https://login.microsoftonline.com/organizations',
      },
    });
  }
  return ccaInstance;
}

/** Test helper -- reset MSAL singleton. */
export function _resetRemediationBrokerForTests(): void {
  ccaInstance = null;
}

// ---- OBO exchange ----

export interface BrokerExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresOn: Date;
}

/**
 * Exchange a SPA-acquired access token (the OBO assertion) for a
 * scope-bundle-restricted access + refresh token pair.
 *
 * MSAL Node's acquireTokenOnBehalfOf returns only an access token;
 * the refresh token is held in the MSAL cache. We extract it via
 * serialize() + parse. This is a known MSAL Node quirk per research §2.
 */
export async function exchangeForRemediationRefreshToken(
  spaAssertion: string,
  bundle: ScopeBundleName,
): Promise<BrokerExchangeResult> {
  const cca = getCca();
  const scopes = [...SCOPE_BUNDLES[bundle], 'offline_access'];

  const result = await cca.acquireTokenOnBehalfOf({
    oboAssertion: spaAssertion,
    scopes,
  });

  if (!result || !result.accessToken) {
    throw new Error('OBO exchange failed: no access token returned');
  }

  // Extract refresh token from the MSAL token cache snapshot.
  // Known MSAL Node quirk: refresh tokens are not exposed directly on the
  // result object; they live in the serialized cache. We parse the cache
  // JSON and pull the first RefreshToken entry.
  const cacheJson = cca.getTokenCache().serialize();
  let refreshToken = '';
  try {
    const parsed = JSON.parse(cacheJson) as {
      RefreshToken?: Record<string, { secret?: string }>;
    };
    const rts = parsed.RefreshToken ?? {};
    const firstKey = Object.keys(rts)[0];
    if (firstKey && rts[firstKey].secret) {
      refreshToken = rts[firstKey].secret!;
    }
  } catch {
    // Leave refreshToken empty; caller should handle.
  }
  if (!refreshToken) {
    throw new Error('OBO exchange did not produce a refresh token');
  }

  return {
    accessToken: result.accessToken,
    refreshToken,
    expiresOn: result.expiresOn ?? new Date(Date.now() + 3600 * 1000),
  };
}

// ---- Consent persistence ----

/**
 * Store a fresh remediation consent row. If an active consent row
 * already exists for (tenantId, bundle), mark it revoked before
 * inserting the new row -- preserves audit history and keeps the
 * filtered unique index satisfied.
 */
export async function storeRemediationConsent(
  tenantId: string,
  bundle: ScopeBundleName,
  refreshToken: string,
  consentedByUserId: string,
): Promise<void> {
  // Envelope-encrypt the refresh token and store it in Key Vault.
  const encrypted = await encryptValue(refreshToken);
  const secretName = `remediation-${tenantId}-${bundle}`;
  await setSecret(secretName, encrypted);

  const db = await getControlPlaneDb();

  // Revoke any prior active row for this (tenant, bundle).
  await db
    .update(tenantRemediationConsents)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(tenantRemediationConsents.tenantId, tenantId),
        eq(tenantRemediationConsents.scopeBundle, bundle),
        isNull(tenantRemediationConsents.revokedAt),
      ),
    );

  // Insert the new row.
  await db.insert(tenantRemediationConsents).values({
    id: crypto.randomUUID(),
    tenantId,
    scopeBundle: bundle,
    consentedByUserId,
    refreshTokenSecretName: secretName,
    consentedAt: new Date(),
    createdAt: new Date(),
  });
}

/**
 * Resolve a valid access token for a (tenantId, scopeBundle) pair.
 * Returns null when no active consent row exists OR when MSAL throws
 * InteractionRequiredAuthError (consent revoked upstream -- we mark
 * the row revoked locally and return null so the caller can surface
 * a re-consent prompt).
 */
export async function getRemediationAccessToken(
  tenantId: string,
  bundle: ScopeBundleName,
): Promise<string | null> {
  const db = await getControlPlaneDb();

  const rows = (await db
    .select()
    .from(tenantRemediationConsents)
    .where(
      and(
        eq(tenantRemediationConsents.tenantId, tenantId),
        eq(tenantRemediationConsents.scopeBundle, bundle),
        isNull(tenantRemediationConsents.revokedAt),
      ),
    )) as Array<{
    id: string;
    refreshTokenSecretName: string;
  }>;

  const consent = rows[0];
  if (!consent) {
    console.warn(
      `[remediation-token-broker] No active consent for tenant=${tenantId} bundle=${bundle}`,
    );
    return null;
  }

  // Fetch + decrypt refresh token from Key Vault.
  let refreshToken: string;
  try {
    const encrypted = await getSecret(consent.refreshTokenSecretName);
    refreshToken = await decryptValue(encrypted);
  } catch (err) {
    console.error(
      `[remediation-token-broker] Failed to retrieve refresh token for tenant=${tenantId} bundle=${bundle}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  // Exchange refresh token for a fresh access token.
  const cca = getCca();
  try {
    const result = await cca.acquireTokenByRefreshToken({
      refreshToken,
      scopes: [...SCOPE_BUNDLES[bundle]],
    });
    if (!result || !result.accessToken) {
      return null;
    }

    // Update lastUsedAt on the consent row.
    await db
      .update(tenantRemediationConsents)
      .set({ lastUsedAt: new Date() })
      .where(eq(tenantRemediationConsents.id, consent.id));

    return result.accessToken;
  } catch (err) {
    // InteractionRequiredAuthError -> consent revoked upstream.
    const errName = err instanceof Error ? err.name : '';
    const errMsg = err instanceof Error ? err.message : String(err);
    if (
      errName === 'InteractionRequiredAuthError' ||
      errMsg.includes('AADSTS65001') ||
      errMsg.includes('interaction_required')
    ) {
      console.warn(
        `[remediation-token-broker] Consent revoked for tenant=${tenantId} bundle=${bundle}; marking row revoked`,
      );
      await db
        .update(tenantRemediationConsents)
        .set({ revokedAt: new Date() })
        .where(eq(tenantRemediationConsents.id, consent.id));
      return null;
    }
    // Other errors -> propagate
    throw err;
  }
}
