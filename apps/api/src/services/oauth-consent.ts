import crypto from 'node:crypto';
import { ConfidentialClientApplication } from '@azure/msal-node';

/**
 * OAuth Admin Consent service.
 *
 * Handles the multi-tenant Entra ID admin consent flow:
 * 1. MSP generates a consent URL from the onboarding wizard
 * 2. Client admin opens the URL, authenticates, grants permissions
 * 3. Entra ID redirects to callback with authorization code
 * 4. Backend exchanges code for tokens via MSAL
 *
 * Uses the authorization code flow with prompt=admin_consent
 * (combines consent + code exchange in one redirect per RESEARCH Pitfall 1).
 *
 * TENANT-01: OAuth consent flow for tenant onboarding
 */

/** Graph API scopes for the consent prompt. */
export const GRAPH_SCOPES = [
  'https://graph.microsoft.com/.default',
  'offline_access',
] as const;

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

/**
 * Build a shareable admin consent URL.
 *
 * Uses /organizations/oauth2/v2.0/authorize with prompt=admin_consent
 * to combine consent + authorization code in one redirect.
 *
 * The state parameter is HMAC-signed to prevent tampering (Pitfall 6).
 *
 * @param wizardSessionId - The onboarding wizard session ID to embed in state
 * @returns The full authorization URL the client admin should visit
 */
export function buildConsentUrl(wizardSessionId: string): string {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('OAUTH_CLIENT_ID and OAUTH_REDIRECT_URI are required');
  }

  const state = signState({ wizardSessionId, ts: Date.now() });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'https://graph.microsoft.com/.default offline_access',
    state,
    prompt: 'admin_consent',
  });

  return `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Sign state payload with HMAC-SHA256 to prevent tampering.
 * Format: base64(payload)|base64(hmac)
 */
function signState(payload: { wizardSessionId: string; ts: number }): string {
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error('OAUTH_CLIENT_SECRET is required for state signing');
  }

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString('base64');
  const hmac = crypto
    .createHmac('sha256', clientSecret)
    .update(payloadB64)
    .digest('base64');

  return Buffer.from(`${payloadB64}|${hmac}`).toString('base64');
}

/**
 * Verify an HMAC-signed state parameter from the OAuth callback.
 *
 * @param state - The state parameter from the callback URL
 * @returns The decoded wizard session ID
 * @throws Error if the state is invalid, tampered, or expired (>1 hour)
 */
export function verifyStateHmac(state: string): { wizardSessionId: string } {
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error('OAUTH_CLIENT_SECRET is required for state verification');
  }

  let decoded: string;
  try {
    decoded = Buffer.from(state, 'base64').toString('utf-8');
  } catch {
    throw new Error('Invalid state parameter: malformed base64');
  }

  const separatorIndex = decoded.lastIndexOf('|');
  if (separatorIndex === -1) {
    throw new Error('Invalid state parameter: missing signature');
  }

  const payloadB64 = decoded.slice(0, separatorIndex);
  const signature = decoded.slice(separatorIndex + 1);

  // Verify HMAC
  const expectedHmac = crypto
    .createHmac('sha256', clientSecret)
    .update(payloadB64)
    .digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
    throw new Error('Invalid state parameter: signature mismatch');
  }

  // Decode payload
  let payload: { wizardSessionId: string; ts: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));
  } catch {
    throw new Error('Invalid state parameter: malformed payload');
  }

  // Check timestamp (must be within 1 hour)
  const ONE_HOUR_MS = 60 * 60 * 1000;
  if (Date.now() - payload.ts > ONE_HOUR_MS) {
    throw new Error('Invalid state parameter: expired');
  }

  return { wizardSessionId: payload.wizardSessionId };
}

/**
 * Exchange an authorization code for tokens.
 *
 * Called from the OAuth callback handler after the client admin
 * grants consent and Entra ID redirects back with a code.
 *
 * @param code - The authorization code from the callback
 * @returns Access token, customer tenant ID, and expiry
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  tenantId: string;
  expiresOn: Date;
}> {
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error('OAUTH_REDIRECT_URI is required');
  }

  const cca = getCca();

  const result = await cca.acquireTokenByCode({
    code,
    redirectUri,
    scopes: [...GRAPH_SCOPES],
  });

  if (!result || !result.accessToken) {
    throw new Error('Token exchange failed: no access token returned');
  }

  const tenantId = result.account?.tenantId;
  if (!tenantId) {
    throw new Error('Token exchange failed: no tenant ID in account');
  }

  return {
    accessToken: result.accessToken,
    tenantId,
    expiresOn: result.expiresOn ?? new Date(Date.now() + 3600 * 1000),
  };
}

/** Reset the singleton CCA instance (for testing). */
export function _resetCca(): void {
  ccaInstance = null;
}
