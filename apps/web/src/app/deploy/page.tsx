"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { Rocket } from "lucide-react";

export default function DeployPage() {
  return (
    <AuthGuard>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Rocket className="h-16 w-16 text-gray-300" />
        <h2 className="mt-6 text-xl font-semibold text-gray-900">
          Policy Deployment — Coming Soon
        </h2>
        <p className="mt-2 max-w-md text-sm text-gray-500">
          Deploy Conditional Access policies, Intune compliance, DLP rules, and
          Defender configurations directly from this dashboard.
        </p>
      </div>
    </AuthGuard>
  );
}
