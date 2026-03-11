"use client";

import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError, type RedirectRequest } from "@azure/msal-browser";
import { useCallback, useMemo } from "react";
import { loginRequest, apiScopes, type OmzigTokenClaims } from "@/lib/msal";
import type { Role } from "@omzig/shared";
import { ROLE_HIERARCHY, ROLES } from "@omzig/shared";

/**
 * Determine the highest role from the Entra ID app roles claim array.
 */
function resolveHighestRole(roles: string[]): Role {
  if (!roles || roles.length === 0) return "Read-only";

  let highest: Role = "Read-only";
  let highestLevel = 0;

  for (const roleName of roles) {
    if (ROLES.includes(roleName as Role)) {
      const level = ROLE_HIERARCHY[roleName as Role];
      if (level > highestLevel) {
        highestLevel = level;
        highest = roleName as Role;
      }
    }
  }

  return highest;
}

export function useAuth() {
  const { instance, accounts, inProgress } = useMsal();
  const account = useAccount(accounts[0] ?? null);

  const isAuthenticated = accounts.length > 0;
  const isLoading = inProgress !== "none";

  // Extract roles and MFA status from ID token claims
  const claims = account?.idTokenClaims as OmzigTokenClaims | undefined;
  const roles = useMemo(() => claims?.roles ?? [], [claims?.roles]);
  const highestRole = useMemo(() => resolveHighestRole(roles), [roles]);
  const hasMfa = useMemo(
    () => claims?.amr?.includes("mfa") ?? false,
    [claims?.amr],
  );

  const login = useCallback(async () => {
    try {
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
        scopes: apiScopes,
        account,
      });
      return result.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        await instance.acquireTokenRedirect({
          scopes: apiScopes,
          account,
        });
        // Won't reach here -- page redirects
        return "";
      }
      throw err;
    }
  }, [instance, account]);

  return {
    isAuthenticated,
    isLoading,
    account,
    user: account
      ? { name: account.name ?? "", email: account.username ?? "" }
      : null,
    roles,
    highestRole,
    hasMfa,
    login,
    logout,
    getToken,
  };
}
