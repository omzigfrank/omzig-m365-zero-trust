"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/Card";
import type { MaturityScoreEntry } from "@/lib/types";

/** Short axis labels for the 7 ZTA tenets */
const TENET_SHORT_LABELS: Record<string, string> = {
  T1: "Resources",
  T2: "Communication",
  T3: "Per-Session",
  T4: "Dynamic Policy",
  T5: "Monitoring",
  T6: "Authentication",
  T7: "Improvement",
};

/** Color coding for maturity levels */
const MATURITY_COLORS: Record<string, string> = {
  Traditional: "text-red-600",
  Initial: "text-orange-600",
  Advanced: "text-yellow-600",
  Optimal: "text-green-600",
};

interface ZtaMaturityRadarProps {
  current: MaturityScoreEntry[] | undefined;
  previous?: MaturityScoreEntry[] | null;
}

export function ZtaMaturityRadar({ current, previous }: ZtaMaturityRadarProps) {
  if (!current || current.length === 0) return null;

  // Filter to per-tenet entries (exclude 'overall')
  const tenetEntries = current.filter((e) => e.tenet !== "overall");
  const previousTenetEntries = previous?.filter((e) => e.tenet !== "overall");

  // Build recharts data
  const data = tenetEntries.map((entry) => {
    const shortLabel = TENET_SHORT_LABELS[entry.tenet] ?? entry.tenetName;
    const previousEntry = previousTenetEntries?.find(
      (p) => p.tenet === entry.tenet
    );

    return {
      tenet: shortLabel,
      current: entry.weightedPassRate,
      ...(previousEntry ? { previous: previousEntry.weightedPassRate } : {}),
    };
  });

  // Overall maturity level
  const overallEntry = current.find((e) => e.tenet === "overall");
  const weakestTenet = tenetEntries.reduce(
    (min, entry) =>
      entry.weightedPassRate < min.weightedPassRate ? entry : min,
    tenetEntries[0]
  );

  return (
    <Card>
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        ZTA Maturity Radar
      </h3>

      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="tenet" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />

          {/* Current audit: solid fill */}
          <Radar
            name="Current"
            dataKey="current"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.3}
          />

          {/* Previous audit: dashed outline, no fill */}
          {previousTenetEntries && previousTenetEntries.length > 0 && (
            <Radar
              name="Previous"
              dataKey="previous"
              stroke="#9ca3af"
              fill="none"
              fillOpacity={0}
              strokeDasharray="5 5"
            />
          )}

          <Legend />
        </RadarChart>
      </ResponsiveContainer>

      {/* Overall maturity summary */}
      {overallEntry && (
        <div className="mt-4 text-center text-sm text-gray-700">
          <span>Overall: </span>
          <span
            className={`font-semibold ${MATURITY_COLORS[overallEntry.maturityLevel] ?? "text-gray-700"}`}
          >
            {overallEntry.maturityLevel}
          </span>
          {weakestTenet && weakestTenet.tenet !== "overall" && (
            <>
              <span className="mx-2 text-gray-400">|</span>
              <span>Weakest: </span>
              <span className="font-medium">
                {TENET_SHORT_LABELS[weakestTenet.tenet] ?? weakestTenet.tenetName}
              </span>
              <span> at </span>
              <span
                className={`font-semibold ${MATURITY_COLORS[weakestTenet.maturityLevel] ?? "text-gray-700"}`}
              >
                {weakestTenet.maturityLevel}
              </span>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
