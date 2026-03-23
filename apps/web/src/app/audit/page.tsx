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
} from "@/hooks/useClientAudit";
import {
  Play,
  RotateCcw,
  AlertTriangle,
  Shield,
  Target,
  Layers,
} from "lucide-react";

const FRAMEWORKS: {
  id: FrameworkSelection;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  controls: number;
}[] = [
  {
    id: "scuba",
    label: "CISA SCuBA",
    subtitle: "M365 security baselines",
    icon: <Shield className="h-5 w-5" />,
    controls: 29,
  },
  {
    id: "nist",
    label: "NIST ZTA",
    subtitle: "Zero Trust + 800-53 + CSF",
    icon: <Target className="h-5 w-5" />,
    controls: 72,
  },
  {
    id: "both",
    label: "Both",
    subtitle: "All frameworks combined",
    icon: <Layers className="h-5 w-5" />,
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
        {/* Header */}
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

        {/* Framework selector + Run button */}
        {audit.status !== "complete" && (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 text-sm font-medium text-gray-700">
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
                    className={`flex min-w-[140px] flex-col items-start rounded-lg border-2 px-4 py-3 text-left transition ${
                      selectedFramework === fw.id
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <div className="flex items-center gap-2">
                      {fw.icon}
                      <span className="text-sm font-semibold">{fw.label}</span>
                    </div>
                    <span className="mt-1 text-xs opacity-70">
                      {fw.subtitle}
                    </span>
                    <span className="mt-1 text-xs font-medium">
                      {fw.controls} controls
                    </span>
                  </button>
                ))}
              </div>

              {/* Run button */}
              <button
                onClick={handleRun}
                disabled={audit.status === "running"}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {audit.status === "running" ? "Running..." : "Run Audit"}
              </button>
            </div>
          </div>
        )}

        {/* Progress with phases */}
        {audit.status === "running" && (
          <div className="space-y-3">
            {/* Phase indicator */}
            <div className="flex items-center gap-6 rounded-xl border border-gray-200 bg-white px-6 py-4">
              {["Collecting", "Evaluating", "Scoring"].map((phase, i) => {
                const isActive = audit.phase === phase;
                const isDone =
                  ["Collecting", "Evaluating", "Scoring"].indexOf(
                    audit.phase,
                  ) > i;
                return (
                  <div key={phase} className="flex items-center gap-2">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isActive
                          ? "animate-pulse bg-blue-600 text-white"
                          : isDone
                            ? "bg-green-500 text-white"
                            : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {isDone ? "\u2713" : i + 1}
                    </div>
                    <span
                      className={`text-sm ${isActive ? "font-medium text-blue-700" : isDone ? "text-green-700" : "text-gray-400"}`}
                    >
                      {phase}
                    </span>
                    {i < 2 && (
                      <div
                        className={`mx-2 h-px w-8 ${isDone ? "bg-green-300" : "bg-gray-200"}`}
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
            {/* Summary banner */}
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4">
              <div className="flex items-center gap-6">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">
                    {result.totalChecks}
                  </span>{" "}
                  controls evaluated
                </div>
                <div className="text-sm">
                  <span className="font-semibold text-green-600">
                    {result.passedChecks} passed
                  </span>
                  {" / "}
                  <span className="font-semibold text-red-600">
                    {result.failedChecks} failed
                  </span>
                  {result.errorChecks > 0 && (
                    <>
                      {" / "}
                      <span className="font-semibold text-yellow-600">
                        {result.errorChecks} n/a
                      </span>
                    </>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  Completed in {(result.durationMs / 1000).toFixed(1)}s
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => audit.reset()}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  New Audit
                </button>
              </div>
            </div>

            <ScoreOverview frameworkScores={result.frameworkScores} />

            {hasNist && result.maturitySnapshot?.length > 0 && (
              <ZtaMaturityRadar
                current={result.maturitySnapshot}
                previous={result.previousMaturity}
              />
            )}

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
              Select a framework above and click{" "}
              <strong>Run Audit</strong> to evaluate your tenant.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              The audit runs entirely in your browser — your data never
              leaves your session.
            </p>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
