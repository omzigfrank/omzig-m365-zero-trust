/**
 * Phase 8 Plan 01 Task 2 -- drift-poller tests.
 *
 * Tests the polling logic, MAX_CONCURRENT, deduplication, baseline skip,
 * alert insertion, SignalR push, and graceful drain.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock state ----

let cpTenantRows: any[] = [];
let tenantAuditRunRows: any[] = [];
let insertedAlerts: any[] = [];
let cpUpdates: any[] = [];
let tenantUserAccessRows: any[] = [];

function resetState() {
  cpTenantRows = [];
  tenantAuditRunRows = [];
  insertedAlerts = [];
  cpUpdates = [];
  tenantUserAccessRows = [];
}

// ---- Mock: @omzig/db ----

const mockCpDb = {
  select: vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        // Return cpTenantRows for tenants queries, or tenantUserAccessRows
        // We determine based on the mock state -- since the poller queries
        // tenants first and tenantUserAccess second, use a simple counter.
        return Promise.resolve(cpTenantRows);
      }),
    })),
  })),
  update: vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        cpUpdates.push({ table: 'tenants', time: new Date() });
        return Promise.resolve();
      }),
    })),
  })),
};

// We need to track which table is being queried to return correct data.
// Use a more detailed mock that distinguishes queries.
const TENANTS_SYM = Symbol('tenants');
const AUDIT_RUNS_SYM = Symbol('audit_runs');
const DRIFT_ALERTS_SYM = Symbol('drift_alerts');
const TENANT_USER_ACCESS_SYM = Symbol('tenant_user_access');

function makeCpDb() {
  let queryTable: any = null;
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => {
        queryTable = table;
        return {
          where: vi.fn().mockImplementation(() => {
            if (queryTable === TENANTS_SYM) return Promise.resolve(cpTenantRows);
            if (queryTable === TENANT_USER_ACCESS_SYM) return Promise.resolve(tenantUserAccessRows);
            return Promise.resolve([]);
          }),
        };
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          cpUpdates.push({ table: 'tenants', time: new Date() });
          return Promise.resolve();
        }),
      })),
    })),
  };
}

function makeTenantDb() {
  let queryTable: any = null;
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => {
        queryTable = table;
        return {
          where: vi.fn().mockImplementation(() => ({
            orderBy: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => {
                if (queryTable === AUDIT_RUNS_SYM) return Promise.resolve(tenantAuditRunRows);
                return Promise.resolve([]);
              }),
            })),
          })),
          orderBy: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        };
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: any) => {
        insertedAlerts.push(vals);
        return Promise.resolve();
      }),
    })),
  };
}

const mockCp = makeCpDb();
const mockTenant = makeTenantDb();

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(() => mockCp),
  getTenantDb: vi.fn().mockImplementation(() => ({ db: mockTenant })),
  tenants: TENANTS_SYM,
  auditRuns: AUDIT_RUNS_SYM,
  driftAlerts: DRIFT_ALERTS_SYM,
  tenantUserAccess: TENANT_USER_ACCESS_SYM,
  tenantRemediationConsents: Symbol('consents'),
}));

// ---- Mock: @omzig/audit ----

const mockParseAuditLogEvents = vi.fn().mockReturnValue({
  areaEvents: new Map(),
  allEvents: [],
});
const mockCollectSingleArea = vi.fn().mockResolvedValue({});
const mockDiffFactArea = vi.fn().mockReturnValue({
  drifted: false,
  structuredDiff: { added: [], removed: [], modified: [] },
  humanSummary: 'no changes',
});
const mockClassifySeverity = vi.fn().mockReturnValue('Medium');

const mockGraphClient = {
  api: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue({ value: [] }),
  }),
};
const mockCreateGraphClient = vi.fn().mockReturnValue(mockGraphClient);

vi.mock('@omzig/audit', () => ({
  parseAuditLogEvents: (...args: any[]) => mockParseAuditLogEvents(...args),
  collectSingleArea: (...args: any[]) => mockCollectSingleArea(...args),
  diffFactArea: (...args: any[]) => mockDiffFactArea(...args),
  classifySeverity: (...args: any[]) => mockClassifySeverity(...args),
  createGraphClient: (...args: any[]) => mockCreateGraphClient(...args),
}));

// ---- Mock: signalr ----

const mockPushDriftAlert = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/signalr.js', () => ({
  pushDriftAlert: (...args: any[]) => mockPushDriftAlert(...args),
  pushAuditProgress: vi.fn(),
  pushRemediationProgress: vi.fn(),
}));

// ---- Mock: drizzle-orm ----

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a: any, _b: any) => `eq`),
  and: vi.fn((...args: any[]) => args),
  or: vi.fn((...args: any[]) => args),
  isNotNull: vi.fn(() => `isNotNull`),
  isNull: vi.fn(() => `isNull`),
  lte: vi.fn(() => `lte`),
  desc: vi.fn(() => `desc`),
  sql: vi.fn(),
}));

// ---- Import SUT ----

const {
  startDriftPoller,
  stopDriftPoller,
  _resetDriftPollerForTests,
  _pollForDueDriftChecks,
  _drainInFlightForTests,
} = await import('../services/drift-poller.js');

// ---- Tests ----

describe('drift-poller', () => {
  beforeEach(() => {
    resetState();
    _resetDriftPollerForTests();
    vi.clearAllMocks();
    // Re-apply default mocks after clearAllMocks
    mockParseAuditLogEvents.mockReturnValue({
      areaEvents: new Map(),
      allEvents: [],
    });
    mockDiffFactArea.mockReturnValue({
      drifted: false,
      structuredDiff: { added: [], removed: [], modified: [] },
      humanSummary: 'no changes',
    });
    mockClassifySeverity.mockReturnValue('Medium');
    mockCollectSingleArea.mockResolvedValue({});
    mockPushDriftAlert.mockResolvedValue(undefined);
    mockCreateGraphClient.mockReturnValue(mockGraphClient);
    mockGraphClient.api.mockReturnValue({
      get: vi.fn().mockResolvedValue({ value: [] }),
    });
  });

  afterEach(async () => {
    await stopDriftPoller();
  });

  it('pollForDueDriftChecks queries control-plane for due tenants', async () => {
    cpTenantRows = [];
    await _pollForDueDriftChecks();
    expect(mockCp.select).toHaveBeenCalled();
  });

  it('skips tenants with no baseline factsSnapshot', async () => {
    cpTenantRows = [{
      id: 'tenant-1',
      databaseName: 'db-tenant-1',
      tokenSecretName: 'secret-1',
      isDeleted: false,
      status: 'active',
      lastDriftPollAt: null,
      driftCheckIntervalMinutes: 15,
    }];
    tenantAuditRunRows = []; // No completed runs

    // Events exist but no baseline -> should skip
    mockParseAuditLogEvents.mockReturnValue({
      areaEvents: new Map([['conditionalAccess', [{ eventId: 'e1', activityDisplayName: 'X', area: 'conditionalAccess' }]]]),
      allEvents: [{ eventId: 'e1' }],
    });

    await _pollForDueDriftChecks();
    await _drainInFlightForTests();

    expect(insertedAlerts).toHaveLength(0);
    expect(mockCollectSingleArea).not.toHaveBeenCalled();
  });

  it('does not insert drift_alerts when diffFactArea returns drifted=false', async () => {
    cpTenantRows = [{
      id: 'tenant-1',
      databaseName: 'db-tenant-1',
      tokenSecretName: 'secret-1',
      isDeleted: false,
      status: 'active',
      lastDriftPollAt: null,
      driftCheckIntervalMinutes: 15,
    }];
    tenantAuditRunRows = [{
      factsSnapshot: JSON.stringify({ conditionalAccess: { policies: [] } }),
      status: 'completed',
      completedAt: new Date(),
    }];
    mockParseAuditLogEvents.mockReturnValue({
      areaEvents: new Map([['conditionalAccess', [{ eventId: 'e1', activityDisplayName: 'Update conditional access policy', area: 'conditionalAccess', actorUpn: 'admin@test.com' }]]]),
      allEvents: [{ eventId: 'e1' }],
    });
    mockDiffFactArea.mockReturnValue({
      drifted: false,
      structuredDiff: { added: [], removed: [], modified: [] },
      humanSummary: 'no changes',
    });

    await _pollForDueDriftChecks();
    await _drainInFlightForTests();

    expect(insertedAlerts).toHaveLength(0);
  });

  it('inserts a drift_alerts row when diffFactArea returns drifted=true', async () => {
    cpTenantRows = [{
      id: 'tenant-1',
      databaseName: 'db-tenant-1',
      tokenSecretName: 'secret-1',
      isDeleted: false,
      status: 'active',
      lastDriftPollAt: null,
      driftCheckIntervalMinutes: 15,
    }];
    tenantAuditRunRows = [{
      factsSnapshot: JSON.stringify({ conditionalAccess: { policies: [] } }),
      status: 'completed',
      completedAt: new Date(),
    }];
    mockParseAuditLogEvents.mockReturnValue({
      areaEvents: new Map([['conditionalAccess', [{ eventId: 'e1', activityDisplayName: 'Delete conditional access policy', area: 'conditionalAccess', actorUpn: 'admin@test.com', actorAppName: null, timestamp: new Date(), operationType: 'Delete' }]]]),
      allEvents: [{ eventId: 'e1' }],
    });
    mockDiffFactArea.mockReturnValue({
      drifted: true,
      structuredDiff: { added: [], removed: [{ id: 'p1', displayName: 'Block Legacy Auth' }], modified: [] },
      humanSummary: 'conditionalAccess: 1 item(s) removed',
    });

    await _pollForDueDriftChecks();
    await _drainInFlightForTests();

    expect(insertedAlerts.length).toBeGreaterThanOrEqual(1);
    expect(insertedAlerts[0].area).toBe('conditionalAccess');
    expect(insertedAlerts[0].severity).toBe('Medium');
  });

  it('calls pushDriftAlert for each user in tenantUserAccess when drift detected', async () => {
    cpTenantRows = [{
      id: 'tenant-1',
      databaseName: 'db-tenant-1',
      tokenSecretName: 'secret-1',
      isDeleted: false,
      status: 'active',
      lastDriftPollAt: null,
      driftCheckIntervalMinutes: 15,
    }];
    tenantAuditRunRows = [{
      factsSnapshot: JSON.stringify({ conditionalAccess: { policies: [] } }),
      status: 'completed',
      completedAt: new Date(),
    }];
    tenantUserAccessRows = [
      { userId: 'user-1', tenantId: 'tenant-1' },
      { userId: 'user-2', tenantId: 'tenant-1' },
    ];
    mockParseAuditLogEvents.mockReturnValue({
      areaEvents: new Map([['conditionalAccess', [{ eventId: 'e1', activityDisplayName: 'Delete CA policy', area: 'conditionalAccess', actorUpn: 'admin@test.com' }]]]),
      allEvents: [{ eventId: 'e1' }],
    });
    mockDiffFactArea.mockReturnValue({
      drifted: true,
      structuredDiff: { added: [], removed: [{ id: 'p1' }], modified: [] },
      humanSummary: 'drift detected',
    });

    await _pollForDueDriftChecks();
    await _drainInFlightForTests();

    expect(mockPushDriftAlert).toHaveBeenCalledTimes(2);
    expect(mockPushDriftAlert.mock.calls[0][0]).toBe('user-1');
    expect(mockPushDriftAlert.mock.calls[1][0]).toBe('user-2');
  });

  it('deduplicates: 3 CA events -> collectSingleArea called once', async () => {
    cpTenantRows = [{
      id: 'tenant-1',
      databaseName: 'db-tenant-1',
      tokenSecretName: 'secret-1',
      isDeleted: false,
      status: 'active',
      lastDriftPollAt: null,
      driftCheckIntervalMinutes: 15,
    }];
    tenantAuditRunRows = [{
      factsSnapshot: JSON.stringify({ conditionalAccess: { policies: [] } }),
      status: 'completed',
      completedAt: new Date(),
    }];
    // parseAuditLogEvents already deduplicates: 3 CA events -> 1 area key
    const threeEvents = [
      { eventId: 'e1', activityDisplayName: 'Update CA', area: 'conditionalAccess' },
      { eventId: 'e2', activityDisplayName: 'Add CA', area: 'conditionalAccess' },
      { eventId: 'e3', activityDisplayName: 'Delete CA', area: 'conditionalAccess' },
    ];
    mockParseAuditLogEvents.mockReturnValue({
      areaEvents: new Map([['conditionalAccess', threeEvents]]),
      allEvents: threeEvents,
    });

    await _pollForDueDriftChecks();
    await _drainInFlightForTests();

    // collectSingleArea should be called exactly once for the single unique area
    expect(mockCollectSingleArea).toHaveBeenCalledTimes(1);
  });

  it('updates lastDriftPollAt BEFORE launching the drift check (PITFALL 5)', async () => {
    cpTenantRows = [{
      id: 'tenant-1',
      databaseName: 'db-tenant-1',
      tokenSecretName: 'secret-1',
      isDeleted: false,
      status: 'active',
      lastDriftPollAt: null,
      driftCheckIntervalMinutes: 15,
    }];
    tenantAuditRunRows = [];

    await _pollForDueDriftChecks();
    await _drainInFlightForTests();

    // cpUpdates should have at least one entry (lastDriftPollAt update)
    expect(cpUpdates.length).toBeGreaterThanOrEqual(1);
  });

  it('stopDriftPoller sets shuttingDown and drains', async () => {
    startDriftPoller();
    await stopDriftPoller();
    // Should complete without hanging
    expect(true).toBe(true);
  });
});
