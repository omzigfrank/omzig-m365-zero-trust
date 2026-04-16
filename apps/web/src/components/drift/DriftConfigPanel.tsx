"use client";

/**
 * DriftConfigPanel -- Phase 8 Plan 02.
 *
 * Polling interval configuration for drift monitoring.
 * Admin-only: non-Admin users see a disabled Save button.
 */

import { useState, useEffect } from "react";
import { useDriftConfig } from "@/hooks/useDriftConfig";
import { useAuth } from "@/hooks/useAuth";

const INTERVAL_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "60 minutes" },
];

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

interface DriftConfigPanelProps {
  tenantId: string;
}

export function DriftConfigPanel({ tenantId }: DriftConfigPanelProps) {
  const {
    intervalMinutes,
    lastPollAt,
    loading,
    saving,
    error,
    saveSuccess,
    saveConfig,
  } = useDriftConfig(tenantId);
  const { highestRole } = useAuth();
  const isAdmin = highestRole === "Admin" || highestRole === "Owner";

  const [selectedInterval, setSelectedInterval] = useState(15);

  useEffect(() => {
    if (!loading) {
      setSelectedInterval(intervalMinutes);
    }
  }, [intervalMinutes, loading]);

  const handleSave = () => {
    saveConfig(selectedInterval);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-omzig-400">
          sync
        </span>
        <h3 className="text-sm font-semibold text-gray-900">
          Drift Monitoring
        </h3>
      </div>

      <div className="mt-4">
        <label
          htmlFor="drift-interval"
          className="block text-xs font-medium text-gray-600"
        >
          Check interval
        </label>
        <div className="mt-1.5 flex items-center gap-3">
          <select
            id="drift-interval"
            value={selectedInterval}
            onChange={(e) => setSelectedInterval(Number(e.target.value))}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            onClick={handleSave}
            disabled={!isAdmin || saving || loading}
            className="rounded-md bg-omzig-400 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-omzig-400/90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Save"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {!isAdmin && (
          <p className="mt-2 text-xs text-gray-400">
            Only Admin users can change the drift check interval.
          </p>
        )}
      </div>

      {/* Feedback */}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {saveSuccess && (
        <p className="mt-3 text-xs text-green-600">
          Configuration saved successfully.
        </p>
      )}

      {/* Last checked */}
      {lastPollAt && (
        <p className="mt-3 text-xs text-gray-400">
          Last checked: {relativeTime(lastPollAt)}
        </p>
      )}
    </div>
  );
}
