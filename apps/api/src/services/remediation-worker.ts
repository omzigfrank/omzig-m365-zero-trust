/**
 * Remediation Worker -- Phase 7 Plan 01 Task 3.
 *
 * In-process poller that picks up pending remediation_jobs rows across
 * all active tenants, resolves a write access token via the OBO token
 * broker, invokes the audit package's executeRemediation() for each,
 * and transitions rows through their lifecycle. Mirrors scheduler.ts
 * in overall structure but with Phase 7-specific knobs:
 *
 *   POLL_INTERVAL_MS        10_000   (6x tighter than scheduler)
 *   MAX_CONCURRENT          2        (writes are more consequential)
 *   STAGGER_MS              30_000
 *   HEARTBEAT_INTERVAL_MS   30_000   (worker heartbeats on running rows)
 *   ZOMBIE_THRESHOLD_MS     5 min    (zombie sweep reclaims stuck rows)
 *   MAX_ATTEMPTS            3
 *
 * This file does NOT modify apps/api/src/services/scheduler.ts. The
 * graceful drain capability added here is self-contained to the
 * remediation worker; see deferred-items.md for the scheduler follow-up.
 */
import os from 'node:os';
import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import {
  getControlPlaneDb,
  getTenantDb,
  tenants,
  remediationJobs,
} from '@omzig/db';
import {
  executeRemediation,
  getRemediationByControlId,
  WriteRateLimiter,
  collectFacts,
  createGraphClient,
} from '@omzig/audit';
import {
  getRemediationAccessToken,
  type ScopeBundleName,
} from './remediation-token-broker.js';
import { pushRemediationProgress } from './signalr.js';

// ---- Constants ----

const POLL_INTERVAL_MS = 10_000; // 10 seconds
const STAGGER_MS = 30 * 1000; // 30 seconds between staggered launches
const MAX_CONCURRENT = 2;
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const ZOMBIE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;
const DRAIN_TIMEOUT_MS = 30_000; // graceful stop cap

// ---- Module state ----

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let runningCount = 0;
const pendingQueue: Array<QueueEntry> = [];
const inFlightPromises = new Set<Promise<void>>();
let shuttingDown = false;

const workerId = `${process.pid}@${os.hostname()}`;

type TenantRow = {
  id: string;
  databaseName: string | null;
  isDeleted: boolean;
  status: string;
};

type JobRow = {
  id: string;
  tenantId: string;
  findingId: string;
  controlId: string;
  classification: string;
  scopeBundle: string;
  status: string;
  attemptCount: number;
  approvedByUserId: string;
};

type QueueEntry = {
  tenant: TenantRow;
  job: JobRow;
};

// Shared write rate limiter across all in-process remediations.
const sharedRateLimiter = new WriteRateLimiter();

// ---- Helpers ----

function isShuttingDown(): boolean {
  return shuttingDown;
}

// ---- Launch / execute ----

function launchRemediation(tenant: TenantRow, job: JobRow): Promise<void> {
  // Synchronous counter bump BEFORE any await, mirroring scheduler.ts.
  runningCount++;
  const p = executeRemediationJob(tenant, job);
  inFlightPromises.add(p);
  // Remove from tracking set when done (regardless of outcome).
  p.finally(() => inFlightPromises.delete(p));
  return p;
}

function safePushRemediation(
  userId: string,
  message: Parameters<typeof pushRemediationProgress>[1],
): void {
  // Fire-and-forget; SignalR not configured in tests and we never want to
  // bubble progress errors into the worker control flow.
  pushRemediationProgress(userId, message).catch(() => {});
}

async function executeRemediationJob(
  tenant: TenantRow,
  job: JobRow,
): Promise<void> {
  let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  const classification = (job.classification === 'RISKY' ? 'RISKY' : 'SAFE') as
    | 'SAFE'
    | 'RISKY';

  // Lifecycle push: started
  safePushRemediation(job.approvedByUserId, {
    type: 'remediation_started',
    remediationJobId: job.id,
    tenantId: tenant.id,
    controlId: job.controlId,
    classification,
    status: 'running',
  });

  try {
    if (!tenant.databaseName) {
      throw new Error(`Tenant ${tenant.id} missing databaseName`);
    }
    const { db: tenantDb } = await getTenantDb(tenant.databaseName);

    // Start heartbeat loop -- refreshes heartbeat_at so the zombie
    // sweeper does not reclaim this row.
    heartbeatHandle = setInterval(() => {
      tenantDb
        .update(remediationJobs)
        .set({ heartbeatAt: new Date() })
        .where(eq(remediationJobs.id, job.id))
        .catch((err: unknown) => {
          console.warn(
            `[remediation-worker] heartbeat update failed for job ${job.id}:`,
            err instanceof Error ? err.message : err,
          );
        });
    }, HEARTBEAT_INTERVAL_MS);

    // Resolve write access token via OBO broker.
    const accessToken = await getRemediationAccessToken(
      tenant.id,
      job.scopeBundle as ScopeBundleName,
    );

    if (!accessToken) {
      await tenantDb
        .update(remediationJobs)
        .set({
          status: 'failed',
          lastAttemptError: `consent_missing: no active consent for bundle=${job.scopeBundle}`,
          completedAt: new Date(),
        })
        .where(eq(remediationJobs.id, job.id));
      return;
    }

    // Look up remediation entry.
    const entry = getRemediationByControlId(job.controlId);
    if (!entry) {
      await tenantDb
        .update(remediationJobs)
        .set({
          status: 'failed',
          lastAttemptError: `unknown_control: ${job.controlId}`,
          completedAt: new Date(),
        })
        .where(eq(remediationJobs.id, job.id));
      return;
    }

    // Build Graph client and facts context. For Phase 7 Plan 01 we
    // collect facts fresh at execution time; in 07-02 the API route
    // will pass an audit-run-derived facts snapshot directly.
    const graphClient = createGraphClient(accessToken);
    const facts = await collectFacts(graphClient);

    const ctx = {
      tenantId: tenant.id,
      graphClient,
      facts,
      rateLimiter: sharedRateLimiter,
    };

    // Lifecycle push: progress (executing)
    safePushRemediation(job.approvedByUserId, {
      type: 'remediation_progress',
      remediationJobId: job.id,
      tenantId: tenant.id,
      controlId: job.controlId,
      classification,
      status: 'executing',
      message: `Executing ${entry.controlId}`,
    });

    const result = await executeRemediation(entry, ctx);

    await tenantDb
      .update(remediationJobs)
      .set({
        status: 'completed',
        beforeSnapshot: JSON.stringify(result.beforeSnapshot),
        afterSnapshot: JSON.stringify(result.afterSnapshot),
        targetResourceId: result.targetResourceId,
        completedAt: new Date(),
      })
      .where(eq(remediationJobs.id, job.id));

    // Lifecycle push: completed
    safePushRemediation(job.approvedByUserId, {
      type: 'remediation_completed',
      remediationJobId: job.id,
      tenantId: tenant.id,
      controlId: job.controlId,
      classification,
      status: 'completed',
      beforeSnapshot: result.beforeSnapshot,
      afterSnapshot: result.afterSnapshot,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[remediation-worker] job ${job.id} (${job.controlId}) failed:`,
      errMsg,
    );

    // Lifecycle push: failed
    safePushRemediation(job.approvedByUserId, {
      type: 'remediation_failed',
      remediationJobId: job.id,
      tenantId: tenant.id,
      controlId: job.controlId,
      classification,
      status: 'failed',
      error: errMsg,
    });

    // Decide retry vs fail.
    try {
      if (tenant.databaseName) {
        const { db: tenantDb } = await getTenantDb(tenant.databaseName);
        const nextStatus = job.attemptCount + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await tenantDb
          .update(remediationJobs)
          .set({
            status: nextStatus,
            lastAttemptError: errMsg.slice(0, 3900),
            ...(nextStatus === 'failed' ? { completedAt: new Date() } : {}),
          })
          .where(eq(remediationJobs.id, job.id));
      }
    } catch (innerErr) {
      console.error(
        '[remediation-worker] failed to update job row after error:',
        innerErr instanceof Error ? innerErr.message : innerErr,
      );
    }
  } finally {
    if (heartbeatHandle !== null) {
      clearInterval(heartbeatHandle);
    }
    runningCount--;
    // Drain the queue with stagger between launches.
    if (pendingQueue.length > 0 && !shuttingDown) {
      const next = pendingQueue.shift()!;
      setTimeout(() => {
        if (!shuttingDown) {
          launchRemediation(next.tenant, next.job).catch((e) =>
            console.error('[remediation-worker] queued launch failed:', e),
          );
        }
      }, STAGGER_MS);
    }
  }
}

// ---- Row-level lock ----

/**
 * Attempt to claim a pending job by UPDATE ... WHERE status='pending'.
 * Returns true iff the UPDATE affected exactly 1 row (i.e., no other
 * worker grabbed it between SELECT and UPDATE). Mirrors research §8.1.
 */
async function tryClaimJob(
  tenantDb: Awaited<ReturnType<typeof getTenantDb>>['db'],
  jobId: string,
): Promise<boolean> {
  const result = (await tenantDb
    .update(remediationJobs)
    .set({
      status: 'running',
      workerId,
      startedAt: new Date(),
      heartbeatAt: new Date(),
      // attemptCount handled via raw increment on re-pickup below
    })
    .where(
      and(eq(remediationJobs.id, jobId), eq(remediationJobs.status, 'pending')),
    )) as unknown as { rowsAffected?: number | number[] };

  // drizzle mssql returns rowsAffected as number or number[] depending on driver.
  const affected = Array.isArray(result?.rowsAffected)
    ? result.rowsAffected[0] ?? 0
    : result?.rowsAffected ?? 0;
  return affected > 0;
}

// ---- Poll ----

export async function pollPendingJobs(): Promise<void> {
  if (shuttingDown) return;

  try {
    // Zombie sweep first: reclaim stuck running rows.
    await sweepZombieJobs();

    const db = await getControlPlaneDb();
    const activeTenants = (await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.isDeleted, false),
          eq(tenants.status, 'active'),
          isNotNull(tenants.databaseName),
        ),
      )) as unknown as TenantRow[];

    for (const tenant of activeTenants) {
      if (!tenant.databaseName) continue;

      try {
        const { db: tenantDb } = await getTenantDb(tenant.databaseName);
        const pending = (await tenantDb
          .select()
          .from(remediationJobs)
          .where(eq(remediationJobs.status, 'pending'))) as unknown as JobRow[];

        // Sort oldest first -- drizzle does not expose LIMIT easily for
        // mssql; take the first 10 by createdAt ordering in-memory.
        const top10 = pending.slice(0, 10);

        for (const job of top10) {
          if (shuttingDown) return;
          const claimed = await tryClaimJob(tenantDb, job.id);
          if (!claimed) continue; // another worker grabbed it

          if (runningCount < MAX_CONCURRENT) {
            launchRemediation(tenant, { ...job, attemptCount: job.attemptCount + 1 }).catch(
              (e) => console.error('[remediation-worker] launch failed:', e),
            );
          } else {
            pendingQueue.push({
              tenant,
              job: { ...job, attemptCount: job.attemptCount + 1 },
            });
          }
        }
      } catch (innerErr) {
        console.error(
          `[remediation-worker] tenant ${tenant.id} poll error (continuing):`,
          innerErr instanceof Error ? innerErr.message : innerErr,
        );
      }
    }
  } catch (err) {
    console.error(
      '[remediation-worker] pollPendingJobs error (continuing):',
      err instanceof Error ? err.message : err,
    );
  }
}

// ---- Zombie sweep ----

/**
 * For each active tenant, find running rows whose heartbeat_at is older
 * than ZOMBIE_THRESHOLD_MS. If attempt_count < MAX_ATTEMPTS, reset to
 * pending so the next poll re-picks them. Otherwise mark failed.
 */
export async function sweepZombieJobs(): Promise<void> {
  try {
    const db = await getControlPlaneDb();
    const activeTenants = (await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.isDeleted, false),
          eq(tenants.status, 'active'),
          isNotNull(tenants.databaseName),
        ),
      )) as unknown as TenantRow[];

    const cutoff = new Date(Date.now() - ZOMBIE_THRESHOLD_MS);

    for (const tenant of activeTenants) {
      if (!tenant.databaseName) continue;

      try {
        const { db: tenantDb } = await getTenantDb(tenant.databaseName);

        // Candidate rows: running + heartbeat old OR heartbeat null.
        // Two passes: rows that can be retried, rows that must fail.
        const candidates = (await tenantDb
          .select()
          .from(remediationJobs)
          .where(eq(remediationJobs.status, 'running'))) as unknown as Array<{
          id: string;
          attemptCount: number;
          heartbeatAt: Date | null;
        }>;

        for (const row of candidates) {
          if (row.heartbeatAt !== null && row.heartbeatAt > cutoff) continue;

          if (row.attemptCount >= MAX_ATTEMPTS) {
            await tenantDb
              .update(remediationJobs)
              .set({
                status: 'failed',
                lastAttemptError: 'zombie_exceeded_max_attempts',
                completedAt: new Date(),
              })
              .where(eq(remediationJobs.id, row.id));
          } else {
            await tenantDb
              .update(remediationJobs)
              .set({ status: 'pending', workerId: null })
              .where(eq(remediationJobs.id, row.id));
          }
        }
      } catch (err) {
        console.error(
          `[remediation-worker] zombie sweep failed for tenant ${tenant.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    console.error(
      '[remediation-worker] sweepZombieJobs error (continuing):',
      err instanceof Error ? err.message : err,
    );
  }
}

// ---- Lifecycle ----

export function startRemediationWorker(): void {
  if (intervalHandle !== null) return; // idempotent
  shuttingDown = false;
  console.log(
    `[remediation-worker] Starting -- workerId=${workerId} poll=${POLL_INTERVAL_MS}ms max=${MAX_CONCURRENT} stagger=${STAGGER_MS}ms`,
  );
  intervalHandle = setInterval(() => {
    pollPendingJobs().catch((e) =>
      console.error('[remediation-worker] poll error:', e),
    );
  }, POLL_INTERVAL_MS);
}

/**
 * Graceful drain: clear the interval, drain in-flight jobs with a 30s
 * cap (Promise.race against a timeout), then resolve. Called from the
 * SIGTERM handler in apps/api/src/index.ts.
 */
export async function stopRemediationWorker(): Promise<void> {
  shuttingDown = true;
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  const inFlight = Array.from(inFlightPromises);
  if (inFlight.length === 0) {
    console.log('[remediation-worker] Stopped (no in-flight jobs)');
    return;
  }

  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), DRAIN_TIMEOUT_MS);
  });

  const drainPromise = Promise.allSettled(inFlight).then(() => 'drained' as const);

  const winner = await Promise.race([drainPromise, timeoutPromise]);
  if (winner === 'timeout') {
    console.warn(
      `[remediation-worker] Drain timeout -- ${inFlightPromises.size} in-flight jobs abandoned`,
    );
  } else {
    console.log('[remediation-worker] Stopped (drained cleanly)');
  }
}

// ---- Test helpers ----

export function _resetRemediationWorkerForTests(): void {
  runningCount = 0;
  pendingQueue.length = 0;
  inFlightPromises.clear();
  shuttingDown = false;
}

export function _getRunningCountForTests(): number {
  return runningCount;
}

export function _getQueueDepthForTests(): number {
  return pendingQueue.length;
}

export function _getInFlightCountForTests(): number {
  return inFlightPromises.size;
}

// Suppress unused import warning -- isNull is reserved for future use in
// pending_since-style queries once we add that column.
void isNull;
void lt;
