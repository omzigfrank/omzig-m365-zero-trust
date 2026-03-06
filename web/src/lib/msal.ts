import { Configuration, LogLevel, PublicClientApplication } from "@azure/msal-browser";

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "",
    authority: process.env.NEXT_PUBLIC_MSAL_AUTHORITY || "https://login.microsoftonline.com/common",
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

export const graphScopes = [
  "User.Read",
  "Directory.Read.All",
  "Policy.Read.All",
  "DeviceManagementManagedDevices.Read.All",
  "SecurityEvents.Read.All",
  "Reports.Read.All",
  "Domain.Read.All",
  "Application.Read.All",
];

export const loginRequest = {
  scopes: graphScopes,
};

export const msalInstance = new PublicClientApplication(msalConfig);
