import type { ClockPort } from "@lfspm/core";

export class SystemClockAdapter implements ClockPort {
  private readonly readTime: () => number;

  constructor(readTime: () => number = Date.now) {
    this.readTime = readTime;
  }

  now(): number {
    const readTime = this.readTime;
    return readTime();
  }
}
