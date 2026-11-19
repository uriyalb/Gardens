import type { Pt } from '../model/types';

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-12) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return Math.hypot(p.x - x, p.y - y);
}

export function distToPolygonEdge(p: Pt, poly: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return d;
}

export function distToPolyline(p: Pt, line: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < line.length - 1; i++) d = Math.min(d, distToSegment(p, line[i], line[i + 1]));
  return d;
}

export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(a / 2);
}

export function centroid(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    x += (poly[j].x + poly[i].x) * f;
    y += (poly[j].y + poly[i].y) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  a *= 3;
  const c = { x: x / a, y: y / a };
  if (pointInPolygon(c, poly)) return c;
  // fallback for concave shapes: closest vertex-midpoint inside
  return poly[0];
}

export function bbox(points: Pt[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y));
  const o1 = o(a, b, c),
    o2 = o(a, b, d),
    o3 = o(c, d, a),
    o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

export function isSelfIntersecting(poly: Pt[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i],
      b = poly[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segIntersect(a, b, poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function polygonValidity(poly: Pt[]): string | null {
  if (poly.length < 3) return 'too_few_vertices';
  if (polygonArea(poly) < 1e-6) return 'zero_area';
  if (isSelfIntersecting(poly)) return 'self_intersecting';
  return null;
}

/** Does a circle intersect (or lie in) the polygon? */
export function circleIntersectsPolygon(c: Pt, r: number, poly: Pt[]): boolean {
  return pointInPolygon(c, poly) || distToPolygonEdge(c, poly) < r;
}

export function polylineLength(line: Pt[]): number {
  let L = 0;
  for (let i = 0; i < line.length - 1; i++) L += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y);
  return L;
}

/** Point and unit tangent at arc length s along polyline. */
export function pointAtLength(line: Pt[], s: number): { p: Pt; tx: number; ty: number } {
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i],
      b = line[i + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + L >= s || i === line.length - 2) {
      const t = L > 0 ? Math.max(0, Math.min(1, (s - acc) / L)) : 0;
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, tx: L ? (b.x - a.x) / L : 1, ty: L ? (b.y - a.y) / L : 0 };
    }
    acc += L;
  }
  return { p: line[0] ?? { x: 0, y: 0 }, tx: 1, ty: 0 };
}

/** y of polyline at given x (for section ground lines); null if outside its x-range. */
export function yAtX(line: Pt[], x: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i],
      b = line[i + 1];
    const lo = Math.min(a.x, b.x),
      hi = Math.max(a.x, b.x);
    if (x >= lo && x <= hi) {
      const t = hi - lo < 1e-9 ? 0 : (x - a.x) / (b.x - a.x);
      const y = a.y + (b.y - a.y) * t;
      if (best === null || y < best) best = y; // topmost surface
    }
  }
  return best;
}

export function nearestOnPolyline(p: Pt, line: Pt[]): { p: Pt; d: number; segment: number } {
  let best = { p: line[0], d: Infinity, segment: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i],
      b = line[i + 1];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.d) best = { p: q, d, segment: i };
  }
  return best;
}
