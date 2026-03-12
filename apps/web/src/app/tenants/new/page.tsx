"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { OnboardingWizard } from "@/components/tenants/OnboardingWizard";
import { useOnboarding } from "@/hooks/useOnboarding";

export default function NewTenantPage() {
  const onboarding = useOnboarding();

  return (
    <AuthGuard>
      <div className="mx-auto max-w-4xl py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Connect New Tenant
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Follow the steps below to connect a client M365 tenant for
            compliance auditing.
          </p>
        </div>

        <OnboardingWizard {...onboarding} />
      </div>
    </AuthGuard>
  );
}
