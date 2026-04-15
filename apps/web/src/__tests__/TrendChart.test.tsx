import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Capture what gets passed to LineChart / Line components
let capturedLineChartData: any[] = [];
let capturedLineProps: Array<{
  dataKey: string;
  stroke: string;
  name?: string;
}> = [];

vi.mock("recharts", () => {
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    LineChart: ({
      data,
      children,
    }: {
      data: any[];
      children: React.ReactNode;
    }) => {
      capturedLineChartData = data;
      return (
        <div data-testid="line-chart" data-point-count={data.length}>
          {children}
        </div>
      );
    },
    Line: (props: { dataKey: string; stroke: string; name?: string }) => {
      capturedLineProps.push({
        dataKey: props.dataKey,
        stroke: props.stroke,
        name: props.name,
      });
      return (
        <div
          data-testid={`line-${props.dataKey}`}
          data-stroke={props.stroke}
        />
      );
    },
    CartesianGrid: () => <div data-testid="cartesian-grid" />,
    XAxis: () => <div data-testid="x-axis" />,
    YAxis: () => <div data-testid="y-axis" />,
    Tooltip: () => <div data-testid="tooltip" />,
    Legend: () => <div data-testid="legend" />,
  };
});

import { TrendChart } from "@/components/audit/TrendChart";
import type { AuditHistoryPoint } from "@/hooks/useAuditHistory";

afterEach(() => {
  cleanup();
  capturedLineChartData = [];
  capturedLineProps = [];
});

function makePoint(
  completedAt: string,
  scores: { overall: number; AAD: number; ZTA: number; n80053: number; CSF: number },
): AuditHistoryPoint {
  return {
    auditId: `audit-${completedAt}`,
    startedAt: completedAt,
    completedAt,
    status: "completed",
    duration: 60000,
    totalChecks: 100,
    passedChecks: scores.overall,
    failedChecks: 100 - scores.overall,
    overallScore: scores.overall,
    frameworkScores: {
      AAD: scores.AAD,
      ZTA: scores.ZTA,
      "80053": scores.n80053,
      CSF: scores.CSF,
    },
  };
}

describe("TrendChart", () => {
  it("shows threshold message when data is empty", () => {
    render(<TrendChart data={[]} />);
    expect(screen.getByText(/complete 3 or more audits/i)).toBeDefined();
    expect(screen.queryByTestId("line-chart")).toBeNull();
  });

  it("shows threshold message when data has 1 point", () => {
    render(
      <TrendChart
        data={[
          makePoint("2026-04-01T00:00:00Z", {
            overall: 70,
            AAD: 80,
            ZTA: 60,
            n80053: 75,
            CSF: 65,
          }),
        ]}
      />,
    );
    expect(screen.getByText(/complete 3 or more audits/i)).toBeDefined();
    expect(screen.queryByTestId("line-chart")).toBeNull();
  });

  it("shows threshold message when data has 2 points", () => {
    render(
      <TrendChart
        data={[
          makePoint("2026-04-01T00:00:00Z", {
            overall: 70,
            AAD: 80,
            ZTA: 60,
            n80053: 75,
            CSF: 65,
          }),
          makePoint("2026-04-02T00:00:00Z", {
            overall: 72,
            AAD: 81,
            ZTA: 62,
            n80053: 76,
            CSF: 66,
          }),
        ]}
      />,
    );
    expect(screen.getByText(/complete 3 or more audits/i)).toBeDefined();
    expect(screen.queryByTestId("line-chart")).toBeNull();
  });

  it("renders LineChart when data has 3+ points", () => {
    render(
      <TrendChart
        data={[
          makePoint("2026-04-01T00:00:00Z", {
            overall: 70,
            AAD: 80,
            ZTA: 60,
            n80053: 75,
            CSF: 65,
          }),
          makePoint("2026-04-02T00:00:00Z", {
            overall: 72,
            AAD: 81,
            ZTA: 62,
            n80053: 76,
            CSF: 66,
          }),
          makePoint("2026-04-03T00:00:00Z", {
            overall: 74,
            AAD: 82,
            ZTA: 64,
            n80053: 77,
            CSF: 67,
          }),
        ]}
      />,
    );
    expect(screen.getByTestId("line-chart")).toBeDefined();
    expect(screen.queryByText(/complete 3 or more audits/i)).toBeNull();
  });

  it("renders 5 Line components (Overall + 4 frameworks)", () => {
    render(
      <TrendChart
        data={[
          makePoint("2026-04-01T00:00:00Z", {
            overall: 70,
            AAD: 80,
            ZTA: 60,
            n80053: 75,
            CSF: 65,
          }),
          makePoint("2026-04-02T00:00:00Z", {
            overall: 72,
            AAD: 81,
            ZTA: 62,
            n80053: 76,
            CSF: 66,
          }),
          makePoint("2026-04-03T00:00:00Z", {
            overall: 74,
            AAD: 82,
            ZTA: 64,
            n80053: 77,
            CSF: 67,
          }),
        ]}
      />,
    );
    expect(capturedLineProps.length).toBe(5);
    const dataKeys = capturedLineProps.map((p) => p.dataKey);
    expect(dataKeys).toContain("Overall");
  });

  it("each line has correct color (Overall=#1e40af, AAD=#059669, ZTA=#d97706, 80053=#7c3aed, CSF=#dc2626)", () => {
    render(
      <TrendChart
        data={[
          makePoint("2026-04-01T00:00:00Z", {
            overall: 70,
            AAD: 80,
            ZTA: 60,
            n80053: 75,
            CSF: 65,
          }),
          makePoint("2026-04-02T00:00:00Z", {
            overall: 72,
            AAD: 81,
            ZTA: 62,
            n80053: 76,
            CSF: 66,
          }),
          makePoint("2026-04-03T00:00:00Z", {
            overall: 74,
            AAD: 82,
            ZTA: 64,
            n80053: 77,
            CSF: 67,
          }),
        ]}
      />,
    );

    const strokeByDataKey: Record<string, string> = {};
    for (const p of capturedLineProps) {
      strokeByDataKey[p.dataKey] = p.stroke;
    }
    expect(strokeByDataKey["Overall"]).toBe("#1e40af");
    // Frameworks keyed by label, check presence of expected colors
    const strokes = capturedLineProps.map((p) => p.stroke.toLowerCase());
    expect(strokes).toContain("#059669");
    expect(strokes).toContain("#d97706");
    expect(strokes).toContain("#7c3aed");
    expect(strokes).toContain("#dc2626");
  });

  it("data points are sorted by completedAt ascending (oldest first)", () => {
    render(
      <TrendChart
        data={[
          // Intentionally out of order
          makePoint("2026-04-03T00:00:00Z", {
            overall: 74,
            AAD: 82,
            ZTA: 64,
            n80053: 77,
            CSF: 67,
          }),
          makePoint("2026-04-01T00:00:00Z", {
            overall: 70,
            AAD: 80,
            ZTA: 60,
            n80053: 75,
            CSF: 65,
          }),
          makePoint("2026-04-02T00:00:00Z", {
            overall: 72,
            AAD: 81,
            ZTA: 62,
            n80053: 76,
            CSF: 66,
          }),
        ]}
      />,
    );
    expect(capturedLineChartData.length).toBe(3);
    expect(capturedLineChartData[0].Overall).toBe(70);
    expect(capturedLineChartData[1].Overall).toBe(72);
    expect(capturedLineChartData[2].Overall).toBe(74);
  });
});
