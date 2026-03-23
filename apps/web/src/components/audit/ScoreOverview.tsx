import { ScoreCard } from "@/components/audit/ScoreCard";
import type { FrameworkScores } from "@/lib/types";

/** Product code to display label mapping */
const FRAMEWORK_LABELS: Record<string, string> = {
  AAD: "CISA SCuBA",
  ZTA: "NIST 800-207",
  "80053": "NIST 800-53",
  CSF: "NIST CSF 2.0",
};

/** Ordered list of framework product codes */
const FRAMEWORK_ORDER = ["AAD", "ZTA", "80053", "CSF"];

const EMPTY_SCORE = { total: 0, pass: 0, fail: 0, warn: 0, na: 0, score: 0 };

export function ScoreOverview({
  frameworkScores,
}: {
  frameworkScores?: FrameworkScores;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {FRAMEWORK_ORDER.map((product) => {
        const fs = frameworkScores?.[product] ?? EMPTY_SCORE;
        return (
          <ScoreCard
            key={product}
            label={FRAMEWORK_LABELS[product] ?? product}
            score={fs.score}
            total={fs.total}
            pass={fs.pass}
            fail={fs.fail}
            product={product}
          />
        );
      })}
    </div>
  );
}
