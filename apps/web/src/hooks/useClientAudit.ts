"use client";

/**
 * Client-side audit hook -- runs the full audit pipeline in the browser.
 *
 * Instead of calling the backend API (which requires a deployed Hono server,
 * database, and SignalR), this hook:
 * 1. Uses the user's delegated Graph token directly
 * 2. Calls collectFacts() to gather tenant config from Graph API
 * 3. Runs all evaluators (~100+ controls) against the facts
 * 4. Computes framework scores and maturity snapshot
 * 5. Returns results in-memory (no persistence)
 */

import { useState, useCallback } from "react";
// Deep imports to avoid pulling in @omzig/db (server-only, needs tls/net/dns)
import { createGraphClient } from "@omzig/audit/graph-client";
import { collectFacts } from "@omzig/audit/fact-collector";
import { getAllControls } from "@omzig/audit/control-registry";
import { calculateMaturitySnapshot } from "@omzig/audit/maturity-calculator";
import type { EvaluatorResult } from "@omzig/audit/types";

export type AuditStatus = "idle" | "running" | "complete" | "error";

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
}

export interface ClientAuditState {
  status: AuditStatus;
  progress: string;
  completed: number;
  total: number;
  result: ClientAuditResult | null;
  error: string | null;
}

const initialState: ClientAuditState = {
  status: "idle",
  progress: "",
  completed: 0,
  total: 0,
  result: null,
  error: null,
};

export function useClientAudit() {
  const [state, setState] = useState<ClientAuditState>(initialState);

  const execute = useCallback(async (accessToken: string) => {
    const allControls = getAllControls();

    setState({
      status: "running",
      progress: "Starting audit...",
      completed: 0,
      total: allControls.length,
      result: null,
      error: null,
    });

    try {
      // Create Graph client with the user's delegated token
      const client = createGraphClient(accessToken);

      // COLLECT phase
      setState((s) => ({
        ...s,
        progress: "Collecting tenant configuration from Graph API...",
      }));

      const facts = await collectFacts(client, (msg) => {
        setState((s) => ({ ...s, progress: msg }));
      });

      // EVALUATE phase
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

        // Update progress every 5 controls to avoid excessive re-renders
        if (i % 5 === 0 || i === allControls.length - 1) {
          setState((s) => ({
            ...s,
            completed: i + 1,
            progress: `${i + 1}/${allControls.length} — Evaluating ${control.id}`,
          }));
        }
      }

      // COMPUTE framework scores
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

      // COMPUTE maturity snapshot
      const ztaFindings = findings
        .filter((f) => f.nist800207Tenet)
        .map((f) => ({
          product: f.product,
          rating: f.rating,
          severity: f.severity,
          nist800207Tenet: f.nist800207Tenet!,
        }));
      const snapshot = calculateMaturitySnapshot(ztaFindings);

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
          maturityLevel: t.maturityLevel as "Traditional" | "Initial" | "Advanced" | "Optimal",
        })),
        previousMaturity: null,
      };

      setState({
        status: "complete",
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
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { ...state, execute, reset };
}
