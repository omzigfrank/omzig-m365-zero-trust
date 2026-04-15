"use client";

import { useRouter } from "next/navigation";
import type { AuditHistoryPoint } from "@/hooks/useAuditHistory";

interface AuditHistoryListProps {
  data: AuditHistoryPoint[];
  tenantId: string;
}

function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return "--";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function statusBadge(status: string): { cls: string; label: string } {
  const s = status.toLowerCase();
  if (s === "completed" || s === "complete") {
    return { cls: "bg-green-100 text-green-800", label: "Completed" };
  }
  if (s === "failed" || s === "error") {
    return { cls: "bg-red-100 text-red-800", label: "Failed" };
  }
  if (s === "running" || s === "pending") {
    return { cls: "bg-yellow-100 text-yellow-800", label: "Running" };
  }
  return { cls: "bg-gray-100 text-gray-700", label: status };
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

export function AuditHistoryList({ data, tenantId }: AuditHistoryListProps) {
  const router = useRouter();

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-500">No audit runs in this time range.</p>
      </div>
    );
  }

  // Most recent first
  const sorted = [...data].sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Duration
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Checks
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Score
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {sorted.map((run) => {
            const badge = statusBadge(run.status);
            return (
              <tr
                key={run.auditId}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => router.push(`/tenants/${tenantId}`)}
              >
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                  {formatDateTime(run.completedAt ?? run.startedAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {formatDuration(run.duration)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {run.passedChecks}/{run.totalChecks} passed
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${scoreColor(
                    run.overallScore,
                  )}`}
                >
                  {run.overallScore}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
