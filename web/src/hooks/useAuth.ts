"use client";

import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError, RedirectRequest } from "@azure/msal-browser";
import { useCallback } from "react";
import { loginRequest, graphScopes } from "@/lib/msal";

export function useAuth() {
  const { instance, accounts } = useMsal();
  const account = useAccount(accounts[0] ?? null);

  const isAuthenticated = accounts.length > 0;

  const login = useCallback(async () => {
    try {
      // Use redirect flow — no popup blockers
      await instance.loginRedirect(loginRequest as RedirectRequest);
    } catch (err) {
      console.error("Login failed:", err);
      throw err;
    }
  }, [instance]);

  const logout = useCallback(async () => {
    await instance.logoutRedirect({ postLogoutRedirectUri: "/" });
  }, [instance]);

  const getToken = useCallback(async (): Promise<string> => {
    if (!account) throw new Error("No account signed in");

    try {
      const result = await instance.acquireTokenSilent({
        scopes: graphScopes,
        account,
      });
      return result.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        // Fall back to redirect for token acquisition too
        await instance.acquireTokenRedirect({
          scopes: graphScopes,
          account,
        });
        // Won't reach here — page redirects
        return "";
      }
      throw err;
    }
  }, [instance, account]);

  return {
    isAuthenticated,
    account,
    user: account
      ? { name: account.name ?? "", email: account.username ?? "" }
      : null,
    login,
    logout,
    getToken,
  };
}
