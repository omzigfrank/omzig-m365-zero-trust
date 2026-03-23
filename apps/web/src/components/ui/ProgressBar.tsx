export function ProgressBar({
  message,
  completed,
  total,
}: {
  message: string;
  completed?: number;
  total?: number;
}) {
  const pct = total && total > 0 ? Math.round((completed ?? 0) / total * 100) : 0;
  const showBar = total !== undefined && total > 0;

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-6">
      {showBar ? (
        <>
          <div className="w-full max-w-md">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
              <span>{completed ?? 0} / {total} checks</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <p className="text-sm text-gray-600">{message}</p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-600">{message}</p>
        </>
      )}
    </div>
  );
}
