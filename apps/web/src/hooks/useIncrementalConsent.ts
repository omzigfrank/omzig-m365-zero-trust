"use client";

/**
 * useIncrementalConsent -- Phase 7 Plan 02.
 *
 * React hook wrapping `ensureRemediationConsent` with React state and an
 * automatic POST to the server-side /remediations/consent endpoint so the
 * backend can store the OBO refresh token. The SPA never keeps the access
 * token beyond the single server round-trip.
 */

import { useCallback, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import {
  ensureRemediationConsent,
  type ScopeBundleName,
} from '@/services/remediation-consent';

interface UseIncrementalConsentState {
  isPrompting: boolean;
  error: string | null;
}

export function useIncrementalConsent(tenantId: string) {
  const { instance } = useMsal();
  const [state, setState] = useState<UseIncrementalConsentState>({
    isPrompting: false,
    error: null,
  });

  const ensureConsent = useCallback(
    async (bundle: ScopeBundleName): Promise<string> => {
      setState({ isPrompting: true, error: null });
      try {
        const { accessToken, interactionRequired } =
          await ensureRemediationConsent(instance, bundle);

        // If a popup was actually shown, register the new consent with the
        // backend so the OBO refresh token is envelope-encrypted and stored
        // in Key Vault. This is the one-time handshake per bundle per tenant.
        if (interactionRequired) {
          const response = await fetch(
            `/api/tenants/${tenantId}/remediations/consent`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bundle, spaAssertion: accessToken }),
            },
          );
          if (!response.ok) {
            const text = await response.text();
            throw new Error(
              `Consent registration failed (${response.status}): ${text}`,
            );
          }
        }

        setState({ isPrompting: false, error: null });
        return accessToken;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Consent prompt failed';
        setState({ isPrompting: false, error: message });
        throw err;
      }
    },
    [instance, tenantId],
  );

  const reset = useCallback(() => {
    setState({ isPrompting: false, error: null });
  }, []);

  return {
    ensureConsent,
    isPrompting: state.isPrompting,
    error: state.error,
    reset,
  };
}
