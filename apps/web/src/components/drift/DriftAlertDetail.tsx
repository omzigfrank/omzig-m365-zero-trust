"use client";

/**
 * DriftAlertDetail -- Phase 8 Plan 02.
 *
 * Detail view for a single drift alert with before/after JSON diff,
 * human-readable summary, actor info, severity badge, and remediation link.
 *
 * Renders as a drawer/overlay panel.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "@/lib/api-client";
import { DriftSeverityBadge } from "./DriftSeverityBadge";
import { AREA_DISPLAY_NAMES } from "./DriftAlertList";
import type { DriftSeverity } from "@omzig/audit";

// ── Types ─────────────────────────────────────────────────────────

interface DriftAlertFull {
  id: string;
  area: string;
  severity: DriftSeverity;
  activityType: string;
  actorUpn: string | null;
  beforeSnapshot: string | null;
  afterSnapshot: string | null;
  diffSummary: string;
  auditEventId: string | null;
  detectedAt: string;
  dismissedAt: string | null;
  dismissedBy: string | null;
  remediationJobId: string | null;
}

interface DriftAlertDetailProps {
  alertId: string;
  tenantId: string;
  onClose: () => void;
  onDismiss: (alertId: string) => void;
}

// ── Diff highlighting helper ──────────────────────────────────────

function highlightDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Set<string> {
  const changed = new Set<string>();
  if (!before || !after) return changed;
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.add(key);
    }
  }
  return changed;
}

// ── Component ─────────────────────────────────────────────────────

export function DriftAlertDetail({
  alertId,
  tenantId,
  onClose,
  onDismiss,
}: DriftAlertDetailProps) {
  const [alert, setAlert] = useState<DriftAlertFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDetail() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<DriftAlertFull>(
          `/tenants/${tenantId}/drift-alerts/${alertId}`,
          tenantId,
        );
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message || "Failed to fetch drift alert detail");
          return;
        }
        setAlert(res.data!);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to fetch detail",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [alertId, tenantId]);

  const beforeObj = alert?.beforeSnapshot
    ? (() => {
        try {
          return JSON.parse(alert.beforeSnapshot) as Record<string, unknown>;
        } catch {
          return null;
        }
      })()
    : null;

  const afterObj = alert?.afterSnapshot
    ? (() => {
        try {
          return JSON.parse(alert.afterSnapshot) as Record<string, unknown>;
        } catch {
          return null;
        }
      })()
    : null;

  const changedKeys = highlightDiff(beforeObj, afterObj);

  const drawerContent = (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Drawer */}
      <div className="relative w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="p-6">
          {loading && (
            <div className="space-y-3">
              <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-64 animate-pulse rounded bg-gray-100" />
              <div className="h-32 animate-pulse rounded bg-gray-100" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {alert && !loading && (
            <>
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3">
                  <DriftSeverityBadge severity={alert.severity} />
                  <h2 className="text-lg font-semibold text-gray-900">
                    {AREA_DISPLAY_NAMES[alert.area] ?? alert.area}
                  </h2>
                </div>
                <p
                  className="mt-2 text-sm text-gray-600"
                  data-testid="drift-detail-activity"
                >
                  {alert.activityType}
                </p>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <span>
                    Detected:{" "}
                    {new Date(alert.detectedAt).toLocaleString()}
                  </span>
                  <span data-testid="drift-detail-actor">
                    Actor: {alert.actorUpn ?? "System action"}
                  </span>
                </div>
                <div className="mt-2">
                  {alert.dismissedAt ? (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      Dismissed
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Active
                    </span>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900">
                  What Changed
                </h3>
                <div
                  className="mt-2 rounded-lg bg-gray-50 p-4 text-sm text-gray-700"
                  data-testid="drift-detail-summary"
                >
                  {alert.diffSummary}
                </div>
                <div className="mt-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                  Note: Configuration changes may take up to 15 minutes to
                  appear in the audit log.
                </div>
              </div>

              {/* Before/After comparison */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900">
                  Before / After
                </h3>
                <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Before */}
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-gray-500">
                      Before
                    </h4>
                    {beforeObj ? (
                      <pre
                        className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs"
                        data-testid="drift-detail-before"
                      >
                        {Object.entries(beforeObj).map(([key, value]) => (
                          <div
                            key={key}
                            className={
                              changedKeys.has(key) ? "bg-yellow-100" : ""
                            }
                          >
                            {`"${key}": ${JSON.stringify(value, null, 2)}`}
                          </div>
                        ))}
                      </pre>
                    ) : (
                      <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-400">
                        Snapshot not available
                      </p>
                    )}
                  </div>

                  {/* After */}
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-gray-500">
                      After
                    </h4>
                    {afterObj ? (
                      <pre
                        className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs"
                        data-testid="drift-detail-after"
                      >
                        {Object.entries(afterObj).map(([key, value]) => (
                          <div
                            key={key}
                            className={
                              changedKeys.has(key) ? "bg-green-100" : ""
                            }
                          >
                            {`"${key}": ${JSON.stringify(value, null, 2)}`}
                          </div>
                        ))}
                      </pre>
                    ) : (
                      <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-400">
                        Snapshot not available
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Remediation link */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900">
                  Affected Controls
                </h3>
                <p className="mt-2 text-xs text-gray-500">
                  Run a new audit on this tenant to identify which security
                  controls are affected by this configuration drift.
                </p>
                <a
                  href={`/tenants/${tenantId}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-omzig-400 hover:underline"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    security
                  </span>
                  Go to tenant audit
                </a>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 border-t border-gray-200 pt-4">
                {!alert.dismissedAt && (
                  <button
                    onClick={() => onDismiss(alert.id)}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                    data-testid="drift-detail-dismiss"
                  >
                    Dismiss
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(drawerContent, document.body);
}
