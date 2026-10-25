/**
 * A hybrid logical clock: wall-clock microseconds, but never goes backwards and
 * always moves past any value seen from the other device. So a move made after
 * seeing the partner's move always wins over it, even if the phone clocks differ.
 */
export class Clock {
  private last = 0;

  constructor(private now: () => number = Date.now) {}

  next(): number {
    this.last = Math.max(this.now() * 1000, this.last + 1);
    return this.last;
  }

  observe(v: number): void {
    if (v > this.last) this.last = v;
  }
}
