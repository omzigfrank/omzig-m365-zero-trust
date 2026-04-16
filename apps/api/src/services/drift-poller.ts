/**
 * Drift Poller Service -- Phase 8 Plan 01 Task 2.
 *
 * In-process poller that checks the control-plane DB every 60 seconds
 * for tenants whose drift check interval has elapsed, then executes
 * the two-phase detection (audit log poll + targeted re-collect + diff)
 * for each. Mirrors the scheduler.ts + remediation-worker.ts patterns.
 *
 * PITFALL 5: lastDriftPollAt is updated BEFORE processing to prevent
 * re-picks on crash.
 */

import { eq, and, or, isNotNull, isNull, lte, desc } from 'drizzle-orm';
import {
  getControlPlaneDb,
  getTenantDb,
  tenants,
  auditRuns,
  driftAlerts,
  tenantUserAccess,
} from '@omzig/db';
import {
  parseAuditLogEvents,
  collectSingleArea,
  diffFactArea,
  classifySeverity,
  createGraphClient,
  type AuditFacts,
  type DriftEvent,
} from '@omzig/audit';
import { pushDriftAlert } from './signalr.js';

// ---- Constants ----

const POLL_INTERVAL_MS = 60_000; // Check for due tenants every 60s
const MAX_CONCURRENT = 3;
const STAGGER_MS = 30 * 1000; // 30s between queued launches
const DRAIN_TIMEOUT_MS = 30_000;

// ---- Module state ----

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let runningCount = 0;
const pendingQueue: Array<TenantRow> = [];
const inFlightPromises = new Set<Promise<void>>();
let shuttingDown = false;

type TenantRow = {
  id: string;
  databaseName: string | null;
  tokenSecretName: string | null;
  isDeleted: boolean;
  status: string;
  lastDriftPollAt: Date | null;
  driftCheckIntervalMinutes: number | null;
};

// ---- Token resolution stub ----

async function getDriftAccessToken(_tenant: TenantRow): Promise<string | null> {
  if (!_tenant.tokenSecretName) {
    console.warn(
      `[drift-poller] Tenant ${_tenant.id} has no tokenSecretName -- skipping drift check`,
    );
    return null;
  }
  // TODO: integrate with keyvault.ts for real token resolution
  console.warn(
    `[drift-poller] Using PLACEHOLDER token for tenant ${_tenant.id}. ` +
      'Replace getDriftAccessToken() with a real Key Vault + MSAL flow.',
  );
  return 'placeholder-drift-token';
}

// ---- Internal: execute a single drift check ----

function launchDriftCheck(tenant: TenantRow): Promise<void> {
  runningCount++;
  const p = checkTenantDrift(tenant);
  inFlightPromises.add(p);
  p.finally(() => inFlightPromises.delete(p));
  return p;
}

async function checkTenantDrift(tenant: TenantRow): Promise<void> {
  try {
    if (!tenant.databaseName) {
      console.warn(`[drift-poller] Tenant ${tenant.id} missing databaseName`);
      return;
    }

    const cpDb = await getControlPlaneDb();

    // PITFALL 5: Update lastDriftPollAt BEFORE starting to prevent re-picks on crash.
    const oldPollAt = tenant.lastDriftPollAt;
    await cpDb
      .update(tenants)
      .set({ lastDriftPollAt: new Date(), updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id));

    // Get Graph access token
    const accessToken = await getDriftAccessToken(tenant);
    if (!accessToken) return;

    const client = createGraphClient(accessToken);

    // Determine "since" for audit log query
    const since = oldPollAt ?? new Date(Date.now() - 15 * 60_000);

    // Poll audit log: GET /auditLogs/directoryAudits?$filter=activityDateTime ge {since}
    let allRawEvents: unknown[] = [];
    try {
      const sinceISO = since.toISOString();
      let url: string | null =
        `/auditLogs/directoryAudits?$filter=activityDateTime ge ${sinceISO}&$top=100&$orderby=activityDateTime desc`;

      while (url) {
        const page = await client.api(url).get();
        if (page?.value) allRawEvents.push(...page.value);
        url = page?.['@odata.nextLink'] ?? null;
        // Safety: cap at 500 events per poll cycle
        if (allRawEvents.length > 500) break;
      }
    } catch (err) {
      console.error(
        `[drift-poller] Audit log query failed for tenant ${tenant.id}:`,
        err instanceof Error ? err.message : err,
      );
      return;
    }

    // Parse and filter events
    const { areaEvents } = parseAuditLogEvents(allRawEvents as any[]);
    if (areaEvents.size === 0) return; // No security-relevant changes

    // Load baseline from most recent completed audit run with factsSnapshot
    const { db: tenantDb } = await getTenantDb(tenant.databaseName);
    const latestRuns = await tenantDb
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.status, 'completed'))
      .orderBy(desc(auditRuns.completedAt))
      .limit(1);

    const latestRun = (latestRuns as any[])[0];
    if (!latestRun?.factsSnapshot) {
      console.log(
        `[drift-poller] Tenant ${tenant.id} has no baseline factsSnapshot -- skipping`,
      );
      return;
    }

    let baselineFacts: AuditFacts;
    try {
      baselineFacts = JSON.parse(latestRun.factsSnapshot) as AuditFacts;
    } catch {
      console.error(
        `[drift-poller] Failed to parse factsSnapshot for tenant ${tenant.id}`,
      );
      return;
    }

    // For each unique area, re-collect and diff
    for (const [area, areaEventsArr] of areaEvents) {
      if (shuttingDown) break;

      try {
        const currentAreaFacts = await collectSingleArea(
          client,
          area as keyof AuditFacts,
        );
        const baselineAreaFacts =
          baselineFacts[area as keyof AuditFacts];

        const diff = diffFactArea(area, baselineAreaFacts, currentAreaFacts);
        if (!diff.drifted) continue; // Audit log showed activity but net state didn't change

        const severity = classifySeverity(areaEventsArr as DriftEvent[]);
        const actorUpn =
          (areaEventsArr as DriftEvent[])[0]?.actorUpn ?? null;
        const alertId = crypto.randomUUID();

        // Insert drift_alerts row
        await tenantDb.insert(driftAlerts).values({
          id: alertId,
          tenantId: tenant.id,
          area,
          severity,
          activityType: (areaEventsArr as DriftEvent[])
            .map((e) => e.activityDisplayName)
            .join(', '),
          actorUpn,
          beforeSnapshot: JSON.stringify(baselineAreaFacts),
          afterSnapshot: JSON.stringify(currentAreaFacts),
          diffSummary: diff.humanSummary,
          auditEventId:
            (areaEventsArr as DriftEvent[])[0]?.eventId ?? null,
          detectedAt: new Date(),
        });

        // Push to all users watching this tenant
        try {
          const watchers = await cpDb
            .select()
            .from(tenantUserAccess)
            .where(eq(tenantUserAccess.tenantId, tenant.id));

          for (const watcher of watchers as Array<{ userId: string }>) {
            pushDriftAlert(watcher.userId, {
              type: 'drift_detected',
              driftAlertId: alertId,
              tenantId: tenant.id,
              area,
              severity,
              activityType:
                (areaEventsArr as DriftEvent[])[0]
                  ?.activityDisplayName ?? '',
              actorUpn,
              diffSummary: diff.humanSummary,
              detectedAt: new Date().toISOString(),
            }).catch(() => {}); // Fire-and-forget
          }
        } catch {
          // SignalR push failure is non-fatal
        }
      } catch (err) {
        console.error(
          `[drift-poller] Area ${area} re-collection failed for tenant ${tenant.id}:`,
          err instanceof Error ? err.message : err,
        );
        // Continue with other areas
      }
    }
  } catch (err) {
    console.error(
      `[drift-poller] checkTenantDrift failed for tenant ${tenant.id}:`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    runningCount--;
    // Drain queue with stagger
    if (pendingQueue.length > 0 && !shuttingDown) {
      const next = pendingQueue.shift()!;
      setTimeout(() => {
        if (!shuttingDown) {
          launchDriftCheck(next).catch((e) =>
            console.error('[drift-poller] queued launch failed:', e),
          );
        }
      }, STAGGER_MS);
    }
  }
}

// ---- Internal: poll for due drift checks ----

export async function _pollForDueDriftChecks(): Promise<void> {
  if (shuttingDown) return;

  try {
    const db = await getControlPlaneDb();
    const now = new Date();

    const dueRows = (await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.isDeleted, false),
          eq(tenants.status, 'active'),
          isNotNull(tenants.databaseName),
          isNotNull(tenants.tokenSecretName),
        ),
      )) as unknown as TenantRow[];

    // Client-side filter for due check: either never polled or interval elapsed
    const dueTenants = dueRows.filter((t) => {
      if (!t.lastDriftPollAt) return true;
      const intervalMs = (t.driftCheckIntervalMinutes ?? 15) * 60_000;
      return t.lastDriftPollAt.getTime() + intervalMs < now.getTime();
    });

    for (const tenant of dueTenants) {
      if (shuttingDown) break;
      if (runningCount < MAX_CONCURRENT) {
        launchDriftCheck(tenant).catch((e) =>
          console.error('[drift-poller] launchDriftCheck rejected:', e),
        );
      } else {
        pendingQueue.push(tenant);
      }
    }
  } catch (err) {
    console.error(
      '[drift-poller] _pollForDueDriftChecks error (continuing):',
      err instanceof Error ? err.message : err,
    );
  }
}

// ---- Lifecycle ----

export function startDriftPoller(): void {
  if (intervalHandle !== null) return; // idempotent
  shuttingDown = false;
  console.log(
    `[drift-poller] Starting -- poll interval ${POLL_INTERVAL_MS}ms, max concurrent ${MAX_CONCURRENT}, stagger ${STAGGER_MS}ms`,
  );
  intervalHandle = setInterval(() => {
    _pollForDueDriftChecks().catch((e) =>
      console.error('[drift-poller] poll error:', e),
    );
  }, POLL_INTERVAL_MS);
}

export async function stopDriftPoller(): Promise<void> {
  shuttingDown = true;
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  const inFlight = Array.from(inFlightPromises);
  if (inFlight.length === 0) {
    console.log('[drift-poller] Stopped (no in-flight checks)');
    return;
  }

  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), DRAIN_TIMEOUT_MS);
  });

  const drainPromise = Promise.allSettled(inFlight).then(
    () => 'drained' as const,
  );

  const winner = await Promise.race([drainPromise, timeoutPromise]);
  if (winner === 'timeout') {
    console.warn(
      `[drift-poller] Drain timeout -- ${inFlightPromises.size} in-flight checks abandoned`,
    );
  } else {
    console.log('[drift-poller] Stopped (drained cleanly)');
  }
}

// ---- Test helpers ----

export function _resetDriftPollerForTests(): void {
  runningCount = 0;
  pendingQueue.length = 0;
  inFlightPromises.clear();
  shuttingDown = false;
}

export async function _drainInFlightForTests(): Promise<void> {
  await Promise.allSettled(Array.from(inFlightPromises));
}

// Suppress unused import warnings
void or;
void isNull;
void lte;
