"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ScoreOverview } from "@/components/audit/ScoreOverview";
import { ZtaMaturityRadar } from "@/components/audit/ZtaMaturityRadar";
import { FrameworkBreakdown } from "@/components/audit/FrameworkBreakdown";
import { AuditResults } from "@/components/audit/AuditResults";
import { ExportButtons } from "@/components/audit/ExportButtons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useAuth } from "@/hooks/useAuth";
import {
  useClientAudit,
  type FrameworkSelection,
  type CollectionDiagnostics,
} from "@/hooks/useClientAudit";

const FRAMEWORKS: {
  id: FrameworkSelection;
  label: string;
  subtitle: string;
  icon: string;
  controls: number;
}[] = [
  {
    id: "scuba",
    label: "CISA SCuBA",
    subtitle: "M365 security baselines",
    icon: "verified_user",
    controls: 29,
  },
  {
    id: "nist",
    label: "NIST ZTA",
    subtitle: "Zero Trust + 800-53 + CSF",
    icon: "shield",
    controls: 72,
  },
  {
    id: "both",
    label: "Both",
    subtitle: "All frameworks combined",
    icon: "layers",
    controls: 101,
  },
];

export default function AuditPage() {
  const { getToken } = useAuth();
  const audit = useClientAudit();
  const [selectedFramework, setSelectedFramework] =
    useState<FrameworkSelection>("both");

  const handleRun = async () => {
    try {
      const token = await getToken();
      await audit.execute(token, selectedFramework);
    } catch {
      // Error is already captured in audit state
    }
  };

  const result = audit.result as any;
  const hasNist =
    selectedFramework === "nist" || selectedFramework === "both";

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* ── Results header (shown when complete) ────────────────── */}
        {result && (
          <div className="space-y-6">
            {/* Title row */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-on-surface">
                  Security Audit Results
                </h1>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-sm text-on-surface-variant">
                    {new Date().toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                    Full Framework Scan
                  </span>
                </div>
              </div>
              <ExportButtons data={result} />
            </div>

            {/* Stat boxes + new audit */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-6 rounded-xl bg-surface-container-lowest px-6 py-4 shadow-lift">
                {/* Passed */}
                <div className="text-center">
                  <div className="text-2xl font-black text-primary">
                    {result.passedChecks}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Passed
                  </div>
                </div>

                <div className="h-8 w-px bg-outline-variant" />

                {/* Failed */}
                <div className="text-center">
                  <div className="border-b-2 border-tertiary text-2xl font-black text-tertiary">
                    {result.failedChecks}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Failed
                  </div>
                </div>

                <div className="h-8 w-px bg-outline-variant" />

                {/* N/A */}
                <div className="text-center">
                  <div className="text-2xl font-black text-outline">
                    {result.errorChecks ?? 0}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    N/A
                  </div>
                </div>

                <div className="h-8 w-px bg-outline-variant" />

                {/* Total + duration */}
                <div className="text-center">
                  <div className="text-2xl font-black text-on-surface">
                    {result.totalChecks}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Total
                  </div>
                </div>
              </div>

              <div className="text-xs text-outline">
                Completed in {(result.durationMs / 1000).toFixed(1)}s
              </div>

              <div className="ml-auto">
                <button
                  onClick={() => audit.reset()}
                  className="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2 text-sm font-semibold text-on-surface-variant transition hover:bg-surface-container-highest"
                >
                  <span className="material-symbols-outlined text-lg">
                    refresh
                  </span>
                  New Audit
                </button>
              </div>
            </div>

            {/* Diagnostics */}
            {result.diagnostics && (
              <DiagnosticsPanel diagnostics={result.diagnostics} />
            )}

            <ScoreOverview frameworkScores={result.frameworkScores} />

            {hasNist && result.maturitySnapshot?.length > 0 && (
              <ZtaMaturityRadar
                current={result.maturitySnapshot}
                previous={result.previousMaturity}
              />
            )}

            <FrameworkBreakdown findings={result.findings} />

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-lift">
              <h2 className="mb-4 text-lg font-bold text-on-surface">
                Audit Findings
              </h2>
              <AuditResults findings={result.findings} />
            </div>
          </div>
        )}

        {/* ── Pre-audit: header + framework selector ──────────────── */}
        {!result && (
          <>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-on-surface">
                Security Audit
              </h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                Evaluate your Microsoft 365 tenant against compliance frameworks
              </p>
            </div>

            {/* Framework selector + Run button */}
            {audit.status !== "complete" && (
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-lift">
                <div className="mb-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Select Framework
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  {/* Framework cards */}
                  <div className="flex gap-3">
                    {FRAMEWORKS.map((fw) => (
                      <button
                        key={fw.id}
                        onClick={() => setSelectedFramework(fw.id)}
                        disabled={audit.status === "running"}
                        className={`flex min-w-[150px] flex-col items-start rounded-lg border-2 px-4 py-3 text-left transition ${
                          selectedFramework === fw.id
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-outline"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-xl">
                            {fw.icon}
                          </span>
                          <span className="text-sm font-bold">{fw.label}</span>
                        </div>
                        <span className="mt-1 text-xs opacity-70">
                          {fw.subtitle}
                        </span>
                        <span className="mt-1 text-xs font-semibold">
                          {fw.controls} controls
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Run button */}
                  <button
                    onClick={handleRun}
                    disabled={audit.status === "running"}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">
                      play_arrow
                    </span>
                    {audit.status === "running" ? "Running..." : "Run Audit"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Progress with phases ────────────────────────────────── */}
        {audit.status === "running" && (
          <div className="space-y-3">
            {/* Phase indicator */}
            <div className="flex items-center gap-6 rounded-xl bg-surface-container-lowest px-6 py-4 shadow-lift">
              {["Collecting", "Evaluating", "Scoring"].map((phase, i) => {
                const isActive = audit.phase === phase;
                const isDone =
                  ["Collecting", "Evaluating", "Scoring"].indexOf(
                    audit.phase,
                  ) > i;
                return (
                  <div key={phase} className="flex items-center gap-2">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        isActive
                          ? "animate-pulse bg-primary text-white"
                          : isDone
                            ? "bg-green-500 text-white"
                            : "bg-surface-container-high text-outline"
                      }`}
                    >
                      {isDone ? (
                        <span className="material-symbols-outlined text-sm">
                          check
                        </span>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        isActive
                          ? "text-primary"
                          : isDone
                            ? "text-green-600"
                            : "text-outline"
                      }`}
                    >
                      {phase}
                    </span>
                    {i < 2 && (
                      <div
                        className={`mx-2 h-px w-8 ${
                          isDone
                            ? "bg-green-300"
                            : "bg-surface-container-high"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <ProgressBar
              message={audit.progress}
              completed={audit.completed}
              total={audit.total}
            />
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────── */}
        {audit.status === "error" && (
          <div className="flex items-start gap-3 rounded-xl border border-error/30 bg-error-container p-4">
            <span className="material-symbols-outlined mt-0.5 text-xl text-error">
              warning
            </span>
            <div>
              <div className="text-sm font-bold text-error">Audit Failed</div>
              <div className="mt-1 text-sm text-on-surface-variant">
                {audit.error}
              </div>
              <button
                onClick={handleRun}
                className="mt-3 text-sm font-bold text-error underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ── Empty / idle state ──────────────────────────────────── */}
        {audit.status === "idle" && (
          <div className="rounded-xl border border-dashed border-outline-variant py-16 text-center">
            <span className="material-symbols-outlined mb-3 text-4xl text-outline">
              security
            </span>
            <p className="text-on-surface-variant">
              Select a framework above and click{" "}
              <strong className="text-primary">Run Audit</strong> to evaluate
              your tenant.
            </p>
            <p className="mt-2 text-sm text-outline">
              The audit runs entirely in your browser -- your data never leaves
              your session.
            </p>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

/* ─── Diagnostics panel (collapsible) ───────────────────────────────── */

function DiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: CollectionDiagnostics;
}) {
  const [open, setOpen] = useState(
    diagnostics.errorCount > 0 || diagnostics.emptyCount > 0,
  );

  const hasProblems =
    diagnostics.errorCount > 0 || diagnostics.emptyCount > 0;

  return (
    <div
      className={`rounded-xl shadow-lift ${
        hasProblems
          ? "bg-amber-50"
          : "bg-surface-container-lowest"
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4"
      >
        <div className="flex items-center gap-3">
          {hasProblems ? (
            <span className="material-symbols-outlined text-xl text-amber-500">
              warning
            </span>
          ) : (
            <span className="material-symbols-outlined text-xl text-green-500">
              check_circle
            </span>
          )}
          <span className="text-sm font-bold text-on-surface">
            Collection Diagnostics
          </span>
          <span className="text-xs text-on-surface-variant">
            {diagnostics.okCount} OK
            {diagnostics.errorCount > 0 && (
              <span className="ml-1 text-error">
                &middot; {diagnostics.errorCount} errors
              </span>
            )}
            {diagnostics.emptyCount > 0 && (
              <span className="ml-1 text-amber-600">
                &middot; {diagnostics.emptyCount} empty
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-xs text-outline">
            <span className="material-symbols-outlined text-xs">schedule</span>
            Collect: {diagnostics.collectionMs}ms &middot; Eval:{" "}
            {diagnostics.evaluationMs}ms
          </div>
          <span className="material-symbols-outlined text-lg text-outline">
            {open ? "expand_less" : "expand_more"}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-outline-variant px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                <th className="pb-2 pr-4">Data Source</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Detail</th>
                <th className="pb-2">Controls Affected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high">
              {diagnostics.areas.map((area) => (
                <tr key={area.area}>
                  <td className="py-2 pr-4 font-medium text-on-surface">
                    {area.label}
                  </td>
                  <td className="py-2 pr-4">
                    {area.status === "ok" && (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <span className="material-symbols-outlined text-sm">
                          check_circle
                        </span>
                        OK
                      </span>
                    )}
                    {area.status === "error" && (
                      <span className="inline-flex items-center gap-1 text-error">
                        <span className="material-symbols-outlined text-sm">
                          cancel
                        </span>
                        Error
                      </span>
                    )}
                    {area.status === "empty" && (
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <span className="material-symbols-outlined text-sm">
                          do_not_disturb_on
                        </span>
                        Empty
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-on-surface-variant">
                    {area.detail}
                  </td>
                  <td className="py-2">
                    <span className="text-xs text-on-surface-variant">
                      {area.controls}
                    </span>
                    {area.note &&
                      (area.status === "error" ||
                        area.status === "empty") && (
                        <p className="mt-1 text-xs text-primary">
                          {area.note}
                        </p>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasProblems && (
            <div className="mt-4 rounded-lg bg-amber-100 px-4 py-3 text-xs text-amber-800">
              <strong>Note:</strong> Error or empty data sources mean those
              Graph API endpoints returned 403 (missing permissions) or empty
              data. Controls that depend on missing data evaluate as{" "}
              <strong>N/A</strong> instead of Pass/Fail. Grant the app
              additional Graph API permissions for a complete assessment.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
