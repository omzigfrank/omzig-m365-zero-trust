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

/** Backend-aligned finding from the audit pipeline */
export interface AuditFinding {
  id: string;
  controlId: string;
  product: string;
  description: string;
  requirementLevel: "SHALL" | "SHALL NOT" | "SHOULD" | "SHOULD NOT" | "MAY";
  severity: "Critical" | "High" | "Medium" | "Low";
  rating: "pass" | "fail" | "warn" | "na";
  message: string;
  action?: string;
  settingName?: string;
  currentValue?: string;
  expectedValue?: string;
  requiredPermission?: string;
  nist80053?: string;
}

/** Backend-aligned audit run detail with findings */
export interface AuditRunDetail {
  id: string;
  tenantId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  errorChecks: number;
  summary?: string;
  findings: AuditFinding[];
}

/** Real-time progress update from SignalR */
export interface AuditProgressUpdate {
  auditId: string;
  tenantId: string;
  completed: number;
  total: number;
  currentCheck: string;
  status: "running" | "complete" | "error";
}

export interface AuditState {
  status: "idle" | "running" | "complete" | "error";
  progress: string;
  completed: number;
  total: number;
  currentCheck: string;
  auditId: string | null;
  result: AuditRunDetail | null;
  error: string | null;
}
