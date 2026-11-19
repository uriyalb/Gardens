// Hand-drawn style geometry primitives (procedural, deterministic).
import type { Pt } from '../model/types';
import type { Rng } from '../geometry/rng';
import { f } from './svg';

/** Closed Catmull-Rom spline through points as cubic Béziers. */
export function smoothClosed(pts: Pt[], tension = 1): string {
  const n = pts.length;
  if (n < 3) return '';
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n],
      p1 = pts[i],
      p2 = pts[(i + 1) % n],
      p3 = pts[(i + 2) % n];
    const k = tension / 6;
    d += `C${f(p1.x + (p2.x - p0.x) * k)} ${f(p1.y + (p2.y - p0.y) * k)} ${f(p2.x - (p3.x - p1.x) * k)} ${f(p2.y - (p3.y - p1.y) * k)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d + 'Z';
}

export function smoothOpen(pts: Pt[], tension = 1): string {
  const n = pts.length;
  if (n < 2) return '';
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  if (n === 2) return d + `L${f(pts[1].x)} ${f(pts[1].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[Math.min(n - 1, i + 2)];
    const k = tension / 6;
    d += `C${f(p1.x + (p2.x - p0.x) * k)} ${f(p1.y + (p2.y - p0.y) * k)} ${f(p2.x - (p3.x - p1.x) * k)} ${f(p2.y - (p3.y - p1.y) * k)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

export const polyD = (pts: Pt[], closed = true) =>
  pts.length ? 'M' + pts.map((p) => `${f(p.x)} ${f(p.y)}`).join('L') + (closed ? 'Z' : '') : '';

/** Radius function made of a few random harmonics: stable silhouette per seed. */
export function harmonicRadius(rng: Rng, amount: number, harmonics = [2, 3, 5, 7]) {
  const comps = harmonics.map((k) => ({ k, ph: rng() * Math.PI * 2, a: (0.35 + rng() * 0.65) / k ** 0.6 }));
  const norm = comps.reduce((s, c) => s + c.a, 0) || 1;
  return (theta: number) => 1 + (amount * comps.reduce((s, c) => s + c.a * Math.sin(c.k * theta + c.ph), 0)) / norm;
}

/** Irregular closed blob. */
export function blob(cx: number, cy: number, r: number, rng: Rng, irregularity: number, n = 10, sx = 1, sy = 1, rot = 0): string {
  const rf = harmonicRadius(rng, irregularity * 0.5, [2, 3, 4]);
  const pts: Pt[] = [];
  const cr = Math.cos(rot),
    sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const rr = r * rf(t) * (1 + (rng() - 0.5) * irregularity * 0.25);
    const x = Math.cos(t) * rr * sx,
      y = Math.sin(t) * rr * sy;
    pts.push({ x: cx + x * cr - y * sr, y: cy + x * sr + y * cr });
  }
  return smoothClosed(pts);
}

/** Scalloped "cloud" outline around a radius function. */
export function scallop(cx: number, cy: number, R: number, rf: (t: number) => number, lobes: number, rng: Rng, bulge = 0.22, sy = 1): string {
  const pts: Pt[] = [];
  const offs = rng() * Math.PI * 2;
  const angles: number[] = [];
  for (let i = 0; i < lobes; i++) angles.push(offs + ((i + (rng() - 0.5) * 0.45) / lobes) * Math.PI * 2);
  for (const a of angles) pts.push({ x: cx + Math.cos(a) * R * rf(a), y: cy + Math.sin(a) * R * rf(a) * sy });
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    const dx = mx - cx,
      dy = my - cy;
    const L = Math.hypot(dx, dy) || 1;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const bl = seg * (bulge + rng() * bulge * 0.8);
    d += `Q${f(mx + (dx / L) * bl * 2)} ${f(my + (dy / L) * bl * 2)} ${f(b.x)} ${f(b.y)}`;
  }
  return d + 'Z';
}

/** Hand-drawn line between two points: slight bow and wobble. */
export function handLine(a: Pt, b: Pt, rng: Rng, irregularity: number): string {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / (L || 1),
    ny = (b.x - a.x) / (L || 1);
  const bow = (rng() - 0.5) * L * 0.08 * irregularity;
  const mx = (a.x + b.x) / 2 + nx * bow,
    my = (a.y + b.y) / 2 + ny * bow;
  return `M${f(a.x)} ${f(a.y)}Q${f(mx)} ${f(my)} ${f(b.x)} ${f(b.y)}`;
}

/** Curve from a toward b with a sideways bend (for branches, sprays). */
export function bentCurve(a: Pt, b: Pt, bend: number): string {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / (L || 1),
    ny = (b.x - a.x) / (L || 1);
  const mx = (a.x + b.x) / 2 + nx * bend * L,
    my = (a.y + b.y) / 2 + ny * bend * L;
  return `M${f(a.x)} ${f(a.y)}Q${f(mx)} ${f(my)} ${f(b.x)} ${f(b.y)}`;
}

/** Wavy polyline (twisted olive branches). */
export function wavy(a: Pt, b: Pt, rng: Rng, waves: number, amp: number): string {
  const pts: Pt[] = [];
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / (L || 1),
    ny = (b.x - a.x) / (L || 1);
  const ph = rng() * Math.PI * 2;
  const steps = Math.max(4, waves * 3);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = Math.sin(t * waves * Math.PI + ph) * amp * L * Math.sin(t * Math.PI) + (rng() - 0.5) * amp * L * 0.2;
    pts.push({ x: a.x + (b.x - a.x) * t + nx * w, y: a.y + (b.y - a.y) * t + ny * w });
  }
  return smoothOpen(pts);
}

/** Tapered filled stroke between points (trunks/branches in section). */
export function taper(pts: Pt[], w0: number, w1: number): string {
  if (pts.length < 2) return '';
  const left: Pt[] = [],
    right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[Math.min(pts.length - 1, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    const dx = q.x - o.x,
      dy = q.y - o.y;
    const L = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    left.push({ x: p.x - (dy / L) * w, y: p.y + (dx / L) * w });
    right.push({ x: p.x + (dy / L) * w, y: p.y - (dx / L) * w });
  }
  const all = [...left, ...right.reverse()];
  return polyD(all, true);
}

export function quadPoints(a: Pt, c: Pt, b: Pt, n = 6): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });
  }
  return out;
}
