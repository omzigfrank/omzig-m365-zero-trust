import type { TenantHealth } from "@omzig/shared";

const healthColors: Record<TenantHealth, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-gray-400",
  orange: "bg-orange-500",
};

export function HealthDot({ health }: { health: TenantHealth }) {
  return (
    <span
      aria-label={`Health: ${health}`}
      className={`inline-block h-3 w-3 rounded-full ${healthColors[health]}`}
    />
  );
}
