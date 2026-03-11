/**
 * @deprecated Replaced by FrameworkFilter (multi-select checkboxes).
 * The audit page now runs all frameworks automatically.
 * Kept for backward compatibility only.
 */
"use client";

import { clsx } from "clsx";
import type { AuditFramework } from "@/lib/types";

const options: { value: AuditFramework; label: string; desc: string }[] = [
  { value: "CISA", label: "CISA SCuBA", desc: "128 M365 security controls" },
  { value: "NIST", label: "NIST ZTA", desc: "31 Zero Trust checks" },
  { value: "Both", label: "Both", desc: "Combined frameworks" },
];

/** @deprecated Use FrameworkFilter instead. */
export function FrameworkSelector({
  value,
  onChange,
  disabled,
}: {
  value: AuditFramework;
  onChange: (v: AuditFramework) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={clsx(
            "rounded-lg border px-4 py-3 text-left transition",
            value === opt.value
              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
              : "border-gray-200 bg-white hover:border-gray-300",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <div className="text-sm font-medium text-gray-900">{opt.label}</div>
          <div className="text-xs text-gray-500">{opt.desc}</div>
        </button>
      ))}
    </div>
  );
}
