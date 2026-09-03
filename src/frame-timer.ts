// src/frame-timer.ts — the ring buffer from the first article in the series. Writes
// frame times into a fixed-capacity Float64Array; no allocation per frame.
export class FrameTimer {
  private readonly ring: Float64Array;
  private head = 0;
  private filled = 0;
  private t0 = 0;

  constructor(readonly capacity = 240) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.ring = new Float64Array(capacity);
  }

  begin(): void {
    this.t0 = performance.now();
  }

  end(): number {
    const ms = performance.now() - this.t0;
    this.record(ms);
    return ms;
  }

  record(ms: number): void {
    this.ring[this.head] = ms;
    this.head = (this.head + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  /** A copy of the filled region. We don't sort; the stats module does that. */
  values(): Float64Array {
    return Float64Array.from(this.ring.subarray(0, this.filled));
  }

  get count(): number {
    return this.filled;
  }

  reset(): void {
    this.head = 0;
    this.filled = 0;
  }
}
