import { apiClient } from "./api-client";
import type { ActionQueueItem } from "@omzig/shared";

/**
 * Fetch all action queue items for the current organization.
 * GET /api/action-queue
 */
export async function fetchActionQueue(): Promise<ActionQueueItem[]> {
  const res = await apiClient.get<ActionQueueItem[]>("/api/action-queue");

  if (res.error) {
    throw new Error(res.error.message || "Failed to fetch action queue");
  }

  return res.data ?? [];
}

/**
 * Dismiss an action queue item (idempotent).
 * POST /api/action-queue/{itemId}/dismiss
 */
export async function dismissActionQueueItem(itemId: string): Promise<void> {
  const res = await apiClient.post<{ ok: boolean }>(
    `/api/action-queue/${itemId}/dismiss`,
    {},
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to dismiss action queue item");
  }
}
