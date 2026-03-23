"use client";

import { useRouter } from "next/navigation";
import type { TenantSummary } from "@omzig/shared";
import { HealthDot } from "./HealthDot";
import { Trash2 } from "lucide-react";

/** Map framework product codes to short labels */
const FW_LABELS: Record<string, string> = {
  AAD: "SCuBA",
  ZTA: "ZTA",
  "80053": "800-53",
  CSF: "CSF",
};

const FW_ORDER = ["AAD", "ZTA", "80053", "CSF"] as const;

/** Simple relative time formatter */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TenantCardProps {
  tenant: TenantSummary;
  onRemove: (id: string) => void;
}

export function TenantCard({ tenant, onRemove }: TenantCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/tenants/${tenant.id}`);
  };

  return (
    <div
      data-testid="tenant-card"
      onClick={handleClick}
      className="group relative cursor-pointer rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      {/* Header: Name + Health dot */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HealthDot health={tenant.health} />
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {tenant.displayName}
          </h3>
        </div>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tenant.id);
          }}
          className="rounded p-1 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
          aria-label={`Remove ${tenant.displayName}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Status badge for non-active states */}
      {tenant.status !== "active" && (
        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {tenant.status}
        </span>
      )}

      {/* Overall score */}
      <div className="mt-4 text-center">
        <div className="text-3xl font-bold text-gray-900">
          {tenant.overallScore !== null ? tenant.overallScore : "--"}
        </div>
        <div className="text-xs text-gray-500">Overall Score</div>
      </div>

      {/* Framework mini scores */}
      <div className="mt-3 grid grid-cols-4 gap-1">
        {FW_ORDER.map((key) => {
          const score = tenant.frameworkScores?.[key];
          return (
            <div key={key} className="text-center">
              <div className="text-xs font-medium text-gray-400">
                {FW_LABELS[key]}
              </div>
              <div className="text-sm font-semibold text-gray-700">
                {score !== undefined ? score : "--"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: last audit + critical findings */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>
          {tenant.lastAuditAt ? relativeTime(tenant.lastAuditAt) : "No audit"}
        </span>
        {tenant.criticalFindingsCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {tenant.criticalFindingsCount}
          </span>
        )}
      </div>
    </div>
  );
}
