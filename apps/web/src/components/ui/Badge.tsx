import { clsx } from "clsx";
import type { AuditRating } from "@/lib/types";

const ratingStyles: Record<AuditRating, string> = {
  pass: "bg-primary-container text-on-primary-container",
  fail: "bg-tertiary text-white",
  warn: "bg-amber-500 text-white",
  blocker: "bg-error text-on-error",
  na: "bg-outline-variant text-on-surface-variant",
};

const ratingLabels: Record<AuditRating, string> = {
  pass: "Pass",
  fail: "Fail",
  warn: "Warn",
  blocker: "Blocker",
  na: "N/A",
};

export function Badge({ rating }: { rating: AuditRating }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
        ratingStyles[rating],
      )}
    >
      {ratingLabels[rating]}
    </span>
  );
}
