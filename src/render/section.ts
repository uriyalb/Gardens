// Orthographic elevation/section renderers. Local coordinates: ground contact at (0,0), up = -y.
import type { EffectiveParams } from '../model/resolve';
import type { Pt, Species } from '../model/types';
import { range, subRng, type Rng } from '../geometry/rng';
import { bentCurve, blob, harmonicRadius, quadPoints, scallop, smoothOpen, taper } from './sketch';
import { BRANCH_COLOR, TRUNK_COLOR, fillOpacity, foliage, ink, lw, mix, type RenderContext } from './style';
import { g, path } from './svg';
import type { PlantParts } from './plan';

const detail = (rc: RenderContext) => (rc.style.textures ? rc.style.foliage_detail : rc.style.foliage_detail * 0.35);

interface Crown {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rf: (t: number) => number;
}

function inCrown(c: Crown, p: Pt, k = 1) {
  const t = Math.atan2((p.y - c.cy) / c.ry, (p.x - c.cx) / c.rx);
  const r = c.rf(t) * k;
  return ((p.x - c.cx) / (c.rx * r)) ** 2 + ((p.y - c.cy) / (c.ry * r)) ** 2 <= 1;
}

function crownPoint(c: Crown, t: number, d: number): Pt {
  return { x: c.cx + Math.cos(t) * c.rx * c.rf(t) * d, y: c.cy + Math.sin(t) * c.ry * c.rf(t) * d };
}

interface Branch {
  pts: Pt[];
  w0: number;
  w1: number;
}

/** Deterministic branching structure: primary → secondary → (tertiary) toward crown envelope. */
function grow(rng: Rng, fork: Pt, c: Crown, nPrimary: number, spread: [number, number], twist: number, tw: number, depth: number): { branches: Branch[]; tips: Pt[] } {
  const branches: Branch[] = [];
  const tips: Pt[] = [];
  for (let i = 0; i < nPrimary; i++) {
    const f = nPrimary === 1 ? 0.5 : i / (nPrimary - 1);
    const t = -Math.PI / 2 + (spread[0] + (spread[1] - spread[0]) * f) + (rng() - 0.5) * 0.35;
    const target = crownPoint(c, t, range(rng, 0.55, 0.82));
    const mid = { x: (fork.x + target.x) / 2 + (rng() - 0.5) * c.rx * 0.25 * (1 + twist), y: (fork.y + target.y) / 2 + (rng() - 0.3) * c.ry * 0.15 };
    const pts = quadPoints(fork, mid, target, 8).map((p, k) => (twist > 0 && k > 0 && k < 8 ? { x: p.x + Math.sin(k * 1.7 + i) * twist * tw * 0.8, y: p.y } : p));
    const w0 = tw * range(rng, 0.42, 0.6);
    branches.push({ pts, w0, w1: w0 * 0.3 });
    if (depth < 1) {
      tips.push(target);
      continue;
    }
    const nSec = 2 + Math.floor(rng() * 2) + (depth > 1 ? 1 : 0);
    for (let k = 0; k < nSec; k++) {
      const s = pts[Math.min(pts.length - 1, 3 + Math.floor(rng() * 4))];
      const t2 = t + (rng() - 0.5) * 1.4;
      const end = crownPoint(c, t2, range(rng, 0.6, 0.95));
      const m2 = { x: (s.x + end.x) / 2 + (rng() - 0.5) * c.rx * 0.18, y: (s.y + end.y) / 2 - rng() * c.ry * 0.1 };
      const p2 = quadPoints(s, m2, end, 5);
      branches.push({ pts: p2, w0: w0 * 0.45, w1: w0 * 0.12 });
      tips.push(end);
      if (depth > 1) {
        for (let q = 0; q < 2; q++) {
          const s3 = p2[2 + Math.floor(rng() * 3)];
          const a3 = Math.atan2(end.y - s3.y, end.x - s3.x) + (rng() - 0.5) * 1.6;
          const L3 = Math.hypot(end.x - s3.x, end.y - s3.y) * range(rng, 0.4, 0.7);
          const e3 = { x: s3.x + Math.cos(a3) * L3, y: s3.y + Math.sin(a3) * L3 };
          branches.push({ pts: [s3, e3], w0: w0 * 0.15, w1: w0 * 0.05 });
          tips.push(e3);
        }
      }
    }
  }
  return { branches, tips };
}

function drawBranches(rc: RenderContext, bs: Branch[], color: string): string {
  let d = '';
  for (const b of bs) d += taper(b.pts, Math.max(b.w0, rc.px * 0.5), Math.max(b.w1, rc.px * 0.25));
  return path(d, { fill: rc.style.monochrome ? '#FFFFFF' : color, 'fill-opacity': rc.style.fills ? 1 : 1, stroke: ink(rc), 'stroke-width': lw(rc, 0.35), 'stroke-linejoin': 'round' });
}

function trunkShape(rc: RenderContext, e: EffectiveParams, rng: Rng, fork: Pt, twisted: boolean): string {
  const tw = Math.max(e.tw, rc.px * 2);
  const mid = { x: fork.x * 0.5 + (rng() - 0.5) * tw * (twisted ? 2.2 : 0.6), y: fork.y * 0.5 };
  const pts = quadPoints({ x: 0, y: 0 }, mid, fork, 10);
  let out = '';
  // root flare
  const flare = `M${(-tw * 0.9).toFixed(2)} 0Q${(-tw * 0.5).toFixed(2)} ${(-tw * 0.2).toFixed(2)} ${(-tw * 0.45).toFixed(2)} ${(-tw * 0.9).toFixed(2)}L${(tw * 0.45).toFixed(2)} ${(-tw * 0.9).toFixed(2)}Q${(tw * 0.5).toFixed(2)} ${(-tw * 0.2).toFixed(2)} ${(tw * 0.9).toFixed(2)} 0Z`;
  out += path(taper(pts, tw, tw * 0.62) + flare, { fill: rc.style.monochrome ? '#FFFFFF' : TRUNK_COLOR, stroke: ink(rc), 'stroke-width': lw(rc, 0.7), 'stroke-linejoin': 'round' });
  if (twisted || rc.style.textures) {
    // bark fissures / twisting strands
    let fd = '';
    const n = twisted ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const off = (i / (n - 1 || 1) - 0.5) * tw * 0.5;
      const sp = pts.map((p, k) => ({ x: p.x + off * (1 - k / 14) + (twisted ? Math.sin(k * 0.9 + i * 2) * tw * 0.18 : 0), y: p.y }));
      fd += smoothOpen(sp.slice(1, -1));
    }
    out += path(fd, { fill: 'none', stroke: ink(rc), 'stroke-width': lw(rc, 0.35), 'stroke-opacity': 0.55 });
  }
  return out;
}

function groundShadow(rc: RenderContext, e: EffectiveParams, w: number): string {
  const s = rc.style.shadow_strength * e.shadowMul;
  if (s <= 0.001 || !rc.style.fills) return '';
  return `<ellipse cx="0" cy="0" rx="${(w / 2).toFixed(2)}" ry="${Math.max(rc.px, w * 0.035).toFixed(2)}" fill="#2E302C" fill-opacity="${Math.min(0.5, s * 1.4).toFixed(2)}"/>`;
}

export function renderTreeSection(sp: Species, e: EffectiveParams, rc: RenderContext): PlantParts {
  const kind = sp.section_renderer;
  const rng = subRng(e.seed, 'sec-' + kind);
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const D = detail(rc);
  const op = 1 - e.transparency;
  const H = e.H,
    Hb = Math.min(e.Hb, H * 0.85),
    R = e.R;
  const crownH = H - Hb;
  const lean = (rng() - 0.5) * R * 0.25 * e.irregularity;
  let crown: Crown;
  if (kind === 'branching_airy_tree') {
    crown = { cx: lean, cy: -(Hb + crownH * 0.52), rx: R, ry: (crownH / 2) * 0.92, rf: harmonicRadius(rng, 0.35 * e.irregularity + 0.08, [2, 3, 5]) };
  } else if (kind === 'twisted_olive_tree') {
    crown = { cx: lean + R * 0.12 * (rng() > 0.5 ? 1 : -1), cy: -(Hb + crownH * 0.5), rx: R * 0.98, ry: (crownH / 2) * 0.88, rf: harmonicRadius(rng, 0.4 * e.irregularity + 0.08, [2, 3, 4]) };
  } else {
    crown = { cx: lean * 0.5, cy: -(Hb + crownH * 0.5), rx: R * 0.96, ry: (crownH / 2) * 0.98, rf: harmonicRadius(rng, 0.18 * e.irregularity + 0.04, [2, 3]) };
  }
  const fork = { x: lean * 0.6, y: -Hb - crownH * (kind === 'broad_layered_tree' ? 0.06 : 0.02) };
  const bd = rc.style.branch_detail;
  const depth = bd > 0.65 ? 2 : bd > 0.2 ? 1 : 0;
  const nPrimary = kind === 'branching_airy_tree' ? 5 + Math.round(bd * 2) : kind === 'twisted_olive_tree' ? 3 + Math.round(bd) : 4 + Math.round(bd * 2);
  const spread: [number, number] = kind === 'branching_airy_tree' ? [-1.35, 1.35] : kind === 'twisted_olive_tree' ? [-1.1, 1.1] : [-1.0, 1.0];
  const twist = kind === 'twisted_olive_tree' ? 0.6 : 0;
  const tw = Math.max(e.tw, rc.px * 2);
  const { branches, tips } = grow(subRng(e.seed, 'branches'), fork, crown, nPrimary, spread, twist, tw * (kind === 'broad_layered_tree' ? 1.15 : 1), depth);

  const trunk = groundShadow(rc, e, R * 1.2) + trunkShape(rc, e, subRng(e.seed, 'trunk'), fork, kind === 'twisted_olive_tree') + drawBranches(rc, branches, mix(TRUNK_COLOR, BRANCH_COLOR, 0.4));

  // ---- foliage ----
  let canopy = '';
  const fr = subRng(e.seed, 'foliage');
  const fillPts: Pt[] = [];
  const nFill = Math.round((kind === 'twisted_olive_tree' ? 40 + 50 * D : kind === 'branching_airy_tree' ? 26 + 30 * D : 10 + 14 * D) * e.clusterMul);
  for (let i = 0; i < nFill; i++) {
    const t = fr() * Math.PI * 2,
      d = Math.sqrt(fr()) * 0.88;
    fillPts.push(crownPoint(crown, t, d));
  }
  const anchors = [...tips, ...fillPts].map((p) => ({ p, rank: fr(), sub: fr() * 1e9 }));

  if (kind === 'branching_airy_tree') {
    // Tamarix: fine elongated pendulous sprays, semi-transparent, soft irregular edge
    let washes = '',
      sprays = '';
    const sc = mix(cols[2] ?? cols[0], ink(rc), 0.35);
    anchors.forEach((a, i) => {
      if (a.rank > e.density * 1.2) return;
      const lr = subRng(a.sub, 1);
      const w = R * range(lr, 0.2, 0.34),
        h = crownH * range(lr, 0.1, 0.17);
      washes += path(blob(a.p.x, a.p.y, 1, lr, 0.8, 9, w, h), { fill: cols[i % cols.length], 'fill-opacity': fillOpacity(rc, 0.55 * op), stroke: 'none' });
      const n = Math.round(7 + 11 * D);
      let d = '';
      for (let k = 0; k < n; k++) {
        const x0 = a.p.x + (lr() - 0.5) * w * 1.4;
        const y0 = a.p.y - h * range(lr, 0.2, 0.8);
        const len = crownH * range(lr, 0.07, 0.17);
        d += bentCurve({ x: x0, y: y0 }, { x: x0 + (lr() - 0.5) * len * 0.5, y: y0 + len }, (lr() - 0.5) * 0.5);
      }
      sprays += d;
    });
    canopy += washes + path(sprays, { fill: 'none', stroke: sc, 'stroke-width': lw(rc, 0.4), 'stroke-opacity': 0.5 + 0.4 * op, 'stroke-linecap': 'round' });
    // thin branch network visible through foliage
    canopy += g({ opacity: e.branchVis * 0.6 }, path(branches.slice(-Math.ceil(branches.length / 2)).map((b) => smoothOpen(b.pts)).join(''), { fill: 'none', stroke: BRANCH_COLOR, 'stroke-width': lw(rc, 0.45) }));
  } else if (kind === 'broad_layered_tree') {
    // Celtis: broad fuller foliage masses in layers
    const layersDef = [
      { c: cols[2] ?? cols[0], o: 0.75, s: 1.0, k: 0.95 },
      { c: cols[0], o: 0.7, s: 0.8, k: 0.8 },
      { c: cols[1] ?? cols[0], o: 0.55, s: 0.55, k: 0.62 },
    ];
    layersDef.forEach((L, li) => {
      let fills = '';
      let lines = '';
      anchors.forEach((a) => {
        if (a.rank > e.density * 1.1) return;
        if (!inCrown(crown, a.p, L.k + 0.1)) return;
        const lr = subRng(a.sub, li + 3);
        const rr = R * range(lr, 0.22, 0.34) * L.s;
        const ox = li === 2 ? -rr * 0.2 : 0,
          oy = li === 2 ? -rr * 0.25 : 0;
        const d = scallop(a.p.x + ox, a.p.y + oy, rr, harmonicRadius(lr, 0.3, [2, 3]), 7, lr, 0.22, 0.85);
        fills += path(d, { fill: L.c, 'fill-opacity': fillOpacity(rc, L.o * (0.4 + op * 0.6)), stroke: 'none' });
        if (li === 0) lines += d;
      });
      canopy += fills;
      if (lines) canopy += path(lines, { fill: 'none', stroke: ink(rc), 'stroke-width': lw(rc, 0.5 * e.outlineMul), 'stroke-opacity': 0.55 });
    });
    // readable structural branches partly visible through gaps
    canopy += g({ opacity: e.branchVis * 0.5 * (1.2 - e.density) }, drawBranches(rc, branches.slice(0, nPrimary), BRANCH_COLOR));
  } else if (kind === 'twisted_olive_tree') {
    // Olive: small granular silver clusters with internal gaps
    const gr = subRng(e.seed, 'ole-gaps');
    const gaps = Array.from({ length: 3 }, () => ({ ...crownPoint(crown, gr() * Math.PI * 2, range(gr, 0.15, 0.55)), r: R * range(gr, 0.12, 0.2) * (0.6 + e.transparency) }));
    let fills = '',
      lines = '';
    anchors.forEach((a, i) => {
      if (a.rank > e.density * 1.15) return;
      if (gaps.some((q) => Math.hypot(q.x - a.p.x, q.y - a.p.y) < q.r)) return;
      const lr = subRng(a.sub, 7);
      const rr = R * range(lr, 0.09, 0.15);
      const d = blob(a.p.x, a.p.y, rr, lr, 0.7, 7, 1.25, 0.8);
      fills += path(d, { fill: cols[i % cols.length], 'fill-opacity': fillOpacity(rc, 0.85 * (0.45 + op * 0.55)), stroke: 'none' });
      lines += d;
    });
    canopy += fills + path(lines, { fill: 'none', stroke: ink(rc), 'stroke-width': lw(rc, 0.35 * e.outlineMul), 'stroke-opacity': 0.5 });
    canopy += g({ opacity: e.branchVis * 0.7 }, path(branches.map((b) => smoothOpen(b.pts)).join(''), { fill: 'none', stroke: BRANCH_COLOR, 'stroke-width': lw(rc, 0.55) }));
  } else {
    let d = '';
    anchors.forEach((a) => {
      if (a.rank > e.density) return;
      const lr = subRng(a.sub, 9);
      d += scallop(a.p.x, a.p.y, R * range(lr, 0.25, 0.35), harmonicRadius(lr, 0.3, [2, 3]), 7, lr, 0.2);
    });
    canopy += path(d, { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.6 * op), stroke: ink(rc), 'stroke-width': lw(rc, 0.45), 'stroke-opacity': 0.6 });
  }
  return { trunk, main: canopy };
}

export function renderShrubSection(sp: Species, e: EffectiveParams, rc: RenderContext): PlantParts {
  const kind = sp.section_renderer;
  const R = e.R,
    H = Math.max(e.H, rc.px * 3);
  const rng = subRng(e.seed, 'ssec-' + kind);
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const D = detail(rc);
  const op = 1 - e.transparency;
  let out = groundShadow(rc, e, R * 1.8);

  if (kind === 'grass_strip') {
    const n = Math.round(Math.max(4, (R * 2) / (rc.px * (3.2 - D * 1.6))));
    let d = '';
    for (let i = 0; i < n; i++) {
      const x = -R + (i + rng()) * ((2 * R) / n);
      const h = Math.max(rc.px * 2, H * range(rng, 0.6, 1.1));
      d += `M${x.toFixed(2)} 0Q${(x + h * 0.2).toFixed(2)} ${(-h * 0.5).toFixed(2)} ${(x + (rng() - 0.5) * h * 0.7).toFixed(2)} ${(-h).toFixed(2)}`;
    }
    out += path(`M${(-R).toFixed(2)} 0L${R.toFixed(2)} 0L${R.toFixed(2)} ${(-H * 0.5).toFixed(2)}L${(-R).toFixed(2)} ${(-H * 0.5).toFixed(2)}Z`, { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.6), stroke: 'none' });
    out += path(d, { fill: 'none', stroke: mix(cols[1] ?? cols[0], ink(rc), 0.5), 'stroke-width': lw(rc, 0.35) });
    return { main: out };
  }

  if (kind === 'upright_stem_shrub') {
    // Lavender: fan of fine upright stems with flower spikes over a soft low mound
    const mound = blob(0, -H * 0.3, 1, rng, 0.5, 10, R * 0.95, H * 0.32);
    out += path(mound, { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.75 * op), stroke: ink(rc), 'stroke-width': lw(rc, 0.35), 'stroke-opacity': 0.5 });
    const n = Math.round((14 + 30 * D) * (0.5 + e.density));
    let st = '',
      fl = '';
    for (let i = 0; i < n; i++) {
      const bx = (rng() - 0.5) * R * 0.5;
      const tx = (rng() - 0.5) * R * 2 * 0.95;
      const th = H * range(rng, 0.65, 1.0) * (1 - Math.abs(tx / R) * 0.3);
      st += bentCurve({ x: bx, y: 0 }, { x: tx, y: -th }, (rng() - 0.5) * 0.15);
      if (sp.flower_color && rng() < 0.6 * (0.4 + e.density)) {
        const L = H * 0.14;
        const ang = Math.atan2(-th, tx - bx);
        fl += `M${tx.toFixed(2)} ${(-th).toFixed(2)}L${(tx + Math.cos(ang) * L).toFixed(2)} ${(-th + Math.sin(ang) * L).toFixed(2)}`;
      }
    }
    out += path(st, { fill: 'none', stroke: mix(cols[1] ?? cols[0], ink(rc), 0.45), 'stroke-width': lw(rc, 0.35), 'stroke-linecap': 'round' });
    if (fl && !rc.style.monochrome) out += path(fl, { fill: 'none', stroke: foliage(rc, sp.flower_color!), 'stroke-width': lw(rc, 1.5), 'stroke-linecap': 'round', 'stroke-opacity': 0.85 });
    return { main: out };
  }

  if (kind === 'woody_spreading_shrub') {
    // Rosemary: irregular low mass, woody branching, fine needle ticks
    const pts: Pt[] = [];
    const rf = harmonicRadius(rng, 0.45 * e.irregularity + 0.15, [3, 5, 7]);
    for (let i = 0; i <= 16; i++) {
      const t = Math.PI + (i / 16) * Math.PI;
      pts.push({ x: Math.cos(t) * R * rf(t), y: Math.min(0, Math.sin(t) * H * rf(t + 1)) });
    }
    const d = smoothOpen(pts) + 'Z';
    out += path(d, { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.85 * op), stroke: ink(rc), 'stroke-width': lw(rc, 0.55 * e.outlineMul), 'stroke-opacity': 0.75 });
    let w = '';
    for (let i = 0; i < 4 + Math.round(rc.style.branch_detail * 3); i++) {
      const tx = (rng() - 0.5) * R * 1.6;
      w += smoothOpen([
        { x: tx * 0.15, y: 0 },
        { x: tx * 0.5 + (rng() - 0.5) * R * 0.2, y: -H * range(rng, 0.25, 0.45) },
        { x: tx, y: -H * range(rng, 0.55, 0.85) },
      ]);
    }
    out += path(w, { fill: 'none', stroke: BRANCH_COLOR, 'stroke-width': lw(rc, 0.6), opacity: 0.4 + e.branchVis * 0.6 });
    let nd = '';
    const n = Math.round((20 + 40 * D) * (0.4 + e.density));
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * R * 1.7;
      const y = -H * rng() * 0.9 * (1 - Math.abs(x / R) * 0.5);
      const o = -Math.PI / 2 + (rng() - 0.5) * 1.5;
      const L = H * 0.07;
      nd += `M${x.toFixed(2)} ${y.toFixed(2)}L${(x + Math.cos(o) * L).toFixed(2)} ${(y + Math.sin(o) * L).toFixed(2)}`;
    }
    out += path(nd, { fill: 'none', stroke: mix(cols[1] ?? cols[0], ink(rc), 0.5), 'stroke-width': lw(rc, 0.3) });
    return { main: out };
  }

  // compact_shrub (Pittosporum) and fallback: scalloped dome from the ground
  const rf = harmonicRadius(rng, 0.2 * e.irregularity + 0.05, [2, 3]);
  const lobes = 8 + Math.round(D * 4);
  const pts: Pt[] = [];
  for (let i = 0; i <= lobes; i++) {
    const t = Math.PI + (i / lobes) * Math.PI;
    pts.push({ x: Math.cos(t) * R * 0.95 * rf(t), y: Math.min(0, Math.sin(t) * H * 0.98 * rf(t + 0.7)) });
  }
  let d = `M${pts[0].x.toFixed(2)} 0`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    const cy = -H * 0.45;
    const dx = mx,
      dy = my - cy;
    const L = Math.hypot(dx, dy) || 1;
    const bl = Math.hypot(b.x - a.x, b.y - a.y) * 0.35;
    d += `Q${(mx + (dx / L) * bl).toFixed(2)} ${(my + (dy / L) * bl).toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  d += 'Z';
  out += path(d, { fill: cols[1] ?? cols[0], 'fill-opacity': fillOpacity(rc, 1.15 * op), stroke: 'none' });
  out += path(blob(-R * 0.2, -H * 0.62, 1, rng, 0.4, 8, R * 0.5, H * 0.25), { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.7), stroke: 'none' });
  let leaves = '';
  const n = Math.round((6 + 12 * D) * e.clusterMul);
  for (let i = 0; i < n; i++) {
    const x = (rng() - 0.5) * R * 1.5,
      y = -H * range(rng, 0.15, 0.85);
    if (rng() > e.density) continue;
    const s = R * 0.12;
    leaves += bentCurve({ x: x - s, y }, { x: x + s, y: y - s * 0.3 }, 0.35);
  }
  out += path(leaves, { fill: 'none', stroke: ink(rc), 'stroke-width': lw(rc, 0.4), 'stroke-opacity': 0.55 });
  out += path(d, { fill: 'none', stroke: ink(rc), 'stroke-width': lw(rc, 0.8 * e.outlineMul) });
  return { main: out };
}
