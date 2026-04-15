"use client";

import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { AuditHistoryPoint } from "@/hooks/useAuditHistory";

interface TrendChartProps {
  data: AuditHistoryPoint[];
}

interface ChartRow {
  date: string;
  Overall: number;
  "CISA SCuBA": number;
  "NIST 800-207": number;
  "NIST 800-53": number;
  "NIST CSF 2.0": number;
}

/** Framework color palette, shared with the backend SVG renderer. */
const COLORS = {
  Overall: "#1e40af",
  "CISA SCuBA": "#059669",
  "NIST 800-207": "#d97706",
  "NIST 800-53": "#7c3aed",
  "NIST CSF 2.0": "#dc2626",
} as const;

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Historical compliance trend line chart with 5 series (Overall +
 * 4 frameworks). Renders a threshold message when fewer than 3 data
 * points exist.
 */
export function TrendChart({ data }: TrendChartProps) {
  if (data.length < 3) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-500">
          Complete 3 or more audits to see compliance trends over time.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          ({data.length} of 3 completed audits)
        </p>
      </div>
    );
  }

  // Sort oldest first so lines march left-to-right forward in time
  const sorted = [...data].sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return aTime - bTime;
  });

  const chartData: ChartRow[] = sorted.map((p) => ({
    date: formatDate(p.completedAt),
    Overall: p.overallScore,
    "CISA SCuBA": p.frameworkScores.AAD ?? 0,
    "NIST 800-207": p.frameworkScores.ZTA ?? 0,
    "NIST 800-53": p.frameworkScores["80053"] ?? 0,
    "NIST CSF 2.0": p.frameworkScores.CSF ?? 0,
  }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">
        Compliance Score Trend
      </h3>
      <div style={{ width: "100%", height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
            <YAxis
              domain={[0, 100]}
              stroke="#6b7280"
              fontSize={12}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip formatter={(value) => `${value}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="Overall"
              stroke={COLORS.Overall}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              name="Overall"
            />
            <Line
              type="monotone"
              dataKey="CISA SCuBA"
              stroke={COLORS["CISA SCuBA"]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="CISA SCuBA"
            />
            <Line
              type="monotone"
              dataKey="NIST 800-207"
              stroke={COLORS["NIST 800-207"]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="NIST 800-207"
            />
            <Line
              type="monotone"
              dataKey="NIST 800-53"
              stroke={COLORS["NIST 800-53"]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="NIST 800-53"
            />
            <Line
              type="monotone"
              dataKey="NIST CSF 2.0"
              stroke={COLORS["NIST CSF 2.0"]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="NIST CSF 2.0"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
