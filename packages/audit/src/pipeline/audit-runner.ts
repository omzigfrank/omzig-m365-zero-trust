/**
 * Audit runner pipeline — orchestrates the complete audit flow:
 * 1. Open own DB connection (PITFALL 4: NOT middleware-provided)
 * 2. Update audit run status to 'running'
 * 3. Create Graph client with access token
 * 4. COLLECT: call collectFacts
 * 5. EVALUATE: run all evaluators, persist each finding, push progress
 * 6. UPDATE: mark run complete with counts
 * 7. CLEANUP: close DB connection in finally block
 */
import { eq } from 'drizzle-orm';
import { getTenantDb, closeTenantDb, auditRuns, auditFindings } from '@omzig/db';
import type { AuditProgressMessage } from '../types.js';
import { ENTRA_ID_CONTROLS } from '../registry/entra-id-controls.js';
import { collectFacts } from '../collectors/fact-collector.js';
import { createGraphClient } from '../collectors/graph-client.js';
import { ProgressEmitter } from './progress-emitter.js';
import { RateLimiter } from './rate-limiter.js';
import { TokenManager } from './token-manager.js';

export interface AuditPipelineParams {
  auditId: string;
  tenantId: string;
  databaseName: string;
  accessToken: string;
  userId: string;
  signalrPush: (userId: string, message: AuditProgressMessage) => Promise<void>;
}

export async function runAuditPipeline(params: AuditPipelineParams): Promise<void> {
  const { auditId, tenantId, databaseName, accessToken, userId, signalrPush } = params;

  // PITFALL 4: Open our own DB connection — middleware closes its connection after 202 response
  const db = await getTenantDb(databaseName);
  const emitter = new ProgressEmitter(userId, auditId, tenantId, signalrPush);
  const rateLimiter = new RateLimiter();
  const tokenManager = new TokenManager(accessToken);

  try {
    // Mark run as 'running'
    await db.update(auditRuns).set({ status: 'running', startedAt: new Date() }).where(eq(auditRuns.id, auditId));

    // Create Graph client
    const token = await tokenManager.refreshIfNeeded();
    const client = createGraphClient(token);

    // COLLECT phase
    await emitter.emit(0, ENTRA_ID_CONTROLS.length, 'Collecting tenant configuration...', 'running');
    const facts = await collectFacts(client, (msg) => {
      rateLimiter.recordRequest();
    });

    // EVALUATE phase
    let passedChecks = 0;
    let failedChecks = 0;
    let errorChecks = 0;

    for (let i = 0; i < ENTRA_ID_CONTROLS.length; i++) {
      const control = ENTRA_ID_CONTROLS[i];
      await rateLimiter.checkThreshold();

      try {
        const result = control.evaluator(facts);

        // Count by rating
        if (result.rating === 'pass') passedChecks++;
        else if (result.rating === 'fail') failedChecks++;
        else errorChecks++; // warn and na go to error count for tracking

        // Persist finding with denormalized control metadata
        await db.insert(auditFindings).values({
          id: crypto.randomUUID(),
          auditRunId: auditId,
          controlId: control.id,
          product: control.product,
          description: control.description,
          requirementLevel: control.requirementLevel,
          severity: control.severity,
          rating: result.rating,
          message: result.message,
          action: result.action ?? null,
          settingName: result.settingName ?? null,
          currentValue: result.currentValue ?? null,
          expectedValue: result.expectedValue ?? null,
          requiredPermission: result.requiredPermission ?? null,
          nist80053: control.nist80053,
        });
      } catch (err) {
        errorChecks++;
        // Persist error finding
        await db.insert(auditFindings).values({
          id: crypto.randomUUID(),
          auditRunId: auditId,
          controlId: control.id,
          product: control.product,
          description: control.description,
          requirementLevel: control.requirementLevel,
          severity: control.severity,
          rating: 'na',
          message: `Evaluator error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          action: `Review evaluator for ${control.id}`,
          nist80053: control.nist80053,
        });
      }

      // Push progress after each evaluator
      await emitter.emit(
        i + 1,
        ENTRA_ID_CONTROLS.length,
        `${i + 1}/${ENTRA_ID_CONTROLS.length} — Evaluating ${control.id}`,
        'running',
      );
    }

    // UPDATE: mark complete
    const summary = `${passedChecks} passed, ${failedChecks} failed, ${errorChecks} warnings/na`;
    await db.update(auditRuns).set({
      status: 'completed',
      completedAt: new Date(),
      passedChecks,
      failedChecks,
      errorChecks,
      summary,
    }).where(eq(auditRuns.id, auditId));

    await emitter.emit(ENTRA_ID_CONTROLS.length, ENTRA_ID_CONTROLS.length, 'Audit complete', 'complete');
  } catch (err) {
    // Mark run as failed
    try {
      await db.update(auditRuns).set({
        status: 'failed',
        completedAt: new Date(),
        summary: `Pipeline error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }).where(eq(auditRuns.id, auditId));
      await emitter.emit(0, ENTRA_ID_CONTROLS.length, 'Audit failed', 'error');
    } catch {
      // Best effort — DB may be unavailable
    }
  } finally {
    // CLEANUP: always close the DB connection
    await closeTenantDb(databaseName);
  }
}
