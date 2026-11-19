// Orthographic top-view (plan) renderers. Local coordinates: trunk centre at (0,0).
import type { EffectiveParams } from '../model/resolve';
import type { Pt, Species } from '../model/types';
import { range, subRng } from '../geometry/rng';
import { bentCurve, blob, harmonicRadius, scallop, smoothClosed, wavy } from './sketch';
import { BRANCH_COLOR, TRUNK_COLOR, fillOpacity, foliage, ink, lw, mix, type RenderContext } from './style';
import { circle, g, path } from './svg';

export interface PlantParts {
  trunk?: string;
  main: string; // canopy (trees) or whole plant (shrubs)
}

const baseDetail = (rc: RenderContext) => (rc.style.textures ? rc.style.foliage_detail : rc.style.foliage_detail * 0.35);
/** Level of detail: small symbols (relative to the drawing) get simplified foliage so they stay readable at print scale. */
const lod = (rc: RenderContext, R: number) => Math.max(0.2, Math.min(1, R / (rc.px * 30)));
const detailFor = (rc: RenderContext, R: number) => baseDetail(rc) * lod(rc, R);
const bdetail = (rc: RenderContext) => rc.style.branch_detail;

function shadow(rc: RenderContext, e: EffectiveParams, heightUnits: number, shape: (dx: number, dy: number) => string): string {
  const s = rc.style.shadow_strength * e.shadowMul;
  if (s <= 0.001 || !rc.style.fills) return '';
  // Taller elements cast a longer offset: reinforces the height hierarchy in plan.
  const off = Math.min(e.R * 0.28, heightUnits * 0.035 + e.R * 0.04);
  return path(shape(off, off * 0.8), { fill: '#2E302C', 'fill-opacity': Math.min(0.35, s * 1.2), stroke: 'none' });
}

function trunkPlan(rc: RenderContext, e: EffectiveParams): string {
  const r = Math.max(e.tw / 2, rc.px * 1.6);
  return (
    circle(0, 0, r, { fill: rc.style.monochrome ? '#FFFFFF' : TRUNK_COLOR, 'fill-opacity': rc.style.fills ? 0.9 : 1, stroke: ink(rc), 'stroke-width': lw(rc, 0.7) }) +
    circle(0, 0, rc.px * 0.6, { fill: ink(rc), stroke: 'none' })
  );
}

function envelopePts(R: number, rf: (t: number) => number, n = 36, ox = 0, oy = 0, sx = 1, sy = 1, rot = 0): Pt[] {
  const pts: Pt[] = [];
  const c = Math.cos(rot),
    s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.cos(t) * R * rf(t) * sx,
      y = Math.sin(t) * R * rf(t) * sy;
    pts.push({ x: ox + x * c - y * s, y: oy + x * s + y * c });
  }
  return pts;
}

// ---------------- Tamarix: feathery irregular canopy ----------------
function featheryCanopy(sp: Species, e: EffectiveParams, rc: RenderContext): string {
  const R = e.R;
  const rng = subRng(e.seed, 'tam-env');
  const rf = harmonicRadius(rng, 0.55 * e.irregularity + 0.1, [2, 3, 5, 7]);
  const env = envelopePts(R, rf, 40);
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const op = 1 - e.transparency;
  const D = detailFor(rc, R);
  let out = shadow(rc, e, e.H, (dx, dy) => smoothClosed(env.map((p) => ({ x: p.x + dx, y: p.y + dy }))));
  // very light base wash (filtered shade footprint)
  out += path(smoothClosed(env), { fill: cols[1] ?? cols[0], 'fill-opacity': fillOpacity(rc, 0.35 * op), stroke: 'none' });

  // branches (visible through the airy crown)
  const br = subRng(e.seed, 'tam-br');
  const nb = 4 + Math.round(bdetail(rc) * 4);
  let branches = '';
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + br() * 0.6;
    const L = R * rf(a) * range(br, 0.55, 0.8);
    const end = { x: Math.cos(a) * L, y: Math.sin(a) * L };
    branches += path(bentCurve({ x: 0, y: 0 }, end, (br() - 0.5) * 0.35), { stroke: BRANCH_COLOR, 'stroke-width': lw(rc, 0.9), fill: 'none', 'stroke-linecap': 'round' });
    const nf = bdetail(rc) > 0.4 ? 2 : 1;
    for (let k = 0; k < nf; k++) {
      const t = range(br, 0.45, 0.7);
      const s = { x: end.x * t, y: end.y * t };
      const a2 = a + (k ? 1 : -1) * range(br, 0.3, 0.7);
      const e2 = { x: s.x + Math.cos(a2) * L * 0.4, y: s.y + Math.sin(a2) * L * 0.4 };
      branches += path(bentCurve(s, e2, (br() - 0.5) * 0.4), { stroke: BRANCH_COLOR, 'stroke-width': lw(rc, 0.5), fill: 'none', 'stroke-linecap': 'round' });
    }
  }
  out += g({ opacity: e.branchVis * 0.85 }, branches);

  // wispy foliage clusters with feathery sprays
  const cr = subRng(e.seed, 'tam-cl');
  const nMax = Math.round((22 + 26 * D) * e.clusterMul);
  let washes = '',
    sprays = '';
  const sprayColor = mix(cols[2] ?? cols[0], ink(rc), 0.35);
  for (let i = 0; i < nMax; i++) {
    const a = cr() * Math.PI * 2;
    const d = Math.sqrt(cr()) * 0.8;
    const cx = Math.cos(a) * R * rf(a) * d,
      cy = Math.sin(a) * R * rf(a) * d;
    const rr = R * range(cr, 0.14, 0.27);
    const rank = cr();
    const sub = cr() * 1e9;
    if (rank > e.density * 1.25) continue; // stable thinning: density opens gaps coherently
    const lr = subRng(sub, 0);
    washes += path(blob(cx, cy, rr, lr, 0.8, 9, 1.2, 0.8, a), { fill: cols[i % cols.length], 'fill-opacity': fillOpacity(rc, 0.5 * op), stroke: 'none' });
    const ns = Math.round(5 + 11 * D);
    let d2 = '';
    for (let k = 0; k < ns; k++) {
      const sa = a + (lr() - 0.5) * 2.4;
      const s0 = { x: cx + (lr() - 0.5) * rr * 0.6, y: cy + (lr() - 0.5) * rr * 0.6 };
      const len = rr * range(lr, 0.6, 1.25);
      const s1 = { x: s0.x + Math.cos(sa) * len, y: s0.y + Math.sin(sa) * len };
      d2 += bentCurve(s0, s1, (lr() - 0.5) * 0.5);
    }
    sprays += path(d2, { stroke: sprayColor, 'stroke-width': lw(rc, 0.42), fill: 'none', 'stroke-linecap': 'round', 'stroke-opacity': 0.55 + 0.35 * op });
  }
  out += washes + sprays;

  // soft broken edge: short wisps around the perimeter instead of a hard outline
  const er = subRng(e.seed, 'tam-edge');
  const nEdge = Math.round((24 + 40 * D) * (0.6 + e.density * 0.6));
  let edge = '';
  for (let i = 0; i < nEdge; i++) {
    const a = er() * Math.PI * 2;
    const r0 = R * rf(a) * range(er, 0.86, 1.0);
    const p0 = { x: Math.cos(a) * r0, y: Math.sin(a) * r0 };
    const ta = a + Math.PI / 2 + (er() - 0.5) * 1.2;
    const len = R * range(er, 0.06, 0.14);
    edge += bentCurve(p0, { x: p0.x + Math.cos(ta) * len, y: p0.y + Math.sin(ta) * len }, (er() - 0.5) * 0.6);
  }
  out += path(edge, { stroke: ink(rc), 'stroke-width': lw(rc, 0.45 * e.outlineMul), fill: 'none', 'stroke-linecap': 'round', 'stroke-opacity': 0.75 });
  return out;
}

// ---------------- Celtis: dense rounded canopy ----------------
function denseCanopy(sp: Species, e: EffectiveParams, rc: RenderContext): string {
  const R = e.R;
  const rng = subRng(e.seed, 'cel-env');
  const rf = harmonicRadius(rng, 0.2 * e.irregularity + 0.04, [2, 3, 5]);
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const op = 1 - e.transparency;
  const D = detailFor(rc, R);
  const lobes = 10 + Math.round(D * 7);
  const outer = scallop(0, 0, R * 0.93, rf, lobes, subRng(e.seed, 'cel-sc'), 0.2);
  let out = shadow(rc, e, e.H, (dx, dy) => scallop(dx, dy, R * 0.93, rf, lobes, subRng(e.seed, 'cel-sc'), 0.2));
  out += path(outer, { fill: cols[1] ?? cols[0], 'fill-opacity': fillOpacity(rc, 0.9 * op), stroke: 'none' });

  // structural branching under inner foliage layers
  const br = subRng(e.seed, 'cel-br');
  const nb = 5 + Math.round(bdetail(rc) * 3);
  let branches = '';
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + br() * 0.5;
    const L = R * range(br, 0.55, 0.75);
    const end = { x: Math.cos(a) * L, y: Math.sin(a) * L };
    branches += path(bentCurve({ x: 0, y: 0 }, end, (br() - 0.5) * 0.18), { stroke: BRANCH_COLOR, 'stroke-width': lw(rc, 1.5), fill: 'none', 'stroke-linecap': 'round' });
    const nf = 1 + Math.round(bdetail(rc) * 2);
    for (let k = 0; k < nf; k++) {
      const t = range(br, 0.4, 0.8);
      const s = { x: end.x * t, y: end.y * t };
      const a2 = a + (k % 2 ? 1 : -1) * range(br, 0.35, 0.75);
      const e2 = { x: s.x + Math.cos(a2) * L * 0.45, y: s.y + Math.sin(a2) * L * 0.45 };
      branches += path(bentCurve(s, e2, (br() - 0.5) * 0.3), { stroke: BRANCH_COLOR, 'stroke-width': lw(rc, 0.8), fill: 'none', 'stroke-linecap': 'round' });
    }
  }
  out += g({ opacity: e.branchVis * (0.35 + 0.65 * (1 - e.density * 0.6)) }, branches);

  // layered inner masses (denser internal layering, more shade)
  const lr = subRng(e.seed, 'cel-layers');
  const layers = [
    { r: 0.7, c: cols[0], o: 0.65 },
    { r: 0.44, c: cols[2] ?? cols[0], o: 0.5 },
  ];
  layers.forEach((L, i) => {
    const ox = (lr() - 0.3) * R * 0.14,
      oy = (lr() - 0.3) * R * 0.14;
    const rf2 = harmonicRadius(lr, 0.25, [2, 3]);
    out += path(scallop(ox, oy, R * L.r, rf2, Math.max(6, lobes - 3 - i * 2), lr, 0.18), {
      fill: L.c,
      'fill-opacity': fillOpacity(rc, L.o * op * (0.5 + e.density * 0.6)),
      stroke: ink(rc),
      'stroke-width': lw(rc, 0.35),
      'stroke-opacity': 0.35 * Math.min(1, e.density + 0.2),
    });
  });

  // leaf-mass arcs ("c" strokes), thinned by density
  const ar = subRng(e.seed, 'cel-arcs');
  const nA = Math.round((12 + 26 * D) * e.clusterMul);
  let arcs = '';
  for (let i = 0; i < nA; i++) {
    const a = ar() * Math.PI * 2;
    const d = Math.sqrt(ar()) * 0.82;
    const cx = Math.cos(a) * R * d,
      cy = Math.sin(a) * R * d;
    const rr = R * range(ar, 0.07, 0.13);
    const rank = ar();
    const a0 = ar() * Math.PI * 2;
    if (rank > e.density) continue;
    const p0 = { x: cx + Math.cos(a0) * rr, y: cy + Math.sin(a0) * rr };
    const p1 = { x: cx + Math.cos(a0 + 2.4) * rr, y: cy + Math.sin(a0 + 2.4) * rr };
    arcs += `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)}A${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  out += path(arcs, { stroke: ink(rc), 'stroke-width': lw(rc, 0.45), fill: 'none', 'stroke-opacity': 0.55, 'stroke-linecap': 'round' });
  // stronger contour
  out += path(outer, { fill: 'none', stroke: ink(rc), 'stroke-width': lw(rc, 0.9 * e.outlineMul), 'stroke-linejoin': 'round' });
  return out;
}

// ---------------- Olea: granular asymmetric canopy ----------------
function granularCanopy(sp: Species, e: EffectiveParams, rc: RenderContext): string {
  const R = e.R;
  const rng = subRng(e.seed, 'ole-env');
  const a0 = rng() * Math.PI * 2;
  const shift = R * (0.1 + 0.18 * e.irregularity);
  const ox = Math.cos(a0) * shift,
    oy = Math.sin(a0) * shift;
  const rf = harmonicRadius(rng, 0.45 * e.irregularity + 0.08, [2, 3, 4, 6]);
  const sx = 1.08,
    sy = 0.84;
  const env = envelopePts(R * 0.92, rf, 36, ox, oy, sx, sy, a0);
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const op = 1 - e.transparency;
  const D = detailFor(rc, R);
  let out = shadow(rc, e, e.H, (dx, dy) => smoothClosed(env.map((p) => ({ x: p.x + dx, y: p.y + dy }))));
  out += path(smoothClosed(env), { fill: cols[2] ?? cols[0], 'fill-opacity': fillOpacity(rc, 0.28 * op), stroke: 'none' });

  // twisted main branches from the trunk
  const br = subRng(e.seed, 'ole-br');
  const nb = 3 + Math.round(bdetail(rc) * 2);
  let branches = '';
  for (let i = 0; i < nb; i++) {
    const a = a0 + (i / nb) * Math.PI * 2 + (br() - 0.5) * 0.8;
    const L = R * range(br, 0.5, 0.85);
    const end = { x: ox * 0.6 + Math.cos(a) * L, y: oy * 0.6 + Math.sin(a) * L };
    branches += path(wavy({ x: 0, y: 0 }, end, br, 2 + Math.round(br() * 2), 0.07), { stroke: BRANCH_COLOR, 'stroke-width': lw(rc, 1.25), fill: 'none', 'stroke-linecap': 'round' });
  }
  out += g({ opacity: e.branchVis * 0.9 }, branches);

  // natural internal openings
  const gr = subRng(e.seed, 'ole-gaps');
  const gaps = Array.from({ length: 3 }, () => {
    const a = gr() * Math.PI * 2;
    const d = range(gr, 0.2, 0.6) * R;
    return { x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d, r: R * range(gr, 0.1, 0.2) * (0.6 + e.transparency) };
  });
  // granular foliage clusters
  const cr = subRng(e.seed, 'ole-gr');
  const nG = Math.round((40 + 70 * D) * e.clusterMul);
  let grains = '';
  let outlines = '';
  const c = Math.cos(a0),
    s = Math.sin(a0);
  for (let i = 0; i < nG; i++) {
    const t = cr() * Math.PI * 2;
    const d = Math.sqrt(cr()) * 0.92;
    const lx = Math.cos(t) * R * rf(t) * d * sx,
      ly = Math.sin(t) * R * rf(t) * d * sy;
    const x = ox + lx * c - ly * s,
      y = oy + lx * s + ly * c;
    const rr = R * range(cr, 0.08, 0.15);
    const rank = cr();
    const sub = cr() * 1e9;
    if (rank > e.density * 1.2) continue;
    if (gaps.some((q) => Math.hypot(q.x - x, q.y - y) < q.r)) continue;
    const bp = blob(x, y, rr, subRng(sub, 0), 0.7, 7);
    grains += path(bp, { fill: cols[i % cols.length], 'fill-opacity': fillOpacity(rc, 0.85 * (0.4 + op * 0.6)), stroke: 'none' });
    outlines += bp;
  }
  out += grains + path(outlines, { fill: 'none', stroke: ink(rc), 'stroke-width': lw(rc, 0.35 * e.outlineMul), 'stroke-opacity': 0.55 });
  return out;
}

function simpleCanopy(sp: Species, e: EffectiveParams, rc: RenderContext): string {
  const rng = subRng(e.seed, 'simple');
  const rf = harmonicRadius(rng, 0.25 * e.irregularity, [2, 3, 5]);
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const d = scallop(0, 0, e.R * 0.94, rf, 12, rng, 0.16);
  return (
    shadow(rc, e, e.H, (dx, dy) => scallop(dx, dy, e.R * 0.94, rf, 12, subRng(e.seed, 'simple'), 0.16)) +
    path(d, { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.8 * (1 - e.transparency)), stroke: ink(rc), 'stroke-width': lw(rc, 0.8 * e.outlineMul) })
  );
}

// ---------------- Shrubs ----------------
function compactMound(sp: Species, e: EffectiveParams, rc: RenderContext): string {
  const R = e.R;
  const rng = subRng(e.seed, 'pit');
  const rf = harmonicRadius(rng, 0.25 * e.irregularity + 0.05, [2, 3]);
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const D = detailFor(rc, R);
  const lobes = 7 + Math.round(D * 4);
  const d = scallop(0, 0, R * 0.9, rf, lobes, subRng(e.seed, 'pit-sc'), 0.22);
  let out = shadow(rc, e, e.H * 3, (dx, dy) => scallop(dx, dy, R * 0.9, rf, lobes, subRng(e.seed, 'pit-sc'), 0.22));
  out += path(d, { fill: cols[1] ?? cols[0], 'fill-opacity': fillOpacity(rc, 1.15 * (1 - e.transparency)), stroke: 'none' });
  out += path(blob(-R * 0.15, -R * 0.15, R * 0.5, rng, 0.5, 8), { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.7), stroke: 'none' });
  // broad leaf texture
  const lr = subRng(e.seed, 'pit-leaf');
  const n = Math.round((5 + 12 * D) * e.clusterMul);
  let leaves = '';
  for (let i = 0; i < n; i++) {
    const a = lr() * Math.PI * 2;
    const r = Math.sqrt(lr()) * R * 0.7;
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    const s = R * range(lr, 0.08, 0.15);
    const rot = lr() * Math.PI * 2;
    if (lr() > e.density) continue;
    const p0 = { x: x + Math.cos(rot) * s, y: y + Math.sin(rot) * s };
    const p1 = { x: x - Math.cos(rot) * s, y: y - Math.sin(rot) * s };
    leaves += bentCurve(p0, p1, 0.35);
  }
  out += path(leaves, { stroke: ink(rc), 'stroke-width': lw(rc, 0.4), fill: 'none', 'stroke-opacity': 0.6, 'stroke-linecap': 'round' });
  out += path(d, { fill: 'none', stroke: ink(rc), 'stroke-width': lw(rc, 0.8 * e.outlineMul), 'stroke-linejoin': 'round' });
  return out;
}

function fineUprightMound(sp: Species, e: EffectiveParams, rc: RenderContext): string {
  const R = e.R;
  const rng = subRng(e.seed, 'lav');
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const D = detailFor(rc, R);
  const b = blob(0, 0, R * 0.88, rng, 0.6 + e.irregularity * 0.4, 11);
  let out = shadow(rc, e, e.H * 3, (dx, dy) => blob(dx, dy, R * 0.88, subRng(e.seed, 'lav'), 0.6 + e.irregularity * 0.4, 11));
  out += path(b, { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.85 * (1 - e.transparency)), stroke: ink(rc), 'stroke-width': lw(rc, 0.4 * e.outlineMul), 'stroke-opacity': 0.5 });
  // fine upright stems seen from above: radial ticks
  const sr = subRng(e.seed, 'lav-st');
  const n = Math.round((8 + 26 * D) * (0.5 + e.density));
  let st = '';
  const tips: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = sr() * Math.PI * 2;
    const r0 = R * range(sr, 0.05, 0.35),
      r1 = R * range(sr, 0.55, 0.95);
    const p1 = { x: Math.cos(a) * r1, y: Math.sin(a) * r1 };
    st += `M${(Math.cos(a) * r0).toFixed(2)} ${(Math.sin(a) * r0).toFixed(2)}L${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
    tips.push(p1);
  }
  out += path(st, { stroke: mix(cols[1] ?? cols[0], ink(rc), 0.45), 'stroke-width': lw(rc, 0.35), fill: 'none', 'stroke-linecap': 'round' });
  if (sp.flower_color && !rc.style.monochrome) {
    const fr = subRng(e.seed, 'lav-fl');
    let fl = '';
    tips.forEach((p) => {
      if (fr() < 0.35 * (0.4 + e.density)) fl += circle(p.x, p.y, Math.max(rc.px * 0.8, R * 0.08), { fill: foliage(rc, sp.flower_color!), 'fill-opacity': 0.85, stroke: 'none' });
    });
    out += fl;
  }
  return out;
}

function linearLeafMass(sp: Species, e: EffectiveParams, rc: RenderContext): string {
  const R = e.R;
  const rng = subRng(e.seed, 'ros');
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const D = detailFor(rc, R);
  const b = blob(0, 0, R * 0.9, rng, 0.8 + e.irregularity * 0.4, 12, 1.15, 0.85, rng() * 3);
  let out = shadow(rc, e, e.H * 3, (dx, dy) => blob(dx, dy, R * 0.9, subRng(e.seed, 'ros'), 0.8 + e.irregularity * 0.4, 12, 1.15, 0.85, 0));
  out += path(b, { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.9 * (1 - e.transparency)), stroke: ink(rc), 'stroke-width': lw(rc, 0.55 * e.outlineMul), 'stroke-opacity': 0.75 });
  // woody branching
  const wr = subRng(e.seed, 'ros-w');
  let w = '';
  for (let i = 0; i < 3 + Math.round(bdetail(rc) * 2); i++) {
    const a = wr() * Math.PI * 2;
    w += bentCurve({ x: 0, y: 0 }, { x: Math.cos(a) * R * 0.7, y: Math.sin(a) * R * 0.7 }, (wr() - 0.5) * 0.4);
  }
  out += path(w, { stroke: BRANCH_COLOR, 'stroke-width': lw(rc, 0.6), fill: 'none', opacity: e.branchVis });
  // fine linear needles
  const nr = subRng(e.seed, 'ros-n');
  const n = Math.round((16 + 40 * D) * (0.4 + e.density));
  let nd = '';
  for (let i = 0; i < n; i++) {
    const a = nr() * Math.PI * 2;
    const r = Math.sqrt(nr()) * R * 0.82;
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    const o = nr() * Math.PI;
    const L = R * range(nr, 0.06, 0.12);
    nd += `M${(x - Math.cos(o) * L).toFixed(2)} ${(y - Math.sin(o) * L).toFixed(2)}L${(x + Math.cos(o) * L).toFixed(2)} ${(y + Math.sin(o) * L).toFixed(2)}`;
  }
  out += path(nd, { stroke: mix(cols[1] ?? cols[0], ink(rc), 0.5), 'stroke-width': lw(rc, 0.32), fill: 'none', 'stroke-linecap': 'round' });
  if (sp.flower_color && !rc.style.monochrome) {
    const fr = subRng(e.seed, 'ros-f');
    let fl = '';
    for (let i = 0; i < 6; i++) {
      const a = fr() * Math.PI * 2,
        r = Math.sqrt(fr()) * R * 0.75;
      if (fr() < e.density) fl += circle(Math.cos(a) * r, Math.sin(a) * r, Math.max(rc.px * 0.5, R * 0.035), { fill: foliage(rc, sp.flower_color), 'fill-opacity': 0.8, stroke: 'none' });
    }
    out += fl;
  }
  return out;
}

/** Individual ground-cover patch (when a lawn/groundcover species is placed as a point). */
function groundPatch(sp: Species, e: EffectiveParams, rc: RenderContext): string {
  const rng = subRng(e.seed, 'gc');
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const b = blob(0, 0, e.R, rng, 0.5, 12);
  let out = path(b, { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.7), stroke: ink(rc), 'stroke-width': lw(rc, 0.35), 'stroke-opacity': 0.45 });
  if (rc.style.textures) {
    let t = '';
    const n = Math.round(6 + 10 * rc.style.foliage_detail);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2,
        r = Math.sqrt(rng()) * e.R * 0.8;
      t += tick(Math.cos(a) * r, Math.sin(a) * r, rc.px * 1.4);
    }
    out += path(t, { stroke: mix(cols[1] ?? cols[0], ink(rc), 0.5), 'stroke-width': lw(rc, 0.3), fill: 'none', 'stroke-opacity': 0.6 });
  }
  return out;
}

export function tick(x: number, y: number, s: number): string {
  return `M${(x - s * 0.5).toFixed(2)} ${(y - s * 0.6).toFixed(2)}L${x.toFixed(2)} ${y.toFixed(2)}L${(x + s * 0.4).toFixed(2)} ${(y - s * 0.8).toFixed(2)}`;
}

export function renderTreePlan(sp: Species, e: EffectiveParams, rc: RenderContext): PlantParts {
  let canopy: string;
  switch (sp.plan_renderer) {
    case 'feathery_irregular_canopy':
      canopy = featheryCanopy(sp, e, rc);
      break;
    case 'dense_rounded_canopy':
      canopy = denseCanopy(sp, e, rc);
      break;
    case 'granular_asymmetric_canopy':
      canopy = granularCanopy(sp, e, rc);
      break;
    default:
      canopy = simpleCanopy(sp, e, rc);
  }
  return { trunk: trunkPlan(rc, e), main: canopy };
}

export function renderShrubPlan(sp: Species, e: EffectiveParams, rc: RenderContext): PlantParts {
  switch (sp.plan_renderer) {
    case 'compact_mound':
      return { main: compactMound(sp, e, rc) };
    case 'fine_upright_mound':
      return { main: fineUprightMound(sp, e, rc) };
    case 'linear_leaf_mass':
      return { main: linearLeafMass(sp, e, rc) };
    case 'lawn_surface':
    case 'groundcover_texture':
      return { main: groundPatch(sp, e, rc) };
    case 'feathery_irregular_canopy':
    case 'dense_rounded_canopy':
    case 'granular_asymmetric_canopy':
    case 'simple_round_canopy':
      return { main: simpleCanopy(sp, e, rc) };
    default:
      return { main: compactMound(sp, e, rc) };
  }
}

/** Optional canopy footprint outline (projection of the crown on the ground). */
export function footprint(e: EffectiveParams, rc: RenderContext, color: string): string {
  return circle(0, 0, e.R, { fill: 'none', stroke: color, 'stroke-width': lw(rc, 0.6), 'stroke-dasharray': `${f2(rc.px * 4)} ${f2(rc.px * 3)}`, 'stroke-opacity': 0.8 });
}
const f2 = (n: number) => n.toFixed(2);
