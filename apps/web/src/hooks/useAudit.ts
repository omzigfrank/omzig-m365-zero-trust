"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  HubConnectionBuilder,
  HubConnectionState,
  type HubConnection,
} from "@microsoft/signalr";
import {
  triggerAudit,
  fetchAuditDetail,
  negotiateSignalR,
  retryCheck as retryCheckApi,
} from "@/lib/audit-api";
import type { AuditState, AuditProgressUpdate } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

const initialState: AuditState = {
  status: "idle",
  progress: "",
  completed: 0,
  total: 0,
  currentCheck: "",
  auditId: null,
  result: null,
  error: null,
};

export function useAudit(tenantId: string = '') {
  const [state, setState] = useState<AuditState>(initialState);
  const connectionRef = useRef<HubConnection | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Stop polling if active */
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /** Disconnect SignalR if connected */
  const stopSignalR = useCallback(() => {
    const conn = connectionRef.current;
    if (conn && conn.state !== HubConnectionState.Disconnected) {
      conn.stop().catch(() => {});
    }
    connectionRef.current = null;
  }, []);

  /** Fetch completed audit results */
  const fetchResults = useCallback(
    async (auditId: string) => {
      try {
        const detail = await fetchAuditDetail(tenantId, auditId);
        setState((s) => ({
          ...s,
          status: "complete",
          progress: "",
          result: detail,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          error:
            err instanceof Error ? err.message : "Failed to fetch results",
        }));
      }
      stopPolling();
      stopSignalR();
    },
    [tenantId, stopPolling, stopSignalR],
  );

  /** Start polling fallback when SignalR is unavailable */
  const startPolling = useCallback(
    (auditId: string) => {
      if (pollRef.current) return;

      pollRef.current = setInterval(async () => {
        try {
          const detail = await fetchAuditDetail(tenantId, auditId);
          if (detail.status === "completed" || detail.status === "failed") {
            stopPolling();
            setState((s) => ({
              ...s,
              status: detail.status === "completed" ? "complete" : "error",
              progress: "",
              result: detail,
              error:
                detail.status === "failed"
                  ? detail.summary || "Audit failed"
                  : null,
            }));
          }
        } catch {
          // Ignore polling errors — will retry on next interval
        }
      }, POLL_INTERVAL_MS);
    },
    [tenantId, stopPolling],
  );

  /** Connect to SignalR for real-time progress */
  const connectSignalR = useCallback(
    async (auditId: string) => {
      try {
        const { url, accessToken } = await negotiateSignalR();

        const connection = new HubConnectionBuilder()
          .withUrl(url, { accessTokenFactory: () => accessToken })
          .withAutomaticReconnect()
          .build();

        connection.on("auditProgress", (msg: AuditProgressUpdate) => {
          if (msg.auditId !== auditId) return;

          if (msg.status === "complete") {
            fetchResults(auditId);
            return;
          }

          if (msg.status === "error") {
            setState((s) => ({
              ...s,
              status: "error",
              error: "Audit pipeline failed",
            }));
            stopSignalR();
            return;
          }

          setState((s) => ({
            ...s,
            completed: msg.completed,
            total: msg.total,
            currentCheck: msg.currentCheck,
            progress: `${msg.completed}/${msg.total} — ${msg.currentCheck}`,
          }));
        });

        connection.onclose(() => {
          // If still running, fall back to polling
          setState((s) => {
            if (s.status === "running") {
              startPolling(auditId);
            }
            return s;
          });
        });

        await connection.start();
        connectionRef.current = connection;
      } catch {
        // SignalR unavailable — fall back to polling
        startPolling(auditId);
      }
    },
    [fetchResults, startPolling, stopSignalR],
  );

  /** Trigger an async audit run */
  const execute = useCallback(
    async (accessToken?: string) => {
      setState({
        ...initialState,
        status: "running",
        progress: "Starting audit...",
      });

      try {
        const { auditId } = await triggerAudit(tenantId, accessToken);

        setState((s) => ({
          ...s,
          auditId,
          progress: "Audit started, connecting to progress feed...",
        }));

        // Connect SignalR for real-time updates (falls back to polling)
        await connectSignalR(auditId);

        return auditId;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        setState({
          ...initialState,
          status: "error",
          error: message,
        });
        throw err;
      }
    },
    [tenantId, connectSignalR],
  );

  /** Retry a single control check */
  const retryCheck = useCallback(
    async (auditId: string, controlId: string) => {
      return retryCheckApi(tenantId, auditId, controlId);
    },
    [tenantId],
  );

  /** Reset state */
  const reset = useCallback(() => {
    stopPolling();
    stopSignalR();
    setState(initialState);
  }, [stopPolling, stopSignalR]);

  /** Cleanup on unmount */
  useEffect(() => {
    return () => {
      stopPolling();
      stopSignalR();
    };
  }, [stopPolling, stopSignalR]);

  return { ...state, execute, retryCheck, reset };
}
