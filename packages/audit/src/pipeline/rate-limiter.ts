/**
 * Graph API rate limiter. Tracks request count per audit run
 * and inserts delays when approaching the 80% threshold.
 */

export class RateLimiter {
  private requestCount = 0;
  private delayCount = 0;
  private readonly limit: number;
  private readonly threshold: number;

  constructor(limit = 10000, thresholdPercent = 0.8) {
    this.limit = limit;
    this.threshold = Math.floor(limit * thresholdPercent);
  }

  recordRequest(): void {
    this.requestCount++;
  }

  async checkThreshold(): Promise<void> {
    if (this.requestCount >= this.threshold) {
      this.delayCount++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  getStats(): { requestCount: number; threshold: number; delayed: number } {
    return {
      requestCount: this.requestCount,
      threshold: this.threshold,
      delayed: this.delayCount,
    };
  }
}
