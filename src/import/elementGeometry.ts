import type { Pt } from '../model/types';

const STRAIGHT = /^[MmLlHhVvZz0-9eE.,\s+-]+$/;

function straightPathVertices(d: string): { pts: Pt[]; closed: boolean } | null {
  if (!STRAIGHT.test(d)) return null;
  const toks = d.match(/[MmLlHhVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  if (!toks) return null;
  const pts: Pt[] = [];
  let cmd = 'M',
    x = 0,
    y = 0,
    sx = 0,
    sy = 0,
    closed = false,
    i = 0;
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    const t = toks[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        closed = true;
        x = sx;
        y = sy;
        continue;
      }
    }
    if (i >= toks.length) break;
    switch (cmd) {
      case 'M':
      case 'L':
        x = num();
        y = num();
        break;
      case 'm':
      case 'l':
        x += num();
        y += num();
        break;
      case 'H':
        x = num();
        break;
      case 'h':
        x += num();
        break;
      case 'V':
        y = num();
        break;
      case 'v':
        y += num();
        break;
      default:
        return null;
    }
    if (cmd === 'M' || cmd === 'm') {
      if (pts.length) return null; // multiple subpaths: fall back to sampling
      sx = x;
      sy = y;
      cmd = cmd === 'M' ? 'L' : 'l';
    }
    pts.push({ x, y });
  }
  return { pts, closed };
}

/** Exact vertices (straight geometry) or dense samples (curves) of an SVG element, in document coordinates. */
export function elementPoints(el: SVGGraphicsElement, toDoc: DOMMatrix, sampleStep: number): { points: Pt[]; closed: boolean } | null {
  const tag = el.tagName.toLowerCase();
  let local: Pt[] = [];
  let closed = false;
  if (tag === 'polygon' || tag === 'polyline') {
    const pl = (el as SVGPolygonElement).points;
    for (let i = 0; i < pl.numberOfItems; i++) local.push({ x: pl.getItem(i).x, y: pl.getItem(i).y });
    closed = tag === 'polygon';
  } else if (tag === 'rect') {
    const r = el as SVGRectElement;
    const x = r.x.baseVal.value,
      y = r.y.baseVal.value,
      w = r.width.baseVal.value,
      h = r.height.baseVal.value;
    local = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    closed = true;
  } else if (tag === 'line') {
    const l = el as SVGLineElement;
    local = [
      { x: l.x1.baseVal.value, y: l.y1.baseVal.value },
      { x: l.x2.baseVal.value, y: l.y2.baseVal.value },
    ];
  } else if (tag === 'path' || tag === 'circle' || tag === 'ellipse') {
    const sv = tag === 'path' ? straightPathVertices(el.getAttribute('d') ?? '') : null;
    if (sv) {
      local = sv.pts;
      closed = sv.closed;
    } else {
      const ge = el as unknown as SVGGeometryElement;
      const L = ge.getTotalLength();
      const n = Math.max(12, Math.min(400, Math.round(L / sampleStep)));
      for (let i = 0; i <= n; i++) {
        const p = ge.getPointAtLength((L * i) / n);
        local.push({ x: p.x, y: p.y });
      }
      closed = tag !== 'path' || /z\s*$/i.test(el.getAttribute('d') ?? '');
      if (closed) local.pop();
    }
  } else return null;
  if (closed && local.length > 2) {
    const a = local[0],
      b = local[local.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) local.pop();
  }
  const points = local.map((p) => {
    const q = new DOMPoint(p.x, p.y).matrixTransform(toDoc);
    return { x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 };
  });
  return { points, closed };
}
