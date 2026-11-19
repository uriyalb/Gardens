import { circleIntersectsPolygon, pointInPolygon, polygonValidity } from '../geometry/polygon';
import type { DrawingMode, Project, SelItem } from '../model/types';
import { colorDistance } from '../render/style';

export interface ValidationIssue {
  level: 'warning' | 'error' | 'info';
  code: string;
  message: string;
  item?: SelItem;
}

/** Reports problems; never silently corrects site data. */
export function validateProject(p: Project, mode: DrawingMode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const spIds = new Set(p.species.map((s) => s.species_id));
  const view = p.views[mode];
  const frame = view.background?.viewBox ?? view.canvas;
  const upm = view.calibration.units_per_meter;

  // duplicate IDs
  const seen = new Map<string, number>();
  [...p.plants.map((x) => x.instance_id), ...p.areas.map((a) => a.area_id), ...p.lines.map((l) => l.line_id), ...p.species.map((s) => 'species:' + s.species_id)].forEach((id) =>
    seen.set(id, (seen.get(id) ?? 0) + 1),
  );
  seen.forEach((n, id) => {
    if (n > 1) issues.push({ level: 'error', code: 'duplicate_id', message: `Duplicate ID "${id}" (${n}×)` });
  });

  // marker colours
  for (let i = 0; i < p.species.length; i++)
    for (let j = i + 1; j < p.species.length; j++) {
      const a = p.species[i],
        b = p.species[j];
      if (colorDistance(a.marker_color, b.marker_color) < 40)
        issues.push({ level: 'warning', code: 'ambiguous_marker_color', message: `Marker colours of ${a.species_id} and ${b.species_id} are ambiguous (${a.marker_color} / ${b.marker_color})` });
    }

  const protectedZones = p.areas.filter((a) => a.kind === 'protected' && a.drawing_mode === mode);

  for (const pl of p.plants.filter((x) => x.drawing_mode === mode)) {
    const item: SelItem = { kind: 'plant', id: pl.instance_id };
    if (!spIds.has(pl.species_id)) issues.push({ level: 'error', code: 'missing_species', message: `${pl.instance_id}: no valid species assigned`, item });
    if (!(pl.height_m > 0) || !(pl.crown_diameter_m > 0) || pl.crown_base_height_m < 0 || pl.crown_base_height_m >= pl.height_m && pl.height_m > 0.5)
      issues.push({ level: 'error', code: 'invalid_dimensions', message: `${pl.instance_id}: invalid dimensions (H ${pl.height_m} m, Ø ${pl.crown_diameter_m} m, base ${pl.crown_base_height_m} m)`, item });
    const { x, y } = pl.position;
    if (x < frame.x || y < frame.y || x > frame.x + frame.w || y > frame.y + frame.h)
      issues.push({ level: 'warning', code: 'outside_drawing', message: `${pl.instance_id}: planting coordinate (${x}, ${y}) falls outside the drawing`, item });
    if (mode === 'plan') {
      for (const z of protectedZones) {
        if (pointInPolygon(pl.position, z.points)) issues.push({ level: 'warning', code: 'inside_protected', message: `${pl.instance_id} is placed inside protected boundary ${z.area_id}`, item });
        else if (circleIntersectsPolygon(pl.position, (pl.crown_diameter_m * upm) / 2, z.points))
          issues.push({ level: 'info', code: 'crown_conflict', message: `${pl.instance_id}: crown Ø ${pl.crown_diameter_m} m overlaps protected boundary ${z.area_id}`, item });
      }
    }
  }
  for (const a of p.areas.filter((x) => x.drawing_mode === mode)) {
    const item: SelItem = { kind: 'area', id: a.area_id };
    const v = polygonValidity(a.points);
    if (v) issues.push({ level: 'error', code: 'invalid_polygon', message: `${a.area_id}: invalid polygon (${v})`, item });
    if (a.kind === 'planting' && (!a.species_id || !spIds.has(a.species_id))) issues.push({ level: 'error', code: 'missing_species', message: `${a.area_id}: no species assigned`, item });
    if (a.kind === 'planting' && !(a.spacing_m > 0) && !a.plant_count) issues.push({ level: 'error', code: 'invalid_spacing', message: `${a.area_id}: spacing must be positive`, item });
  }
  for (const l of p.lines.filter((x) => x.drawing_mode === mode)) {
    const item: SelItem = { kind: 'line', id: l.line_id };
    if (!l.species_id || !spIds.has(l.species_id)) issues.push({ level: 'error', code: 'missing_species', message: `${l.line_id}: no species assigned`, item });
    if (l.points.length < 2) issues.push({ level: 'error', code: 'invalid_line', message: `${l.line_id}: needs at least two points`, item });
  }
  for (const s of p.species) {
    if (s.mix) for (const m of s.mix) if (!spIds.has(m.species_id)) issues.push({ level: 'warning', code: 'mix_missing_species', message: `Mix ${s.species_id} references unknown species ${m.species_id}` });
  }
  if (view.calibration.status === 'uncalibrated')
    issues.push({ level: 'info', code: 'uncalibrated', message: 'Scale not calibrated: all real-world dimensions are approximate/illustrative.' });
  return issues;
}
