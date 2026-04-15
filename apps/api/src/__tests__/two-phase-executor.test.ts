/**
 * Phase 7 Plan 03 -- Two-phase executor worker tests.
 *
 * Unit-tests the worker's two-phase branching logic without spinning up
 * the full interval poller. We invoke executeRemediationJob directly via
 * module-internal imports + vi.mock boundaries.
 *
 * What we verify:
 *   - On first-phase success with phase='report_only_deployed', the worker
 *     updates status='awaiting_enforce' and does NOT write status=completed.
 *   - targetResourceId is persisted to the row so /enforce knows which
 *     Graph resource to PATCH.
 *   - On re-pickup with targetResourceId set AND entry.enforcePhaseExecutor
 *     present, the worker calls enforcePhaseExecutor (not entry.executor).
 *   - After enforcePhaseExecutor returns phase='completed', the worker
 *     writes status='completed'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Shared mock state ----

const REMEDIATION_JOBS = Symbol('remediation_jobs');
const TENANTS = Symbol('tenants');

let jobRows: any[] = [];
const jobUpdates: any[] = [];

function resetState() {
  jobRows = [];
  jobUpdates.length = 0;
}

// Helper to build a minimal tenant row
const TEST_TENANT = {
  id: 'tenant-1',
  databaseName: 'tenant_test_db',
  isDeleted: false,
  status: 'active',
};

// ---- Mocks ----

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([TEST_TENANT]),
      }),
    }),
  })),
  getTenantDb: vi.fn(async () => ({
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(jobRows)),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((vals: any) => {
          jobUpdates.push({ vals });
          return {
            where: () => Promise.resolve({ rowsAffected: 1 }),
          };
        }),
      })),
    },
  })),
  tenants: TENANTS,
  remediationJobs: REMEDIATION_JOBS,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  isNotNull: vi.fn((...args: any[]) => args),
  isNull: vi.fn((...args: any[]) => args),
  lt: vi.fn((...args: any[]) => args),
  desc: vi.fn((...args: any[]) => args),
}));

// Mock executeRemediation and entry lookup so we control what the worker sees.
let mockEntry: any = null;
let executeResult: any = null;
let enforceResult: any = null;

vi.mock('@omzig/audit', () => ({
  getRemediationByControlId: vi.fn((_id: string) => mockEntry),
  executeRemediation: vi.fn(async () => executeResult),
  WriteRateLimiter: class {
    async beforeWrite() {}
    async handle429() {}
  },
  collectFacts: vi.fn(async () => ({})),
  createGraphClient: vi.fn(() => ({ api: () => ({}) })),
}));

vi.mock('../services/remediation-token-broker.js', () => ({
  getRemediationAccessToken: vi.fn(async () => 'test-token'),
}));

vi.mock('../services/signalr.js', () => ({
  pushRemediationProgress: vi.fn(async () => {}),
}));

// ---- Tests ----

describe('remediation-worker two-phase executor support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it('first phase: pauses job at awaiting_enforce when result.phase=report_only_deployed', async () => {
    // Entry with BOTH executor + enforcePhaseExecutor (two-phase RISKY).
    mockEntry = {
      controlId: 'MS.AAD.3.7v1',
      classification: 'RISKY',
      scopeBundle: 'conditionalAccess',
      executor: vi.fn(),
      enforcePhaseExecutor: vi.fn(),
      rollbackExecutor: vi.fn(),
    };
    executeResult = {
      beforeSnapshot: { targetResourceId: 'policy-123' },
      afterSnapshot: { id: 'policy-123', state: 'enabledForReportingButNotEnforced' },
      targetResourceId: 'policy-123',
      phase: 'report_only_deployed',
    };

    // Import after mocks are set up.
    const mod = await import('../services/remediation-worker.js');

    // Call the internal executor with a minimal job row. We need to access
    // the internal via a test helper; worker exposes pollPendingJobs +
    // startRemediationWorker but not executeRemediationJob directly.
    // Instead, we set up jobRows and call pollPendingJobs() to exercise
    // the full path.

    jobRows = [
      {
        id: 'job-phase1',
        tenantId: 'tenant-1',
        findingId: 'f-1',
        controlId: 'MS.AAD.3.7v1',
        classification: 'RISKY',
        scopeBundle: 'conditionalAccess',
        status: 'pending',
        attemptCount: 0,
        approvedByUserId: 'user-1',
        targetResourceId: null,
      },
    ];

    await mod.pollPendingJobs();
    // Wait for in-flight promises to drain.
    await new Promise((r) => setTimeout(r, 50));

    // Find the update that set status='awaiting_enforce'.
    const awaiting = jobUpdates.find(
      (u) => u.vals.status === 'awaiting_enforce',
    );
    expect(awaiting).toBeDefined();
    expect(awaiting.vals.targetResourceId).toBe('policy-123');

    // There should NOT be a 'completed' update on the same pickup.
    const completed = jobUpdates.find((u) => u.vals.status === 'completed');
    expect(completed).toBeUndefined();

    // enforcePhaseExecutor should NOT have been called yet.
    expect(mockEntry.enforcePhaseExecutor).not.toHaveBeenCalled();
  });

  it('enforce phase: calls enforcePhaseExecutor when job has targetResourceId on re-pickup', async () => {
    mockEntry = {
      controlId: 'MS.AAD.3.7v1',
      classification: 'RISKY',
      scopeBundle: 'conditionalAccess',
      executor: vi.fn(),
      enforcePhaseExecutor: vi.fn(async () => enforceResult),
      rollbackExecutor: vi.fn(),
    };
    enforceResult = {
      beforeSnapshot: { targetResourceId: 'policy-123' },
      afterSnapshot: { id: 'policy-123', state: 'enabled' },
      targetResourceId: 'policy-123',
      phase: 'completed',
    };

    const mod = await import('../services/remediation-worker.js');

    // Re-pickup: status=pending, targetResourceId already set.
    jobRows = [
      {
        id: 'job-phase2',
        tenantId: 'tenant-1',
        findingId: 'f-1',
        controlId: 'MS.AAD.3.7v1',
        classification: 'RISKY',
        scopeBundle: 'conditionalAccess',
        status: 'pending',
        attemptCount: 0,
        approvedByUserId: 'user-1',
        targetResourceId: 'policy-123',
      },
    ];

    await mod.pollPendingJobs();
    await new Promise((r) => setTimeout(r, 50));

    // enforcePhaseExecutor WAS called.
    expect(mockEntry.enforcePhaseExecutor).toHaveBeenCalledTimes(1);
    const callArgs = mockEntry.enforcePhaseExecutor.mock.calls[0];
    expect(callArgs[1]).toEqual({ targetResourceId: 'policy-123' });

    // And the status transition was completed.
    const completed = jobUpdates.find((u) => u.vals.status === 'completed');
    expect(completed).toBeDefined();
  });

  it('single-phase (no enforcePhaseExecutor) completes normally even when result.phase is undefined', async () => {
    // Single-phase RISKY (e.g., block-guest-access) — no enforcePhaseExecutor.
    mockEntry = {
      controlId: 'MS.AAD.8.2v1',
      classification: 'RISKY',
      scopeBundle: 'authPolicy',
      executor: vi.fn(),
      rollbackExecutor: vi.fn(),
      // No enforcePhaseExecutor.
    };
    executeResult = {
      beforeSnapshot: { allowInvitesFrom: 'everyone' },
      afterSnapshot: { allowInvitesFrom: 'adminsAndGuestInviters' },
      targetResourceId: 'authorizationPolicy:allowInvitesFrom:adminsAndGuestInviters',
      // phase undefined → treated as completed.
    };

    const mod = await import('../services/remediation-worker.js');

    jobRows = [
      {
        id: 'job-single',
        tenantId: 'tenant-1',
        findingId: 'f-1',
        controlId: 'MS.AAD.8.2v1',
        classification: 'RISKY',
        scopeBundle: 'authPolicy',
        status: 'pending',
        attemptCount: 0,
        approvedByUserId: 'user-1',
        targetResourceId: null,
      },
    ];

    await mod.pollPendingJobs();
    await new Promise((r) => setTimeout(r, 50));

    const completed = jobUpdates.find((u) => u.vals.status === 'completed');
    expect(completed).toBeDefined();
    const awaiting = jobUpdates.find(
      (u) => u.vals.status === 'awaiting_enforce',
    );
    expect(awaiting).toBeUndefined();
  });
});
