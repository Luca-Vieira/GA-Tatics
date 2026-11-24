/** Balde de fichas: cada mensagem gasta uma ficha e as fichas voltam aos poucos. Segura clientes que inundam o servidor. */
export class RateLimiter {
  private tokens: number;
  private lastRefillMs: number;

  constructor(
    private readonly burst: number,
    private readonly refillPerSecond: number,
    nowMs: number,
  ) {
    this.tokens = burst;
    this.lastRefillMs = nowMs;
  }

  /** `true` se a mensagem pode passar. */
  tryConsume(nowMs: number): boolean {
    const elapsedSeconds = Math.max(0, nowMs - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefillMs = nowMs;
    if (this.tokens < 1) {
      return false;
    }
    this.tokens -= 1;
    return true;
  }
}
