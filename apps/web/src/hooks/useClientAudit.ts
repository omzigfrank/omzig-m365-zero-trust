"use client";

/**
 * Client-side audit hook -- runs the full audit pipeline in the browser.
 *
 * Supports framework selection: CISA SCuBA, NIST ZTA, or both (all 4 frameworks).
 * Shows phase-by-phase progress and collection diagnostics.
 */

import { useState, useCallback } from "react";
import { createGraphClient } from "@omzig/audit/graph-client";
import { collectFacts } from "@omzig/audit/fact-collector";
import { getAllControls } from "@omzig/audit/control-registry";
import { calculateMaturitySnapshot } from "@omzig/audit/maturity-calculator";
import type { AuditFacts, EvaluatorResult } from "@omzig/audit/types";

export type AuditStatus = "idle" | "running" | "complete" | "error";
export type FrameworkSelection = "scuba" | "nist" | "both";

const FRAMEWORK_PRODUCTS: Record<FrameworkSelection, string[]> = {
  scuba: ["AAD"],
  nist: ["ZTA", "80053", "CSF"],
  both: ["AAD", "ZTA", "80053", "CSF"],
};

export interface AuditFinding {
  controlId: string;
  product: string;
  description: string;
  requirementLevel: string;
  severity: string;
  rating: string;
  message: string;
  action?: string | null;
  settingName?: string | null;
  currentValue?: string | null;
  expectedValue?: string | null;
  nist80053: string;
  nistCsf?: string | null;
  nist800207Tenet?: string | null;
}

/** Diagnostic entry for one data area */
export interface AreaDiagnostic {
  area: string;
  label: string;
  status: "ok" | "error" | "empty";
  detail: string;
  /** Which controls depend on this data source */
  controls: string;
  /** Clarifying note (e.g. what is NOT affected by an error here) */
  note?: string;
  /** Graph API endpoint used to collect this data */
  endpoint?: string;
}

export interface CollectionDiagnostics {
  areas: AreaDiagnostic[];
  okCount: number;
  errorCount: number;
  emptyCount: number;
  collectionMs: number;
  evaluationMs: number;
}

export interface ClientAuditResult {
  status: string;
  summary: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  errorChecks: number;
  findings: AuditFinding[];
  frameworkScores: Record<
    string,
    {
      total: number;
      pass: number;
      fail: number;
      warn: number;
      na: number;
      score: number;
    }
  >;
  maturitySnapshot: Array<{
    tenet: string;
    tenetName: string;
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    passRate: number;
    weightedPassRate: number;
    maturityLevel: "Traditional" | "Initial" | "Advanced" | "Optimal";
  }>;
  previousMaturity: null;
  framework: FrameworkSelection;
  durationMs: number;
  diagnostics: CollectionDiagnostics;
  rawFacts?: unknown;
}

export interface ClientAuditState {
  status: AuditStatus;
  phase: string;
  progress: string;
  completed: number;
  total: number;
  result: ClientAuditResult | null;
  error: string | null;
}

const initialState: ClientAuditState = {
  status: "idle",
  phase: "",
  progress: "",
  completed: 0,
  total: 0,
  result: null,
  error: null,
};

/**
 * Metadata for each data source: which controls depend on it and clarifying notes.
 */
const AREA_META: Record<
  string,
  { controls: string; note?: string; endpoint?: string }
> = {
  organization: {
    controls: "Tenant identity, domain validation",
    endpoint: "/organization?$select=id,displayName,verifiedDomains",
  },
  conditionalAccess: {
    controls:
      "MS.AAD.1.1, 2.x, 3.1, 3.3, 3.6–3.8, ZTA T4.x, T6.x, 800-53 AC/IA, CSF PR.AA",
    note: "Primary source for MFA enforcement, risk policies, device compliance, and session controls. MFA enforcement is verified here via CA policies — not via the MFA Registration endpoint.",
    endpoint: "/identity/conditionalAccess/policies?$top=100",
  },
  namedLocations: {
    controls: "ZTA T2.x (network location awareness)",
    note: "Empty is normal if no trusted locations are configured.",
    endpoint: "/identity/conditionalAccess/namedLocations?$top=100",
  },
  mfa: {
    controls: "MS.AAD.3.2 only (registration rate)",
    note: "Only affects the registration rate check (% of users who have registered an MFA method). MFA enforcement is evaluated via Conditional Access policies above — not this endpoint. An error here does NOT impact MFA enforcement results.",
    endpoint: "/reports/authenticationMethods/userRegistrationDetails",
  },
  authMethods: {
    controls: "MS.AAD.3.4 (migration), 3.5 (SMS/Voice)",
    note: "Checks auth method migration status and whether weak methods (SMS, Voice) are disabled.",
    endpoint: "/policies/authenticationMethodsPolicy",
  },
  authorizationPolicy: {
    controls: "MS.AAD.8.x (guest access, user consent)",
    endpoint: "/policies/authorizationPolicy",
  },
  adminConsentPolicy: {
    controls: "MS.AAD.5.3 (admin consent workflow)",
    endpoint: "/policies/adminConsentRequestPolicy",
  },
  passwordPolicy: {
    controls: "MS.AAD.6.1 (password expiry), 800-53 IA-5",
    endpoint: "/domains (password policy from domain settings)",
  },
  adminRoles: {
    controls: "MS.AAD.7.x (privileged roles), ZTA T4.4, 800-53 AC-6",
    note: "Checks Global Admin count and role assignments.",
    endpoint: "/directoryRoles?$select=id,displayName + /directoryRoles/{id}/members",
  },
  roleAssignments: {
    controls: "MS.AAD.7.3–7.5 (PIM, JIT access), 800-53 AC-2/AC-6",
    note: "Requires Entra ID P2 licensing for PIM data.",
    endpoint: "/roleManagement/directory/roleAssignments?$top=100",
  },
  devices: {
    controls: "ZTA T1.1–T1.4 (device inventory/compliance), CSF ID.AM",
    endpoint: "/deviceManagement/managedDevices?$top=100&$select=id,deviceName,complianceState",
  },
  licenses: {
    controls: "ZTA T5.x, 800-53 CM-8 (asset inventory)",
    endpoint: "/subscribedSkus?$select=skuPartNumber,prepaidUnits,consumedUnits",
  },
  securityDefaults: {
    controls: "MS.AAD.1.1 (security defaults vs. CA policies)",
    endpoint: "/policies/identitySecurityDefaultsEnforcementPolicy",
  },
  domains: {
    controls: "MS.AAD.6.1 (password policy), 800-53 IA-5",
    endpoint: "/domains?$select=id,isDefault,isVerified,passwordValidityPeriodInDays",
  },
  appRegistrations: {
    controls: "MS.AAD.5.x (app governance), 800-53 CM-7",
    endpoint: "/applications?$top=100&$select=id,displayName,signInAudience",
  },
  sensitivityLabels: {
    controls: "ZTA T4.5, 800-53 SC-13, CSF PR.DS (data protection)",
    note: "Requires Microsoft Purview / E5 licensing.",
    endpoint: "(beta) /security/informationProtection/sensitivityLabels?$top=100",
  },
};

/**
 * Inspect all 16 fact areas and build diagnostics with control mapping.
 */
function buildDiagnostics(facts: AuditFacts): AreaDiagnostic[] {
  const areas: AreaDiagnostic[] = [];

  const check = (
    area: string,
    label: string,
    obj: { available: boolean; error?: string },
    countField?: number,
  ) => {
    const meta = AREA_META[area] ?? { controls: "" };
    const base = { area, label, controls: meta.controls, note: meta.note, endpoint: meta.endpoint };

    if (obj.error) {
      areas.push({ ...base, status: "error", detail: obj.error });
    } else if (!obj.available) {
      areas.push({ ...base, status: "empty", detail: "No data returned" });
    } else if (countField !== undefined && countField === 0) {
      areas.push({ ...base, status: "ok", detail: "Available (0 items)" });
    } else {
      const count = countField !== undefined ? ` (${countField} items)` : "";
      areas.push({ ...base, status: "ok", detail: `Collected${count}` });
    }
  };

  check("organization", "Organization", facts.organization);
  check(
    "conditionalAccess",
    "Conditional Access Policies",
    facts.conditionalAccess,
    facts.conditionalAccess.totalPolicies,
  );
  check(
    "namedLocations",
    "Named Locations",
    facts.namedLocations,
    facts.namedLocations.totalLocations,
  );
  check("mfa", "MFA Registration", facts.mfa, facts.mfa.totalUsers);
  check("authMethods", "Auth Methods Policy", facts.authMethods);
  check(
    "authorizationPolicy",
    "Authorization Policy",
    facts.authorizationPolicy,
  );
  check(
    "adminConsentPolicy",
    "Admin Consent Policy",
    facts.adminConsentPolicy,
  );
  check("passwordPolicy", "Password Policy", facts.passwordPolicy);
  check(
    "adminRoles",
    "Admin Roles / Global Admins",
    facts.adminRoles,
    facts.adminRoles.globalAdminCount,
  );
  check(
    "roleAssignments",
    "PIM Role Assignments",
    facts.roleAssignments,
    facts.roleAssignments.totalAssignments,
  );
  check(
    "devices",
    "Managed Devices",
    facts.devices,
    facts.devices.totalDevices,
  );
  check("licenses", "Licenses / SKUs", facts.licenses);
  check("securityDefaults", "Security Defaults", facts.securityDefaults);
  check("domains", "Domains", facts.domains, facts.domains.totalDomains);
  check(
    "appRegistrations",
    "App Registrations",
    facts.appRegistrations,
    facts.appRegistrations.totalApps,
  );
  check(
    "sensitivityLabels",
    "Sensitivity Labels",
    facts.sensitivityLabels,
    facts.sensitivityLabels.totalLabels,
  );

  return areas;
}

export function useClientAudit() {
  const [state, setState] = useState<ClientAuditState>(initialState);

  const execute = useCallback(
    async (accessToken: string, framework: FrameworkSelection = "both") => {
      const startTime = Date.now();
      const products = FRAMEWORK_PRODUCTS[framework];
      const allControls = getAllControls().filter((c) =>
        products.includes(c.product),
      );

      setState({
        status: "running",
        phase: "Connecting",
        progress: "Creating Graph API client...",
        completed: 0,
        total: allControls.length,
        result: null,
        error: null,
      });

      try {
        const client = createGraphClient(accessToken);

        // ── PHASE 1: COLLECT ──────────────────────────────────────
        setState((s) => ({
          ...s,
          phase: "Collecting",
          progress:
            "Fetching tenant configuration from Microsoft Graph API...",
        }));

        const collectStart = Date.now();
        const facts = await collectFacts(client, (msg) => {
          setState((s) => ({ ...s, progress: msg }));
        });
        const collectEnd = Date.now();

        // Build collection diagnostics
        const areaResults = buildDiagnostics(facts);
        const okCount = areaResults.filter((a) => a.status === "ok").length;
        const errorCount = areaResults.filter(
          (a) => a.status === "error",
        ).length;
        const emptyCount = areaResults.filter(
          (a) => a.status === "empty",
        ).length;

        // ── PHASE 2: EVALUATE ─────────────────────────────────────
        setState((s) => ({
          ...s,
          phase: "Evaluating",
          progress: `Evaluating ${allControls.length} controls (${okCount} data sources OK, ${errorCount} errors)...`,
        }));

        const evalStart = Date.now();
        const findings: AuditFinding[] = [];
        let passedChecks = 0;
        let failedChecks = 0;
        let errorChecks = 0;

        for (let i = 0; i < allControls.length; i++) {
          const control = allControls[i];

          try {
            const result: EvaluatorResult = control.evaluator(facts);

            if (result.rating === "pass") passedChecks++;
            else if (result.rating === "fail") failedChecks++;
            else errorChecks++;

            findings.push({
              controlId: control.id,
              product: control.product,
              description: control.description,
              requirementLevel: control.requirementLevel,
              severity: control.severity,
              rating: result.rating,
              message: result.message,
              action: result.action ?? null,
              settingName: result.settingName ?? null,
              currentValue: result.currentValue ?? null,
              expectedValue: result.expectedValue ?? null,
              nist80053: control.nist80053,
              nistCsf: control.nistCsf ?? null,
              nist800207Tenet: control.nist800207Tenet ?? null,
            });
          } catch (err) {
            errorChecks++;
            findings.push({
              controlId: control.id,
              product: control.product,
              description: control.description,
              requirementLevel: control.requirementLevel,
              severity: control.severity,
              rating: "na",
              message: `Evaluator error: ${err instanceof Error ? err.message : "Unknown error"}`,
              action: `Review evaluator for ${control.id}`,
              nist80053: control.nist80053,
              nistCsf: control.nistCsf ?? null,
              nist800207Tenet: control.nist800207Tenet ?? null,
            });
          }

          if (i % 3 === 0 || i === allControls.length - 1) {
            setState((s) => ({
              ...s,
              completed: i + 1,
              progress: `${i + 1}/${allControls.length} — ${control.id}: ${control.description.slice(0, 60)}...`,
            }));
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        const evalEnd = Date.now();

        // ── PHASE 3: SCORING ──────────────────────────────────────
        setState((s) => ({
          ...s,
          phase: "Scoring",
          progress: "Computing framework scores and maturity levels...",
        }));

        const frameworkScores: ClientAuditResult["frameworkScores"] = {};
        for (const finding of findings) {
          const product = finding.product;
          if (!frameworkScores[product]) {
            frameworkScores[product] = {
              total: 0,
              pass: 0,
              fail: 0,
              warn: 0,
              na: 0,
              score: 0,
            };
          }
          frameworkScores[product].total++;
          const rating = finding.rating as "pass" | "fail" | "warn" | "na";
          if (rating in frameworkScores[product]) {
            frameworkScores[product][rating]++;
          }
        }
        for (const key of Object.keys(frameworkScores)) {
          const fs = frameworkScores[key];
          const applicable = fs.pass + fs.fail;
          fs.score =
            applicable > 0 ? Math.round((fs.pass / applicable) * 100) : 0;
        }

        const ztaFindings = findings
          .filter((f) => f.nist800207Tenet)
          .map((f) => ({
            product: f.product,
            rating: f.rating,
            severity: f.severity,
            nist800207Tenet: f.nist800207Tenet!,
          }));
        const snapshot = calculateMaturitySnapshot(ztaFindings);

        const durationMs = Date.now() - startTime;
        const summary = `${passedChecks} passed, ${failedChecks} failed, ${errorChecks} warnings/na`;

        const diagnostics: CollectionDiagnostics = {
          areas: areaResults,
          okCount,
          errorCount,
          emptyCount,
          collectionMs: collectEnd - collectStart,
          evaluationMs: evalEnd - evalStart,
        };

        const result: ClientAuditResult = {
          status: "completed",
          summary,
          totalChecks: allControls.length,
          passedChecks,
          failedChecks,
          errorChecks,
          findings,
          frameworkScores,
          maturitySnapshot: snapshot.tenets.map((t) => ({
            tenet: t.tenet,
            tenetName: t.tenetName,
            totalChecks: t.totalChecks,
            passedChecks: t.passedChecks,
            failedChecks: t.failedChecks,
            passRate: t.passRate,
            weightedPassRate: t.weightedPassRate,
            maturityLevel: t.maturityLevel as
              | "Traditional"
              | "Initial"
              | "Advanced"
              | "Optimal",
          })),
          previousMaturity: null,
          framework,
          durationMs,
          diagnostics,
          rawFacts: facts,
        };

        setState({
          status: "complete",
          phase: "Done",
          progress: "",
          completed: allControls.length,
          total: allControls.length,
          result,
          error: null,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        setState({
          ...initialState,
          status: "error",
          error: message,
        });
        throw err;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { ...state, execute, reset };
}
