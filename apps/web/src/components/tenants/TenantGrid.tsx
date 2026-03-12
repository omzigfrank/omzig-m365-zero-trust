"use client";

import { useRouter } from "next/navigation";
import type { TenantSummary } from "@omzig/shared";
import { TenantCard } from "./TenantCard";
import { Plus } from "lucide-react";

interface TenantGridProps {
  tenants: TenantSummary[];
  onRemove: (id: string) => void;
}

export function TenantGrid({ tenants, onRemove }: TenantGridProps) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* Add Tenant card */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push("/tenants/new")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") router.push("/tenants/new");
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-gray-500 transition hover:border-blue-400 hover:text-blue-600"
      >
        <Plus className="h-8 w-8" />
        <span className="mt-2 text-sm font-medium">Add Tenant</span>
      </div>

      {/* Tenant cards */}
      {tenants.map((tenant) => (
        <TenantCard key={tenant.id} tenant={tenant} onRemove={onRemove} />
      ))}
    </div>
  );
}
