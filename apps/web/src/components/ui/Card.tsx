import { clsx } from "clsx";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl bg-surface-container-lowest p-6 shadow-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}
