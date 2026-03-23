"use client";

import { useState, useEffect, useCallback } from "react";
import type { ActionQueueItem } from "@omzig/shared";
import { fetchActionQueue, dismissActionQueueItem } from "@/lib/action-queue-api";

/**
 * Hook for fetching and dismissing action queue items.
 *
 * Fetches items on mount. dismissItem performs optimistic removal
 * from local state, calling the API in background and rolling back
 * on failure.
 */
export function useActionQueue() {
  const [items, setItems] = useState<ActionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchActionQueue();
      setItems(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch action queue",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  /** Optimistically remove item, call API, roll back on error */
  const dismissItem = useCallback(
    async (itemId: string) => {
      const prevItems = items;
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      try {
        await dismissActionQueueItem(itemId);
      } catch (err) {
        // Revert on failure
        setItems(prevItems);
        throw err;
      }
    },
    [items],
  );

  return { items, loading, error, dismissItem, refetch: fetch };
}
