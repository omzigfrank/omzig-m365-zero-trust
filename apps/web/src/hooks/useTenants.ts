"use client";

import { useState, useEffect, useCallback } from "react";
import type { TenantSummary } from "@omzig/shared";
import { fetchTenants, deleteTenant } from "@/lib/tenant-api";

export function useTenants() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTenants();
      setTenants(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch tenants",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  /** Optimistic removal: remove from local state then call API */
  const removeTenant = useCallback(
    async (id: string) => {
      setTenants((prev) => prev.filter((t) => t.id !== id));
      try {
        await deleteTenant(id);
      } catch (err) {
        // Revert on failure
        await fetch();
        throw err;
      }
    },
    [fetch],
  );

  return { tenants, loading, error, removeTenant, refetch: fetch };
}
