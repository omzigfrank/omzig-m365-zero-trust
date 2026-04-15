"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { apiClient } from "@/lib/api-client";

export interface ScheduleSettingsProps {
  tenantId: string;
}

type Frequency = "disabled" | "daily" | "weekly";

interface ScheduleResponse {
  frequency: Frequency | null;
  nextRunAt: string | null;
}

function formatNextRun(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Schedule configuration form for a tenant.
 *
 * Loads current schedule on mount, lets an admin pick Disabled / Daily /
 * Weekly, and PATCHes /api/tenants/:tenantId/schedule on save. Displays
 * the next computed run time when a schedule is active.
 *
 * Phase 6 Plan 01 (TENANT-05, TENANT-06).
 */
export function ScheduleSettings({ tenantId }: ScheduleSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>("disabled");
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const res = await apiClient.get<ScheduleResponse>(
          `/api/tenants/${tenantId}/schedule`,
        );
        if (cancelled) return;
        if (res.error) {
          setFeedback({ kind: "error", text: res.error.message });
          return;
        }
        const data = res.data!;
        setFrequency((data.frequency as Frequency) ?? "disabled");
        setNextRunAt(data.nextRunAt);
      } catch (err) {
        if (!cancelled) {
          setFeedback({
            kind: "error",
            text: err instanceof Error ? err.message : "Failed to load schedule",
          });
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

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiClient.patch<ScheduleResponse>(
        `/api/tenants/${tenantId}/schedule`,
        { frequency },
      );
      if (res.error) {
        setFeedback({ kind: "error", text: res.error.message });
        return;
      }
      const data = res.data!;
      setFrequency((data.frequency as Frequency) ?? "disabled");
      setNextRunAt(data.nextRunAt);
      setFeedback({ kind: "success", text: "Schedule updated." });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to save schedule",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-gray-500" />
        <h3 className="text-base font-semibold text-gray-900">Scan Schedule</h3>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading schedule...</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="schedule-frequency"
                className="mb-1 block text-xs font-medium text-gray-700"
              >
                Frequency
              </label>
              <select
                id="schedule-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={saving}
              >
                <option value="disabled">Disabled</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          {nextRunAt && frequency !== "disabled" && (
            <div className="text-sm text-gray-600">
              Next scan:{" "}
              <span className="font-medium text-gray-900">
                {formatNextRun(nextRunAt)}
              </span>
            </div>
          )}

          {feedback && (
            <div
              className={
                "text-sm " +
                (feedback.kind === "success"
                  ? "text-green-700"
                  : "text-red-700")
              }
            >
              {feedback.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
