import { clsx } from "clsx";
import type { AuditRating } from "@/lib/types";

const ratingStyles: Record<AuditRating, string> = {
  pass: "bg-green-100 text-green-800 border-green-200",
  fail: "bg-red-100 text-red-800 border-red-200",
  warn: "bg-yellow-100 text-yellow-800 border-yellow-200",
  blocker: "bg-red-200 text-red-900 border-red-300",
  na: "bg-gray-100 text-gray-600 border-gray-200",
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
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        ratingStyles[rating]
      )}
    >
      {ratingLabels[rating]}
    </span>
  );
}
