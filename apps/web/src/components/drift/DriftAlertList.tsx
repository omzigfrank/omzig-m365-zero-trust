"use client";

/**
 * DriftAlertList -- Phase 8 Plan 02.
 *
 * Table of drift alerts with columns: Time, Severity, Area, Activity, Actor, Status, Actions.
 * Includes filter bar for severity and area dropdowns.
 */

import type { DriftSeverity } from "@omzig/audit";
import { DriftSeverityBadge } from "./DriftSeverityBadge";

// ── Types ─────────────────────────────────────────────────────────

export interface DriftAlertRow {
  id: string;
  area: string;
  severity: DriftSeverity;
  activityType: string;
  actorUpn: string | null;
  diffSummary: string;
  detectedAt: string;
  dismissedAt: string | null;
}

interface DriftAlertListProps {
  alerts: DriftAlertRow[];
  onAlertSelect: (alertId: string) => void;
  onDismiss: (alertId: string) => void;
  severityFilter?: DriftSeverity | null;
  areaFilter?: string | null;
  onSeverityFilterChange?: (v: DriftSeverity | null) => void;
  onAreaFilterChange?: (v: string | null) => void;
}

// ── Area display name lookup ──────────────────────────────────────

const AREA_DISPLAY_NAMES: Record<string, string> = {
  conditionalAccess: "Conditional Access",
  namedLocations: "Named Locations",
  securityDefaults: "Security Defaults",
  authMethods: "Auth Methods",
  authorizationPolicy: "Authorization Policy",
  adminRoles: "Admin Roles",
  roleAssignments: "Role Assignments",
  appRegistrations: "App Registrations",
  devices: "Devices",
  passwordPolicy: "Password Policy",
};

const AREA_OPTIONS = Object.entries(AREA_DISPLAY_NAMES).map(([k, v]) => ({
  value: k,
  label: v,
}));

const SEVERITY_OPTIONS: DriftSeverity[] = [
  "Critical",
  "High",
  "Medium",
  "Low",
];

// ── Relative time helper ──────────────────────────────────────────

function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

// ── Component ─────────────────────────────────────────────────────

export function DriftAlertList({
  alerts,
  onAlertSelect,
  onDismiss,
  severityFilter,
  areaFilter,
  onSeverityFilterChange,
  onAreaFilterChange,
}: DriftAlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 py-12 text-center">
        <span className="material-symbols-outlined mb-2 block text-[40px] text-gray-300">
          verified_user
        </span>
        <p className="text-sm font-medium text-gray-600">
          No drift alerts detected
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Changes may take up to 15 minutes to appear after a configuration
          change
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      {(onSeverityFilterChange || onAreaFilterChange) && (
        <div className="mb-4 flex items-center gap-3">
          {onSeverityFilterChange && (
            <select
              aria-label="Severity filter"
              value={severityFilter ?? ""}
              onChange={(e) =>
                onSeverityFilterChange(
                  (e.target.value as DriftSeverity) || null,
                )
              }
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
            >
              <option value="">All Severities</option>
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {onAreaFilterChange && (
            <select
              aria-label="Area filter"
              value={areaFilter ?? ""}
              onChange={(e) => onAreaFilterChange(e.target.value || null)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
            >
              <option value="">All Areas</option>
              {AREA_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Severity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Area
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Activity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Actor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {alerts.map((alert) => (
              <tr
                key={alert.id}
                data-testid={`drift-alert-row-${alert.id}`}
                onClick={() => onAlertSelect(alert.id)}
                className="cursor-pointer transition hover:bg-gray-50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  <span title={new Date(alert.detectedAt).toLocaleString()}>
                    {relativeTime(alert.detectedAt)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <DriftSeverityBadge severity={alert.severity} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-800">
                  {AREA_DISPLAY_NAMES[alert.area] ?? alert.area}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-sm text-gray-600">
                  <span title={alert.activityType}>
                    {alert.activityType.length > 50
                      ? alert.activityType.slice(0, 50) + "..."
                      : alert.activityType}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {alert.actorUpn ?? "System"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {alert.dismissedAt ? (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      Dismissed
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Active
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {!alert.dismissedAt && (
                    <button
                      aria-label="Dismiss"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismiss(alert.id);
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100"
                    >
                      Dismiss
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { AREA_DISPLAY_NAMES };
