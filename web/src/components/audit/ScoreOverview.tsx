import { Card } from "@/components/ui/Card";
import type { AuditEnvelope } from "@/lib/types";

export function ScoreOverview({ data }: { data: AuditEnvelope }) {
  const { combinedSummary } = data;
  const applicable = combinedSummary.pass + combinedSummary.fail;
  const score = applicable > 0 ? Math.round((combinedSummary.pass / applicable) * 100) : 0;

  const scoreColor =
    score >= 85
      ? "text-green-600"
      : score >= 70
        ? "text-yellow-600"
        : score >= 50
          ? "text-orange-600"
          : "text-red-600";

  const riskLabel =
    score >= 85
      ? "Low Risk"
      : score >= 70
        ? "Moderate Risk"
        : score >= 50
          ? "Elevated Risk"
          : "Critical Risk";

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="flex flex-col items-center justify-center py-8">
        <div className={`text-4xl font-bold ${scoreColor}`}>{score}%</div>
        <div className="mt-1 text-sm text-gray-500">Overall Score</div>
        <div className={`mt-1 text-xs font-medium ${scoreColor}`}>
          {riskLabel}
        </div>
      </Card>

      <Card>
        <div className="text-3xl font-bold text-green-600">
          {combinedSummary.pass}
        </div>
        <div className="mt-1 text-sm text-gray-500">Pass</div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
          <div
            className="h-1.5 rounded-full bg-green-500"
            style={{
              width: `${combinedSummary.total > 0 ? (combinedSummary.pass / combinedSummary.total) * 100 : 0}%`,
            }}
          />
        </div>
      </Card>

      <Card>
        <div className="text-3xl font-bold text-red-600">
          {combinedSummary.fail}
        </div>
        <div className="mt-1 text-sm text-gray-500">Fail</div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
          <div
            className="h-1.5 rounded-full bg-red-500"
            style={{
              width: `${combinedSummary.total > 0 ? (combinedSummary.fail / combinedSummary.total) * 100 : 0}%`,
            }}
          />
        </div>
      </Card>

      <Card>
        <div className="text-3xl font-bold text-gray-400">
          {combinedSummary.na}
        </div>
        <div className="mt-1 text-sm text-gray-500">N/A</div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
          <div
            className="h-1.5 rounded-full bg-gray-300"
            style={{
              width: `${combinedSummary.total > 0 ? (combinedSummary.na / combinedSummary.total) * 100 : 0}%`,
            }}
          />
        </div>
      </Card>
    </div>
  );
}
