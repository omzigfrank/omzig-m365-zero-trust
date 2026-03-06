"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import Link from "next/link";
import {
  ClipboardCheck,
  Shield,
  ArrowRight,
  BarChart3,
  Rocket,
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <AuthGuard>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your Microsoft 365 security posture
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid gap-6 md:grid-cols-3">
          <Link href="/audit">
            <Card className="group cursor-pointer transition hover:border-blue-300 hover:shadow-md">
              <div className="flex items-start justify-between">
                <ClipboardCheck className="h-8 w-8 text-blue-600" />
                <ArrowRight className="h-5 w-5 text-gray-300 transition group-hover:text-blue-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                Run Security Audit
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Evaluate your tenant against CISA SCuBA and NIST Zero Trust
                frameworks. Get a compliance score and actionable findings.
              </p>
              <div className="mt-4 text-sm font-medium text-blue-600">
                Start audit
              </div>
            </Card>
          </Link>

          <Card className="opacity-60">
            <div className="flex items-start justify-between">
              <BarChart3 className="h-8 w-8 text-gray-400" />
              <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-400">
                Coming Soon
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Reports
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              View Secure Score trends, MFA registration status, license
              utilization, and compliance dashboards.
            </p>
          </Card>

          <Card className="opacity-60">
            <div className="flex items-start justify-between">
              <Rocket className="h-8 w-8 text-gray-400" />
              <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-400">
                Coming Soon
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Deploy Policies
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Deploy Conditional Access policies, Intune compliance, DLP rules,
              and Defender configurations.
            </p>
          </Card>
        </div>

        {/* Info cards */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-6">
          <div className="flex items-start gap-4">
            <Shield className="mt-0.5 h-6 w-6 text-blue-600" />
            <div>
              <h3 className="font-semibold text-blue-900">
                How the Audit Works
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm text-blue-800">
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
