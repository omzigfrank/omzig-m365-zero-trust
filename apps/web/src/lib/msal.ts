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
    redirectUri:
      process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI || "http://localhost:3000",
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
 * Graph API scopes needed for the client-side audit.
 * The audit collects tenant configuration directly from Graph in the browser.
 */
export const graphScopes = [
  "User.Read",
  "Directory.Read.All",
  "Policy.Read.All",
  "DeviceManagementManagedDevices.Read.All",
  "Reports.Read.All",
  "Domain.Read.All",
  "Application.Read.All",
  "RoleManagement.Read.Directory",
  "InformationProtectionPolicy.Read.All",
];

/**
 * Kept for backward compat — aliases graphScopes.
 * Previously pointed at a custom api:// scope for the Hono backend.
 */
export const apiScopes = graphScopes;

/**
 * Login request uses Graph scopes so the user consents to audit permissions up front.
 */
export const loginRequest = {
  scopes: graphScopes,
};

export const msalInstance = new PublicClientApplication(msalConfig);
