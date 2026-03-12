"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionQueueItem } from "@omzig/shared";
import {
  AlertTriangle,
  ShieldAlert,
  KeyRound,
  Clock,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle,
} from "lucide-react";

interface ActionQueueProps {
  items: ActionQueueItem[];
  onDismiss: (itemId: string) => void;
  loading: boolean;
}

const DEFAULT_VISIBLE = 5;

/**
 * Collapsible action queue panel.
 *
 * Displays cross-tenant action items sorted by severity.
 * Shows top 5 by default with "View all" option.
 * Items are clickable (navigate to tenant) with dismiss button.
 */
export function ActionQueue({ items, onDismiss, loading }: ActionQueueProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const visibleItems = showAll ? items : items.slice(0, DEFAULT_VISIBLE);

  const handleItemClick = (item: ActionQueueItem) => {
    router.push(item.linkTo);
  };

  const handleDismiss = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    onDismiss(itemId);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <button
        data-testid="action-queue-header"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <span className="text-sm font-semibold text-gray-900">
            Action Items
          </span>
          {items.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {items.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-3">
          {/* Loading state */}
          {loading && (
            <div className="space-y-2 py-3">
              <div className="h-12 animate-pulse rounded border border-gray-100 bg-gray-50" />
              <div className="h-12 animate-pulse rounded border border-gray-100 bg-gray-50" />
            </div>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && (
            <div className="flex items-center gap-2 py-6 text-center">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <span className="text-sm text-gray-500">
                No action items. All tenants are in good shape.
              </span>
            </div>
          )}

          {/* Items */}
          {!loading && items.length > 0 && (
            <div className="space-y-1 pt-2">
              {visibleItems.map((item) => (
                <ActionQueueRow
                  key={item.id}
                  item={item}
                  onClick={() => handleItemClick(item)}
                  onDismiss={(e) => handleDismiss(e, item.id)}
                />
              ))}

              {/* View all link */}
              {items.length > DEFAULT_VISIBLE && !showAll && (
                <button
                  onClick={() => setShowAll(true)}
                  className="mt-1 text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  View all ({items.length})
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----

interface ActionQueueRowProps {
  item: ActionQueueItem;
  onClick: () => void;
  onDismiss: (e: React.MouseEvent) => void;
}

const SEVERITY_BORDER: Record<string, string> = {
  critical_findings: "border-l-red-500",
  needs_reauth: "border-l-orange-500",
  stale_audit: "border-l-yellow-500",
};

function TypeIcon({ type }: { type: ActionQueueItem["type"] }) {
  switch (type) {
    case "critical_findings":
      return <ShieldAlert className="h-4 w-4 text-red-500" />;
    case "needs_reauth":
      return <KeyRound className="h-4 w-4 text-orange-500" />;
    case "stale_audit":
      return <Clock className="h-4 w-4 text-yellow-600" />;
  }
}

function ActionQueueRow({ item, onClick, onDismiss }: ActionQueueRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`action-queue-item-${item.id}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`flex cursor-pointer items-center gap-3 rounded border-l-4 px-3 py-2 transition hover:bg-gray-50 ${SEVERITY_BORDER[item.type] || "border-l-gray-300"}`}
    >
      <TypeIcon type={item.type} />

      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-gray-900">
          {item.tenantName}
        </span>
        {item.count !== undefined && (
          <span className="ml-1 text-xs text-gray-500">({item.count})</span>
        )}
        <span className="ml-2 text-sm text-gray-500">{item.message}</span>
      </div>

      <button
        aria-label="Dismiss"
        onClick={onDismiss}
        className="rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
