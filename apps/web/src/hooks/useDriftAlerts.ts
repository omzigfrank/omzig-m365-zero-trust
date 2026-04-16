"use client";

/**
 * useDriftAlerts -- Phase 8 Plan 02.
 *
 * Hook for fetching drift alerts with filtering and SignalR real-time
 * subscription. Mirrors the useAudit.ts + useRemediation.ts patterns.
 *
 * When a SignalR 'driftAlert' message arrives for the current tenantId,
 * the new alert is prepended to the list.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  HubConnectionBuilder,
  HubConnectionState,
  type HubConnection,
} from "@microsoft/signalr";
import { apiClient } from "@/lib/api-client";
import type { DriftSeverity, DriftAlertMessage } from "@omzig/audit";

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

type StatusFilter = "active" | "dismissed";

// ── Hook ──────────────────────────────────────────────────────────

export function useDriftAlerts(tenantId: string | null) {
  const [alerts, setAlerts] = useState<DriftAlertRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [severityFilter, setSeverityFilter] =
    useState<DriftSeverity | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);

  const connectionRef = useRef<HubConnection | null>(null);
  const tenantIdRef = useRef(tenantId);
  tenantIdRef.current = tenantId;

  // ── Fetch alerts ──────────────────────────────────────────────

  const fetchAlerts = useCallback(async () => {
    if (!tenantId) {
      setAlerts([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let path = `/tenants/${tenantId}/drift-alerts?page=${page}&pageSize=20&status=${statusFilter}`;
      if (severityFilter) path += `&severity=${severityFilter}`;
      if (areaFilter) path += `&area=${areaFilter}`;

      const res = await apiClient.get<{
        data: DriftAlertRow[];
        total: number;
        page: number;
        pageSize: number;
      }>(path, tenantId);

      if (res.error) {
        setError(res.error.message || "Failed to fetch drift alerts");
        return;
      }

      const body = res.data!;
      setAlerts(body.data);
      setTotal(body.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch drift alerts",
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, severityFilter, areaFilter, statusFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // ── SignalR subscription ──────────────────────────────────────

  useEffect(() => {
    if (!tenantId) return;

    let connection: HubConnection | null = null;

    async function connectSignalR() {
      try {
        const negotiateRes = await apiClient.get<{
          url: string;
          accessToken: string;
        }>("/signalr/negotiate");

        if (negotiateRes.error || !negotiateRes.data) return;

        const { url, accessToken } = negotiateRes.data;

        connection = new HubConnectionBuilder()
          .withUrl(url, { accessTokenFactory: () => accessToken })
          .withAutomaticReconnect()
          .build();

        connection.on("driftAlert", (msg: DriftAlertMessage) => {
          // Only prepend if the message is for the current tenant
          if (msg.tenantId !== tenantIdRef.current) return;

          const newAlert: DriftAlertRow = {
            id: msg.driftAlertId,
            area: msg.area,
            severity: msg.severity,
            activityType: msg.activityType,
            actorUpn: msg.actorUpn,
            diffSummary: msg.diffSummary,
            detectedAt: msg.detectedAt,
            dismissedAt: null,
          };

          setAlerts((prev) => [newAlert, ...prev]);
          setTotal((prev) => prev + 1);
        });

        await connection.start();
        connectionRef.current = connection;
      } catch {
        // SignalR unavailable -- rely on manual refresh
      }
    }

    connectSignalR();

    return () => {
      if (
        connection &&
        connection.state !== HubConnectionState.Disconnected
      ) {
        connection.stop().catch(() => {});
      }
      connectionRef.current = null;
    };
  }, [tenantId]);

  // ── Dismiss alert ─────────────────────────────────────────────

  const dismissAlert = useCallback(
    async (alertId: string) => {
      if (!tenantId) return;

      // Optimistic update
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, dismissedAt: new Date().toISOString() }
            : a,
        ),
      );

      try {
        const res = await apiClient.post(
          `/tenants/${tenantId}/drift-alerts/${alertId}/dismiss`,
          {},
          tenantId,
        );
        if (res.error) {
          // Revert on failure
          setAlerts((prev) =>
            prev.map((a) =>
              a.id === alertId ? { ...a, dismissedAt: null } : a,
            ),
          );
        }
      } catch {
        // Revert on failure
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, dismissedAt: null } : a,
          ),
        );
      }
    },
    [tenantId],
  );

  return {
    alerts,
    total,
    loading,
    error,
    page,
    setPage,
    severityFilter,
    setSeverityFilter,
    areaFilter,
    setAreaFilter,
    statusFilter,
    setStatusFilter,
    dismissAlert,
    refetch: fetchAlerts,
  };
}
