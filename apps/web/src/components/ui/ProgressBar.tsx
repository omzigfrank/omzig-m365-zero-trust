export function ProgressBar({
  message,
  completed,
  total,
}: {
  message: string;
  completed?: number;
  total?: number;
}) {
  const pct =
    total && total > 0 ? Math.round(((completed ?? 0) / total) * 100) : 0;
  const showBar = total !== undefined && total > 0;

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-lowest p-6 shadow-lift">
      {showBar ? (
        <>
          <div className="w-full max-w-md">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-on-surface-variant">
              <span>
                {completed ?? 0} / {total} checks
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-container transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <p className="text-sm text-on-surface-variant">{message}</p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-on-surface-variant">{message}</p>
        </>
      )}
    </div>
  );
}
