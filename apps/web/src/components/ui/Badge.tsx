import { clsx } from "clsx";
import type { AuditRating } from "@/lib/types";

const ratingStyles: Record<AuditRating, string> = {
  pass: "bg-green-100 text-green-700",
  fail: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  blocker: "bg-red-200 text-red-800",
  na: "bg-gray-100 text-gray-600",
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
