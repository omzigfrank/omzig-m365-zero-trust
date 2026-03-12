"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { GdapVerificationResult, StepMetadata, WizardStateResponse } from "@/lib/tenant-api";
import {
  createTenant,
  generateConsentUrl as generateConsentUrlApi,
  verifyGdap as verifyGdapApi,
  provisionTenant as provisionTenantApi,
  fetchWizardState,
  updateWizardState,
  resetWizardState as resetWizardStateApi,
} from "@/lib/tenant-api";

const STORAGE_KEY = "omzig-wizard-state";

export interface OnboardingState {
  currentStep: number;
  tenantId: string | null;
  displayName: string | null;
  connectionMethod: "oauth" | "gdap" | null;
  consentUrl: string | null;
  gdapResult: GdapVerificationResult | null;
  provisioningStatus: {
    dbCreated: boolean;
    tokenStored: boolean;
    firstAuditTriggered: boolean;
  };
  error: string | null;
  loading: boolean;
  lastSyncedAt: string | null;
}

const initialState: OnboardingState = {
  currentStep: 1,
  tenantId: null,
  displayName: null,
  connectionMethod: null,
  consentUrl: null,
  gdapResult: null,
  provisioningStatus: {
    dbCreated: false,
    tokenStored: false,
    firstAuditTriggered: false,
  },
  error: null,
  loading: false,
  lastSyncedAt: null,
};

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(initialState);
  const searchParams = useSearchParams();
  const stateRef = useRef(state);
  stateRef.current = state;

  // Helper: build stepsCompleted array from current state
  const buildStepsCompleted = useCallback(
    (s: OnboardingState): StepMetadata[] => {
      const steps: StepMetadata[] = [];
      if (s.tenantId) {
        steps.push({
          step: 1,
          data: {
            tenantId: s.tenantId,
            displayName: s.displayName || "",
          },
          completedAt: new Date().toISOString(),
        });
      }
      if (s.connectionMethod) {
        steps.push({
          step: 2,
          data: { connectionMethod: s.connectionMethod },
          completedAt: new Date().toISOString(),
        });
      }
      if (s.currentStep >= 4) {
        steps.push({
          step: 3,
          data: {
            consentUrl: s.consentUrl || undefined,
            gdapResult: s.gdapResult || undefined,
          },
          completedAt: new Date().toISOString(),
        });
      }
      if (s.provisioningStatus.firstAuditTriggered) {
        steps.push({
          step: 4,
          data: { provisioningStatus: s.provisioningStatus },
          completedAt: new Date().toISOString(),
        });
      }
      return steps;
    },
    [],
  );

  // Helper: persist to localStorage cache
  const cacheToLocalStorage = useCallback((s: OnboardingState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Helper: persist state to setupWizardState table via API
  const persistState = useCallback(
    async (s: OnboardingState, isComplete = false) => {
      try {
        await updateWizardState({
          currentStep: s.currentStep,
          stepsCompleted: buildStepsCompleted(s),
          isComplete,
        });
        cacheToLocalStorage(s);
      } catch {
        // Swallow persistence errors -- wizard still functions
      }
    },
    [buildStepsCompleted, cacheToLocalStorage],
  );

  // Restore state on mount from setupWizardState table (or localStorage cache)
  useEffect(() => {
    let cancelled = false;

    // Quick hydration from localStorage first
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as OnboardingState;
        if (!cancelled && parsed.currentStep > 1 && !parsed.provisioningStatus?.firstAuditTriggered) {
          setState(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }

    // Then fetch from API (source of truth)
    fetchWizardState()
      .then((wizardState) => {
        if (cancelled) return;

        if (wizardState && !wizardState.isComplete) {
          // Hydrate from server state
          const restored = hydrateFromWizardState(wizardState);
          setState(restored);
          cacheToLocalStorage(restored);
        }
      })
      .catch(() => {
        // Ignore fetch errors -- use cached state or fresh start
      })
      .then(() => {
        // Check for OAuth consent callback params
        if (cancelled) return;
        const consent = searchParams.get("consent");
        const tenantIdParam = searchParams.get("tenantId");
        if (consent === "success" && tenantIdParam) {
          // Auto-advance to provisioning
          setState((prev) => ({
            ...prev,
            currentStep: 4,
            tenantId: tenantIdParam,
            connectionMethod: "oauth",
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Submit tenant details (step 1 -> step 2)
  const submitTenantDetails = useCallback(
    async (data: { displayName: string; primaryDomain: string; contactEmail: string }) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await createTenant(data);
        const newState: OnboardingState = {
          ...stateRef.current,
          currentStep: 2,
          tenantId: result.id,
          displayName: data.displayName,
          loading: false,
          error: null,
        };
        setState(newState);
        await persistState(newState);
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to create tenant",
        }));
      }
    },
    [persistState],
  );

  // Select connection method (step 2 -> step 3)
  const selectConnectionMethod = useCallback(
    async (method: "oauth" | "gdap") => {
      const newState: OnboardingState = {
        ...stateRef.current,
        currentStep: 3,
        connectionMethod: method,
      };
      setState(newState);
      await persistState(newState);
    },
    [persistState],
  );

  // Generate OAuth consent URL
  const generateConsent = useCallback(async () => {
    const tenantId = stateRef.current.tenantId;
    if (!tenantId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await generateConsentUrlApi(tenantId);
      setState((s) => ({
        ...s,
        consentUrl: result.consentUrl,
        loading: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to generate consent URL",
      }));
    }
  }, []);

  // Verify GDAP relationship
  const verifyGdapRelationship = useCallback(
    async (relationshipId: string) => {
      const tenantId = stateRef.current.tenantId;
      if (!tenantId) return;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await verifyGdapApi(tenantId, relationshipId);
        setState((s) => ({
          ...s,
          gdapResult: result,
          loading: false,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to verify GDAP relationship",
        }));
      }
    },
    [],
  );

  // Advance to provisioning (step 3 -> step 4)
  const advanceToProvisioning = useCallback(async () => {
    const newState: OnboardingState = { ...stateRef.current, currentStep: 4 };
    setState(newState);
    await persistState(newState);
  }, [persistState]);

  // Start provisioning (step 4)
  const startProvisioning = useCallback(async () => {
    const s = stateRef.current;
    if (!s.tenantId || !s.connectionMethod) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Determine m365TenantId based on connection method
      const m365TenantId =
        s.connectionMethod === "gdap" && s.gdapResult
          ? s.gdapResult.customerTenantId
          : s.tenantId!;

      // Simulate staged progress
      setState((prev) => ({
        ...prev,
        provisioningStatus: { ...prev.provisioningStatus, dbCreated: true },
      }));

      await provisionTenantApi(s.tenantId!, {
        m365TenantId,
        token: m365TenantId,
        connectionMethod: s.connectionMethod!,
      });

      setState((prev) => ({
        ...prev,
        provisioningStatus: {
          dbCreated: true,
          tokenStored: true,
          firstAuditTriggered: true,
        },
        loading: false,
      }));

      // Auto-advance to step 5 after short delay
      setTimeout(() => {
        setState((prev) => {
          const completed = { ...prev, currentStep: 5 };
          persistState(completed, true);
          return completed;
        });
      }, 1000);
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Provisioning failed",
      }));
    }
  }, [persistState]);

  // Go back to a previous step
  const goBack = useCallback(() => {
    setState((s) => {
      if (s.currentStep <= 1 || s.currentStep >= 4) return s;
      return { ...s, currentStep: s.currentStep - 1 };
    });
  }, []);

  // Reset wizard state (for "Connect Another Tenant")
  const resetWizard = useCallback(async () => {
    try {
      await resetWizardStateApi();
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup errors
    }
    setState(initialState);
  }, []);

  return {
    ...state,
    submitTenantDetails,
    selectConnectionMethod,
    generateConsent,
    verifyGdapRelationship,
    advanceToProvisioning,
    startProvisioning,
    goBack,
    resetWizard,
  };
}

/**
 * Hydrate OnboardingState from a WizardStateResponse.
 */
function hydrateFromWizardState(ws: WizardStateResponse): OnboardingState {
  const restored: OnboardingState = { ...initialState, currentStep: ws.currentStep };

  for (const step of ws.stepsCompleted) {
    if (step.step === 1) {
      restored.tenantId = step.data.tenantId as string;
      restored.displayName = step.data.displayName as string;
    }
    if (step.step === 2) {
      restored.connectionMethod = step.data.connectionMethod as "oauth" | "gdap";
    }
    if (step.step === 3) {
      restored.consentUrl = (step.data.consentUrl as string) || null;
      restored.gdapResult = (step.data.gdapResult as GdapVerificationResult) || null;
    }
  }

  return restored;
}
