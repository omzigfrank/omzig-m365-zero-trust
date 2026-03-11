"use client";

import { useState, useCallback } from "react";
import { runAudit } from "@/lib/audit-api";
import type { AuditState, AuditFramework } from "@/lib/types";

export function useAudit() {
  const [state, setState] = useState<AuditState>({
    status: "idle",
    progress: "",
    result: null,
    error: null,
  });

  const execute = useCallback(
    async (accessToken: string, framework: AuditFramework) => {
      setState({
        status: "running",
        progress: "Connecting to tenant...",
        result: null,
        error: null,
      });

      try {
        setState((s) => ({ ...s, progress: "Running audit evaluators..." }));

        const result = await runAudit(accessToken, framework);

        setState({
          status: "complete",
          progress: "",
          result,
          error: null,
        });

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        setState({
          status: "error",
          progress: "",
          result: null,
          error: message,
        });
        throw err;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ status: "idle", progress: "", result: null, error: null });
  }, []);

  return { ...state, execute, reset };
}
