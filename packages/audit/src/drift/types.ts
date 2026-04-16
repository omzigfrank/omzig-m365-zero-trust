/**
 * Drift detection types -- Phase 8 Plan 01.
 *
 * Types for the audit-log-parser, diff-engine, severity-classifier,
 * area-recollector, and drift-poller integration.
 */

import type { AuditFacts } from '../types.js';

// ========================================================================
// Graph directoryAudit event shape (from /auditLogs/directoryAudits)
// ========================================================================

export interface DirectoryAuditEvent {
  id: string;
  activityDisplayName: string;
  activityDateTime: string;
  category: string;
  result: 'success' | 'failure' | 'timeout' | 'unknownFutureValue';
  resultReason?: string;
  operationType?: string;
  loggedByService?: string;
  correlationId?: string;
  initiatedBy: {
    user?: {
      id?: string;
      displayName?: string;
      userPrincipalName?: string;
      ipAddress?: string;
    };
    app?: {
      appId?: string;
      displayName?: string;
      servicePrincipalId?: string;
    };
  };
  targetResources?: Array<{
    id: string;
    displayName?: string;
    type?: string;
    modifiedProperties?: Array<{
      displayName: string;
      oldValue: string | null;
      newValue: string | null;
    }>;
  }>;
  additionalDetails?: Array<{ key: string; value: string }>;
}

// ========================================================================
// Parsed drift event (output of audit-log-parser)
// ========================================================================

export interface DriftEvent {
  eventId: string;
  activityDisplayName: string;
  area: keyof AuditFacts;
  actorUpn: string | null;
  actorAppName: string | null;
  timestamp: Date;
  operationType: string;
}

// ========================================================================
// Area diff result (output of diff-engine)
// ========================================================================

export interface AreaDiffResult {
  drifted: boolean;
  structuredDiff: {
    added: Array<{ id: string; displayName?: string }>;
    removed: Array<{ id: string; displayName?: string }>;
    modified: Array<{
      id: string;
      displayName?: string;
      changedFields: string[];
    }>;
  };
  humanSummary: string;
}

// ========================================================================
// Drift severity levels
// ========================================================================

export type DriftSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

// ========================================================================
// Drift alert message (for SignalR push)
// ========================================================================

export interface DriftAlertMessage {
  type: 'drift_detected';
  driftAlertId: string;
  tenantId: string;
  area: string;
  severity: DriftSeverity;
  activityType: string;
  actorUpn: string | null;
  diffSummary: string;
  detectedAt: string;
}

// ========================================================================
// Drift configuration
// ========================================================================

export interface DriftConfig {
  intervalMinutes: number;
  lastPollAt: string | null;
}

// ========================================================================
// Graph throttle error (thrown by area-recollector)
// ========================================================================

export class GraphThrottledError extends Error {
  readonly code = 'GRAPH_THROTTLED';
  readonly retryAfterSeconds: number;
  constructor(retryAfter: number) {
    super(`Graph API returned 429 — retry after ${retryAfter}s`);
    this.name = 'GraphThrottledError';
    this.retryAfterSeconds = retryAfter;
  }
}

export class AreaRecollectionNotSupported extends Error {
  readonly code = 'AREA_NOT_SUPPORTED';
  constructor(area: string) {
    super(`AreaRecollectionNotSupported: ${area} is not monitored by drift detection`);
    this.name = 'AreaRecollectionNotSupported';
  }
}
