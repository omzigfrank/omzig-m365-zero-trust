"use client";

/**
 * useDriftConfig -- Phase 8 Plan 02.
 *
 * Hook for fetching and saving drift configuration (polling interval).
 */

import { useState, useCallback, useEffect } from "react";
import { apiClient } from "@/lib/api-client";

export function useDriftConfig(tenantId: string) {
  const [intervalMinutes, setIntervalMinutes] = useState<number>(15);
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{
        intervalMinutes: number;
        lastPollAt: string | null;
      }>(`/tenants/${tenantId}/drift-config`, tenantId);

      if (res.error) {
        setError(res.error.message || "Failed to fetch drift config");
        return;
      }

      setIntervalMinutes(res.data!.intervalMinutes);
      setLastPollAt(res.data!.lastPollAt);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch drift config",
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(
    async (newInterval: number) => {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);
      try {
        const res = await apiClient.patch<{
          intervalMinutes: number;
          lastPollAt: string | null;
        }>(
          `/tenants/${tenantId}/drift-config`,
          { intervalMinutes: newInterval },
          tenantId,
        );

        if (res.error) {
          setError(res.error.message || "Failed to save drift config");
          return;
        }

        setIntervalMinutes(res.data!.intervalMinutes);
        setLastPollAt(res.data!.lastPollAt);
        setSaveSuccess(true);
        // Clear success message after 3s
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save drift config",
        );
      } finally {
        setSaving(false);
      }
    },
    [tenantId],
  );

  return {
    intervalMinutes,
    lastPollAt,
    loading,
    saving,
    error,
    saveSuccess,
    saveConfig,
  };
}
