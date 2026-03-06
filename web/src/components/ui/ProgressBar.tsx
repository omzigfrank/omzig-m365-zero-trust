export function ProgressBar({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
}
