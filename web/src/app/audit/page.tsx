"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { FrameworkSelector } from "@/components/audit/FrameworkSelector";
import { ScoreOverview } from "@/components/audit/ScoreOverview";
import { AuditResults } from "@/components/audit/AuditResults";
import { ExportButtons } from "@/components/audit/ExportButtons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/hooks/useAudit";
import { Play, RotateCcw, AlertTriangle } from "lucide-react";
import type { AuditFramework } from "@/lib/types";

export default function AuditPage() {
  const { getToken } = useAuth();
  const audit = useAudit();
  const [framework, setFramework] = useState<AuditFramework>("Both");

  const handleRun = async () => {
    try {
      const token = await getToken();
      await audit.execute(token, framework);
    } catch {
      // Error is already captured in audit state
    }
  };

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

          {audit.result && (
            <ExportButtons data={audit.result} />
          )}
        </div>

        {/* Framework selection + run button */}
        <div className="flex items-end justify-between gap-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">
              Select Framework
            </label>
            <FrameworkSelector
              value={framework}
              onChange={setFramework}
              disabled={audit.status === "running"}
            />
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
          <ProgressBar message={audit.progress} />
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
        {audit.result && (
          <>
            <ScoreOverview data={audit.result} />

            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Audit Results
              </h2>
              <AuditResults data={audit.result} />
            </div>
          </>
        )}

        {/* Empty state */}
        {audit.status === "idle" && (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">
              Select a framework and click <strong>Run Audit</strong> to
              evaluate your tenant.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              The audit will collect data from Microsoft Graph and evaluate it
              against {framework === "Both" ? "CISA SCuBA + NIST ZTA" : framework}{" "}
              controls.
            </p>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
