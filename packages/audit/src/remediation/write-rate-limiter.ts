/**
 * Write rate limiter for remediation Graph API calls.
 *
 * Phase 7 Plan 01 -- research §3.3. Honors Retry-After response headers
 * (clamped to 60s max) and pre-throttles at 90% of the 3000-writes-per-150s
 * Entra ID identity bucket. Sibling to packages/audit/src/pipeline/rate-limiter.ts
 * (which governs reads at 80% of 10K); kept separate because the identity
 * write bucket is a distinct Graph throttling resource.
 */

export class WriteRateLimiter {
  private windowStart = Date.now();
  private writesInWindow = 0;

  private readonly WINDOW_MS = 150_000; // 2 minutes 30 seconds
  private readonly MAX_WRITES = 3_000;
  private readonly THROTTLE_AT = 2_700; // 90% of MAX_WRITES

  /**
   * Call before every Graph write. Resets the window after WINDOW_MS has
   * elapsed. If the window count has hit THROTTLE_AT, sleeps until the
   * window rolls over so the next write lands in a fresh bucket.
   */
  async beforeWrite(): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart >= this.WINDOW_MS) {
      this.windowStart = now;
      this.writesInWindow = 0;
    }
    if (this.writesInWindow >= this.THROTTLE_AT) {
      const wait = this.WINDOW_MS - (Date.now() - this.windowStart);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
      this.windowStart = Date.now();
      this.writesInWindow = 0;
    }
    this.writesInWindow++;
  }

  /**
   * Call when Graph returns a 429. Reads the Retry-After header value
   * (in seconds), clamps to 60s max, and sleeps for that duration.
   * Falls back to 10s when the header is missing or unparseable.
   */
  async handle429(retryAfterHeader?: string | null): Promise<void> {
    let sec = 10;
    if (retryAfterHeader) {
      const parsed = parseInt(retryAfterHeader, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        sec = parsed;
      }
    }
    if (sec > 60) sec = 60;
    await new Promise((r) => setTimeout(r, sec * 1000));
  }

  /** Test helpers -- expose internal state for unit tests. */
  _getStateForTests(): {
    windowStart: number;
    writesInWindow: number;
    WINDOW_MS: number;
    MAX_WRITES: number;
    THROTTLE_AT: number;
  } {
    return {
      windowStart: this.windowStart,
      writesInWindow: this.writesInWindow,
      WINDOW_MS: this.WINDOW_MS,
      MAX_WRITES: this.MAX_WRITES,
      THROTTLE_AT: this.THROTTLE_AT,
    };
  }

  _resetForTests(): void {
    this.windowStart = Date.now();
    this.writesInWindow = 0;
  }
}
