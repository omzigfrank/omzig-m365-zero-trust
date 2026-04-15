/**
 * Progress emitter wrapping SignalR push for audit pipeline and remediation worker.
 * Silently catches errors — progress is best-effort and should not crash the pipeline.
 *
 * Phase 7 Plan 02: added emitRemediation + optional remediationPushFn so the
 * remediation worker can reuse the same emitter abstraction as the audit
 * pipeline. The audit pipeline constructs ProgressEmitter with only the audit
 * push function (remediationPushFn undefined); the remediation worker can
 * construct its own emitter with both.
 */
import type {
  AuditProgressMessage,
  RemediationProgressMessage,
  RemediationProgressMessageType,
} from '../types.js';

export class ProgressEmitter {
  private readonly userId: string;
  private readonly auditId: string;
  private readonly tenantId: string;
  private readonly pushFn: (userId: string, message: AuditProgressMessage) => Promise<void>;
  private readonly remediationPushFn?: (
    userId: string,
    message: RemediationProgressMessage,
  ) => Promise<void>;

  constructor(
    userId: string,
    auditId: string,
    tenantId: string,
    pushFn: (userId: string, message: AuditProgressMessage) => Promise<void>,
    remediationPushFn?: (
      userId: string,
      message: RemediationProgressMessage,
    ) => Promise<void>,
  ) {
    this.userId = userId;
    this.auditId = auditId;
    this.tenantId = tenantId;
    this.pushFn = pushFn;
    this.remediationPushFn = remediationPushFn;
  }

  async emit(
    completed: number,
    total: number,
    currentCheck: string,
    status: 'running' | 'complete' | 'error',
  ): Promise<void> {
    try {
      await this.pushFn(this.userId, {
        auditId: this.auditId,
        tenantId: this.tenantId,
        completed,
        total,
        currentCheck,
        status,
      });
    } catch {
      // Progress is best-effort — do not crash the pipeline
    }
  }

  async emitRemediation(
    remediationJobId: string,
    controlId: string,
    classification: 'SAFE' | 'RISKY',
    type: RemediationProgressMessageType,
    status: string,
    opts?: {
      message?: string;
      error?: string;
      beforeSnapshot?: unknown;
      afterSnapshot?: unknown;
    },
  ): Promise<void> {
    if (!this.remediationPushFn) return;
    try {
      await this.remediationPushFn(this.userId, {
        type,
        remediationJobId,
        tenantId: this.tenantId,
        controlId,
        classification,
        status,
        ...(opts ?? {}),
      });
    } catch {
      // Best-effort
    }
  }
}
