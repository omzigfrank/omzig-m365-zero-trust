/**
 * Skeleton executor for mailbox auditing.
 *
 * This is implemented as a deliberate skeleton until EXTREMED-01 ships
 * the PowerShell sidecar. Exchange Online mailbox auditing is not
 * Graph-native -- the real remediation requires Exchange Online
 * PowerShell via Set-OrganizationConfig / Set-Mailbox cmdlets.
 *
 * Attaching this executor to the registry at all is intentional: it
 * proves the framework correctly handles missing-sidecar cases without
 * silently skipping the entry. The error message directs the operator
 * to the backlog item tracking the sidecar work.
 */

import type {
  ExecutionContext,
  ExecutionResult,
} from '../types.js';
import { ExecutorError } from '../remediation-executor.js';

const CONTROL_ID_PLACEHOLDER = 'EXCHANGE_MAILBOX_AUDIT';

export async function enableMailboxAuditingExecutor(
  _ctx: ExecutionContext,
): Promise<ExecutionResult> {
  throw new ExecutorError(
    CONTROL_ID_PLACEHOLDER,
    new Error('SIDECAR_REQUIRED'),
    'Exchange remediation requires PowerShell sidecar, deferred to EXTREMED-01. ' +
      'Configure mailbox auditing manually via Set-OrganizationConfig -AuditDisabled $false ' +
      'until the sidecar is available.',
  );
}

export async function enableMailboxAuditingRollback(
  _ctx: ExecutionContext,
  _beforeSnapshot: unknown,
): Promise<void> {
  throw new Error('Mailbox auditing rollback also requires Exchange sidecar (EXTREMED-01).');
}
