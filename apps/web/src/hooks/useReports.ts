"use client";

import { useState, useCallback } from "react";
import { createGraphClient } from "@omzig/audit/graph-client";

/** Graph Client type inferred from the factory function. */
type GraphClient = ReturnType<typeof createGraphClient>;

/* ─── Types ──────────────────────────────────────────────────────────── */

export type ReportStatus = "idle" | "loading" | "loaded" | "error";

export interface SecureScoreData {
  currentScore: number;
  maxScore: number;
  percentage: number;
  controlScores: Array<{
    name: string;
    score: number;
    maxScore: number;
    description: string;
  }>;
}

export interface MfaStatusData {
  totalUsers: number;
  mfaRegistered: number;
  mfaNotRegistered: number;
  registrationRate: number;
  methods: Record<string, number>;
}

export interface LicenseData {
  skus: Array<{
    skuPartNumber: string;
    displayName: string;
    total: number;
    consumed: number;
    available: number;
    utilizationPercent: number;
  }>;
  totalLicenses: number;
  totalConsumed: number;
}

export interface DeviceComplianceData {
  totalDevices: number;
  compliant: number;
  nonCompliant: number;
  unknown: number;
  complianceRate: number;
  byOS: Record<string, number>;
}

export interface InactiveUsersData {
  totalUsers: number;
  inactiveCount: number;
  inactiveUsers: Array<{
    displayName: string;
    userPrincipalName: string;
    lastSignIn: string | null;
    daysSinceSignIn: number | null;
  }>;
}

export interface ReportsData {
  secureScore: SecureScoreData | null;
  mfaStatus: MfaStatusData | null;
  licenses: LicenseData | null;
  deviceCompliance: DeviceComplianceData | null;
  inactiveUsers: InactiveUsersData | null;
}

export interface ReportsState {
  status: ReportStatus;
  data: ReportsData;
  error: string | null;
  progress: string;
}

/* ─── SKU display name mapping ───────────────────────────────────────── */

const SKU_NAMES: Record<string, string> = {
  ENTERPRISEPACK: "Office 365 E3",
  ENTERPRISEPREMIUM: "Office 365 E5",
  SPE_E3: "Microsoft 365 E3",
  SPE_E5: "Microsoft 365 E5",
  SPB: "Microsoft 365 Business Premium",
  SMB_BUSINESS_PREMIUM: "Microsoft 365 Business Premium",
  O365_BUSINESS_PREMIUM: "Microsoft 365 Business Standard",
  AAD_PREMIUM: "Azure AD Premium P1",
  AAD_PREMIUM_P2: "Azure AD Premium P2",
  EMSPREMIUM: "Enterprise Mobility + Security E5",
  EMS: "Enterprise Mobility + Security E3",
  FLOW_FREE: "Power Automate Free",
  POWER_BI_STANDARD: "Power BI Free",
  TEAMS_EXPLORATORY: "Teams Exploratory",
  STREAM: "Microsoft Stream",
  EXCHANGESTANDARD: "Exchange Online (Plan 1)",
  EXCHANGEENTERPRISE: "Exchange Online (Plan 2)",
  VISIOCLIENT: "Visio Plan 2",
  PROJECTPREMIUM: "Project Plan 5",
  POWER_BI_PRO: "Power BI Pro",
  ATP_ENTERPRISE: "Microsoft Defender for Office 365 P1",
  THREAT_INTELLIGENCE: "Microsoft Defender for Office 365 P2",
  IDENTITY_THREAT_PROTECTION: "Microsoft 365 E5 Security",
  INFORMATION_PROTECTION_COMPLIANCE: "Microsoft 365 E5 Compliance",
  WIN_DEF_ATP: "Microsoft Defender for Endpoint P2",
  MDATP_XPLAT: "Microsoft Defender for Endpoint P1",
};

/* ─── Data fetchers ──────────────────────────────────────────────────── */

async function fetchSecureScore(client: GraphClient): Promise<SecureScoreData> {
  const response = await client
    .api("/security/secureScores")
    .top(1)
    .get();

  const scores = response.value;
  if (!scores || scores.length === 0) {
    throw new Error("No Secure Score data available");
  }

  const latest = scores[0];
  const currentScore = latest.currentScore ?? 0;
  const maxScore = latest.maxScore ?? 1;
  const percentage = maxScore > 0 ? Math.round((currentScore / maxScore) * 100) : 0;

  const controlScores = (latest.controlScores ?? [])
    .filter((c: any) => c.scoreInPercentage !== undefined)
    .map((c: any) => ({
      name: c.controlName ?? c.controlCategory ?? "Unknown",
      score: c.score ?? 0,
      maxScore: c.maxScore ?? 0,
      description: c.description ?? "",
    }))
    .sort((a: any, b: any) => {
      // Sort by improvement potential (maxScore - score) descending
      const gapA = a.maxScore - a.score;
      const gapB = b.maxScore - b.score;
      return gapB - gapA;
    });

  return { currentScore, maxScore, percentage, controlScores };
}

async function fetchMfaStatus(client: GraphClient): Promise<MfaStatusData> {
  let allUsers: any[] = [];
  let nextLink: string | null =
    "/reports/authenticationMethods/userRegistrationDetails?$top=999";

  while (nextLink) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await client.api(nextLink).get();
    allUsers = allUsers.concat(response.value ?? []);
    nextLink = response["@odata.nextLink"] ?? null;

    // Safety limit to avoid infinite loops
    if (allUsers.length > 50000) break;
  }

  const totalUsers = allUsers.length;
  let mfaRegistered = 0;
  const methods: Record<string, number> = {};

  for (const user of allUsers) {
    const isMfaRegistered = user.isMfaRegistered === true;
    if (isMfaRegistered) mfaRegistered++;

    // Count authentication methods
    const userMethods: string[] = user.methodsRegistered ?? [];
    for (const method of userMethods) {
      methods[method] = (methods[method] ?? 0) + 1;
    }
  }

  const mfaNotRegistered = totalUsers - mfaRegistered;
  const registrationRate =
    totalUsers > 0 ? Math.round((mfaRegistered / totalUsers) * 100) : 0;

  return { totalUsers, mfaRegistered, mfaNotRegistered, registrationRate, methods };
}

async function fetchLicenses(client: GraphClient): Promise<LicenseData> {
  const response = await client.api("/subscribedSkus").get();
  const skuList = response.value ?? [];

  let totalLicenses = 0;
  let totalConsumed = 0;

  const skus = skuList
    .filter((sku: any) => sku.capabilityStatus === "Enabled")
    .map((sku: any) => {
      const skuPartNumber: string = sku.skuPartNumber ?? "Unknown";
      const total: number = sku.prepaidUnits?.enabled ?? 0;
      const consumed: number = sku.consumedUnits ?? 0;
      const available = total - consumed;
      const utilizationPercent =
        total > 0 ? Math.round((consumed / total) * 100) : 0;

      totalLicenses += total;
      totalConsumed += consumed;

      return {
        skuPartNumber,
        displayName: SKU_NAMES[skuPartNumber] ?? skuPartNumber,
        total,
        consumed,
        available,
        utilizationPercent,
      };
    })
    .sort((a: any, b: any) => b.total - a.total);

  return { skus, totalLicenses, totalConsumed };
}

async function fetchDeviceCompliance(
  client: GraphClient,
): Promise<DeviceComplianceData> {
  const response = await client
    .api("/deviceManagement/managedDevices")
    .select("id,deviceName,complianceState,operatingSystem")
    .top(999)
    .get();

  const devices = response.value ?? [];
  const totalDevices = devices.length;
  let compliant = 0;
  let nonCompliant = 0;
  let unknown = 0;
  const byOS: Record<string, number> = {};

  for (const device of devices) {
    const state = device.complianceState ?? "unknown";
    if (state === "compliant") compliant++;
    else if (state === "noncompliant") nonCompliant++;
    else unknown++;

    const os = device.operatingSystem ?? "Unknown";
    byOS[os] = (byOS[os] ?? 0) + 1;
  }

  const complianceRate =
    totalDevices > 0 ? Math.round((compliant / totalDevices) * 100) : 0;

  return { totalDevices, compliant, nonCompliant, unknown, complianceRate, byOS };
}

async function fetchInactiveUsers(
  client: GraphClient,
): Promise<InactiveUsersData> {
  const response = await client
    .api("/users")
    .select("id,displayName,userPrincipalName,signInActivity")
    .filter("userType eq 'Member'")
    .top(999)
    .get();

  const users = response.value ?? [];
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const inactiveUsers: InactiveUsersData["inactiveUsers"] = [];

  for (const user of users) {
    const lastSignInStr: string | null =
      user.signInActivity?.lastSignInDateTime ?? null;

    let daysSinceSignIn: number | null = null;
    let isInactive = false;

    if (lastSignInStr) {
      const lastSignIn = new Date(lastSignInStr).getTime();
      daysSinceSignIn = Math.round((now - lastSignIn) / (24 * 60 * 60 * 1000));
      isInactive = now - lastSignIn > thirtyDaysMs;
    } else {
      // No sign-in activity at all — treat as inactive
      isInactive = true;
    }

    if (isInactive) {
      inactiveUsers.push({
        displayName: user.displayName ?? "Unknown",
        userPrincipalName: user.userPrincipalName ?? "",
        lastSignIn: lastSignInStr,
        daysSinceSignIn,
      });
    }
  }

  // Sort by most inactive first (null = never signed in = top)
  inactiveUsers.sort((a, b) => {
    if (a.daysSinceSignIn === null && b.daysSinceSignIn === null) return 0;
    if (a.daysSinceSignIn === null) return -1;
    if (b.daysSinceSignIn === null) return 1;
    return b.daysSinceSignIn - a.daysSinceSignIn;
  });

  return {
    totalUsers: users.length,
    inactiveCount: inactiveUsers.length,
    inactiveUsers,
  };
}

/* ─── Hook ───────────────────────────────────────────────────────────── */

const initialState: ReportsState = {
  status: "idle",
  data: {
    secureScore: null,
    mfaStatus: null,
    licenses: null,
    deviceCompliance: null,
    inactiveUsers: null,
  },
  error: null,
  progress: "",
};

export function useReports() {
  const [state, setState] = useState<ReportsState>(initialState);

  const execute = useCallback(async (accessToken: string) => {
    setState({
      status: "loading",
      data: {
        secureScore: null,
        mfaStatus: null,
        licenses: null,
        deviceCompliance: null,
        inactiveUsers: null,
      },
      error: null,
      progress: "Creating Graph API client...",
    });

    try {
      const client = createGraphClient(accessToken);

      setState((s) => ({ ...s, progress: "Fetching report data..." }));

      // Fetch all 5 data sources in parallel — each wrapped in try/catch
      const [secureScore, mfaStatus, licenses, deviceCompliance, inactiveUsers] =
        await Promise.all([
          fetchSecureScore(client).catch((err) => {
            console.warn("Secure Score fetch failed:", err);
            return null;
          }),
          fetchMfaStatus(client).catch((err) => {
            console.warn("MFA Status fetch failed:", err);
            return null;
          }),
          fetchLicenses(client).catch((err) => {
            console.warn("Licenses fetch failed:", err);
            return null;
          }),
          fetchDeviceCompliance(client).catch((err) => {
            console.warn("Device Compliance fetch failed:", err);
            return null;
          }),
          fetchInactiveUsers(client).catch((err) => {
            console.warn("Inactive Users fetch failed:", err);
            return null;
          }),
        ]);

      const allFailed =
        !secureScore && !mfaStatus && !licenses && !deviceCompliance && !inactiveUsers;

      if (allFailed) {
        setState({
          status: "error",
          data: { secureScore, mfaStatus, licenses, deviceCompliance, inactiveUsers },
          error:
            "All report data sources failed to load. Check your Graph API permissions.",
          progress: "",
        });
        return;
      }

      setState({
        status: "loaded",
        data: { secureScore, mfaStatus, licenses, deviceCompliance, inactiveUsers },
        error: null,
        progress: "",
      });
    } catch (err) {
      setState({
        ...initialState,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error occurred",
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { ...state, execute, reset };
}
