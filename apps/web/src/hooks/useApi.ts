"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet } from "@/lib/api-client";
import type { ApiResponse, ApiError } from "@omzig/shared";

interface UseApiResult<T> {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * React hook for fetching data from the Hono backend API.
 *
 * - Automatically fetches on mount and when path/tenantId change
 * - Provides loading/error/data state
 * - Exposes refetch() for manual re-fetching
 *
 * @param path - API path (e.g., "/api/auth/me")
 * @param tenantId - Optional tenant ID for X-Tenant-Id header
 */
export function useApi<T>(path: string, tenantId?: string): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const id = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const response: ApiResponse<T> = await apiGet<T>(path, tenantId);

      // Only update state if this is still the latest request
      if (id !== fetchIdRef.current) return;

      if (response.error) {
        setError(response.error);
        setData(null);
      } else {
        setData(response.data ?? null);
        setError(null);
      }
    } catch (err) {
      if (id !== fetchIdRef.current) return;

      setError({
        code: "NETWORK_ERROR",
        message:
          err instanceof Error ? err.message : "An unexpected error occurred",
      });
      setData(null);
    } finally {
      if (id === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [path, tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, error, isLoading, refetch: fetchData };
}
