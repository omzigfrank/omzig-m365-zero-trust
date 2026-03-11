"use client";

const FRAMEWORKS: { product: string; label: string }[] = [
  { product: "AAD", label: "CISA SCuBA" },
  { product: "ZTA", label: "NIST 800-207" },
  { product: "80053", label: "NIST 800-53" },
  { product: "CSF", label: "NIST CSF 2.0" },
];

interface FrameworkFilterProps {
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  disabled?: boolean;
}

export function FrameworkFilter({
  selected,
  onChange,
  disabled,
}: FrameworkFilterProps) {
  const handleToggle = (product: string) => {
    const next = new Set(selected);
    if (next.has(product)) {
      // Prevent deselecting all -- at least 1 must remain
      if (next.size <= 1) return;
      next.delete(product);
    } else {
      next.add(product);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-gray-700">Frameworks:</span>
      {FRAMEWORKS.map(({ product, label }) => (
        <label
          key={product}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition ${
            selected.has(product)
              ? "bg-blue-50 text-blue-700"
              : "bg-gray-50 text-gray-500"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <input
            type="checkbox"
            checked={selected.has(product)}
            onChange={() => handleToggle(product)}
            disabled={disabled}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {label}
        </label>
      ))}
    </div>
  );
}
