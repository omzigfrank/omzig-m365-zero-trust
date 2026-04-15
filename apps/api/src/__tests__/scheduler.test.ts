import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Scheduler service tests.
 *
 * Tests the in-process scheduler that polls the control plane DB for due
 * scans and triggers runAuditPipeline with concurrency control and stagger.
 */

// ---- Mock state ----

let tenantsDueResult: any[] = [];
let tenantUpdates: any[] = [];
let pipelineCalls: any[] = [];
let runAuditPipelineImpl: (params: any) => Promise<void> = async () => {
  /* default no-op */
};

// Mock @omzig/db
const TENANTS_TABLE = Symbol('tenants');

function createMockDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => Promise.resolve(tenantsDueResult)),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: any) => {
        tenantUpdates.push(vals);
        return {
          where: vi.fn().mockImplementation(() =>
            Promise.resolve({ rowsAffected: 1 }),
          ),
        };
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => Promise.resolve()),
    })),
  };
}

let mockDb: ReturnType<typeof createMockDb>;
let mockTenantPool: any;
let mockTenantDb: any;

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(async () => mockDb),
  getTenantDb: vi.fn().mockImplementation(async () => ({
    db: mockTenantDb,
    pool: mockTenantPool,
  })),
  closeTenantDb: vi.fn().mockResolvedValue(undefined),
  tenants: TENANTS_TABLE,
  auditRuns: Symbol('auditRuns'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  lte: vi.fn((...args: any[]) => args),
  isNotNull: vi.fn((...args: any[]) => args),
  sql: vi.fn(),
}));

vi.mock('@omzig/audit', () => ({
  runAuditPipeline: vi.fn().mockImplementation((params: any) => {
    pipelineCalls.push(params);
    return runAuditPipelineImpl(params);
  }),
}));

vi.mock('../services/signalr.js', () => ({
  pushAuditProgress: vi.fn().mockResolvedValue(undefined),
}));

// ---- Setup ----

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  tenantsDueResult = [];
  tenantUpdates = [];
  pipelineCalls = [];
  runAuditPipelineImpl = async () => {
    /* no-op */
  };
  mockDb = createMockDb();
  mockTenantPool = { close: vi.fn() };
  mockTenantDb = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

afterEach(async () => {
  // Ensure scheduler interval is always cleared between tests
  const { stopScheduler, _resetSchedulerForTests } = await import(
    '../services/scheduler.js'
  );
  stopScheduler();
  _resetSchedulerForTests();
  vi.useRealTimers();
});

// ================================================================
// computeNextRun (pure helper)
// ================================================================

describe('computeNextRun', () => {
  it('returns base + 24 hours for daily', async () => {
    const { computeNextRun } = await import('../services/scheduler.js');
    const base = new Date('2026-04-14T10:00:00Z');
    const next = computeNextRun('daily', base);
    expect(next.getTime() - base.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('returns base + 7 days for weekly', async () => {
    const { computeNextRun } = await import('../services/scheduler.js');
    const base = new Date('2026-04-14T10:00:00Z');
    const next = computeNextRun('weekly', base);
    expect(next.getTime() - base.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// ================================================================
// pollForDueScans behavior
// ================================================================

describe('pollForDueScans', () => {
  function makeTenant(id: string): any {
    return {
      id,
      orgId: 'org-1',
      databaseName: `t_${id}`,
      tokenSecretName: `tok-${id}`,
      isDeleted: false,
      status: 'active',
      scheduleFrequency: 'daily',
      scheduleNextRunAt: new Date('2026-04-14T09:00:00Z'),
    };
  }

  it('respects MAX_CONCURRENT (3) when more tenants are due', async () => {
    // Block pipeline so running counter stays elevated
    let releasePipeline: () => void = () => undefined;
    const blocker = new Promise<void>((resolve) => {
      releasePipeline = resolve;
    });
    runAuditPipelineImpl = async () => {
      await blocker;
    };

    tenantsDueResult = [
      makeTenant('a'),
      makeTenant('b'),
      makeTenant('c'),
      makeTenant('d'),
      makeTenant('e'),
    ];

    const { pollForDueScans } = await import('../services/scheduler.js');
    await pollForDueScans();

    // Flush microtasks so the async work inside launchScan/executeScan
    // (DB update + token resolve + tenant DB insert) reaches the
    // runAuditPipeline call before we assert.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    // Only 3 concurrent pipelines should fire immediately
    expect(pipelineCalls.length).toBe(3);

    releasePipeline();
  });

  it('updates scheduleNextRunAt BEFORE launching pipeline (race guard)', async () => {
    const orderLog: string[] = [];

    // Spy on update().set() ordering vs pipeline call ordering
    mockDb.update = vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: any) => {
        orderLog.push('update');
        tenantUpdates.push(vals);
        return {
          where: vi
            .fn()
            .mockImplementation(() => Promise.resolve({ rowsAffected: 1 })),
        };
      }),
    }));

    runAuditPipelineImpl = async () => {
      orderLog.push('pipeline');
    };

    tenantsDueResult = [makeTenant('a')];

    const { pollForDueScans } = await import('../services/scheduler.js');
    await pollForDueScans();

    // Flush microtasks so executeScan's awaits all complete
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    expect(orderLog[0]).toBe('update');
    expect(orderLog).toContain('pipeline');
    // The first update should set scheduleNextRunAt to a future time
    expect(tenantUpdates[0].scheduleNextRunAt).toBeInstanceOf(Date);
    expect(
      (tenantUpdates[0].scheduleNextRunAt as Date).getTime(),
    ).toBeGreaterThan(Date.now());
  });

  it('swallows errors in poll loop without throwing', async () => {
    // Force getControlPlaneDb to throw
    const dbModule = (await import('@omzig/db')) as any;
    (dbModule.getControlPlaneDb as any).mockImplementationOnce(async () => {
      throw new Error('DB unavailable');
    });

    const { pollForDueScans } = await import('../services/scheduler.js');

    // Should not throw
    await expect(pollForDueScans()).resolves.toBeUndefined();
  });
});

// ================================================================
// startScheduler / stopScheduler lifecycle
// ================================================================

describe('startScheduler / stopScheduler', () => {
  it('startScheduler installs a setInterval timer', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const { startScheduler } = await import('../services/scheduler.js');
    startScheduler();
    expect(setIntervalSpy).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('stopScheduler clears the interval timer', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { startScheduler, stopScheduler } = await import(
      '../services/scheduler.js'
    );
    startScheduler();
    stopScheduler();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('startScheduler is idempotent (does not double-install)', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const { startScheduler } = await import('../services/scheduler.js');
    startScheduler();
    startScheduler();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
  });
});

// ================================================================
// Stagger / queue draining
// ================================================================

describe('queue draining with stagger', () => {
  it('queues excess tenants beyond MAX_CONCURRENT', async () => {
    let resolvers: Array<() => void> = [];
    runAuditPipelineImpl = async () =>
      new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });

    const tenants: any[] = [];
    for (let i = 0; i < 6; i++) {
      tenants.push({
        id: `t${i}`,
        orgId: 'org-1',
        databaseName: `db_${i}`,
        tokenSecretName: `tok-${i}`,
        isDeleted: false,
        status: 'active',
        scheduleFrequency: 'daily',
        scheduleNextRunAt: new Date('2026-04-14T09:00:00Z'),
      });
    }
    tenantsDueResult = tenants;

    const { pollForDueScans, _getQueueDepthForTests } = await import(
      '../services/scheduler.js'
    );
    await pollForDueScans();

    // Flush microtasks so the 3 executing scans reach the pipeline call
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    expect(pipelineCalls.length).toBe(3);
    expect(_getQueueDepthForTests()).toBe(3);

    // Cleanup
    resolvers.forEach((r) => r());
  });
});
