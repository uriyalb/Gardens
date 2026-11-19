// Scene assembly: turns project data into per-layer SVG markup. Used by canvas and exporters.
import { SPATIAL_MODIFIERS } from '../model/defaults';
import { resolveParams } from '../model/resolve';
import type { DrawingMode, LayerId, LinearPlanting, PlantInstance, PlantingArea, Project, Species, StyleSettings } from '../model/types';
import { distributeAlongLine, distributeInPolygon, type DistPoint } from '../geometry/distribute';
import { hashSeed } from '../geometry/rng';
import { centroid } from '../geometry/polygon';
import { footprint, renderShrubPlan, renderTreePlan, tick } from './plan';
import { renderShrubSection, renderTreeSection } from './section';
import { polyD } from './sketch';
import { fillOpacity, foliage, ink, lw, makeContext, mix, type RenderContext } from './style';
import { circle, el, f, g, path, text } from './svg';
import { mulberry32 } from '../geometry/rng';

export type LayerMarkup = Partial<Record<LayerId, string>>;

const cache = new Map<string, LayerMarkup>();
const CACHE_MAX = 3000;
function cached(key: string, fn: () => LayerMarkup): LayerMarkup {
  const hit = cache.get(key);
  if (hit) return hit;
  const v = fn();
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, v);
  return v;
}

export function contextFor(project: Project, mode: DrawingMode, simplified = false, styleOverride?: StyleSettings): RenderContext {
  const v = project.views[mode];
  const diag = Math.hypot(v.canvas.w, v.canvas.h);
  return makeContext(styleOverride ?? project.style, v.calibration.units_per_meter, diag, simplified);
}

export const isTree = (sp?: Species) => sp?.category === 'tree';
export const isGroundCover = (sp?: Species) =>
  !!sp && (sp.category === 'grass' || sp.category === 'groundcover' || sp.plan_renderer === 'lawn_surface' || sp.plan_renderer === 'groundcover_texture');

export function speciesMap(project: Project): Map<string, Species> {
  return new Map(project.species.map((s) => [s.species_id, s]));
}

/** Background / midground depth: muted colours, lower detail, reduced line contrast. */
function depthAdjusted(sp: Species, style: StyleSettings, depth: PlantInstance['depth_role']): { sp: Species; style: StyleSettings } {
  if (depth === 'foreground') return { sp, style };
  const k = depth === 'background' ? 0.6 : 0.25;
  return {
    sp: { ...sp, foliage_colors: sp.foliage_colors.map((c) => mix(c, '#AEB5A8', k)), flower_color: sp.flower_color ? mix(sp.flower_color, '#B5B2BC', k) : sp.flower_color },
    style: {
      ...style,
      foliage_detail: style.foliage_detail * (depth === 'background' ? 0.35 : 0.7),
      branch_detail: style.branch_detail * (depth === 'background' ? 0.3 : 0.7),
      outline_strength: style.outline_strength * (depth === 'background' ? 0.35 : 0.75),
      line_color: mix(style.line_color, '#FFFFFF', depth === 'background' ? 0.45 : 0.2),
      shadow_strength: depth === 'background' ? 0 : style.shadow_strength,
    },
  };
}

/** Render a single plant in local coordinates (anchor at 0,0). Returns markup per layer. */
export function renderPlantLocal(p: PlantInstance, sp: Species, rc: RenderContext, mode: DrawingMode): LayerMarkup {
  const key = JSON.stringify([p, sp, rc.style, rc.upm, rc.px, rc.simplified, mode]);
  return cached(key, () => {
    const { sp: sp2, style } = depthAdjusted(sp, rc.style, p.depth_role);
    const rc2 = style === rc.style ? rc : { ...rc, style };
    const e = resolveParams(p, sp2, style, rc.upm);
    const tree = isTree(sp2);
    const parts = mode === 'plan' ? (tree ? renderTreePlan(sp2, e, rc2) : renderShrubPlan(sp2, e, rc2)) : tree ? renderTreeSection(sp2, e, rc2) : renderShrubSection(sp2, e, rc2);
    const out: LayerMarkup = {};
    const add = (layer: LayerId, s: string) => {
      if (s) out[layer] = (out[layer] ?? '') + s;
    };
    if (p.depth_role === 'background') {
      // soft vector halo (export-compatible softness instead of raster blur)
      let halo = '';
      const w = e.R,
        h = mode === 'plan' ? e.R : (e.H - e.Hb) / 2;
      const cy = mode === 'plan' ? 0 : -(e.Hb + (e.H - e.Hb) / 2);
      if (rc.style.fills) {
        for (let i = 0; i < 3; i++) {
          halo += el('ellipse', { cx: 0, cy, rx: w * (1.05 + i * 0.08), ry: h * (1.05 + i * 0.08), fill: foliage(rc2, sp2.foliage_colors[0]), 'fill-opacity': 0.12 - i * 0.03 });
        }
      }
      const op = rc.style.background_vegetation_opacity * (p.opacity / 0.85 > 1 ? 1 : p.opacity / 0.85);
      add('background_vegetation', g({ opacity: f(Math.max(0.05, op)) }, halo + (parts.trunk ?? '') + parts.main));
      return out;
    }
    const opacity = p.depth_role === 'midground' ? p.opacity * 0.8 : p.opacity;
    if (parts.trunk) add('tree_trunks', g({ opacity: f(Math.min(1, opacity + 0.15)) }, parts.trunk));
    let main = parts.main;
    if (p.show_footprint && mode === 'plan') main += footprint(e, rc2, ink(rc2));
    add(p.layer, g({ opacity: f(opacity) }, main));
    return out;
  });
}

export function plantTransform(p: PlantInstance, mode: DrawingMode): string {
  const { x, y } = p.position;
  return mode === 'plan' && p.rotation_deg ? `translate(${f(x)} ${f(y)}) rotate(${f(p.rotation_deg)})` : `translate(${f(x)} ${f(y)})`;
}

// ---------------- generated plants (areas / lines) ----------------

function pickMix(sp: Species, spMap: Map<string, Species>, r: number): Species {
  if (!sp.mix || !sp.mix.length) return sp;
  const total = sp.mix.reduce((s, m) => s + m.ratio, 0) || 1;
  let acc = 0;
  for (const m of sp.mix) {
    acc += m.ratio / total;
    if (r <= acc) return spMap.get(m.species_id) ?? sp;
  }
  return spMap.get(sp.mix[sp.mix.length - 1].species_id) ?? sp;
}

function pseudoPlant(base: PlantingArea | LinearPlanting, sp: Species, pt: DistPoint, mode: DrawingMode, parentId: string): PlantInstance {
  const seed = hashSeed(base.random_seed, pt.idx);
  const r = mulberry32(seed);
  return {
    instance_id: `${parentId}#${pt.idx}`,
    species_id: sp.species_id,
    drawing_mode: mode,
    position: { x: pt.x, y: pt.y, coordinate_space: 'source_svg' },
    height_m: base.plant_height_m * pt.scale,
    crown_diameter_m: base.plant_size_m * pt.scale,
    crown_base_height_m: sp.default_crown_base_height_m * (base.plant_height_m / Math.max(0.01, sp.default_height_m)),
    trunk_width_m: sp.default_trunk_width_m * pt.scale,
    rotation_deg: Math.floor(r() * 360),
    foliage_density: sp.foliage_density,
    canopy_transparency: sp.canopy_transparency,
    natural_irregularity: sp.natural_irregularity,
    branch_visibility: sp.branch_visibility,
    opacity: base.opacity,
    layer: base.layer,
    depth_role: 'foreground',
    spatial_character: base.spatial_character,
    random_seed: seed,
    locked: true,
    show_footprint: false,
    group_id: null,
    source_element_id: null,
    ground_line_id: null,
    verified_position: false,
  };
}

const distCache = new Map<string, DistPoint[]>();
export function areaPoints(a: PlantingArea, upm: number): DistPoint[] {
  const key = JSON.stringify([a.points, a.distribution, a.spacing_m, a.plant_count, a.edge_setback_m, a.random_seed, a.size_variation, upm]);
  let pts = distCache.get(key);
  if (!pts) {
    pts = distributeInPolygon({
      poly: a.points,
      spacing: a.spacing_m * upm,
      count: a.plant_count,
      setback: a.edge_setback_m * upm,
      distribution: a.distribution,
      seed: a.random_seed,
      sizeVariation: a.size_variation,
    });
    if (distCache.size > 400) distCache.delete(distCache.keys().next().value as string);
    distCache.set(key, pts);
  }
  return pts;
}

export function linePoints(l: LinearPlanting, upm: number, mode: DrawingMode): DistPoint[] {
  return distributeAlongLine({
    line: l.points,
    spacing: l.spacing_m * upm,
    count: l.plant_count,
    startOffset: l.start_offset_m * upm,
    endOffset: l.end_offset_m * upm,
    variation: l.spacing_variation,
    stripWidth: mode === 'section' ? 0 : l.strip_width_m * upm,
    distribution: l.distribution,
    seed: l.random_seed,
  });
}

export function generatedPlants(item: PlantingArea | LinearPlanting, project: Project, mode: DrawingMode): PlantInstance[] {
  const spMap = speciesMap(project);
  const sp = item.species_id ? spMap.get(item.species_id) : undefined;
  if (!sp) return [];
  const upm = project.views[mode].calibration.units_per_meter;
  const isArea = 'area_id' in item;
  if (isArea && ((item as PlantingArea).kind === 'protected' || isGroundCover(sp))) return [];
  const pts = isArea ? areaPoints(item as PlantingArea, upm) : linePoints(item as LinearPlanting, upm, mode);
  const pid = isArea ? (item as PlantingArea).area_id : (item as LinearPlanting).line_id;
  return pts.map((pt) => {
    const s = pickMix(sp, spMap, pt.rank);
    // keep the mix component's own proportions relative to the item's target size
    const pp = pseudoPlant(item, s, pt, mode, pid);
    if (s !== sp) {
      pp.crown_diameter_m = s.default_crown_diameter_m * (item.plant_size_m / Math.max(0.01, sp.default_crown_diameter_m)) * pt.scale;
      pp.height_m = s.default_height_m * (item.plant_height_m / Math.max(0.01, sp.default_height_m)) * pt.scale;
      pp.layer = item.layer;
    }
    return pp;
  });
}

function groundSurface(a: PlantingArea, sp: Species, rc: RenderContext): string {
  const cols = sp.foliage_colors.map((c) => foliage(rc, c));
  const d = polyD(a.points);
  const clipId = `${rc.idPrefix}-clip-${a.area_id}`;
  let out = path(d, { fill: cols[0], 'fill-opacity': fillOpacity(rc, 0.6 * a.opacity), stroke: 'none' });
  if (rc.style.textures) {
    // sparse, quiet texture: open lawn must stay quieter than shrubs and canopies
    const rng = mulberry32(a.random_seed);
    const spacing = rc.upm * (sp.plan_renderer === 'groundcover_texture' ? 0.8 : 1.6) * (1.5 - rc.style.foliage_detail);
    const xs = a.points.map((p) => p.x),
      ys = a.points.map((p) => p.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    let t = '';
    let count = 0;
    for (let y = minY; y < maxY && count < 2500; y += spacing) {
      for (let x = minX; x < maxX && count < 2500; x += spacing) {
        if (rng() > 0.45 + sp.foliage_density * 0.4) continue;
        const px = x + rng() * spacing,
          py = y + rng() * spacing;
        if (sp.plan_renderer === 'groundcover_texture') t += `M${f(px)} ${f(py)}h${f(rc.px * 0.6)}`;
        else t += tick(px, py, rc.px * 1.6);
        count++;
      }
    }
    out += path(t, { fill: 'none', stroke: mix(cols[1] ?? cols[0], ink(rc), 0.45), 'stroke-width': lw(rc, 0.3), 'stroke-opacity': 0.5, 'stroke-linecap': 'round', 'clip-path': `url(#${clipId})` });
  }
  out += path(d, { fill: 'none', stroke: ink(rc), 'stroke-width': lw(rc, 0.45 * (0.3 + rc.style.outline_strength) * (SPATIAL_MODIFIERS[a.spatial_character]?.outline ?? 1)), 'stroke-opacity': 0.55 });
  return el('defs', {}, el('clipPath', { id: clipId }, path(d, {}))) + out;
}

export function renderArea(a: PlantingArea, project: Project, rc: RenderContext, mode: DrawingMode): LayerMarkup {
  if (a.kind === 'protected') return {};
  const spMap = speciesMap(project);
  const sp = a.species_id ? spMap.get(a.species_id) : undefined;
  if (!sp) return {};
  const mixSp = (sp.mix ?? []).map((m) => spMap.get(m.species_id));
  const key = JSON.stringify(['area', a, sp, mixSp, rc.style, rc.upm, rc.px, rc.simplified, mode]);
  return cached(key, () => {
    const out: LayerMarkup = {};
    if (isGroundCover(sp)) {
      out[a.layer] = groundSurface(a, sp, rc);
      return out;
    }
    const plants = generatedPlants(a, project, mode);
    const clipId = `${rc.idPrefix}-clip-${a.area_id}`;
    const acc: LayerMarkup = {};
    for (const pp of plants) {
      const s = spMap.get(pp.species_id)!;
      const parts = renderPlantLocal(pp, s, rc, mode);
      const t = plantTransform(pp, mode);
      for (const k in parts) {
        const layer = k as LayerId;
        acc[layer] = (acc[layer] ?? '') + `<g transform="${t}">${parts[layer]}</g>`;
      }
    }
    for (const k in acc) {
      const layer = k as LayerId;
      const clip = a.clip_to_boundary && !isTree(sp) && layer !== 'tree_canopies' && layer !== 'tree_trunks';
      out[layer] = clip ? el('defs', {}, el('clipPath', { id: `${clipId}-${layer}` }, path(polyD(a.points), {}))) + g({ 'clip-path': `url(#${clipId}-${layer})` }, acc[layer]!) : acc[layer]!;
    }
    return out;
  });
}

export function renderLine(l: LinearPlanting, project: Project, rc: RenderContext, mode: DrawingMode): LayerMarkup {
  const spMap = speciesMap(project);
  const sp = l.species_id ? spMap.get(l.species_id) : undefined;
  if (!sp) return {};
  const mixSp = (sp.mix ?? []).map((m) => spMap.get(m.species_id));
  const key = JSON.stringify(['line', l, sp, mixSp, rc.style, rc.upm, rc.px, rc.simplified, mode]);
  return cached(key, () => {
    const out: LayerMarkup = {};
    for (const pp of generatedPlants(l, project, mode)) {
      const s = spMap.get(pp.species_id)!;
      const parts = renderPlantLocal(pp, s, rc, mode);
      const t = plantTransform(pp, mode);
      for (const k in parts) {
        const layer = k as LayerId;
        out[layer] = (out[layer] ?? '') + `<g transform="${t}">${parts[layer]}</g>`;
      }
    }
    return out;
  });
}

// ---------------- identification overlay ----------------

export interface AnnotationOptions {
  showIds: boolean;
  showCodes: boolean;
}

export function renderAnnotations(project: Project, mode: DrawingMode, rc: RenderContext, opts: AnnotationOptions = { showIds: true, showCodes: true }): string {
  const spMap = speciesMap(project);
  const px = rc.px;
  const r = px * 5;
  const fs = px * 14;
  let out = '';
  const label = (x: number, y: number, s: string, color: string) =>
    text(x, y, s, { 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': f(fs), fill: '#111', stroke: '#FFF', 'stroke-width': f(px * 2.5), 'paint-order': 'stroke', 'font-weight': '600', 'data-color': color });
  for (const a of project.areas.filter((x) => x.drawing_mode === mode)) {
    const sp = a.species_id ? spMap.get(a.species_id) : undefined;
    const color = a.kind === 'protected' ? '#E00000' : sp?.marker_color ?? '#888888';
    out += path(polyD(a.points), { fill: color, 'fill-opacity': a.kind === 'protected' ? 0.08 : 0.16, stroke: color, 'stroke-width': px * 1.6, 'stroke-dasharray': a.kind === 'protected' ? `${f(px * 6)} ${f(px * 3)}` : null });
    const c = centroid(a.points);
    out += circle(c.x, c.y, r * 1.3, { fill: color, stroke: '#FFFFFF', 'stroke-width': px * 1.5 });
    const t = [opts.showCodes ? (a.kind === 'protected' ? 'PROTECTED' : sp?.species_id ?? '?') : '', opts.showIds ? a.area_id : ''].filter(Boolean).join(' · ');
    if (t) out += label(c.x + r * 1.8, c.y + fs * 0.35, t, color);
  }
  for (const l of project.lines.filter((x) => x.drawing_mode === mode)) {
    const sp = l.species_id ? spMap.get(l.species_id) : undefined;
    const color = sp?.marker_color ?? '#888888';
    out += path(polyD(l.points, false), { fill: 'none', stroke: color, 'stroke-width': px * 2.2, 'stroke-linecap': 'round' });
    for (const pt of linePoints(l, project.views[mode].calibration.units_per_meter, mode)) out += circle(pt.x, pt.y, r * 0.55, { fill: color, stroke: '#FFF', 'stroke-width': px });
    const m = l.points[Math.floor(l.points.length / 2)];
    const t = [opts.showCodes ? sp?.species_id ?? '?' : '', opts.showIds ? l.line_id : ''].filter(Boolean).join(' · ');
    if (t && m) out += label(m.x + r * 1.6, m.y - r, t, color);
  }
  for (const p of project.plants.filter((x) => x.drawing_mode === mode)) {
    const sp = spMap.get(p.species_id);
    const color = sp?.marker_color ?? '#888888';
    const { x, y } = p.position;
    if (mode === 'plan') {
      out += circle(x, y, (p.crown_diameter_m * rc.upm) / 2, { fill: 'none', stroke: color, 'stroke-width': px, 'stroke-dasharray': `${f(px * 4)} ${f(px * 3)}`, 'stroke-opacity': 0.9 });
    } else {
      out += path(`M${f(x)} ${f(y)}V${f(y - p.height_m * rc.upm)}`, { stroke: color, 'stroke-width': px, 'stroke-dasharray': `${f(px * 4)} ${f(px * 3)}` });
    }
    out += circle(x, y, r, { fill: color, stroke: '#FFFFFF', 'stroke-width': px * 1.5 });
    const t = [opts.showCodes ? sp?.species_id ?? '?' : '', opts.showIds ? p.instance_id : ''].filter(Boolean).join(' · ');
    if (t) out += label(x + r * 1.5, y - r * 1.2, t, color);
  }
  return out;
}

export function renderGroundLines(project: Project, rc: RenderContext): string {
  return project.ground_lines
    .map((gl) => path(polyD(gl.points, false), { fill: 'none', stroke: '#C05A00', 'stroke-width': rc.px * 1.4, 'stroke-dasharray': `${f(rc.px * 8)} ${f(rc.px * 3)} ${f(rc.px * 2)} ${f(rc.px * 3)}` }))
    .join('');
}

/** Full vegetation markup for a mode, organised by layer, for export. */
export function buildVegetationLayers(project: Project, mode: DrawingMode, rc: RenderContext, filter?: (kind: 'plant' | 'area' | 'line', id: string) => boolean): LayerMarkup {
  const spMap = speciesMap(project);
  const out: LayerMarkup = {};
  const add = (parts: LayerMarkup, wrap: (s: string) => string) => {
    for (const k in parts) {
      const layer = k as LayerId;
      out[layer] = (out[layer] ?? '') + wrap(parts[layer]!);
    }
  };
  for (const a of project.areas) if (a.drawing_mode === mode && (!filter || filter('area', a.area_id))) add(renderArea(a, project, rc, mode), (s) => `<g data-area-id="${a.area_id}">${s}</g>`);
  for (const l of project.lines) if (l.drawing_mode === mode && (!filter || filter('line', l.line_id))) add(renderLine(l, project, rc, mode), (s) => `<g data-line-id="${l.line_id}">${s}</g>`);
  for (const p of project.plants) {
    if (p.drawing_mode !== mode || (filter && !filter('plant', p.instance_id))) continue;
    const sp = spMap.get(p.species_id);
    if (!sp) continue;
    add(renderPlantLocal(p, sp, rc, mode), (s) => `<g data-instance-id="${p.instance_id}" data-species-id="${p.species_id}" transform="${plantTransform(p, mode)}">${s}</g>`);
  }
  return out;
}
