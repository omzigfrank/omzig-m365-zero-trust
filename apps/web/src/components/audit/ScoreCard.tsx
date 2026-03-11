import { Card } from "@/components/ui/Card";

interface ScoreCardProps {
  label: string;
  score: number;
  total: number;
  pass: number;
  fail: number;
  product: string;
}

function getScoreColor(score: number): string {
  if (score >= 85) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  if (score >= 50) return "text-orange-600";
  return "text-red-600";
}

function getBarColor(score: number): string {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-yellow-500";
  if (score >= 50) return "bg-orange-500";
  return "bg-red-500";
}

export function ScoreCard({ label, score, total, pass, fail }: ScoreCardProps) {
  const scoreColor = getScoreColor(score);
  const barColor = getBarColor(score);
  const barWidth = total > 0 ? (pass / total) * 100 : 0;

  return (
    <Card className="flex flex-col items-center justify-center py-6">
      <div className={`text-4xl font-bold ${scoreColor}`}>
        {total > 0 ? `${score}%` : "N/A"}
      </div>
      <div className="mt-1 text-sm font-medium text-gray-700">{label}</div>
      {total > 0 ? (
        <>
          <div className="mt-2 flex gap-3 text-xs text-gray-500">
            <span className="text-green-600">{pass} pass</span>
            <span className="text-red-600">{fail} fail</span>
          </div>
          <div className="mt-2 h-1.5 w-3/4 rounded-full bg-gray-100">
            <div
              className={`h-1.5 rounded-full ${barColor}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </>
      ) : (
        <div className="mt-2 text-xs text-gray-400">No data</div>
      )}
    </Card>
  );
}
