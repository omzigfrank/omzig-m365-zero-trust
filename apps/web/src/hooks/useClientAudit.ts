"use client";

/**
 * Client-side audit hook -- runs the full audit pipeline in the browser.
 *
 * Supports framework selection: CISA SCuBA, NIST ZTA, or both (all 4 frameworks).
 * Shows phase-by-phase progress (Collecting → Evaluating → Scoring).
 */

import { useState, useCallback } from "react";
import { createGraphClient } from "@omzig/audit/graph-client";
import { collectFacts } from "@omzig/audit/fact-collector";
import { getAllControls } from "@omzig/audit/control-registry";
import { calculateMaturitySnapshot } from "@omzig/audit/maturity-calculator";
import type { EvaluatorResult } from "@omzig/audit/types";

export type AuditStatus = "idle" | "running" | "complete" | "error";
export type FrameworkSelection = "scuba" | "nist" | "both";

/**
 * Maps user-facing framework choice → control product codes.
 * - scuba: CISA SCuBA (Entra ID baselines)
 * - nist: NIST ZTA + NIST 800-53 + NIST CSF
 * - both: all frameworks
 */
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
        // Create Graph client with the user's delegated token
        const client = createGraphClient(accessToken);

        // ── PHASE 1: COLLECT ──────────────────────────────────────
        setState((s) => ({
          ...s,
          phase: "Collecting",
          progress:
            "Fetching tenant configuration from Microsoft Graph API...",
        }));

        const facts = await collectFacts(client, (msg) => {
          setState((s) => ({ ...s, progress: msg }));
        });

        // ── PHASE 2: EVALUATE ─────────────────────────────────────
        setState((s) => ({
          ...s,
          phase: "Evaluating",
          progress: `Evaluating ${allControls.length} controls...`,
        }));

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

          // Update progress every 3 controls
          if (i % 3 === 0 || i === allControls.length - 1) {
            setState((s) => ({
              ...s,
              completed: i + 1,
              progress: `${i + 1}/${allControls.length} — ${control.id}: ${control.description.slice(0, 60)}...`,
            }));
            // Yield to the event loop so the UI can re-render
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        // ── PHASE 3: SCORING ──────────────────────────────────────
        setState((s) => ({
          ...s,
          phase: "Scoring",
          progress: "Computing framework scores and maturity levels...",
        }));

        // Compute per-framework scores
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

        // Compute maturity snapshot (only meaningful if ZTA controls included)
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
