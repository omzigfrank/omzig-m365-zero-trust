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
        "rounded bg-white p-6 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
