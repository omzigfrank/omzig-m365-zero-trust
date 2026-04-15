"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ScoreOverview } from "@/components/audit/ScoreOverview";
import { ZtaMaturityRadar } from "@/components/audit/ZtaMaturityRadar";
import { FrameworkBreakdown } from "@/components/audit/FrameworkBreakdown";
import { AuditResults } from "@/components/audit/AuditResults";
import { TrendChart } from "@/components/audit/TrendChart";
import { AuditHistoryList } from "@/components/audit/AuditHistoryList";
import {
  TimeRangeSelector,
  timeRangeCutoff,
  type TimeRange,
} from "@/components/audit/TimeRangeSelector";
import { HealthDot } from "@/components/tenants/HealthDot";
import { ScheduleSettings } from "@/components/tenants/ScheduleSettings";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/hooks/useAudit";
import { useAuditHistory } from "@/hooks/useAuditHistory";
import { fetchTenantDetail } from "@/lib/tenant-api";
import type { TenantSummary } from "@omzig/shared";
import {
  ChevronRight,
  Play,
  RotateCcw,
  AlertTriangle,
  Settings,
} from "lucide-react";

type TabId = "overview" | "findings" | "history" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "findings", label: "Findings" },
  { id: "history", label: "Audit History" },
  { id: "settings", label: "Settings" },
];

export default function TenantDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [timeRange, setTimeRange] = useState<TimeRange>("90d");

  const audit = useAudit(tenantId);
  const auditHistory = useAuditHistory(tenantId);

  // Filter history by selected time range
  const filteredHistory = (() => {
    const cutoff = timeRangeCutoff(timeRange);
    if (!cutoff) return auditHistory.data;
    return auditHistory.data.filter((p) => {
      if (!p.completedAt) return false;
      return new Date(p.completedAt).getTime() >= cutoff.getTime();
    });
  })();

  // Fetch tenant detail on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const data = await fetchTenantDetail(tenantId);
        if (!cancelled) {
          setTenant(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch tenant",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const handleRunAudit = async () => {
    try {
      const token = await getToken();
      await audit.execute(token);
    } catch {
      // Error captured in audit state
    }
  };

  // Loading state
  if (loading) {
    return (
      <AuthGuard>
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="text-sm text-gray-500">Loading tenant details...</div>
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
          </div>
        </div>
      </AuthGuard>
    );
  }

  // Error / Not found state
  if (error || !tenant) {
    return (
      <AuthGuard>
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <div className="text-sm font-medium text-red-800">
                {error ?? "Tenant not found"}
              </div>
              <button
                onClick={() => router.push("/tenants")}
                className="mt-3 text-sm font-medium text-red-800 underline hover:no-underline"
              >
                Back to Tenants
              </button>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm text-gray-500">
          <button
            onClick={() => router.push("/tenants")}
            className="hover:text-blue-600 hover:underline"
          >
            Tenants
          </button>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-gray-900">
            {tenant.displayName}
          </span>
        </nav>

        {/* Tenant header */}
        <div className="flex items-start justify-between rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <HealthDot health={tenant.health} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {tenant.displayName}
              </h1>
              {tenant.primaryDomain && (
                <p className="text-sm text-gray-500">{tenant.primaryDomain}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 capitalize">
                  {tenant.status}
                </span>
                {tenant.connectionMethod && (
                  <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {tenant.connectionMethod === "oauth" ? "OAuth" : "GDAP"}
                  </span>
                )}
                {tenant.lastAuditAt && (
                  <span className="text-xs text-gray-400">
                    Last audit:{" "}
                    {new Date(tenant.lastAuditAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Run Audit button */}
          <div className="flex items-center gap-2">
            {audit.status === "complete" ? (
              <button
                onClick={() => audit.reset()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <RotateCcw className="h-4 w-4" />
                New Audit
              </button>
            ) : (
              <button
                onClick={handleRunAudit}
                disabled={audit.status === "running"}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {audit.status === "running" ? "Running..." : "Run Audit"}
              </button>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {audit.result && (
              <>
                <ScoreOverview frameworkScores={audit.result.frameworkScores} />
                <ZtaMaturityRadar
                  current={audit.result.maturitySnapshot}
                  previous={audit.result.previousMaturity}
                />
                <FrameworkBreakdown findings={audit.result.findings} />
              </>
            )}
            {!audit.result && audit.status === "idle" && (
              <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
                <p className="text-gray-500">
                  Click <strong>Run Audit</strong> to evaluate this tenant
                  across all compliance frameworks.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "findings" && (
          <div className="space-y-4">
            {audit.result ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  Audit Findings
                </h2>
                <AuditResults findings={audit.result.findings} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
                <p className="text-gray-500">
                  Run an audit to see findings for this tenant.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Audit History
              </h2>
              <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            </div>

            {auditHistory.loading && (
              <div className="space-y-4">
                <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
                <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
              </div>
            )}

            {!auditHistory.loading && auditHistory.error && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
                <div>
                  <div className="text-sm font-medium text-red-800">
                    Failed to load audit history
                  </div>
                  <div className="mt-1 text-sm text-red-700">
                    {auditHistory.error}
                  </div>
                  <button
                    onClick={() => auditHistory.refetch()}
                    className="mt-3 text-sm font-medium text-red-800 underline hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {!auditHistory.loading && !auditHistory.error && (
              <>
                <TrendChart data={filteredHistory} />
                <AuditHistoryList
                  data={filteredHistory}
                  tenantId={tenantId}
                />
              </>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Tenant Settings
                </h2>
              </div>
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">
                    M365 Tenant ID
                  </span>
                  <span className="text-sm font-mono text-gray-500">
                    {tenant.m365TenantId}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">
                    Connection Method
                  </span>
                  <span className="text-sm text-gray-500 capitalize">
                    {tenant.connectionMethod ?? "None"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">
                    Created At
                  </span>
                  <span className="text-sm text-gray-500">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Phase 6 Plan 01: Scheduled scan configuration */}
            <ScheduleSettings tenantId={tenantId} />
          </div>
        )}

        {/* Audit error */}
        {audit.status === "error" && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <div className="text-sm font-medium text-red-800">
                Audit Failed
              </div>
              <div className="mt-1 text-sm text-red-700">{audit.error}</div>
              <button
                onClick={handleRunAudit}
                className="mt-3 text-sm font-medium text-red-800 underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
