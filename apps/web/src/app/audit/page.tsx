"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { ScoreOverview } from "@/components/audit/ScoreOverview";
import { ZtaMaturityRadar } from "@/components/audit/ZtaMaturityRadar";
import { FrameworkBreakdown } from "@/components/audit/FrameworkBreakdown";
import { AuditResults } from "@/components/audit/AuditResults";
import { ExportButtons } from "@/components/audit/ExportButtons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useAuth } from "@/hooks/useAuth";
import { useClientAudit } from "@/hooks/useClientAudit";
import { Play, RotateCcw, AlertTriangle } from "lucide-react";

export default function AuditPage() {
  const { getToken } = useAuth();
  const audit = useClientAudit();

  const handleRun = async () => {
    try {
      const token = await getToken();
      await audit.execute(token);
    } catch {
      // Error is already captured in audit state
    }
  };

  // Cast result to any for component props — shapes are compatible, just missing DB IDs
  const result = audit.result as any;

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Security Audit
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Evaluate your Microsoft 365 tenant against compliance frameworks
            </p>
          </div>

          {result && <ExportButtons data={result} />}
        </div>

        {/* Run button */}
        <div className="flex items-center justify-between gap-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="text-sm text-gray-600">
            Scans against CISA SCuBA, NIST 800-207, NIST 800-53, and CSF 2.0
            frameworks.
          </div>

          {audit.status === "complete" ? (
            <button
              onClick={() => {
                audit.reset();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              New Audit
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={audit.status === "running"}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {audit.status === "running" ? "Running..." : "Run Audit"}
            </button>
          )}
        </div>

        {/* Progress */}
        {audit.status === "running" && (
          <ProgressBar
            message={audit.progress}
            completed={audit.completed}
            total={audit.total}
          />
        )}

        {/* Error */}
        {audit.status === "error" && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <div className="text-sm font-medium text-red-800">
                Audit Failed
              </div>
              <div className="mt-1 text-sm text-red-700">{audit.error}</div>
              <button
                onClick={handleRun}
                className="mt-3 text-sm font-medium text-red-800 underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            <ScoreOverview frameworkScores={result.frameworkScores} />

            <ZtaMaturityRadar
              current={result.maturitySnapshot}
              previous={result.previousMaturity}
            />

            <FrameworkBreakdown findings={result.findings} />

            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Audit Findings
              </h2>
              <AuditResults findings={result.findings} />
            </div>
          </>
        )}

        {/* Empty state */}
        {audit.status === "idle" && (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">
              Click <strong>Run Audit</strong> to evaluate your tenant across all
              compliance frameworks.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              The audit runs entirely in your browser — your data never leaves
              your session.
            </p>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
