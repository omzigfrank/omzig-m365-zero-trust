import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getControlPlaneDb, tenants } from '@omzig/db';
import { verifyStateHmac, exchangeCodeForTokens } from '../services/oauth-consent.js';

/**
 * OAuth callback route.
 *
 * Handles the Entra ID admin consent callback redirect.
 * This route is PUBLIC (registered before auth middleware) because
 * the redirect comes from Entra ID, not from an authenticated user.
 *
 * Flow:
 * 1. Entra ID redirects to /api/oauth/callback?code=...&state=...
 * 2. We verify the HMAC-signed state parameter
 * 3. Exchange the authorization code for tokens
 * 4. Update the pending tenant record with the customer's M365 tenant ID
 * 5. Redirect to the frontend wizard with success params
 */
export const oauthCallbackRoutes = new Hono();

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

/**
 * GET /oauth/callback - Handle Entra ID consent callback.
 *
 * Possible query params from Entra ID:
 * - code: Authorization code (success)
 * - state: HMAC-signed state with wizard session ID
 * - error: Error code from Entra ID (consent denied, etc.)
 * - error_description: Human-readable error message
 */
oauthCallbackRoutes.get('/oauth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  // Handle error from Entra ID (e.g., consent denied)
  if (error) {
    const params = new URLSearchParams({
      error,
      ...(errorDescription ? { error_description: errorDescription } : {}),
    });
    return c.redirect(`${FRONTEND_URL}/tenants/new?${params.toString()}`);
  }

  // Verify state parameter
  if (!state) {
    return c.redirect(`${FRONTEND_URL}/tenants/new?error=missing_state`);
  }

  let wizardSessionId: string;
  try {
    const verified = verifyStateHmac(state);
    wizardSessionId = verified.wizardSessionId;
  } catch (err) {
    console.error('OAuth state verification failed:', err instanceof Error ? err.message : err);
    return c.redirect(`${FRONTEND_URL}/tenants/new?error=invalid_state`);
  }

  // Exchange code for tokens
  if (!code) {
    return c.redirect(`${FRONTEND_URL}/tenants/new?error=missing_code`);
  }

  try {
    const tokenResult = await exchangeCodeForTokens(code);

    // Update the pending tenant record with the customer's M365 tenant ID
    // The wizardSessionId is the pending tenant's ID (set by buildConsentUrl)
    try {
      const db = await getControlPlaneDb();
      await db
        .update(tenants)
        .set({
          m365TenantId: tokenResult.tenantId,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, wizardSessionId));
    } catch (dbErr) {
      console.error('Failed to update tenant record:', dbErr);
      // Non-fatal: the wizard can still proceed, tenant ID will be set during provisioning
    }

    // Redirect to frontend wizard with success
    const params = new URLSearchParams({
      consent: 'success',
      tenantId: wizardSessionId,
    });
    return c.redirect(`${FRONTEND_URL}/tenants/new?${params.toString()}`);
  } catch (err) {
    console.error('OAuth token exchange failed:', err instanceof Error ? err.message : err);
    return c.redirect(`${FRONTEND_URL}/tenants/new?error=token_exchange_failed`);
  }
});
