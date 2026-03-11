import {
  Configuration,
  LogLevel,
  PublicClientApplication,
  type IdTokenClaims,
} from "@azure/msal-browser";

/**
 * Extended token claims for Omzig platform.
 * Entra ID app roles appear in the `roles` array.
 * MFA status is indicated by the `amr` (auth method reference) claim.
 */
export interface OmzigTokenClaims extends IdTokenClaims {
  roles?: string[];
  amr?: string[];
}

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "",
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_TENANT_ID || "common"}`,
    redirectUri: process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI || "http://localhost:3000",
    postLogoutRedirectUri: "/",
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) {
          console.error("[MSAL]", message);
        }
      },
      logLevel: LogLevel.Error,
      piiLoggingEnabled: false,
    },
  },
};

/**
 * Scopes for the backend API. Uses the custom scope exposed by the API app registration.
 * This is distinct from Graph API scopes -- the backend handles Graph calls itself.
 */
export const apiScopes = [
  `api://${process.env.NEXT_PUBLIC_MSAL_CLIENT_ID}/access_as_user`,
];

/**
 * Login request uses API scopes so the returned token can call the Hono backend.
 */
export const loginRequest = {
  scopes: apiScopes,
};

export const msalInstance = new PublicClientApplication(msalConfig);
