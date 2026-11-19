// Domain operations on the project, all routed through the undoable store.
import { createArea, createGroundLine, createLine, createPlant, nextId, round, uncalibrated } from '../model/factory';
import { layerForSpecies } from '../model/defaults';
import type { DrawingMode, LayerId, PlantInstance, PlantingArea, LinearPlanting, Project, Pt, SelItem, Species } from '../model/types';
import { generatedPlants, isTree } from '../render/scene';
import { randomSeed } from '../geometry/rng';
import { nearestOnPolyline, yAtX } from '../geometry/polygon';
import { getProject, updateProject } from './projectStore';
import { useUI } from './uiStore';

export const mode = () => getProject().active_mode;
export const spById = (p: Project, id: string | null | undefined) => p.species.find((s) => s.species_id === id);

export function snapPoint(pt: Pt): Pt {
  const p = getProject();
  const s = p.settings;
  if (s.snap_enabled && s.grid_size > 0) return { x: Math.round(pt.x / s.grid_size) * s.grid_size, y: Math.round(pt.y / s.grid_size) * s.grid_size };
  return pt;
}

/** Section ground snapping: plant base sits on the topmost ground line under x. */
export function groundSnap(pt: Pt): { pt: Pt; ground_id: string | null } {
  const p = getProject();
  if (!p.settings.snap_to_ground || !p.ground_lines.length) return { pt, ground_id: null };
  let best: { pt: Pt; ground_id: string; d: number } | null = null;
  for (const gl of p.ground_lines) {
    const y = yAtX(gl.points, pt.x);
    if (y === null) continue;
    const d = Math.abs(y - pt.y);
    if (!best || d < best.d) best = { pt: { x: pt.x, y }, ground_id: gl.ground_id, d };
  }
  if (!best) {
    for (const gl of p.ground_lines) {
      const n = nearestOnPolyline(pt, gl.points);
      if (!best || n.d < best.d) best = { pt: n.p, ground_id: gl.ground_id, d: n.d };
    }
  }
  return best ? { pt: best.pt, ground_id: best.ground_id } : { pt, ground_id: null };
}

export function placePlant(pt: Pt, speciesId: string, overrides: Partial<PlantInstance> = {}) {
  const p = getProject();
  const sp = spById(p, speciesId);
  if (!sp) return;
  const m = p.active_mode;
  let pos = snapPoint(pt);
  let ground_line_id: string | null = null;
  if (m === 'section') {
    const g = groundSnap(pos);
    pos = g.pt;
    ground_line_id = g.ground_id;
  }
  let newId = '';
  updateProject((d) => {
    const pl = createPlant(d, sp, pos, m, { ground_line_id, ...overrides });
    newId = pl.instance_id;
    d.plants.push(pl);
  });
  useUI.getState().setSelection([{ kind: 'plant', id: newId }]);
}

export function finishShape(kind: 'polygon' | 'protected' | 'line' | 'ground', pts: Pt[], speciesId: string | null, sourceElement: string | null = null) {
  const p = getProject();
  const m = p.active_mode;
  const sp = speciesId ? spById(p, speciesId) ?? null : null;
  let sel: SelItem | null = null;
  updateProject((d) => {
    if (kind === 'polygon' || kind === 'protected') {
      if (pts.length < 3) return;
      const a = createArea(d, pts, m, kind === 'protected' ? null : sp, kind === 'protected' ? 'protected' : 'planting');
      a.source_element_id = sourceElement;
      d.areas.push(a);
      sel = { kind: 'area', id: a.area_id };
    } else if (kind === 'line') {
      if (pts.length < 2) return;
      const l = createLine(d, pts, m, sp);
      l.source_element_id = sourceElement;
      d.lines.push(l);
      sel = { kind: 'line', id: l.line_id };
    } else {
      if (pts.length < 2) return;
      const g = createGroundLine(d, pts, sourceElement);
      d.ground_lines.push(g);
      sel = { kind: 'ground', id: g.ground_id };
    }
  });
  if (sel) useUI.getState().setSelection([sel]);
}

function expandGroups(p: Project, sel: SelItem[]): SelItem[] {
  const groups = new Set(sel.filter((s) => s.kind === 'plant').map((s) => p.plants.find((x) => x.instance_id === s.id)?.group_id).filter(Boolean));
  if (!groups.size) return sel;
  const out = [...sel];
  p.plants.forEach((pl) => {
    if (pl.group_id && groups.has(pl.group_id) && !out.some((s) => s.kind === 'plant' && s.id === pl.instance_id)) out.push({ kind: 'plant', id: pl.instance_id });
  });
  return out;
}
export { expandGroups };

export function deleteSelection() {
  const sel = useUI.getState().selection;
  if (!sel.length) return;
  updateProject((d) => {
    const ids = new Set(sel.map((s) => s.kind + ':' + s.id));
    d.plants = d.plants.filter((x) => !ids.has('plant:' + x.instance_id) || x.locked);
    d.areas = d.areas.filter((x) => !ids.has('area:' + x.area_id) || x.locked);
    d.lines = d.lines.filter((x) => !ids.has('line:' + x.line_id) || x.locked);
    d.ground_lines = d.ground_lines.filter((x) => !ids.has('ground:' + x.ground_id));
  });
  useUI.getState().setSelection([]);
}

export function duplicateSelection() {
  const sel = useUI.getState().selection;
  if (!sel.length) return;
  const off = getProject().views[mode()].calibration.units_per_meter * 1.5;
  const newSel: SelItem[] = [];
  updateProject((d) => {
    for (const s of sel) {
      if (s.kind === 'plant') {
        const o = d.plants.find((x) => x.instance_id === s.id);
        const sp = o && spById(d, o.species_id);
        if (!o || !sp) continue;
        const pos = { x: round(o.position.x + off), y: round(o.position.y + (d.active_mode === 'plan' ? off : 0)), coordinate_space: 'source_svg' as const };
        const c = createPlant(d, sp, pos, o.drawing_mode, { ...o, position: pos, group_id: null, locked: false, random_seed: randomSeed() });
        d.plants.push(c);
        newSel.push({ kind: 'plant', id: c.instance_id });
      } else if (s.kind === 'area') {
        const o = d.areas.find((x) => x.area_id === s.id);
        if (!o) continue;
        const id = nextId(d, o.kind === 'protected' ? 'ZONE' : 'AREA', d.areas.map((a) => a.area_id));
        d.areas.push({ ...structuredClone(o), area_id: id, locked: false, source_element_id: null, points: o.points.map((q) => ({ x: q.x + off, y: q.y + off })) });
        newSel.push({ kind: 'area', id });
      } else if (s.kind === 'line') {
        const o = d.lines.find((x) => x.line_id === s.id);
        if (!o) continue;
        const id = nextId(d, 'LINE', d.lines.map((a) => a.line_id));
        d.lines.push({ ...structuredClone(o), line_id: id, locked: false, source_element_id: null, points: o.points.map((q) => ({ x: q.x + off, y: q.y + off })) });
        newSel.push({ kind: 'line', id });
      }
    }
  });
  useUI.getState().setSelection(newSel);
}

export function moveItems(sel: SelItem[], dx: number, dy: number, key?: string) {
  if (!dx && !dy) return;
  updateProject((d) => {
    for (const s of sel) {
      if (s.kind === 'plant') {
        const o = d.plants.find((x) => x.instance_id === s.id);
        if (o && !o.locked) {
          o.position.x = round(o.position.x + dx);
          o.position.y = round(o.position.y + dy);
          o.verified_position = true;
        }
      } else {
        const list = s.kind === 'area' ? d.areas.find((x) => x.area_id === s.id) : s.kind === 'line' ? d.lines.find((x) => x.line_id === s.id) : d.ground_lines.find((x) => x.ground_id === s.id);
        if (list && !(list as { locked?: boolean }).locked) list.points = list.points.map((q) => ({ x: round(q.x + dx), y: round(q.y + dy) }));
      }
    }
  }, key);
}

export function updatePlants(ids: string[], patch: Partial<PlantInstance> | ((pl: PlantInstance) => void), key?: string) {
  updateProject((d) => {
    for (const pl of d.plants) {
      if (!ids.includes(pl.instance_id)) continue;
      if (typeof patch === 'function') patch(pl);
      else Object.assign(pl, patch);
    }
  }, key);
}

export function updateArea(id: string, patch: Partial<PlantingArea>, key?: string) {
  updateProject((d) => {
    const a = d.areas.find((x) => x.area_id === id);
    if (a) Object.assign(a, patch);
  }, key);
}
export function updateLine(id: string, patch: Partial<LinearPlanting>, key?: string) {
  updateProject((d) => {
    const a = d.lines.find((x) => x.line_id === id);
    if (a) Object.assign(a, patch);
  }, key);
}

/** Change species while keeping position; dimensions follow the new species defaults. */
export function changeSpecies(ids: string[], speciesId: string, keepDimensions = false) {
  updateProject((d) => {
    const sp = spById(d, speciesId);
    if (!sp) return;
    for (const pl of d.plants) {
      if (!ids.includes(pl.instance_id)) continue;
      const wasTree = isTree(spById(d, pl.species_id));
      pl.species_id = sp.species_id;
      if (!keepDimensions) {
        pl.height_m = sp.default_height_m;
        pl.crown_diameter_m = sp.default_crown_diameter_m;
        pl.crown_base_height_m = sp.default_crown_base_height_m;
        pl.trunk_width_m = sp.default_trunk_width_m;
      }
      pl.foliage_density = sp.foliage_density;
      pl.canopy_transparency = sp.canopy_transparency;
      pl.natural_irregularity = sp.natural_irregularity;
      pl.branch_visibility = sp.branch_visibility;
      if (wasTree !== isTree(sp) || pl.layer === 'tree_canopies' || !keepDimensions) pl.layer = layerForSpecies(sp, pl.height_m);
    }
  });
}

export function applyToAllOfSpecies(source: PlantInstance) {
  const fields: (keyof PlantInstance)[] = ['height_m', 'crown_diameter_m', 'crown_base_height_m', 'trunk_width_m', 'foliage_density', 'canopy_transparency', 'natural_irregularity', 'branch_visibility', 'opacity', 'spatial_character'];
  updateProject((d) => {
    for (const pl of d.plants) {
      if (pl.species_id !== source.species_id || pl.drawing_mode !== source.drawing_mode || pl.locked) continue;
      for (const f of fields) (pl as unknown as Record<string, unknown>)[f] = source[f];
    }
  });
}

export function saveAsSpeciesDefaults(source: PlantInstance) {
  updateProject((d) => {
    const sp = spById(d, source.species_id);
    if (!sp) return;
    sp.default_height_m = source.height_m;
    sp.default_crown_diameter_m = source.crown_diameter_m;
    sp.default_crown_base_height_m = source.crown_base_height_m;
    sp.default_trunk_width_m = source.trunk_width_m;
    sp.foliage_density = source.foliage_density;
    sp.canopy_transparency = source.canopy_transparency;
    sp.natural_irregularity = source.natural_irregularity;
    sp.branch_visibility = source.branch_visibility;
  });
}

export function groupSelection() {
  const sel = useUI.getState().selection.filter((s) => s.kind === 'plant');
  if (sel.length < 2) return;
  updateProject((d) => {
    const gid = nextId(d, 'GROUP', []);
    for (const pl of d.plants) if (sel.some((s) => s.id === pl.instance_id)) pl.group_id = gid;
  });
}
export function ungroupSelection() {
  const sel = useUI.getState().selection.filter((s) => s.kind === 'plant');
  updateProject((d) => {
    for (const pl of d.plants) if (sel.some((s) => s.id === pl.instance_id)) pl.group_id = null;
  });
}

export function convertAreaToPlants(item: PlantingArea | LinearPlanting) {
  const p = getProject();
  const m = item.drawing_mode;
  const gen = generatedPlants(item, p, m);
  if (!gen.length) return;
  const newSel: SelItem[] = [];
  updateProject((d) => {
    for (const g of gen) {
      const sp = spById(d, g.species_id)!;
      const pl = createPlant(d, sp, g.position, m, { ...g, locked: false, verified_position: false, source_element_id: 'area_id' in item ? item.area_id : item.line_id });
      d.plants.push(pl);
      newSel.push({ kind: 'plant', id: pl.instance_id });
    }
    // the generator is replaced by the explicit plants (avoids double planting)
    if ('area_id' in item) {
      d.areas = d.areas.filter((x) => x.area_id !== item.area_id);
    } else {
      d.lines = d.lines.filter((x) => x.line_id !== item.line_id);
    }
  });
  useUI.getState().setSelection(newSel);
}

export function setLayerProp(id: LayerId, patch: Partial<{ visible: boolean; locked: boolean; opacity: number }>, key?: string) {
  updateProject((d) => {
    const l = d.layers.find((x) => x.id === id);
    if (l) Object.assign(l, patch);
  }, key);
}
export function moveLayer(id: LayerId, dir: -1 | 1) {
  updateProject((d) => {
    const i = d.layers.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.layers.length) return;
    [d.layers[i], d.layers[j]] = [d.layers[j], d.layers[i]];
  });
}

export function upsertSpecies(sp: Species, originalId: string | null, applyDefaultsToInstances: boolean) {
  updateProject((d) => {
    const idx = originalId ? d.species.findIndex((s) => s.species_id === originalId) : -1;
    if (idx >= 0) {
      d.species[idx] = sp;
      if (originalId && originalId !== sp.species_id) {
        d.plants.forEach((pl) => pl.species_id === originalId && (pl.species_id = sp.species_id));
        d.areas.forEach((a) => a.species_id === originalId && (a.species_id = sp.species_id));
        d.lines.forEach((a) => a.species_id === originalId && (a.species_id = sp.species_id));
        d.species.forEach((s) => s.mix?.forEach((m) => m.species_id === originalId && (m.species_id = sp.species_id)));
      }
    } else d.species.push(sp);
    if (applyDefaultsToInstances)
      d.plants.forEach((pl) => {
        if (pl.species_id !== sp.species_id) return;
        pl.height_m = sp.default_height_m;
        pl.crown_diameter_m = sp.default_crown_diameter_m;
        pl.crown_base_height_m = sp.default_crown_base_height_m;
        pl.trunk_width_m = sp.default_trunk_width_m;
        pl.foliage_density = sp.foliage_density;
        pl.canopy_transparency = sp.canopy_transparency;
        pl.natural_irregularity = sp.natural_irregularity;
        pl.branch_visibility = sp.branch_visibility;
      });
  });
}

export function deleteSpecies(id: string) {
  updateProject((d) => {
    d.species = d.species.filter((s) => s.species_id !== id);
  });
}

export function setCalibration(m: DrawingMode, upm: number, method: Project['views']['plan']['calibration']['method'], denom: number | null, note: string) {
  updateProject((d) => {
    d.views[m].calibration = { status: 'verified', method, units_per_meter: upm, scale_denominator: denom, display_unit: 'm', note };
  });
}
export function clearCalibration(m: DrawingMode) {
  updateProject((d) => {
    d.views[m].calibration = uncalibrated(d.views[m].canvas);
  });
}
