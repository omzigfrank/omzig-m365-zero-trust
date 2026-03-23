"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";

export default function ReportsPage() {
  return (
    <AuthGuard>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-6xl text-gray-300">
          analytics
        </span>
        <h2 className="mt-6 text-xl font-bold text-gray-800">
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
