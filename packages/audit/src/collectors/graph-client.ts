/**
 * Graph SDK client factory.
 * Creates a Microsoft Graph Client instance using a delegated access token.
 */

import { Client } from '@microsoft/microsoft-graph-client';

/**
 * Create a Graph API client authenticated with the provided access token.
 * Uses delegated token auth (token provided by the platform from Key Vault).
 *
 * @param accessToken - The OAuth 2.0 access token for Graph API
 * @returns A configured Client instance ready for API calls
 */
export function createGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}
