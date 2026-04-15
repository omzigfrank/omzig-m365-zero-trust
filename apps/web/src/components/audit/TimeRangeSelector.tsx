"use client";

export type TimeRange = "30d" | "90d" | "6m" | "1y" | "all";

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "6m", label: "6m" },
  { value: "1y", label: "1y" },
  { value: "all", label: "All" },
];

/**
 * Converts a TimeRange code to a cutoff Date. Returns null for "all".
 */
export function timeRangeCutoff(range: TimeRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  switch (range) {
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "6m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return d;
    }
    case "1y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
  }
}

export function TimeRangeSelector({
  value,
  onChange,
}: TimeRangeSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Time range"
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${
              active
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
