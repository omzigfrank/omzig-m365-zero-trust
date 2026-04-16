/**
 * Audit runner pipeline — orchestrates the complete audit flow:
 * 1. Open own DB connection (PITFALL 4: NOT middleware-provided)
 * 2. Update audit run status to 'running'
 * 3. Create Graph client with access token
 * 4. COLLECT: call collectFacts
 * 5. EVALUATE: run all evaluators (~101 controls), persist each finding, push progress
 * 6. MATURITY: compute and persist maturity snapshot for ZTA tenets
 * 7. UPDATE: mark run complete with counts
 * 8. CLEANUP: close DB connection in finally block
 */
import { eq } from 'drizzle-orm';
import { getTenantDb, closeTenantDb, auditRuns, auditFindings, maturityScores } from '@omzig/db';
import type { AuditProgressMessage } from '../types.js';
import { getAllControls } from '../registry/control-registry.js';
import { collectFacts } from '../collectors/fact-collector.js';
import { createGraphClient } from '../collectors/graph-client.js';
import { ProgressEmitter } from './progress-emitter.js';
import { RateLimiter } from './rate-limiter.js';
import { TokenManager } from './token-manager.js';
import { calculateMaturitySnapshot } from './maturity-calculator.js';

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
  const { db, pool } = await getTenantDb(databaseName);
  const emitter = new ProgressEmitter(userId, auditId, tenantId, signalrPush);
  const rateLimiter = new RateLimiter();
  const tokenManager = new TokenManager(accessToken);
  const allControls = getAllControls();

  try {
    // Mark run as 'running' with actual control count
    await db.update(auditRuns).set({
      status: 'running',
      startedAt: new Date(),
      totalChecks: allControls.length,
    }).where(eq(auditRuns.id, auditId));

    // Create Graph client
    const token = await tokenManager.refreshIfNeeded();
    const client = createGraphClient(token);

    // COLLECT phase
    await emitter.emit(0, allControls.length, 'Collecting tenant configuration...', 'running');
    const facts = await collectFacts(client, (msg) => {
      rateLimiter.recordRequest();
    });

    // EVALUATE phase
    let passedChecks = 0;
    let failedChecks = 0;
    let errorChecks = 0;

    // Track findings for maturity calculation
    const evaluatedFindings: Array<{
      product: string;
      rating: string;
      severity: string;
      nist800207Tenet?: string;
    }> = [];

    for (let i = 0; i < allControls.length; i++) {
      const control = allControls[i];
      await rateLimiter.checkThreshold();

      try {
        const result = control.evaluator(facts);

        // Count by rating
        if (result.rating === 'pass') passedChecks++;
        else if (result.rating === 'fail') failedChecks++;
        else errorChecks++; // warn and na go to error count for tracking

        // Track for maturity calculation
        evaluatedFindings.push({
          product: control.product,
          rating: result.rating,
          severity: control.severity,
          nist800207Tenet: control.nist800207Tenet,
        });

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
          nistCsf: control.nistCsf ?? null,
          nist800207Tenet: control.nist800207Tenet ?? null,
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
          nistCsf: control.nistCsf ?? null,
          nist800207Tenet: control.nist800207Tenet ?? null,
        });
      }

      // Push progress after each evaluator
      await emitter.emit(
        i + 1,
        allControls.length,
        `${i + 1}/${allControls.length} — Evaluating ${control.id}`,
        'running',
      );
    }

    // MATURITY: compute and persist maturity snapshot for ZTA tenets
    const ztaFindings = evaluatedFindings.filter((f) => f.nist800207Tenet);
    const snapshot = calculateMaturitySnapshot(ztaFindings);

    // Persist each tenet score
    for (const tenet of snapshot.tenets) {
      await db.insert(maturityScores).values({
        id: crypto.randomUUID(),
        auditRunId: auditId,
        tenet: tenet.tenet,
        tenetName: tenet.tenetName,
        totalChecks: tenet.totalChecks,
        passedChecks: tenet.passedChecks,
        failedChecks: tenet.failedChecks,
        passRate: Math.round(tenet.passRate),
        weightedPassRate: Math.round(tenet.weightedPassRate),
        maturityLevel: tenet.maturityLevel,
      });
    }

    // Persist overall maturity score
    await db.insert(maturityScores).values({
      id: crypto.randomUUID(),
      auditRunId: auditId,
      tenet: 'overall',
      tenetName: 'Overall',
      totalChecks: snapshot.tenets.reduce((sum, t) => sum + t.totalChecks, 0),
      passedChecks: snapshot.tenets.reduce((sum, t) => sum + t.passedChecks, 0),
      failedChecks: snapshot.tenets.reduce((sum, t) => sum + t.failedChecks, 0),
      passRate: Math.round(
        snapshot.tenets.length > 0
          ? snapshot.tenets.reduce((sum, t) => sum + t.passRate, 0) / snapshot.tenets.length
          : 0,
      ),
      weightedPassRate: Math.round(snapshot.overallWeightedAverage),
      maturityLevel: snapshot.overallMaturityLevel,
    });

    // UPDATE: mark complete
    const summary = `${passedChecks} passed, ${failedChecks} failed, ${errorChecks} warnings/na`;
    await db.update(auditRuns).set({
      status: 'completed',
      completedAt: new Date(),
      passedChecks,
      failedChecks,
      errorChecks,
      summary,
      // Phase 8: Persist full AuditFacts JSON as drift detection baseline.
      factsSnapshot: JSON.stringify(facts),
    }).where(eq(auditRuns.id, auditId));

    await emitter.emit(allControls.length, allControls.length, 'Audit complete', 'complete');
  } catch (err) {
    // Mark run as failed
    try {
      await db.update(auditRuns).set({
        status: 'failed',
        completedAt: new Date(),
        summary: `Pipeline error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }).where(eq(auditRuns.id, auditId));
      await emitter.emit(0, allControls.length, 'Audit failed', 'error');
    } catch {
      // Best effort — DB may be unavailable
    }
  } finally {
    // CLEANUP: always close the DB connection
    await closeTenantDb(pool);
  }
}
