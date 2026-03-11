import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../pipeline/rate-limiter.js';
import { TokenManager } from '../pipeline/token-manager.js';
import { ProgressEmitter } from '../pipeline/progress-emitter.js';

describe('RateLimiter', () => {
  it('tracks request count', () => {
    const limiter = new RateLimiter(100);
    limiter.recordRequest();
    limiter.recordRequest();
    expect(limiter.getStats().requestCount).toBe(2);
  });

  it('delays when threshold exceeded', async () => {
    const limiter = new RateLimiter(10, 0.5); // threshold at 5
    for (let i = 0; i < 6; i++) limiter.recordRequest();
    const start = Date.now();
    await limiter.checkThreshold();
    expect(limiter.getStats().delayed).toBe(1);
  });

  it('does not delay below threshold', async () => {
    const limiter = new RateLimiter(100, 0.8);
    limiter.recordRequest();
    await limiter.checkThreshold();
    expect(limiter.getStats().delayed).toBe(0);
  });
});

describe('TokenManager', () => {
  it('returns the access token', () => {
    const tm = new TokenManager('test-token-123');
    expect(tm.getAccessToken()).toBe('test-token-123');
  });

  it('refreshIfNeeded returns same token (Phase 2 placeholder)', async () => {
    const tm = new TokenManager('my-token');
    const refreshed = await tm.refreshIfNeeded();
    expect(refreshed).toBe('my-token');
  });
});

describe('ProgressEmitter', () => {
  it('calls pushFn with correct message', async () => {
    const pushFn = vi.fn().mockResolvedValue(undefined);
    const emitter = new ProgressEmitter('user1', 'audit1', 'tenant1', pushFn);

    await emitter.emit(5, 29, 'Evaluating MS.AAD.3.1v1', 'running');

    expect(pushFn).toHaveBeenCalledWith('user1', {
      auditId: 'audit1',
      tenantId: 'tenant1',
      completed: 5,
      total: 29,
      currentCheck: 'Evaluating MS.AAD.3.1v1',
      status: 'running',
    });
  });

  it('silently catches errors from pushFn', async () => {
    const pushFn = vi.fn().mockRejectedValue(new Error('SignalR down'));
    const emitter = new ProgressEmitter('user1', 'audit1', 'tenant1', pushFn);

    // Should not throw
    await expect(emitter.emit(1, 29, 'test', 'running')).resolves.toBeUndefined();
  });

  it('emits progress count for all 29 controls', async () => {
    const pushFn = vi.fn().mockResolvedValue(undefined);
    const emitter = new ProgressEmitter('u', 'a', 't', pushFn);

    for (let i = 1; i <= 29; i++) {
      await emitter.emit(i, 29, `Check ${i}`, 'running');
    }
    expect(pushFn).toHaveBeenCalledTimes(29);
  });
});

describe('Audit Runner Pipeline (unit)', () => {
  it('pipeline module exports runAuditPipeline', async () => {
    const mod = await import('../pipeline/audit-runner.js');
    expect(typeof mod.runAuditPipeline).toBe('function');
  });

  it('ENTRA_ID_CONTROLS has 29 evaluators for pipeline to iterate', async () => {
    const { ENTRA_ID_CONTROLS } = await import('../registry/entra-id-controls.js');
    expect(ENTRA_ID_CONTROLS).toHaveLength(29);
  });
});
