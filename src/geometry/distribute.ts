import type { Distribution, LineDistribution, Pt } from '../model/types';
import { bbox, distToPolygonEdge, pointAtLength, pointInPolygon, polygonArea, polylineLength } from './polygon';
import { gauss, mulberry32, range, type Rng } from './rng';

export interface DistPoint extends Pt {
  idx: number;
  scale: number; // size multiplier
  rank: number; // stable 0..1 used for coherent thinning
}

const MAX_POINTS = 2500;

function insideWithSetback(p: Pt, poly: Pt[], setback: number) {
  return pointInPolygon(p, poly) && (setback <= 0 || distToPolygonEdge(p, poly) >= setback);
}

/** Bridson-style dart throwing inside polygon (deterministic). */
function poisson(poly: Pt[], minDist: number, rng: Rng, setback: number, maxPts: number): Pt[] {
  const b = bbox(poly);
  const cell = minDist / Math.SQRT2;
  const gw = Math.max(1, Math.ceil(b.w / cell));
  const gh = Math.max(1, Math.ceil(b.h / cell));
  if (gw * gh > 4e6) return [];
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: Pt[] = [];
  const active: number[] = [];
  const gi = (p: Pt) => Math.floor((p.x - b.minX) / cell) + Math.floor((p.y - b.minY) / cell) * gw;
  const ok = (p: Pt) => {
    if (p.x < b.minX || p.y < b.minY || p.x > b.maxX || p.y > b.maxY) return false;
    if (!insideWithSetback(p, poly, setback)) return false;
    const cx = Math.floor((p.x - b.minX) / cell);
    const cy = Math.floor((p.y - b.minY) / cell);
    for (let y = Math.max(0, cy - 2); y <= Math.min(gh - 1, cy + 2); y++)
      for (let x = Math.max(0, cx - 2); x <= Math.min(gw - 1, cx + 2); x++) {
        const k = grid[x + y * gw];
        if (k >= 0 && Math.hypot(pts[k].x - p.x, pts[k].y - p.y) < minDist) return false;
      }
    return true;
  };
  // seed points: try several random starts
  for (let tries = 0; tries < 60 && pts.length === 0; tries++) {
    const p = { x: range(rng, b.minX, b.maxX), y: range(rng, b.minY, b.maxY) };
    if (ok(p)) {
      pts.push(p);
      active.push(0);
      grid[gi(p)] = 0;
    }
  }
  while (active.length && pts.length < maxPts) {
    const ai = Math.floor(rng() * active.length);
    const base = pts[active[ai]];
    let found = false;
    for (let k = 0; k < 24; k++) {
      const ang = rng() * Math.PI * 2;
      const rr = minDist * (1 + rng());
      const p = { x: base.x + Math.cos(ang) * rr, y: base.y + Math.sin(ang) * rr };
      if (ok(p)) {
        pts.push(p);
        active.push(pts.length - 1);
        grid[gi(p)] = pts.length - 1;
        found = true;
        break;
      }
    }
    if (!found) active.splice(ai, 1);
    // isolated islands: occasionally reseed
    if (!active.length && pts.length < maxPts) {
      for (let tries = 0; tries < 40; tries++) {
        const p = { x: range(rng, b.minX, b.maxX), y: range(rng, b.minY, b.maxY) };
        if (ok(p)) {
          pts.push(p);
          active.push(pts.length - 1);
          grid[gi(p)] = pts.length - 1;
          break;
        }
      }
    }
  }
  return pts;
}

function hexGrid(poly: Pt[], spacing: number, rng: Rng, setback: number, jitter: number): Pt[] {
  const b = bbox(poly);
  const dy = spacing * 0.866;
  const ox = rng() * spacing;
  const oy = rng() * dy;
  const pts: Pt[] = [];
  const rows = Math.ceil(b.h / dy) + 2;
  const cols = Math.ceil(b.w / spacing) + 2;
  if (rows * cols > 1e6) return [];
  for (let r = -1; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      const p = {
        x: b.minX + ox + c * spacing + (r % 2 ? spacing / 2 : 0) + (rng() - 0.5) * jitter * spacing,
        y: b.minY + oy + r * dy + (rng() - 0.5) * jitter * spacing,
      };
      if (insideWithSetback(p, poly, setback)) pts.push(p);
    }
  }
  return pts;
}

export interface AreaDistOptions {
  poly: Pt[];
  spacing: number; // source units
  count: number | null;
  setback: number; // source units
  distribution: Distribution;
  seed: number;
  sizeVariation: number;
}

/** Generate plant points strictly inside the polygon, respecting setback. */
export function distributeInPolygon(o: AreaDistOptions): DistPoint[] {
  if (o.poly.length < 3 || !(o.spacing > 0)) return [];
  const rng = mulberry32(o.seed);
  let spacing = o.spacing;
  const area = polygonArea(o.poly);
  if (o.count && o.count > 0) spacing = Math.sqrt(area / (o.count * 0.866)) * 0.95;
  // guard: avoid enormous counts
  const est = area / (spacing * spacing * 0.866);
  if (est > MAX_POINTS) spacing = Math.sqrt(area / (MAX_POINTS * 0.866));

  let pts: Pt[] = [];
  if (o.distribution === 'uniform') {
    pts = hexGrid(o.poly, spacing, rng, o.setback, 0.18);
  } else if (o.distribution === 'irregular') {
    pts = poisson(o.poly, spacing * 0.82, rng, o.setback, MAX_POINTS);
  } else {
    // clustered: cluster centres by Poisson, then tight drifts around each, gaps between
    const centers = poisson(o.poly, spacing * 2.6, rng, o.setback, 400);
    const perCluster = 10;
    for (const c of centers) {
      const n = Math.max(3, Math.round(perCluster * range(rng, 0.6, 1.4)));
      for (let i = 0; i < n; i++) {
        const p = { x: c.x + gauss(rng) * spacing * 0.8, y: c.y + gauss(rng) * spacing * 0.8 };
        if (!insideWithSetback(p, o.poly, o.setback)) continue;
        if (pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < spacing * 0.55)) continue;
        pts.push(p);
      }
    }
    // fill sparse areas lightly so the mass reads as one planting
    const filler = poisson(o.poly, spacing * 1.3, rng, o.setback, MAX_POINTS);
    for (const p of filler) if (!pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < spacing * 1.05)) pts.push(p);
  }
  let out: DistPoint[] = pts.map((p, idx) => ({
    ...p,
    idx,
    scale: 1 + (rng() - 0.5) * 2 * o.sizeVariation * 0.5,
    rank: rng(),
  }));
  if (o.count && o.count > 0 && out.length > o.count) {
    out = [...out].sort((a, b) => a.rank - b.rank).slice(0, o.count);
  }
  return out;
}

export interface LineDistOptions {
  line: Pt[];
  spacing: number;
  count: number | null;
  startOffset: number;
  endOffset: number;
  variation: number;
  stripWidth: number;
  distribution: LineDistribution;
  seed: number;
}

export function distributeAlongLine(o: LineDistOptions): DistPoint[] {
  const L = polylineLength(o.line);
  const usable = L - o.startOffset - o.endOffset;
  if (o.line.length < 2 || usable <= 0) return [];
  const rng = mulberry32(o.seed);
  let n: number;
  let step: number;
  if (o.count && o.count > 0) {
    n = Math.min(MAX_POINTS, Math.round(o.count));
    step = n > 1 ? usable / (n - 1) : 0;
  } else {
    if (!(o.spacing > 0)) return [];
    n = Math.min(MAX_POINTS, Math.floor(usable / o.spacing) + 1);
    step = o.spacing;
    // center the run inside the usable length
  }
  const used = step * (n - 1);
  const s0 = o.startOffset + (usable - used) / 2;
  const out: DistPoint[] = [];
  for (let i = 0; i < n; i++) {
    let s = s0 + i * step;
    if (o.distribution === 'natural') s += (rng() - 0.5) * step * o.variation;
    s = Math.max(o.startOffset, Math.min(L - o.endOffset, s));
    const { p, tx, ty } = pointAtLength(o.line, s);
    const nx = -ty,
      ny = tx;
    let off = 0;
    if (o.distribution === 'staggered') off = (i % 2 ? 0.5 : -0.5) * o.stripWidth * 0.5;
    else if (o.distribution === 'natural') off = (rng() - 0.5) * o.stripWidth * 0.6;
    out.push({ x: p.x + nx * off, y: p.y + ny * off, idx: i, scale: 1 + (rng() - 0.5) * o.variation * 0.4, rank: rng() });
  }
  return out;
}
