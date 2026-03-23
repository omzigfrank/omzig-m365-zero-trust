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
    <Card className="group flex flex-col gap-3 transition-transform duration-200 hover:-translate-y-1">
      {/* Top row: icon + score */}
      <div className="flex items-center justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            isLow
              ? "bg-tertiary/10 text-tertiary"
              : "bg-primary/10 text-primary"
          }`}
        >
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
        <span
          className={`text-2xl font-black ${
            total > 0
              ? isLow
                ? "text-tertiary"
                : "text-primary"
              : "text-outline"
          }`}
        >
          {total > 0 ? `${score}%` : "N/A"}
        </span>
      </div>

      {/* Framework label */}
      <div className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
        {label}
      </div>

      {/* Stats + bar */}
      {total > 0 ? (
        <>
          <div className="flex gap-3 text-xs font-medium">
            <span className="text-primary">{pass} pass</span>
            <span className="text-tertiary">{fail} fail</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-container-high">
            <div
              className={`h-1.5 rounded-full bg-gradient-to-r transition-all duration-500 ${
                isLow
                  ? "from-tertiary to-tertiary-container"
                  : "from-primary to-primary-container"
              }`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </>
      ) : (
        <div className="text-xs text-outline">No data</div>
      )}
    </Card>
  );
}
