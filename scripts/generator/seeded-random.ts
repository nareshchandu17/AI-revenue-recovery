/**
 * Seeded pseudo-random number generator (Mulberry32).
 * Produces deterministic output given the same seed.
 */
export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed | 0
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Returns an integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** Returns a float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Pick a random element from an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }

  /** Pick N unique elements from an array (shuffled). */
  pickN<T>(arr: readonly T[], n: number): T[] {
    const shuffled = [...arr]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, Math.min(n, shuffled.length))
  }

  /** Weighted random selection. */
  weightedPick<T extends string>(items: { value: T; weight: number }[]): T {
    const total = items.reduce((sum, i) => sum + i.weight, 0)
    let r = this.next() * total
    for (const item of items) {
      r -= item.weight
      if (r <= 0) return item.value
    }
    return items[items.length - 1].value
  }

  /** True with given probability. */
  chance(probability: number): boolean {
    return this.next() < probability
  }

  /** Generate a skewed value (log-normal-ish) in [min, max]. */
  skewedInt(min: number, max: number, skew: number = 0.3): number {
    // Use exponential distribution for skew
    const u = this.next()
    const skewed = Math.pow(u, skew) // lower values more likely
    return Math.round(min + skewed * (max - min))
  }
}
