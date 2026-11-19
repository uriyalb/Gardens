import { randomSeed } from '../geometry/rng';
import { DEFAULT_SPECIES, DEFAULT_STYLE, defaultHeightClasses, defaultLayers, layerForSpecies } from './defaults';
import type {
  Calibration,
  DrawingMode,
  GroundLine,
  LinearPlanting,
  PlantInstance,
  PlantingArea,
  Project,
  Pt,
  Species,
  ViewBox,
  ViewData,
} from './types';

export const DEFAULT_CANVAS: Record<DrawingMode, ViewBox> = {
  plan: { x: 0, y: 0, w: 1200, h: 800 },
  section: { x: 0, y: 0, w: 1600, h: 700 },
};

export function uncalibrated(frame: ViewBox): Calibration {
  // Illustrative only: assume the frame spans ~60 m. Flagged as unverified everywhere.
  return {
    status: 'uncalibrated',
    method: 'none',
    units_per_meter: Math.max(frame.w, frame.h) / 60,
    scale_denominator: null,
    display_unit: 'm',
    note: 'Uncalibrated image-space mode. Dimensions are approximate and illustrative.',
  };
}

export function emptyView(mode: DrawingMode): ViewData {
  const canvas = { ...DEFAULT_CANVAS[mode] };
  return { background: null, canvas, calibration: uncalibrated(canvas) };
}

export function newProjectId() {
  return 'PRJ_' + Date.now().toString(36).toUpperCase() + '_' + Math.floor(Math.random() * 1e4);
}

export function createProject(name = 'Untitled project', species: Species[] = DEFAULT_SPECIES): Project {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    app: 'architectural-vegetation-studio',
    project_id: newProjectId(),
    name,
    created_at: now,
    updated_at: now,
    active_mode: 'plan',
    views: { plan: emptyView('plan'), section: emptyView('section') },
    species: structuredClone(species),
    plants: [],
    areas: [],
    lines: [],
    ground_lines: [],
    layers: defaultLayers(),
    height_classes: defaultHeightClasses(),
    style: { ...DEFAULT_STYLE },
    settings: { snap_enabled: false, grid_size: 0, snap_to_ground: true },
    id_counters: {},
  };
}

/** Allocates the next stable, never-reused id for a prefix. Mutates counters. */
export function nextId(p: Project, prefix: string, existing: string[]): string {
  let n = (p.id_counters[prefix] ?? 0) + 1;
  const set = new Set(existing);
  let id = `${prefix}_${String(n).padStart(3, '0')}`;
  while (set.has(id)) {
    n++;
    id = `${prefix}_${String(n).padStart(3, '0')}`;
  }
  p.id_counters[prefix] = n;
  return id;
}

export function prefixForSpecies(sp: Species | undefined): string {
  if (!sp) return 'PLANT';
  if (sp.category === 'tree') return 'TREE';
  if (sp.category === 'grass' || sp.category === 'groundcover') return 'GC';
  return 'SHRUB';
}

export function createPlant(p: Project, sp: Species, pos: Pt, mode: DrawingMode, overrides: Partial<PlantInstance> = {}): PlantInstance {
  const id = nextId(p, prefixForSpecies(sp), p.plants.map((x) => x.instance_id));
  return {
    species_id: sp.species_id,
    drawing_mode: mode,
    position: { x: round(pos.x), y: round(pos.y), coordinate_space: 'source_svg' },
    height_m: sp.default_height_m,
    crown_diameter_m: sp.default_crown_diameter_m,
    crown_base_height_m: sp.default_crown_base_height_m,
    trunk_width_m: sp.default_trunk_width_m,
    rotation_deg: 0,
    foliage_density: sp.foliage_density,
    canopy_transparency: sp.canopy_transparency,
    natural_irregularity: sp.natural_irregularity,
    branch_visibility: sp.branch_visibility,
    opacity: sp.category === 'tree' ? 0.85 : 1,
    layer: layerForSpecies(sp),
    depth_role: 'foreground',
    spatial_character: 'none',
    random_seed: randomSeed(),
    locked: false,
    show_footprint: false,
    group_id: null,
    source_element_id: null,
    ground_line_id: null,
    verified_position: true,
    ...overrides,
    instance_id: id,
  };
}

export function createArea(p: Project, points: Pt[], mode: DrawingMode, sp: Species | null, kind: 'planting' | 'protected' = 'planting'): PlantingArea {
  const id = nextId(p, kind === 'protected' ? 'ZONE' : 'AREA', p.areas.map((a) => a.area_id));
  return {
    area_id: id,
    drawing_mode: mode,
    kind,
    points: points.map((q) => ({ x: round(q.x), y: round(q.y) })),
    species_id: kind === 'protected' ? null : sp?.species_id ?? null,
    distribution: 'clustered',
    spacing_m: sp ? Math.max(0.3, sp.default_crown_diameter_m * (sp.category === 'tree' ? 1.0 : 0.7)) : 1,
    plant_count: null,
    edge_setback_m: sp ? Math.min(0.5, sp.default_crown_diameter_m * 0.3) : 0.3,
    plant_size_m: sp?.default_crown_diameter_m ?? 1,
    plant_height_m: sp?.default_height_m ?? 1,
    size_variation: 0.35,
    random_seed: randomSeed(),
    layer: kind === 'protected' ? 'architectural_overlay' : sp ? layerForSpecies(sp) : 'low_vegetation',
    opacity: 1,
    locked: false,
    spatial_character: 'none',
    clip_to_boundary: true,
    source_element_id: null,
    label: '',
  };
}

export function createLine(p: Project, points: Pt[], mode: DrawingMode, sp: Species | null): LinearPlanting {
  const id = nextId(p, 'LINE', p.lines.map((l) => l.line_id));
  return {
    line_id: id,
    drawing_mode: mode,
    points: points.map((q) => ({ x: round(q.x), y: round(q.y) })),
    species_id: sp?.species_id ?? null,
    spacing_m: sp ? Math.max(0.3, sp.default_crown_diameter_m * (sp.category === 'tree' ? 1.1 : 0.8)) : 1,
    plant_count: null,
    distribution: 'even',
    start_offset_m: 0,
    end_offset_m: 0,
    spacing_variation: 0.2,
    strip_width_m: sp ? sp.default_crown_diameter_m : 1,
    plant_size_m: sp?.default_crown_diameter_m ?? 1,
    plant_height_m: sp?.default_height_m ?? 1,
    random_seed: randomSeed(),
    layer: sp ? layerForSpecies(sp) : 'low_vegetation',
    opacity: 1,
    locked: false,
    spatial_character: 'none',
    source_element_id: null,
  };
}

export function createGroundLine(p: Project, points: Pt[], source: string | null = null): GroundLine {
  return {
    ground_id: nextId(p, 'GROUND', p.ground_lines.map((g) => g.ground_id)),
    points: points.map((q) => ({ x: round(q.x), y: round(q.y) })),
    source_element_id: source,
  };
}

export const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
