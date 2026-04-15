import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for remediation-worker.ts
 *
 * Mocks @omzig/db, @omzig/audit, remediation-token-broker.
 * Fake timers are used for heartbeat + drain timing.
 */

// ---- Mock state ----

let mockActiveTenants: any[] = [];
let mockPendingJobs: any[] = [];
let mockRunningJobs: any[] = [];
let mockClaimRowsAffected = 1;
let mockTenantUpdates: Array<{ table: string; vals: any }> = [];
let mockExecuteRemediationImpl: (entry: any, ctx: any) => Promise<any> = async () => ({
  beforeSnapshot: null,
  afterSnapshot: {},
  targetResourceId: 'resource-id',
});
let mockCollectFactsImpl = async () => ({}) as any;
let mockGetRemediationAccessTokenImpl: (
  tenantId: string,
  bundle: string,
) => Promise<string | null> = async () => 'access-token';
let mockGetRemediationByControlIdImpl: (id: string) => any = () => ({
  controlId: 'MS.AAD.1.1v1',
  executor: async () => ({ beforeSnapshot: null, afterSnapshot: {}, targetResourceId: 'r' }),
});

const TENANTS_TABLE = Symbol('tenants');
const REMED_JOBS_TABLE = Symbol('remediationJobs');

function createMockControlPlaneDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => Promise.resolve(mockActiveTenants)),
      })),
    })),
  };
}

function createMockTenantDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation((...whereArgs: any[]) => {
          // Hack: when the where clause is a status=running filter, return running jobs.
          // Otherwise return pending jobs. Look at the first where arg string.
          const argStr = JSON.stringify(whereArgs);
          if (argStr.includes('running')) {
            return Promise.resolve(mockRunningJobs);
          }
          return Promise.resolve(mockPendingJobs);
        }),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: any) => {
        mockTenantUpdates.push({ table: 'remediationJobs', vals });
        return {
          where: vi.fn().mockImplementation(() =>
            Promise.resolve({ rowsAffected: mockClaimRowsAffected }),
          ),
        };
      }),
    })),
  };
}

let mockControlPlaneDb: ReturnType<typeof createMockControlPlaneDb>;
let mockTenantDb: ReturnType<typeof createMockTenantDb>;

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(async () => mockControlPlaneDb),
  getTenantDb: vi.fn().mockImplementation(async () => ({
    db: mockTenantDb,
    pool: { close: vi.fn() },
  })),
  closeTenantDb: vi.fn().mockResolvedValue(undefined),
  tenants: TENANTS_TABLE,
  remediationJobs: REMED_JOBS_TABLE,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ eq: [a, b], toString: () => `eq(${String(a)},${String(b)})` })),
  and: vi.fn((...args: any[]) => ({ and: args, toString: () => `and(${args.map(String).join(',')})` })),
  lt: vi.fn((...args: any[]) => args),
  isNotNull: vi.fn((...args: any[]) => args),
  isNull: vi.fn((...args: any[]) => args),
  sql: vi.fn(),
}));

vi.mock('@omzig/audit', () => ({
  executeRemediation: vi.fn().mockImplementation((entry: any, ctx: any) =>
    mockExecuteRemediationImpl(entry, ctx),
  ),
  getRemediationByControlId: vi.fn().mockImplementation((id: string) =>
    mockGetRemediationByControlIdImpl(id),
  ),
  WriteRateLimiter: class {
    async beforeWrite() {}
    async handle429() {}
  },
  collectFacts: vi.fn().mockImplementation(() => mockCollectFactsImpl()),
  createGraphClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../services/remediation-token-broker.js', () => ({
  getRemediationAccessToken: vi
    .fn()
    .mockImplementation((tid: string, bundle: string) =>
      mockGetRemediationAccessTokenImpl(tid, bundle),
    ),
  SCOPE_BUNDLES: {
    conditionalAccess: ['Policy.ReadWrite.ConditionalAccess'],
    authMethods: ['Policy.ReadWrite.AuthenticationMethod'],
    authPolicy: ['Policy.ReadWrite.Authorization'],
    roles: ['RoleManagement.ReadWrite.Directory'],
    securityDefaults: ['Policy.ReadWrite.SecurityDefaults'],
  },
}));

// ---- Setup ----

beforeEach(() => {
  vi.clearAllMocks();
  mockActiveTenants = [];
  mockPendingJobs = [];
  mockRunningJobs = [];
  mockClaimRowsAffected = 1;
  mockTenantUpdates = [];
  mockControlPlaneDb = createMockControlPlaneDb();
  mockTenantDb = createMockTenantDb();
  mockExecuteRemediationImpl = async () => ({
    beforeSnapshot: null,
    afterSnapshot: {},
    targetResourceId: 'r',
  });
  mockCollectFactsImpl = async () => ({}) as any;
  mockGetRemediationAccessTokenImpl = async () => 'access-token';
  mockGetRemediationByControlIdImpl = () => ({
    controlId: 'MS.AAD.1.1v1',
    executor: async () => ({
      beforeSnapshot: null,
      afterSnapshot: {},
      targetResourceId: 'r',
    }),
  });
});

afterEach(async () => {
  const { _resetRemediationWorkerForTests, stopRemediationWorker } = await import(
    '../services/remediation-worker.js'
  );
  await stopRemediationWorker();
  _resetRemediationWorkerForTests();
});

function makeTenant(id: string): any {
  return {
    id,
    databaseName: `t_${id}`,
    isDeleted: false,
    status: 'active',
  };
}

function makeJob(id: string, overrides: Partial<any> = {}): any {
  return {
    id,
    tenantId: 'tenant-1',
    findingId: 'finding-1',
    controlId: 'MS.AAD.1.1v1',
    classification: 'SAFE',
    scopeBundle: 'conditionalAccess',
    status: 'pending',
    attemptCount: 0,
    ...overrides,
  };
}

// ================================================================
// pollPendingJobs
// ================================================================

describe('pollPendingJobs', () => {
  it('queries active, non-deleted tenants across the control plane', async () => {
    mockActiveTenants = [makeTenant('a'), makeTenant('b')];
    mockPendingJobs = [];

    const { pollPendingJobs } = await import('../services/remediation-worker.js');
    await pollPendingJobs();

    expect(mockControlPlaneDb.select).toHaveBeenCalled();
  });

  it('skips jobs when the row-level claim UPDATE affects 0 rows', async () => {
    mockActiveTenants = [makeTenant('a')];
    mockPendingJobs = [makeJob('job-1')];
    mockClaimRowsAffected = 0;

    // Block execution so runningCount stays > 0 if the job were launched.
    let executed = false;
    mockExecuteRemediationImpl = async () => {
      executed = true;
      return { beforeSnapshot: null, afterSnapshot: {}, targetResourceId: 'r' };
    };

    const { pollPendingJobs } = await import('../services/remediation-worker.js');
    await pollPendingJobs();

    // Give async tasks a chance to run
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(executed).toBe(false);
  });

  it('respects MAX_CONCURRENT=2: 5 pending jobs -> 2 launched immediately, 3 queued', async () => {
    mockActiveTenants = [makeTenant('a')];
    mockPendingJobs = [
      makeJob('j1'),
      makeJob('j2'),
      makeJob('j3'),
      makeJob('j4'),
      makeJob('j5'),
    ];

    // Block the executor so runningCount stays elevated during polling.
    let releaseExec: () => void = () => undefined;
    const blocker = new Promise<void>((resolve) => {
      releaseExec = resolve;
    });
    mockExecuteRemediationImpl = async () => {
      await blocker;
      return { beforeSnapshot: null, afterSnapshot: {}, targetResourceId: 'r' };
    };

    const { pollPendingJobs, _getRunningCountForTests, _getQueueDepthForTests } =
      await import('../services/remediation-worker.js');
    await pollPendingJobs();

    // Flush microtasks so launchRemediation has bumped runningCount.
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(_getRunningCountForTests()).toBe(2);
    expect(_getQueueDepthForTests()).toBe(3);

    releaseExec();
  });

  it('marks job as failed (status=failed) when getRemediationAccessToken returns null', async () => {
    mockActiveTenants = [makeTenant('a')];
    mockPendingJobs = [makeJob('j1')];
    mockGetRemediationAccessTokenImpl = async () => null;

    const { pollPendingJobs } = await import('../services/remediation-worker.js');
    await pollPendingJobs();

    for (let i = 0; i < 30; i++) await Promise.resolve();

    const failedUpdate = mockTenantUpdates.find(
      (u) => u.vals.status === 'failed' && u.vals.lastAttemptError?.includes('consent_missing'),
    );
    expect(failedUpdate).toBeDefined();
  });
});

// ================================================================
// Graceful drain
// ================================================================

describe('stopRemediationWorker', () => {
  it('resolves immediately when no jobs are in-flight', async () => {
    const { stopRemediationWorker } = await import('../services/remediation-worker.js');
    const started = Date.now();
    await stopRemediationWorker();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('awaits in-flight promises before resolving', async () => {
    mockActiveTenants = [makeTenant('a')];
    mockPendingJobs = [makeJob('j1')];

    let execResolved = false;
    let releaseExec: () => void = () => undefined;
    mockExecuteRemediationImpl = async () => {
      await new Promise<void>((resolve) => {
        releaseExec = () => {
          execResolved = true;
          resolve();
        };
      });
      return { beforeSnapshot: null, afterSnapshot: {}, targetResourceId: 'r' };
    };

    const { pollPendingJobs, stopRemediationWorker } = await import(
      '../services/remediation-worker.js'
    );
    await pollPendingJobs();
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Kick off the stop and confirm it's waiting
    const stopPromise = stopRemediationWorker();

    // Release the in-flight job
    releaseExec();

    await stopPromise;
    expect(execResolved).toBe(true);
  });
});

// ================================================================
// sweepZombieJobs
// ================================================================

describe('sweepZombieJobs', () => {
  it('resets a running row with an old heartbeat to pending when attemptCount < MAX_ATTEMPTS', async () => {
    mockActiveTenants = [makeTenant('a')];
    mockRunningJobs = [
      {
        id: 'job-zombie-1',
        attemptCount: 1,
        heartbeatAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      },
    ];

    const { sweepZombieJobs } = await import('../services/remediation-worker.js');
    await sweepZombieJobs();

    const reset = mockTenantUpdates.find(
      (u) => u.vals.status === 'pending' && u.vals.workerId === null,
    );
    expect(reset).toBeDefined();
  });

  it('marks a zombie row as failed when attemptCount >= MAX_ATTEMPTS', async () => {
    mockActiveTenants = [makeTenant('a')];
    mockRunningJobs = [
      {
        id: 'job-zombie-terminal',
        attemptCount: 3,
        heartbeatAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ];

    const { sweepZombieJobs } = await import('../services/remediation-worker.js');
    await sweepZombieJobs();

    const failed = mockTenantUpdates.find(
      (u) => u.vals.status === 'failed' && u.vals.lastAttemptError === 'zombie_exceeded_max_attempts',
    );
    expect(failed).toBeDefined();
  });

  it('ignores running rows whose heartbeat is recent', async () => {
    mockActiveTenants = [makeTenant('a')];
    mockRunningJobs = [
      {
        id: 'job-healthy',
        attemptCount: 1,
        heartbeatAt: new Date(),
      },
    ];

    const { sweepZombieJobs } = await import('../services/remediation-worker.js');
    await sweepZombieJobs();

    const reset = mockTenantUpdates.find((u) => u.vals.status === 'pending');
    expect(reset).toBeUndefined();
  });

  it('ignores running rows with null heartbeat only if they are also recent -- treats null heartbeat as stale and resets', async () => {
    // If heartbeat_at is null the worker treats the row as zombie-eligible.
    mockActiveTenants = [makeTenant('a')];
    mockRunningJobs = [
      {
        id: 'job-null-heartbeat',
        attemptCount: 0,
        heartbeatAt: null,
      },
    ];

    const { sweepZombieJobs } = await import('../services/remediation-worker.js');
    await sweepZombieJobs();

    const reset = mockTenantUpdates.find(
      (u) => u.vals.status === 'pending' && u.vals.workerId === null,
    );
    expect(reset).toBeDefined();
  });
});
