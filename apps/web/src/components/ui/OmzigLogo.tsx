/**
 * Omzig logo component. Renders the ŌMZIG wordmark with the distinctive
 * notched O using pure CSS — no SVG text, no font dependency issues.
 *
 * The "O" has a horizontal bar at the top creating the brand notch.
 * Accepts `variant` for light (blue on white) or dark (white on dark bg).
 * Accepts `size` for sm / md / lg.
 */

interface OmzigLogoProps {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: { text: "text-lg", o: "h-5 w-5 border-[2.5px]", bar: "h-[3px] w-[8px] -top-[1px]", gap: "gap-[1px]" },
  md: { text: "text-2xl", o: "h-7 w-7 border-[3px]", bar: "h-[4px] w-[10px] -top-[1.5px]", gap: "gap-[2px]" },
  lg: { text: "text-4xl", o: "h-10 w-10 border-[4px]", bar: "h-[5px] w-[14px] -top-[2px]", gap: "gap-[3px]" },
};

export function OmzigLogo({ variant = "light", size = "md", className = "" }: OmzigLogoProps) {
  const color = variant === "light" ? "text-omzig-400" : "text-white";
  const borderColor = variant === "light" ? "border-omzig-400" : "border-white";
  const barBg = variant === "light" ? "bg-omzig-400" : "bg-white";
  const s = sizes[size];

  return (
    <div className={`flex items-center ${s.gap} ${className}`} aria-label="Omzig">
      {/* Distinctive O with notch */}
      <div className="relative inline-flex items-center justify-center">
        <div className={`rounded-full ${borderColor} ${s.o}`} />
        {/* Notch bar at top */}
        <div className={`absolute left-1/2 -translate-x-1/2 rounded-sm ${barBg} ${s.bar}`} />
      </div>
      <span className={`font-extrabold tracking-tight ${color} ${s.text}`}>
        MZIG
      </span>
    </div>
  );
}
