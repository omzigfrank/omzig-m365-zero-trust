/**
 * In-process scan scheduler service.
 *
 * Polls the control-plane DB on a fixed interval for tenants whose
 * scheduled scan is due, then launches `runAuditPipeline` for up to
 * MAX_CONCURRENT scans simultaneously. Excess due tenants are queued
 * and drained with a STAGGER_MS delay between successive launches.
 *
 * PITFALL 1: scheduleNextRunAt is updated BEFORE launching the pipeline
 * to prevent the next poll from re-picking the same tenant if the run
 * outlasts the poll interval.
 *
 * PITFALL 2: All errors inside the poll loop are caught and logged so
 * a single tenant failure does not crash the scheduler.
 *
 * PITFALL 3: Token refresh -- the scheduler uses a stub token resolver
 * that should be replaced by a real Key Vault retrieval + refresh flow.
 * The TokenManager inside runAuditPipeline handles refresh DURING a run,
 * but the initial token must come from stored credentials.
 */
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { getControlPlaneDb, getTenantDb, tenants, auditRuns } from '@omzig/db';
import { runAuditPipeline } from '@omzig/audit';
import { pushAuditProgress } from './signalr.js';

// ---- Constants ----

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const STAGGER_MS = 5 * 60 * 1000; // 5 minutes between staggered launches
const MAX_CONCURRENT = 3;

// ---- Module state ----

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let runningCount = 0;
const pendingQueue: Array<TenantRow> = [];

type TenantRow = {
  id: string;
  orgId: string;
  databaseName: string | null;
  tokenSecretName: string | null;
  isDeleted: boolean;
  status: string;
  scheduleFrequency: string | null;
  scheduleNextRunAt: Date | null;
};

// ---- Pure helpers ----

/**
 * Compute the next scheduled run time given a frequency and a base date.
 * Pure function — exported for tests and the schedule API route.
 */
export function computeNextRun(
  frequency: 'daily' | 'weekly',
  fromDate: Date,
): Date {
  const ms = frequency === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(fromDate.getTime() + ms);
}

/**
 * Stub token resolver. Production should fetch the refresh token from
 * Key Vault using `tenant.tokenSecretName` and exchange it for an access
 * token via MSAL confidential client. The TokenManager inside the audit
 * pipeline handles refresh during the run.
 */
async function getSchedulerAccessToken(tenant: TenantRow): Promise<string | null> {
  if (!tenant.tokenSecretName) {
    console.warn(
      `[scheduler] Tenant ${tenant.id} has no tokenSecretName -- cannot run scheduled scan`,
    );
    return null;
  }
  // TODO: integrate with keyvault.ts to fetch + refresh the access token.
  console.warn(
    `[scheduler] Using PLACEHOLDER token for tenant ${tenant.id}. ` +
      `Replace getSchedulerAccessToken() with a real Key Vault + MSAL flow before production.`,
  );
  return 'placeholder-access-token';
}

// ---- Internal: execute a single scheduled scan ----

/**
 * Launch a scan for the given tenant. Synchronously increments the running
 * counter (so pollForDueScans's MAX_CONCURRENT check sees an accurate count
 * even before the async work begins) and returns the promise that resolves
 * when the pipeline finishes (or fails). Caller is fire-and-forget.
 */
function launchScan(tenant: TenantRow): Promise<void> {
  // Synchronous counter bump -- must happen BEFORE any await so the
  // outer poll loop sees the updated count immediately.
  runningCount++;
  return executeScan(tenant);
}

async function executeScan(tenant: TenantRow): Promise<void> {
  if (!tenant.databaseName || !tenant.scheduleFrequency) {
    runningCount--;
    return;
  }

  try {
    // PITFALL 1: update scheduleNextRunAt FIRST so the next poll does not
    // re-pick this tenant before the pipeline finishes.
    const nextRun = computeNextRun(
      tenant.scheduleFrequency as 'daily' | 'weekly',
      new Date(),
    );

    const db = await getControlPlaneDb();
    await db
      .update(tenants)
      .set({
        scheduleNextRunAt: nextRun,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));

    // Resolve access token (placeholder in this iteration)
    const accessToken = await getSchedulerAccessToken(tenant);
    if (!accessToken) {
      console.warn(
        `[scheduler] Skipping tenant ${tenant.id} -- no access token available`,
      );
      return;
    }

    // Create audit run row in the tenant DB
    const auditId = crypto.randomUUID();
    const { db: tenantDb } = await getTenantDb(tenant.databaseName);
    await tenantDb.insert(auditRuns).values({
      id: auditId,
      tenantId: tenant.id,
      triggeredBy: 'scheduler',
      status: 'running',
      startedAt: new Date(),
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      errorChecks: 0,
    });

    // Fire-and-forget the pipeline
    await runAuditPipeline({
      auditId,
      tenantId: tenant.id,
      databaseName: tenant.databaseName,
      accessToken,
      userId: 'scheduler',
      signalrPush: pushAuditProgress,
    });
  } catch (err) {
    console.error(
      `[scheduler] executeScan failed for tenant ${tenant.id}:`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    runningCount--;
    // Drain queue with stagger
    if (pendingQueue.length > 0) {
      const next = pendingQueue.shift()!;
      setTimeout(() => {
        launchScan(next).catch((e) => {
          console.error('[scheduler] queued launchScan failed:', e);
        });
      }, STAGGER_MS);
    }
  }
}

// ---- Internal: poll for due scans ----

/**
 * Query the control plane for tenants whose scan is due, then launch
 * up to MAX_CONCURRENT scans. Excess tenants are pushed to the pending
 * queue and drained later via the stagger mechanism in executeScan().
 *
 * Exported for tests. Top-level try/catch swallows errors so the poll
 * loop never crashes the API process.
 */
export async function pollForDueScans(): Promise<void> {
  try {
    const db = await getControlPlaneDb();
    const now = new Date();

    const dueRows = (await db
      .select()
      .from(tenants)
      .where(
        and(
          isNotNull(tenants.scheduleFrequency),
          isNotNull(tenants.scheduleNextRunAt),
          lte(tenants.scheduleNextRunAt, now),
          eq(tenants.isDeleted, false),
          eq(tenants.status, 'active'),
          isNotNull(tenants.databaseName),
        ),
      )) as unknown as TenantRow[];

    for (const tenant of dueRows) {
      if (runningCount < MAX_CONCURRENT) {
        // Fire-and-forget; launchScan increments the counter synchronously.
        launchScan(tenant).catch((e) =>
          console.error('[scheduler] launchScan rejected:', e),
        );
      } else {
        pendingQueue.push(tenant);
      }
    }
  } catch (err) {
    console.error(
      '[scheduler] pollForDueScans error (continuing):',
      err instanceof Error ? err.message : err,
    );
  }
}

// ---- Lifecycle ----

/**
 * Start the scheduler. Installs a setInterval polling timer.
 * Idempotent: subsequent calls without stop are no-ops.
 */
export function startScheduler(): void {
  if (intervalHandle !== null) {
    return; // already running
  }
  console.log(
    `[scheduler] Starting -- poll interval ${POLL_INTERVAL_MS}ms, max concurrent ${MAX_CONCURRENT}, stagger ${STAGGER_MS}ms`,
  );
  intervalHandle = setInterval(() => {
    pollForDueScans().catch((e) =>
      console.error('[scheduler] poll error:', e),
    );
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the scheduler. Clears the interval timer.
 */
export function stopScheduler(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[scheduler] Stopped');
  }
}

// ---- Test helpers ----

export function _resetSchedulerForTests(): void {
  runningCount = 0;
  pendingQueue.length = 0;
}

export function _getQueueDepthForTests(): number {
  return pendingQueue.length;
}
