// Deterministic pseudo-random generators. Every procedural shape is driven by a saved seed.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash of numbers/strings into a 32-bit seed. */
export function hashSeed(...parts: (number | string)[]): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** A sub-stream: same parent seed + label always yields the same sequence. */
export function subRng(seed: number, label: string | number): Rng {
  return mulberry32(hashSeed(seed, label));
}

export const range = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const pick = <T,>(r: Rng, arr: T[]): T => arr[Math.floor(r() * arr.length) % arr.length];
export function gauss(r: Rng): number {
  // Box-Muller, clamped
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.max(-3, Math.min(3, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1e9);
}
