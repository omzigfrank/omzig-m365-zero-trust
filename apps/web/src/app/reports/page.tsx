"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import {
  useReports,
  type SecureScoreData,
  type MfaStatusData,
  type LicenseData,
  type DeviceComplianceData,
  type InactiveUsersData,
} from "@/hooks/useReports";

export default function ReportsPage() {
  const { getToken } = useAuth();
  const reports = useReports();

  const handleLoad = async () => {
    try {
      const token = await getToken();
      await reports.execute(token);
    } catch {
      // Error is captured in reports state
    }
  };

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-gray-800">
              Reports
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Real-time tenant health from Microsoft Graph API
            </p>
          </div>

          {reports.status === "loaded" && (
            <button
              onClick={handleLoad}
              className="inline-flex items-center gap-2 rounded border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Refresh
            </button>
          )}
          {(reports.status === "idle" || reports.status === "error") && (
            <button
              onClick={handleLoad}
              className="inline-flex items-center gap-2 rounded bg-omzig-400 px-6 py-3 text-sm font-bold text-white transition hover:bg-omzig-500"
            >
              <span className="material-symbols-outlined text-lg">
                download
              </span>
              Load Reports
            </button>
          )}
        </div>

        {/* Loading state */}
        {reports.status === "loading" && (
          <div className="flex flex-col items-center gap-3 rounded bg-white p-12 shadow-card">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-omzig-400 border-t-transparent" />
            <p className="text-sm font-medium text-gray-600">
              {reports.progress}
            </p>
            <p className="text-xs text-gray-400">
              Fetching data from 5 Microsoft Graph API endpoints...
            </p>
          </div>
        )}

        {/* Error state */}
        {reports.status === "error" && (
          <div className="flex items-start gap-3 rounded border border-red-200 bg-red-50 p-4">
            <span className="material-symbols-outlined mt-0.5 text-xl text-red-500">
              warning
            </span>
            <div>
              <div className="text-sm font-bold text-red-600">
                Failed to Load Reports
              </div>
              <div className="mt-1 text-sm text-gray-600">{reports.error}</div>
              <button
                onClick={handleLoad}
                className="mt-3 text-sm font-bold text-red-600 underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Idle state */}
        {reports.status === "idle" && (
          <div className="rounded border border-dashed border-gray-300 py-16 text-center">
            <span className="material-symbols-outlined mb-3 text-4xl text-gray-400">
              analytics
            </span>
            <p className="text-gray-600">
              Click{" "}
              <strong className="text-omzig-400">Load Reports</strong> to fetch
              live data from your Microsoft 365 tenant.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Requires SecurityEvents.Read.All, Reports.Read.All, User.Read.All,
              DeviceManagementManagedDevices.Read.All, and
              Directory.Read.All permissions.
            </p>
          </div>
        )}

        {/* Report cards */}
        {reports.status === "loaded" && (
          <div className="space-y-6">
            {/* Top 4 cards in 2x2 grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SecureScoreCard data={reports.data.secureScore} />
              <MfaStatusCard data={reports.data.mfaStatus} />
              <LicenseUsageCard data={reports.data.licenses} />
              <DeviceComplianceCard data={reports.data.deviceCompliance} />
            </div>

            {/* Inactive users — full width */}
            <InactiveUsersCard data={reports.data.inactiveUsers} />
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

/* ─── Card: Null / Permission Error ──────────────────────────────────── */

function CardError({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded bg-gray-100 px-4 py-3">
      <span className="material-symbols-outlined text-lg text-gray-400">
        lock
      </span>
      <span className="text-sm text-gray-500">
        Unable to load {label} — check permissions
      </span>
    </div>
  );
}

/* ─── Card: Secure Score ─────────────────────────────────────────────── */

function SecureScoreCard({ data }: { data: SecureScoreData | null }) {
  return (
    <div className="rounded bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-omzig-400">
          security
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">
          Secure Score
        </h2>
      </div>

      {!data ? (
        <CardError label="Secure Score" />
      ) : (
        <div className="space-y-5">
          {/* Score ring + numbers */}
          <div className="flex items-center gap-6">
            <ScoreRing percentage={data.percentage} size={100} />
            <div>
              <div className="text-4xl font-black text-gray-800">
                {data.percentage}%
              </div>
              <div className="text-sm text-gray-500">
                {data.currentScore.toFixed(1)} / {data.maxScore.toFixed(1)} pts
              </div>
            </div>
          </div>

          {/* Top improvement actions */}
          {data.controlScores.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                Top Improvement Actions
              </div>
              <div className="space-y-2">
                {data.controlScores.slice(0, 5).map((control) => {
                  const gap = control.maxScore - control.score;
                  return (
                    <div
                      key={control.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="truncate pr-4 text-gray-700">
                        {control.name}
                      </span>
                      <span className="shrink-0 font-semibold text-omzig-400">
                        +{gap.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── SVG Score Ring ──────────────────────────────────────────────────── */

function ScoreRing({
  percentage,
  size = 100,
}: {
  percentage: number;
  size?: number;
}) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const color =
    percentage >= 80
      ? "#22c55e"
      : percentage >= 50
        ? "#f59e0b"
        : "#ef4444";

  return (
    <svg
      width={size}
      height={size}
      className="shrink-0 -rotate-90"
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700"
      />
    </svg>
  );
}

/* ─── Card: MFA Status ───────────────────────────────────────────────── */

function MfaStatusCard({ data }: { data: MfaStatusData | null }) {
  return (
    <div className="rounded bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-omzig-400">
          verified_user
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">
          MFA Registration
        </h2>
      </div>

      {!data ? (
        <CardError label="MFA Status" />
      ) : (
        <div className="space-y-5">
          {/* Registration rate */}
          <div className="flex items-baseline gap-3">
            <div className="text-4xl font-black text-gray-800">
              {data.registrationRate}%
            </div>
            <div className="text-sm text-gray-500">registered</div>
          </div>

          {/* Bar */}
          <div>
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>
                {data.mfaRegistered} registered
              </span>
              <span>
                {data.mfaNotRegistered} not registered
              </span>
            </div>
            <div className="flex h-4 overflow-hidden rounded-full bg-gray-200">
              <div
                className="bg-green-500 transition-all duration-500"
                style={{
                  width: `${data.totalUsers > 0 ? (data.mfaRegistered / data.totalUsers) * 100 : 0}%`,
                }}
              />
              <div
                className="bg-red-400"
                style={{
                  width: `${data.totalUsers > 0 ? (data.mfaNotRegistered / data.totalUsers) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {data.totalUsers} total users
            </div>
          </div>

          {/* Method breakdown */}
          {Object.keys(data.methods).length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                Methods Registered
              </div>
              <div className="space-y-1.5">
                {Object.entries(data.methods)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([method, count]) => (
                    <div
                      key={method}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-700">{formatMethodName(method)}</span>
                      <span className="font-semibold text-gray-600">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatMethodName(method: string): string {
  const names: Record<string, string> = {
    microsoftAuthenticator: "Microsoft Authenticator",
    phoneAuthentication: "Phone (SMS/Voice)",
    fido2: "FIDO2 Security Key",
    windowsHelloForBusiness: "Windows Hello",
    emailAuthentication: "Email",
    temporaryAccessPass: "Temporary Access Pass",
    passwordlessMicrosoftAuthenticator: "Passwordless Authenticator",
    softwareOath: "Software OATH Token",
  };
  return names[method] ?? method;
}

/* ─── Card: License Usage ────────────────────────────────────────────── */

function LicenseUsageCard({ data }: { data: LicenseData | null }) {
  return (
    <div className="rounded bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-omzig-400">
          license
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">
          License Usage
        </h2>
      </div>

      {!data ? (
        <CardError label="License Usage" />
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-black text-gray-800">
              {data.totalConsumed.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">
              / {data.totalLicenses.toLocaleString()} licenses used
            </div>
          </div>

          {/* SKU table */}
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-bold uppercase tracking-widest text-gray-400">
                  <th className="pb-2 pr-3">License</th>
                  <th className="pb-2 pr-3 text-right">Used</th>
                  <th className="pb-2 pr-3 text-right">Total</th>
                  <th className="w-28 pb-2">Utilization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.skus.map((sku) => {
                  const isFree = sku.total >= 10_000;
                  return (
                  <tr key={sku.skuPartNumber} className={isFree ? "opacity-50" : ""}>
                    <td className="py-2 pr-3 text-gray-700" title={sku.skuPartNumber}>
                      {sku.displayName}
                      {isFree && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-400">
                          Free
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium text-gray-800">
                      {sku.consumed}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-500">
                      {isFree ? "Unlimited" : sku.total.toLocaleString()}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full transition-all ${
                              sku.utilizationPercent >= 80
                                ? "bg-green-500"
                                : sku.utilizationPercent >= 50
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            }`}
                            style={{
                              width: `${Math.min(sku.utilizationPercent, 100)}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`w-9 text-right text-xs font-semibold ${
                            sku.utilizationPercent >= 80
                              ? "text-green-600"
                              : sku.utilizationPercent >= 50
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {sku.utilizationPercent}%
                        </span>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Card: Device Compliance ────────────────────────────────────────── */

function DeviceComplianceCard({
  data,
}: {
  data: DeviceComplianceData | null;
}) {
  return (
    <div className="rounded bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-xl text-omzig-400">
          devices
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">
          Device Compliance
        </h2>
      </div>

      {!data ? (
        <CardError label="Device Compliance" />
      ) : (
        <div className="space-y-5">
          {/* Compliance rate */}
          <div className="flex items-center gap-6">
            <DonutChart
              segments={[
                { value: data.compliant, color: "#22c55e" },
                { value: data.nonCompliant, color: "#ef4444" },
                { value: data.unknown, color: "#9ca3af" },
              ]}
              size={100}
              label={`${data.complianceRate}%`}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
                <span className="text-gray-700">
                  Compliant: {data.compliant}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                <span className="text-gray-700">
                  Non-compliant: {data.nonCompliant}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-block h-3 w-3 rounded-full bg-gray-400" />
                <span className="text-gray-700">
                  Unknown: {data.unknown}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {data.totalDevices} total devices
              </div>
            </div>
          </div>

          {/* OS breakdown */}
          {Object.keys(data.byOS).length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                By Operating System
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.byOS)
                  .sort(([, a], [, b]) => b - a)
                  .map(([os, count]) => (
                    <span
                      key={os}
                      className="inline-flex items-center gap-1.5 rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                    >
                      <span className="material-symbols-outlined text-sm text-gray-400">
                        {osIcon(os)}
                      </span>
                      {os}: {count}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function osIcon(os: string): string {
  const lower = os.toLowerCase();
  if (lower.includes("windows")) return "desktop_windows";
  if (lower.includes("ios") || lower.includes("iphone") || lower.includes("ipad"))
    return "phone_iphone";
  if (lower.includes("mac")) return "laptop_mac";
  if (lower.includes("android")) return "phone_android";
  if (lower.includes("linux")) return "terminal";
  return "devices_other";
}

/* ─── SVG Donut Chart ────────────────────────────────────────────────── */

function DonutChart({
  segments,
  size = 100,
  label,
}: {
  segments: Array<{ value: number; color: string }>;
  size?: number;
  label: string;
}) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let cumulativeOffset = 0;

  return (
    <svg width={size} height={size} className="shrink-0" viewBox={`0 0 ${size} ${size}`}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />

      {/* Segments */}
      {total > 0 &&
        segments.map((segment, i) => {
          const segmentLength = (segment.value / total) * circumference;
          const offset = circumference - segmentLength;
          const rotation = (cumulativeOffset / total) * 360 - 90;
          cumulativeOffset += segment.value;

          if (segment.value === 0) return null;

          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
              className="transition-all duration-500"
            />
          );
        })}

      {/* Center label */}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-gray-800 text-lg font-black"
        style={{ fontSize: "18px", fontWeight: 900 }}
      >
        {label}
      </text>
    </svg>
  );
}

/* ─── Card: Inactive Users ───────────────────────────────────────────── */

function InactiveUsersCard({ data }: { data: InactiveUsersData | null }) {
  return (
    <div className="rounded bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-xl text-omzig-400">
            person_off
          </span>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">
            Inactive Users
          </h2>
          {data && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
              {data.inactiveCount}
            </span>
          )}
        </div>
        {data && (
          <span className="text-xs text-gray-400">
            No sign-in for 30+ days &middot; {data.totalUsers} total users
          </span>
        )}
      </div>

      {!data ? (
        <CardError label="Inactive Users" />
      ) : data.inactiveUsers.length === 0 ? (
        <div className="flex items-center gap-2 rounded bg-green-50 px-4 py-3 text-sm text-green-700">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          All users have signed in within the last 30 days.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-bold uppercase tracking-widest text-gray-400">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Last Sign-in</th>
                <th className="pb-2 text-right">Days Inactive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.inactiveUsers.slice(0, 25).map((user) => (
                <tr key={user.userPrincipalName}>
                  <td className="py-2 pr-4 font-medium text-gray-800">
                    {user.displayName}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {user.userPrincipalName}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {user.lastSignIn
                      ? new Date(user.lastSignIn).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "Never"}
                  </td>
                  <td className="py-2 text-right">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                        user.daysSinceSignIn === null ||
                        user.daysSinceSignIn > 90
                          ? "bg-red-100 text-red-700"
                          : user.daysSinceSignIn > 60
                            ? "bg-amber-100 text-amber-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {user.daysSinceSignIn !== null
                        ? `${user.daysSinceSignIn}d`
                        : "Never"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.inactiveUsers.length > 25 && (
            <div className="mt-3 text-center text-xs text-gray-400">
              Showing 25 of {data.inactiveUsers.length} inactive users
            </div>
          )}
        </div>
      )}
    </div>
  );
}
