/**
 * Progress emitter wrapping SignalR push for audit pipeline.
 * Silently catches errors — progress is best-effort and should not crash the pipeline.
 */
import type { AuditProgressMessage } from '../types.js';

export class ProgressEmitter {
  private readonly userId: string;
  private readonly auditId: string;
  private readonly tenantId: string;
  private readonly pushFn: (userId: string, message: AuditProgressMessage) => Promise<void>;

  constructor(
    userId: string,
    auditId: string,
    tenantId: string,
    pushFn: (userId: string, message: AuditProgressMessage) => Promise<void>,
  ) {
    this.userId = userId;
    this.auditId = auditId;
    this.tenantId = tenantId;
    this.pushFn = pushFn;
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
}
