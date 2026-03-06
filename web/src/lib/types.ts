export type AuditRating = "pass" | "fail" | "warn" | "blocker" | "na";

export type AuditFramework = "CISA" | "NIST" | "Both";

export interface AuditCheck {
  name: string;
  rating: AuditRating;
  message: string;
  action: string;
}

export interface AuditSummary {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  blocker: number;
  na: number;
  score: number;
  overallReadiness: string;
}

export interface FrameworkReport {
  id: string;
  displayName: string;
  metadata: {
    version: string;
    published: string;
    sourceUrl: string;
  };
  checks: AuditCheck[];
  summary: AuditSummary;
  overallReadiness: string;
}

export interface TenantInfo {
  tenantId: string;
  displayName: string;
  primaryDomain: string;
  user: string;
}

export interface AuditEnvelope {
  generatedAt: string;
  selectedFramework: AuditFramework;
  frameworks: string[];
  tenantInfo: TenantInfo;
  combinedSummary: AuditSummary;
  reports: Record<string, FrameworkReport>;
}

export interface AuditState {
  status: "idle" | "running" | "complete" | "error";
  progress: string;
  result: AuditEnvelope | null;
  error: string | null;
}
