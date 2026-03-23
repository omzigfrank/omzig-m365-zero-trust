"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";

export default function DeployPage() {
  return (
    <AuthGuard>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-6xl text-outline-variant">
          rocket_launch
        </span>
        <h2 className="mt-6 text-xl font-bold text-on-surface">
          Policy Deployment — Coming Soon
        </h2>
        <p className="mt-2 max-w-md text-sm text-on-surface-variant">
          Deploy Conditional Access policies, Intune compliance, DLP rules, and
          Defender configurations directly from this dashboard.
        </p>
      </div>
    </AuthGuard>
  );
}
