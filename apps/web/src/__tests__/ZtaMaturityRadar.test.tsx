import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ZtaMaturityRadar } from "@/components/audit/ZtaMaturityRadar";
import type { MaturityScoreEntry } from "@/lib/types";

// Track what data gets passed to RadarChart
let capturedRadarChartData: any[] = [];
let capturedRadarNames: string[] = [];

// Mock recharts to capture props and render testable elements
vi.mock("recharts", () => {
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 500, height: 400 }}>
        {children}
      </div>
    ),
    RadarChart: ({ data, children }: { data: any[]; children: React.ReactNode }) => {
      capturedRadarChartData = data;
      return (
        <div data-testid="radar-chart" data-point-count={data.length}>
          {children}
        </div>
      );
    },
    PolarGrid: () => <div data-testid="polar-grid" />,
    PolarAngleAxis: ({ dataKey }: { dataKey: string }) => (
      <div data-testid="polar-angle-axis" data-key={dataKey} />
    ),
    PolarRadiusAxis: () => <div data-testid="polar-radius-axis" />,
    Radar: ({ name, dataKey }: { name: string; dataKey: string }) => {
      capturedRadarNames.push(name);
      return <div data-testid={`radar-${name.toLowerCase()}`} data-key={dataKey} />;
    },
    Legend: () => <div data-testid="legend" />,
  };
});

afterEach(() => {
  cleanup();
  capturedRadarChartData = [];
  capturedRadarNames = [];
});

function makeTenetEntry(
  tenet: string,
  tenetName: string,
  passRate: number,
  level: MaturityScoreEntry["maturityLevel"]
): MaturityScoreEntry {
  return {
    tenet,
    tenetName,
    totalChecks: 10,
    passedChecks: Math.round(passRate / 10),
    failedChecks: 10 - Math.round(passRate / 10),
    passRate,
    weightedPassRate: passRate,
    maturityLevel: level,
  };
}

const CURRENT_MATURITY: MaturityScoreEntry[] = [
  makeTenetEntry("T1", "All Resources", 85, "Advanced"),
  makeTenetEntry("T2", "Communication Security", 90, "Optimal"),
  makeTenetEntry("T3", "Per-Session Access", 72, "Advanced"),
  makeTenetEntry("T4", "Dynamic Policy", 60, "Initial"),
  makeTenetEntry("T5", "Monitoring", 78, "Advanced"),
  makeTenetEntry("T6", "Authentication", 95, "Optimal"),
  makeTenetEntry("T7", "Continuous Improvement", 88, "Advanced"),
  makeTenetEntry("overall", "Overall Maturity", 81, "Advanced"),
];

const PREVIOUS_MATURITY: MaturityScoreEntry[] = [
  makeTenetEntry("T1", "All Resources", 70, "Advanced"),
  makeTenetEntry("T2", "Communication Security", 75, "Advanced"),
  makeTenetEntry("T3", "Per-Session Access", 55, "Initial"),
  makeTenetEntry("T4", "Dynamic Policy", 45, "Initial"),
  makeTenetEntry("T5", "Monitoring", 60, "Initial"),
  makeTenetEntry("T6", "Authentication", 80, "Advanced"),
  makeTenetEntry("T7", "Continuous Improvement", 65, "Initial"),
  makeTenetEntry("overall", "Overall Maturity", 64, "Initial"),
];

describe("ZtaMaturityRadar", () => {
  it("renders heading and chart container", () => {
    render(<ZtaMaturityRadar current={CURRENT_MATURITY} />);

    expect(screen.getByText("ZTA Maturity Radar")).toBeDefined();
    expect(screen.getByTestId("responsive-container")).toBeDefined();
    expect(screen.getByTestId("radar-chart")).toBeDefined();
  });

  it("passes exactly 7 data points to RadarChart (excludes overall)", () => {
    render(<ZtaMaturityRadar current={CURRENT_MATURITY} />);

    const chart = screen.getByTestId("radar-chart");
    expect(chart.getAttribute("data-point-count")).toBe("7");

    // Verify data has the short labels for all 7 tenets
    const tenetNames = capturedRadarChartData.map((d) => d.tenet);
    expect(tenetNames).toEqual([
      "Resources",
      "Communication",
      "Per-Session",
      "Dynamic Policy",
      "Monitoring",
      "Authentication",
      "Improvement",
    ]);
  });

  it("includes current weightedPassRate values in chart data", () => {
    render(<ZtaMaturityRadar current={CURRENT_MATURITY} />);

    expect(capturedRadarChartData[0].current).toBe(85); // T1
    expect(capturedRadarChartData[3].current).toBe(60); // T4
    expect(capturedRadarChartData[5].current).toBe(95); // T6
  });

  it("renders a Current Radar layer", () => {
    render(<ZtaMaturityRadar current={CURRENT_MATURITY} />);

    expect(screen.getByTestId("radar-current")).toBeDefined();
    expect(capturedRadarNames).toContain("Current");
  });

  it("renders Previous Radar layer when previous prop is provided", () => {
    render(
      <ZtaMaturityRadar
        current={CURRENT_MATURITY}
        previous={PREVIOUS_MATURITY}
      />
    );

    expect(screen.getByTestId("radar-current")).toBeDefined();
    expect(screen.getByTestId("radar-previous")).toBeDefined();
    expect(capturedRadarNames).toContain("Current");
    expect(capturedRadarNames).toContain("Previous");

    // Previous data should be in the chart data
    expect(capturedRadarChartData[0].previous).toBe(70); // T1 previous
    expect(capturedRadarChartData[3].previous).toBe(45); // T4 previous
  });

  it("does not render Previous Radar when previous is null", () => {
    render(
      <ZtaMaturityRadar current={CURRENT_MATURITY} previous={null} />
    );

    expect(screen.getByTestId("radar-current")).toBeDefined();
    expect(screen.queryByTestId("radar-previous")).toBeNull();
    expect(capturedRadarNames).toContain("Current");
    expect(capturedRadarNames).not.toContain("Previous");
  });

  it("does not render Previous Radar when previous is undefined", () => {
    render(<ZtaMaturityRadar current={CURRENT_MATURITY} />);

    expect(screen.getByTestId("radar-current")).toBeDefined();
    expect(screen.queryByTestId("radar-previous")).toBeNull();
    expect(capturedRadarNames).not.toContain("Previous");
  });

  it("shows overall maturity level", () => {
    render(<ZtaMaturityRadar current={CURRENT_MATURITY} />);

    expect(screen.getByText("Overall:")).toBeDefined();
    expect(screen.getByText("Advanced")).toBeDefined();
  });

  it("shows weakest tenet information", () => {
    render(<ZtaMaturityRadar current={CURRENT_MATURITY} />);

    // T4 (Dynamic Policy) has the lowest weightedPassRate (60) -> Initial
    expect(screen.getByText("Weakest:")).toBeDefined();
    expect(screen.getByText("Dynamic Policy")).toBeDefined();
    expect(screen.getByText("Initial")).toBeDefined();
  });

  it("returns null when current is undefined", () => {
    const { container } = render(
      <ZtaMaturityRadar current={undefined} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("returns null when current is empty array", () => {
    const { container } = render(<ZtaMaturityRadar current={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
