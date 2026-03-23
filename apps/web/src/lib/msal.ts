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
        if (level <= LogLevel.Warning) {
          console.warn("[MSAL]", message);
        }
      },
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: false,
    },
  },
};

/**
 * Minimal login scopes — just enough to sign in.
 * Additional Graph scopes are requested incrementally when the audit runs.
 */
export const loginScopes = ["User.Read"];

/**
 * Full Graph API scopes needed for the client-side audit.
 * Requested via incremental consent when the user clicks "Run Audit".
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
];

/**
 * Login request — minimal scopes for sign-in only.
 */
export const loginRequest = {
  scopes: loginScopes,
};

export const msalInstance = new PublicClientApplication(msalConfig);
