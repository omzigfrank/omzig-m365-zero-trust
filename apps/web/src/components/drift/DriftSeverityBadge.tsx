"use client";

/**
 * DriftSeverityBadge -- Phase 8 Plan 02.
 *
 * Colored badge for drift alert severity levels.
 * Critical (red), High (orange), Medium (yellow), Low (blue).
 */

import type { DriftSeverity } from "@omzig/audit";

const SEVERITY_CLASSES: Record<DriftSeverity, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-blue-100 text-blue-800",
};

interface DriftSeverityBadgeProps {
  severity: DriftSeverity;
}

export function DriftSeverityBadge({ severity }: DriftSeverityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_CLASSES[severity]}`}
    >
      {severity}
    </span>
  );
}
