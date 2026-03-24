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
  const [showRawData, setShowRawData] = useState(false);

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
                <h1 className="text-4xl font-black tracking-tight text-gray-800">
                  Security Audit Results
                </h1>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {new Date().toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                  <span className="rounded bg-omzig-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-omzig-400">
                    Full Framework Scan
                  </span>
                </div>
              </div>
              <ExportButtons data={result} />
            </div>

            {/* Stat boxes + new audit */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-6 rounded bg-white px-6 py-4 shadow-card">
                {/* Passed */}
                <div className="text-center">
                  <div className="text-2xl font-black text-green-600">
                    {result.passedChecks}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Passed
                  </div>
                </div>

                <div className="h-8 w-px bg-gray-200" />

                {/* Failed */}
                <div className="text-center">
                  <div className="text-2xl font-black text-red-600">
                    {result.failedChecks}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Failed
                  </div>
                </div>

                <div className="h-8 w-px bg-gray-200" />

                {/* N/A */}
                <div className="text-center">
                  <div className="text-2xl font-black text-gray-400">
                    {result.errorChecks ?? 0}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    N/A
                  </div>
                </div>

                <div className="h-8 w-px bg-gray-200" />

                {/* Total + duration */}
                <div className="text-center">
                  <div className="text-2xl font-black text-gray-800">
                    {result.totalChecks}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Total
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-400">
                Completed in {(result.durationMs / 1000).toFixed(1)}s
              </div>

              <div className="ml-auto">
                <button
                  onClick={() => audit.reset()}
                  className="inline-flex items-center gap-2 rounded border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
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

            {/* Raw Data Viewer */}
            <div>
              <button
                onClick={() => setShowRawData(!showRawData)}
                className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                <span className="material-symbols-outlined text-[16px]">
                  data_object
                </span>
                {showRawData ? "Hide Raw Data" : "View Raw Data"}
              </button>
              {showRawData && (
                <pre className="mt-3 max-h-96 overflow-auto rounded bg-gray-800 p-4 text-xs text-green-400">
                  {JSON.stringify(result.rawFacts, null, 2)}
                </pre>
              )}
            </div>

            <ScoreOverview frameworkScores={result.frameworkScores} />

            {hasNist && result.maturitySnapshot?.length > 0 && (
              <ZtaMaturityRadar
                current={result.maturitySnapshot}
                previous={result.previousMaturity}
              />
            )}

            <FrameworkBreakdown findings={result.findings} />

            <div className="rounded bg-white p-6 shadow-card">
              <h2 className="mb-4 text-lg font-bold text-gray-800">
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
              <h1 className="text-4xl font-black tracking-tight text-gray-800">
                Security Audit
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Evaluate your Microsoft 365 tenant against compliance frameworks
              </p>
            </div>

            {/* Framework selector + Run button */}
            {audit.status !== "complete" && (
              <div className="rounded bg-white p-6 shadow-card">
                <div className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-500">
                  Select Framework
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  {/* Framework cards */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {FRAMEWORKS.map((fw) => (
                      <button
                        key={fw.id}
                        onClick={() => setSelectedFramework(fw.id)}
                        disabled={audit.status === "running"}
                        className={`flex min-w-[150px] flex-col items-start rounded border px-4 py-3 text-left transition ${
                          selectedFramework === fw.id
                            ? "border-omzig-400 bg-omzig-400/5 text-omzig-400"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
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
                    className="inline-flex items-center gap-2 rounded bg-omzig-400 px-6 py-3 text-sm font-bold text-white transition hover:bg-omzig-500 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="flex flex-wrap items-center gap-4 rounded bg-white px-4 py-4 shadow-card sm:gap-6 sm:px-6">
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
                          ? "animate-pulse bg-omzig-400 text-white"
                          : isDone
                            ? "bg-green-500 text-white"
                            : "bg-gray-200 text-gray-400"
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
                          ? "text-omzig-400"
                          : isDone
                            ? "text-green-600"
                            : "text-gray-400"
                      }`}
                    >
                      {phase}
                    </span>
                    {i < 2 && (
                      <div
                        className={`mx-2 h-px w-8 ${
                          isDone
                            ? "bg-green-300"
                            : "bg-gray-200"
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
          <div className="flex items-start gap-3 rounded border border-red-200 bg-red-50 p-4">
            <span className="material-symbols-outlined mt-0.5 text-xl text-red-500">
              warning
            </span>
            <div>
              <div className="text-sm font-bold text-red-600">Audit Failed</div>
              <div className="mt-1 text-sm text-gray-600">
                {audit.error}
              </div>
              <button
                onClick={handleRun}
                className="mt-3 text-sm font-bold text-red-600 underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ── Empty / idle state ──────────────────────────────────── */}
        {audit.status === "idle" && (
          <div className="rounded border border-dashed border-gray-300 py-16 text-center">
            <span className="material-symbols-outlined mb-3 text-4xl text-gray-400">
              security
            </span>
            <p className="text-gray-600">
              Select a framework above and click{" "}
              <strong className="text-omzig-400">Run Audit</strong> to evaluate
              your tenant.
            </p>
            <p className="mt-2 text-sm text-gray-400">
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
      className={`rounded shadow-card ${
        hasProblems
          ? "bg-amber-50"
          : "bg-white"
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
          <span className="text-sm font-bold text-gray-800">
            Collection Diagnostics
          </span>
          <span className="text-xs text-gray-500">
            {diagnostics.okCount} OK
            {diagnostics.errorCount > 0 && (
              <span className="ml-1 text-red-600">
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
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="material-symbols-outlined text-xs">schedule</span>
            Collect: {diagnostics.collectionMs}ms &middot; Eval:{" "}
            {diagnostics.evaluationMs}ms
          </div>
          <span className="material-symbols-outlined text-lg text-gray-400">
            {open ? "expand_less" : "expand_more"}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-6 py-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-widest text-gray-500">
                  <th className="pb-2 pr-4">Data Source</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Detail</th>
                  <th className="pb-2 pr-4">Controls Affected</th>
                  <th className="pb-2">API Endpoint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diagnostics.areas.map((area) => (
                  <tr key={area.area}>
                    <td className="py-2 pr-4 font-medium text-gray-800">
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
                        <span className="inline-flex items-center gap-1 text-red-600">
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
                    <td className="py-2 pr-4 text-gray-500">
                      {area.detail}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs text-gray-500">
                        {area.controls}
                      </span>
                      {area.note &&
                        (area.status === "error" ||
                          area.status === "empty") && (
                          <p className="mt-1 text-xs text-omzig-400">
                            {area.note}
                          </p>
                        )}
                    </td>
                    <td className="py-2 font-mono text-[10px] text-gray-400">
                      {area.endpoint || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasProblems && (
            <div className="mt-4 rounded bg-amber-100 px-4 py-3 text-xs text-amber-800">
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
