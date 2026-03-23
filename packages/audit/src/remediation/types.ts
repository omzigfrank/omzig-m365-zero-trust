export interface RemediationEntry {
  controlId: string;
  steps: string[];
  adminPortalUrl?: string;
  powershell?: string;
  estimatedImpact?: string;
  notes?: string;
}
