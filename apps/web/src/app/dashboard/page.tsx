"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import Link from "next/link";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <AuthGuard>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            Welcome{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Manage your Microsoft 365 security posture
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid gap-6 md:grid-cols-3">
          <Link href="/audit">
            <Card className="group cursor-pointer rounded-xl shadow-lift transition hover:-translate-y-1 hover:shadow-lg">
              <div className="flex items-start justify-between">
                <span className="material-symbols-outlined text-[32px] text-primary">
                  security
                </span>
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant/30 transition group-hover:text-primary">
                  arrow_forward
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-on-surface">
                Run Security Audit
              </h3>
              <p className="mt-2 text-sm text-on-surface-variant">
                Evaluate your tenant against CISA SCuBA and NIST Zero Trust
                frameworks. Get a compliance score and actionable findings.
              </p>
              <div className="mt-4 text-sm font-medium text-primary">
                Start audit
              </div>
            </Card>
          </Link>

          <Card className="rounded-xl opacity-60">
            <div className="flex items-start justify-between">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant/50">
                analytics
              </span>
              <span className="rounded bg-surface-container-high px-2 py-0.5 text-[10px] font-medium uppercase text-on-surface-variant">
                Coming Soon
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-on-surface">
              Reports
            </h3>
            <p className="mt-2 text-sm text-on-surface-variant">
              View Secure Score trends, MFA registration status, license
              utilization, and compliance dashboards.
            </p>
          </Card>

          <Card className="rounded-xl opacity-60">
            <div className="flex items-start justify-between">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant/50">
                rocket_launch
              </span>
              <span className="rounded bg-surface-container-high px-2 py-0.5 text-[10px] font-medium uppercase text-on-surface-variant">
                Coming Soon
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-on-surface">
              Deploy Policies
            </h3>
            <p className="mt-2 text-sm text-on-surface-variant">
              Deploy Conditional Access policies, Intune compliance, DLP rules,
              and Defender configurations.
            </p>
          </Card>
        </div>

        {/* Info box */}
        <div className="rounded-xl border border-primary/10 bg-primary/5 p-6">
          <div className="flex items-start gap-4">
            <span className="material-symbols-outlined mt-0.5 text-[24px] text-primary">
              security
            </span>
            <div>
              <h3 className="font-semibold text-primary">
                How the Audit Works
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm text-on-surface-variant">
                <li>
                  1. Your Microsoft account provides read-only access to tenant
                  configuration
                </li>
                <li>
                  2. We collect security settings via Microsoft Graph API
                  (nothing is stored)
                </li>
                <li>
                  3. Settings are evaluated against 128 CISA and 31 NIST
                  controls
                </li>
                <li>
                  4. You get an instant score with pass/fail details and
                  remediation guidance
                </li>
                <li>
                  5. Export results as JSON, CSV, or PDF for your compliance
                  records
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
