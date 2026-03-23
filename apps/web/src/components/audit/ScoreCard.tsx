import { Card } from "@/components/ui/Card";

interface ScoreCardProps {
  label: string;
  score: number;
  total: number;
  pass: number;
  fail: number;
  product: string;
}

const FRAMEWORK_ICONS: Record<string, string> = {
  AAD: "verified_user",
  ZTA: "shield",
  "80053": "gavel",
  CSF: "security_update_good",
};

export function ScoreCard({
  label,
  score,
  total,
  pass,
  fail,
  product,
}: ScoreCardProps) {
  const isLow = score < 50;
  const barWidth = total > 0 ? (pass / total) * 100 : 0;
  const icon = FRAMEWORK_ICONS[product] ?? "security";

  return (
    <Card className="group flex flex-col gap-3 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lift">
      {/* Top row: icon + score */}
      <div className="flex items-center justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded ${
            isLow
              ? "bg-red-100 text-red-600"
              : "bg-omzig-400/10 text-omzig-400"
          }`}
        >
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
        <span
          className={`text-2xl font-black ${
            total > 0
              ? isLow
                ? "text-red-600"
                : "text-omzig-400"
              : "text-gray-400"
          }`}
        >
          {total > 0 ? `${score}%` : "N/A"}
        </span>
      </div>

      {/* Framework label */}
      <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
        {label}
      </div>

      {/* Stats + bar */}
      {total > 0 ? (
        <>
          <div className="flex gap-3 text-xs font-medium">
            <span className="text-green-600">{pass} pass</span>
            <span className="text-red-600">{fail} fail</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-200">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                isLow
                  ? "bg-red-500"
                  : "bg-omzig-400"
              }`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </>
      ) : (
        <div className="text-xs text-gray-400">No data</div>
      )}
    </Card>
  );
}
