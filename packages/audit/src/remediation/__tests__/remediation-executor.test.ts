import { describe, it, expect, vi } from 'vitest';
import {
  executeRemediation,
  validatePrerequisitesOnly,
  ExecutorMissingError,
  PrerequisiteFailedError,
  ExecutorError,
} from '../remediation-executor.js';
import type {
  RemediationEntry,
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';
import { WriteRateLimiter } from '../write-rate-limiter.js';
import { createEmptyFacts } from '../../types.js';

function makeCtx(overrides?: Partial<ExecutionContext>): ExecutionContext {
  const rl = new WriteRateLimiter();
  return {
    tenantId: 'tenant-1',
    graphClient: {} as any,
    facts: createEmptyFacts(),
    rateLimiter: rl,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<RemediationEntry>): RemediationEntry {
  return {
    controlId: 'TEST.CTRL',
    steps: ['step'],
    classification: 'SAFE',
    classificationRationale: 'test',
    writeScopes: [],
    scopeBundle: 'conditionalAccess',
    ...overrides,
  };
}

describe('executeRemediation', () => {
  it('throws ExecutorMissingError when entry has no executor attached', async () => {
    const entry = makeEntry({ controlId: 'NO.EXECUTOR' });
    const ctx = makeCtx();
    await expect(executeRemediation(entry, ctx)).rejects.toThrow(ExecutorMissingError);
  });

  it('calls rateLimiter.beforeWrite before the executor', async () => {
    const order: string[] = [];
    const rl = new WriteRateLimiter();
    const beforeWriteSpy = vi.spyOn(rl, 'beforeWrite').mockImplementation(async () => {
      order.push('rateLimiter');
    });
    const entry = makeEntry({
      executor: async (): Promise<ExecutionResult> => {
        order.push('executor');
        return { beforeSnapshot: null, afterSnapshot: {}, targetResourceId: 'x' };
      },
    });
    const ctx = makeCtx({ rateLimiter: rl });

    await executeRemediation(entry, ctx);
    expect(order).toEqual(['rateLimiter', 'executor']);
    expect(beforeWriteSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the ExecutionResult from a successful executor', async () => {
    const entry = makeEntry({
      executor: async () => ({
        beforeSnapshot: { a: 1 },
        afterSnapshot: { a: 2 },
        targetResourceId: 'resource-id',
        notes: 'ok',
      }),
    });
    const ctx = makeCtx();

    const result = await executeRemediation(entry, ctx);
    expect(result.beforeSnapshot).toEqual({ a: 1 });
    expect(result.afterSnapshot).toEqual({ a: 2 });
    expect(result.targetResourceId).toBe('resource-id');
    expect(result.notes).toBe('ok');
  });

  it('calls validatePrerequisites before the executor and short-circuits on failure', async () => {
    const order: string[] = [];
    const entry = makeEntry({
      validatePrerequisites: async (): Promise<PrerequisiteCheckResult> => {
        order.push('prereq');
        return { ok: false, failureReason: 'missing break-glass' };
      },
      executor: async () => {
        order.push('executor');
        return { beforeSnapshot: null, afterSnapshot: {}, targetResourceId: null };
      },
    });
    const ctx = makeCtx();

    await expect(executeRemediation(entry, ctx)).rejects.toThrow(PrerequisiteFailedError);
    // Executor must NOT run after a failed prereq check.
    expect(order).toEqual(['prereq']);
  });

  it('proceeds when validatePrerequisites returns ok=true', async () => {
    const order: string[] = [];
    const entry = makeEntry({
      validatePrerequisites: async () => {
        order.push('prereq');
        return { ok: true };
      },
      executor: async () => {
        order.push('executor');
        return { beforeSnapshot: null, afterSnapshot: {}, targetResourceId: null };
      },
    });
    const ctx = makeCtx();

    await executeRemediation(entry, ctx);
    expect(order).toEqual(['prereq', 'executor']);
  });

  it('wraps executor errors in ExecutorError with the original cause preserved', async () => {
    const originalErr = new Error('Graph 403 Forbidden');
    const entry = makeEntry({
      controlId: 'FAIL.CTRL',
      executor: async () => {
        throw originalErr;
      },
    });
    const ctx = makeCtx();

    try {
      await executeRemediation(entry, ctx);
      expect.fail('expected error');
    } catch (err) {
      expect(err).toBeInstanceOf(ExecutorError);
      expect((err as ExecutorError).controlId).toBe('FAIL.CTRL');
      expect((err as ExecutorError).cause).toBe(originalErr);
    }
  });

  it('propagates PrerequisiteFailedError without wrapping in ExecutorError', async () => {
    const entry = makeEntry({
      validatePrerequisites: async () => ({ ok: false, failureReason: 'nope' }),
      executor: async () => {
        throw new Error('should not run');
      },
    });
    const ctx = makeCtx();

    try {
      await executeRemediation(entry, ctx);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PrerequisiteFailedError);
      expect(err).not.toBeInstanceOf(ExecutorError);
    }
  });
});

describe('validatePrerequisitesOnly', () => {
  it('returns ok=true when entry has no validatePrerequisites hook', async () => {
    const entry = makeEntry({ executor: async () => ({ beforeSnapshot: null, afterSnapshot: {}, targetResourceId: null }) });
    const result = await validatePrerequisitesOnly(entry, makeCtx());
    expect(result.ok).toBe(true);
  });

  it('returns the prereq check result without running the executor', async () => {
    let executorRan = false;
    const entry = makeEntry({
      validatePrerequisites: async () => ({ ok: false, failureReason: 'bad facts' }),
      executor: async () => {
        executorRan = true;
        return { beforeSnapshot: null, afterSnapshot: {}, targetResourceId: null };
      },
    });
    const result = await validatePrerequisitesOnly(entry, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe('bad facts');
    expect(executorRan).toBe(false);
  });
});
