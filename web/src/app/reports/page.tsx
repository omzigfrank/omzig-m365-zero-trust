"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { BarChart3 } from "lucide-react";

export default function ReportsPage() {
  return (
    <AuthGuard>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BarChart3 className="h-16 w-16 text-gray-300" />
        <h2 className="mt-6 text-xl font-semibold text-gray-900">
          Reports — Coming Soon
        </h2>
        <p className="mt-2 max-w-md text-sm text-gray-500">
          Secure Score trends, MFA registration, license utilization, and
          compliance dashboards will be available here.
        </p>
      </div>
    </AuthGuard>
  );
}
