import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WriteRateLimiter } from '../write-rate-limiter.js';

describe('WriteRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('increments writesInWindow on each beforeWrite call', async () => {
    const rl = new WriteRateLimiter();
    await rl.beforeWrite();
    await rl.beforeWrite();
    expect(rl._getStateForTests().writesInWindow).toBe(2);
  });

  it('resets the window after WINDOW_MS elapses', async () => {
    const rl = new WriteRateLimiter();
    await rl.beforeWrite();
    await rl.beforeWrite();
    expect(rl._getStateForTests().writesInWindow).toBe(2);

    // Advance beyond WINDOW_MS (150_000 ms = 150s).
    vi.advanceTimersByTime(150_001);
    await rl.beforeWrite();
    expect(rl._getStateForTests().writesInWindow).toBe(1);
  });

  it('pre-throttles when writesInWindow >= THROTTLE_AT (2700)', async () => {
    const rl = new WriteRateLimiter();
    // Bump UP TO the threshold. After 2700 iterations writesInWindow===2700
    // so the next beforeWrite() will trigger the throttle branch.
    for (let i = 0; i < 2700; i++) {
      await rl.beforeWrite();
    }
    expect(rl._getStateForTests().writesInWindow).toBe(2700);

    // The next call SHOULD be throttled. We drive timers to verify sleep.
    const startedAt = Date.now();
    const p = rl.beforeWrite();
    // Drain pending timers to let the sleep resolve.
    await vi.advanceTimersByTimeAsync(151_000);
    await p;
    const elapsed = Date.now() - startedAt;
    // Confirmed throttled: at least (WINDOW_MS - already elapsed) = ~150s.
    expect(elapsed).toBeGreaterThanOrEqual(100_000);
    // After throttling the window resets and the current call is counted.
    expect(rl._getStateForTests().writesInWindow).toBe(1);
  });

  it('handle429 honors numeric Retry-After header (in seconds)', async () => {
    const rl = new WriteRateLimiter();
    const started = Date.now();
    const p = rl.handle429('30');
    await vi.advanceTimersByTimeAsync(30_000);
    await p;
    expect(Date.now() - started).toBeGreaterThanOrEqual(30_000);
  });

  it('handle429 clamps Retry-After to 60s max', async () => {
    const rl = new WriteRateLimiter();
    const started = Date.now();
    const p = rl.handle429('300'); // 5 minutes asked; must clamp to 60s
    await vi.advanceTimersByTimeAsync(60_000);
    await p;
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(60_000);
    expect(elapsed).toBeLessThan(61_000);
  });

  it('handle429 falls back to 10s when Retry-After is missing', async () => {
    const rl = new WriteRateLimiter();
    const started = Date.now();
    const p = rl.handle429(undefined);
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(Date.now() - started).toBeGreaterThanOrEqual(10_000);
  });

  it('handle429 falls back to 10s when Retry-After is null', async () => {
    const rl = new WriteRateLimiter();
    const started = Date.now();
    const p = rl.handle429(null);
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(Date.now() - started).toBeGreaterThanOrEqual(10_000);
  });

  it('handle429 falls back to 10s when Retry-After is unparseable', async () => {
    const rl = new WriteRateLimiter();
    const started = Date.now();
    const p = rl.handle429('not-a-number');
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(Date.now() - started).toBeGreaterThanOrEqual(10_000);
  });
});
