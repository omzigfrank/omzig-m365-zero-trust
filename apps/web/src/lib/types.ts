export type AuditRating = "pass" | "fail" | "warn" | "blocker" | "na";

/** @deprecated Use FrameworkFilter multi-select instead. Kept for backward compatibility. */
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

/** @deprecated Replaced by AuditRunDetail with frameworkScores and maturitySnapshot. */
export interface AuditEnvelope {
  generatedAt: string;
  selectedFramework: AuditFramework;
  frameworks: string[];
  tenantInfo: TenantInfo;
  combinedSummary: AuditSummary;
  reports: Record<string, FrameworkReport>;
}

/** Per-framework compliance score (pass/(pass+fail)*100) */
export interface FrameworkScore {
  total: number;
  pass: number;
  fail: number;
  warn: number;
  na: number;
  score: number;
}

/** Per-framework scores keyed by product code (AAD, ZTA, 80053, CSF) */
export type FrameworkScores = Record<string, FrameworkScore>;

/** A single tenet maturity entry from the maturity snapshot */
export interface MaturityScoreEntry {
  tenet: string;
  tenetName: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  passRate: number;
  weightedPassRate: number;
  maturityLevel: 'Traditional' | 'Initial' | 'Advanced' | 'Optimal';
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
  nistCsf?: string;
  nist800207Tenet?: string;
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
  maturitySnapshot?: MaturityScoreEntry[];
  previousMaturity?: MaturityScoreEntry[] | null;
  frameworkScores?: FrameworkScores;
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
