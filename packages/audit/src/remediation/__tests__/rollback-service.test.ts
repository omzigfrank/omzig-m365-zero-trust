import { describe, it, expect, vi } from 'vitest';
import {
  computeDrift,
  rollbackRemediation,
  DriftDetectedError,
  type RollbackJob,
} from '../rollback-service.js';
import type { RemediationEntry, ExecutionContext } from '../types.js';
import { WriteRateLimiter } from '../write-rate-limiter.js';
import { createEmptyFacts } from '../../types.js';

function makeCtx(): ExecutionContext {
  return {
    tenantId: 't1',
    graphClient: {} as any,
    facts: createEmptyFacts(),
    rateLimiter: new WriteRateLimiter(),
  };
}

function makeEntry(overrides: Partial<RemediationEntry> = {}): RemediationEntry {
  return {
    controlId: 'TEST.CTRL',
    steps: ['s'],
    classification: 'SAFE',
    classificationRationale: 'test',
    writeScopes: [],
    scopeBundle: 'conditionalAccess',
    ...overrides,
  };
}

describe('computeDrift', () => {
  it('returns drifted=false when current matches afterSnapshot exactly', () => {
    const result = computeDrift({ a: 1, b: 'x' }, { a: 1, b: 'x' });
    expect(result.drifted).toBe(false);
    expect(result.changedFields).toEqual([]);
  });

  it('returns drifted=true with changed field names when a field differs', () => {
    const result = computeDrift({ a: 1, b: 'x' }, { a: 2, b: 'x' });
    expect(result.drifted).toBe(true);
    expect(result.changedFields).toContain('a');
    expect(result.changedFields).not.toContain('b');
  });

  it('skips volatile fields (modifiedDateTime, createdDateTime, policyVersion, lastModifiedDateTime)', () => {
    const current = {
      a: 1,
      modifiedDateTime: '2026-04-15T00:00:00Z',
      createdDateTime: '2026-04-15T00:00:00Z',
      policyVersion: 5,
      lastModifiedDateTime: '2026-04-15T00:00:00Z',
    };
    const after = {
      a: 1,
      modifiedDateTime: '2026-03-01T00:00:00Z',
      createdDateTime: '2026-03-01T00:00:00Z',
      policyVersion: 1,
      lastModifiedDateTime: '2026-03-01T00:00:00Z',
    };
    const result = computeDrift(current, after);
    expect(result.drifted).toBe(false);
    expect(result.changedFields).toEqual([]);
  });

  it('returns drifted=true when a non-volatile field differs even if volatile fields also differ', () => {
    const current = { a: 2, modifiedDateTime: 'x' };
    const after = { a: 1, modifiedDateTime: 'y' };
    const result = computeDrift(current, after);
    expect(result.drifted).toBe(true);
    expect(result.changedFields).toEqual(['a']);
  });

  it('detects added fields in current vs afterSnapshot', () => {
    const current = { a: 1, newField: 'added' };
    const after = { a: 1 };
    const result = computeDrift(current, after);
    expect(result.drifted).toBe(true);
    expect(result.changedFields).toContain('newField');
  });

  it('returns drifted=true with <root> when either side is a primitive', () => {
    const result = computeDrift('foo', 'bar');
    expect(result.drifted).toBe(true);
    expect(result.changedFields).toEqual(['<root>']);
  });
});

describe('rollbackRemediation', () => {
  function makeJob(overrides: Partial<RollbackJob> = {}): RollbackJob {
    return {
      id: 'job-1',
      controlId: 'TEST.CTRL',
      beforeSnapshot: { state: 'enabled' },
      afterSnapshot: { state: 'disabled' },
      targetResourceId: 'resource-42',
      ...overrides,
    };
  }

  it('throws DriftDetectedError when drift is non-empty and confirmDrift=false', async () => {
    const rollbackSpy = vi.fn();
    const entry = makeEntry({ rollbackExecutor: rollbackSpy });
    const job = makeJob();
    // current state differs from afterSnapshot
    const currentState = { state: 'something_else' };

    await expect(
      rollbackRemediation({
        entry,
        job,
        ctx: makeCtx(),
        currentState,
        confirmDrift: false,
      }),
    ).rejects.toThrow(DriftDetectedError);

    expect(rollbackSpy).not.toHaveBeenCalled();
  });

  it('proceeds when drift is non-empty but confirmDrift=true', async () => {
    const rollbackSpy = vi.fn().mockResolvedValue(undefined);
    const entry = makeEntry({ rollbackExecutor: rollbackSpy });
    const job = makeJob();
    const currentState = { state: 'drifted' };

    const result = await rollbackRemediation({
      entry,
      job,
      ctx: makeCtx(),
      currentState,
      confirmDrift: true,
    });

    expect(result.status).toBe('rolled_back');
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy).toHaveBeenCalledWith(expect.anything(), job.beforeSnapshot);
  });

  it('returns rolled_back when drift is empty and rollback succeeds', async () => {
    const rollbackSpy = vi.fn().mockResolvedValue(undefined);
    const entry = makeEntry({ rollbackExecutor: rollbackSpy });
    const job = makeJob();

    const result = await rollbackRemediation({
      entry,
      job,
      ctx: makeCtx(),
      currentState: job.afterSnapshot, // matches exactly
      confirmDrift: false,
    });

    expect(result.status).toBe('rolled_back');
    expect(result.drift?.drifted).toBe(false);
  });

  it('returns rollback_failed when rollbackExecutor throws a non-partial error', async () => {
    const rollbackSpy = vi.fn().mockRejectedValue(new Error('Graph 500'));
    const entry = makeEntry({ rollbackExecutor: rollbackSpy });
    const job = makeJob();

    const result = await rollbackRemediation({
      entry,
      job,
      ctx: makeCtx(),
      currentState: job.afterSnapshot,
      confirmDrift: false,
    });

    expect(result.status).toBe('rollback_failed');
    expect(result.error).toContain('Graph 500');
  });

  it('returns rollback_partial when rollbackExecutor throws a partial-signalling error', async () => {
    const rollbackSpy = vi
      .fn()
      .mockRejectedValue(new Error('partial: SMS rolled back, Voice failed: 403'));
    const entry = makeEntry({ rollbackExecutor: rollbackSpy });
    const job = makeJob();

    const result = await rollbackRemediation({
      entry,
      job,
      ctx: makeCtx(),
      currentState: job.afterSnapshot,
      confirmDrift: false,
    });

    expect(result.status).toBe('rollback_partial');
    expect(result.error).toContain('partial');
  });

  it('returns rollback_failed when no rollbackExecutor is defined', async () => {
    const entry = makeEntry({ rollbackExecutor: undefined });
    const job = makeJob();

    const result = await rollbackRemediation({
      entry,
      job,
      ctx: makeCtx(),
      currentState: job.afterSnapshot,
      confirmDrift: false,
    });

    expect(result.status).toBe('rollback_failed');
    expect(result.error).toContain('No rollbackExecutor');
  });
});
