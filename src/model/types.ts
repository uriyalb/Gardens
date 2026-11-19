// Core data model for Architectural Vegetation Studio.
// All property names are English and match the exported JSON keys.

export type DrawingMode = 'plan' | 'section';

export type Category = 'tree' | 'shrub' | 'groundcover' | 'grass' | 'climber' | 'custom';

export type LayerId =
  | 'background'
  | 'ground_cover'
  | 'low_vegetation'
  | 'medium_shrubs'
  | 'tall_shrubs'
  | 'tree_trunks'
  | 'tree_canopies'
  | 'background_vegetation'
  | 'annotations'
  | 'architectural_overlay';

export type HeightClassId = 'G0' | 'S1' | 'S2' | 'T1' | 'T2';

export type DepthRole = 'foreground' | 'midground' | 'background';

export type SpatialCharacter =
  | 'none'
  | 'open_space'
  | 'filtered_overhead_canopy'
  | 'dense_overhead_canopy'
  | 'shaded_outdoor_room'
  | 'low_planted_boundary'
  | 'tall_vegetated_enclosure'
  | 'visual_screening'
  | 'transitional_planting'
  | 'informal_mature_urban_garden';

export type PlanRenderer =
  | 'feathery_irregular_canopy'
  | 'dense_rounded_canopy'
  | 'granular_asymmetric_canopy'
  | 'simple_round_canopy'
  | 'compact_mound'
  | 'fine_upright_mound'
  | 'linear_leaf_mass'
  | 'lawn_surface'
  | 'groundcover_texture';

export type SectionRenderer =
  | 'branching_airy_tree'
  | 'broad_layered_tree'
  | 'twisted_olive_tree'
  | 'simple_round_tree'
  | 'compact_shrub'
  | 'upright_stem_shrub'
  | 'woody_spreading_shrub'
  | 'grass_strip';

export interface Pt {
  x: number;
  y: number;
}

export interface MixComponent {
  species_id: string;
  ratio: number;
}

export interface Species {
  species_id: string; // unique code, e.g. "TAM"
  scientific_name: string;
  common_name: string;
  hebrew_name: string;
  category: Category;
  marker_color: string;
  height_class: HeightClassId;
  default_height_m: number;
  default_crown_diameter_m: number;
  default_crown_base_height_m: number;
  default_trunk_width_m: number;
  growth_habit: string;
  foliage_type: string;
  foliage_density: number; // 0..1
  canopy_transparency: number; // 0..1
  branch_visibility: number; // 0..1
  natural_irregularity: number; // 0..1
  plan_renderer: PlanRenderer;
  section_renderer: SectionRenderer;
  foliage_colors: string[]; // botanical colours (NOT marker colours)
  flower_color?: string | null;
  mix?: MixComponent[] | null; // for species mixes such as "MIX"
  description?: string;
  custom?: boolean;
}

export interface PlantInstance {
  instance_id: string;
  species_id: string;
  drawing_mode: DrawingMode;
  position: Pt & { coordinate_space: 'source_svg' };
  height_m: number;
  crown_diameter_m: number;
  crown_base_height_m: number;
  trunk_width_m: number;
  rotation_deg: number;
  foliage_density: number;
  canopy_transparency: number;
  natural_irregularity: number;
  branch_visibility: number;
  opacity: number;
  layer: LayerId;
  depth_role: DepthRole;
  spatial_character: SpatialCharacter;
  random_seed: number;
  locked: boolean;
  show_footprint: boolean;
  group_id: string | null;
  source_element_id: string | null;
  ground_line_id: string | null;
  verified_position: boolean;
}

export type Distribution = 'uniform' | 'clustered' | 'irregular';

export interface PlantingArea {
  area_id: string;
  drawing_mode: DrawingMode;
  kind: 'planting' | 'protected';
  points: Pt[];
  species_id: string | null;
  distribution: Distribution;
  spacing_m: number;
  plant_count: number | null; // overrides spacing when set
  edge_setback_m: number;
  plant_size_m: number;
  plant_height_m: number;
  size_variation: number; // 0..1
  random_seed: number;
  layer: LayerId;
  opacity: number;
  locked: boolean;
  spatial_character: SpatialCharacter;
  clip_to_boundary: boolean;
  source_element_id: string | null;
  label: string;
}

export type LineDistribution = 'even' | 'natural' | 'staggered';

export interface LinearPlanting {
  line_id: string;
  drawing_mode: DrawingMode;
  points: Pt[];
  species_id: string | null;
  spacing_m: number;
  plant_count: number | null;
  distribution: LineDistribution;
  start_offset_m: number;
  end_offset_m: number;
  spacing_variation: number; // 0..1
  strip_width_m: number;
  plant_size_m: number;
  plant_height_m: number;
  random_seed: number;
  layer: LayerId;
  opacity: number;
  locked: boolean;
  spatial_character: SpatialCharacter;
  source_element_id: string | null;
}

export interface GroundLine {
  ground_id: string;
  points: Pt[];
  source_element_id: string | null;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Background {
  kind: 'svg' | 'raster';
  name: string;
  viewBox: ViewBox;
  width: number;
  height: number;
  asset_id: string;
  svg_markup: string | null; // sanitized original SVG (svg kind)
  data_url: string | null; // raster image (raster kind)
  element_ids: string[];
}

export type LengthUnit = 'm' | 'cm' | 'mm';

export interface Calibration {
  status: 'verified' | 'uncalibrated';
  method: 'none' | 'unit_equivalence' | 'paper_scale' | 'two_point';
  units_per_meter: number; // source drawing units per real metre
  scale_denominator: number | null;
  display_unit: LengthUnit;
  note: string;
}

export interface ViewData {
  background: Background | null;
  canvas: ViewBox; // working frame (= background viewBox when present)
  calibration: Calibration;
}

export interface Layer {
  id: LayerId;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface HeightClass {
  id: HeightClassId;
  label: string;
  min_m: number;
  max_m: number;
}

export interface StyleSettings {
  style_id: string;
  name: string;
  line_weight: number;
  line_irregularity: number;
  outline_strength: number;
  watercolor_opacity: number;
  color_saturation: number;
  foliage_detail: number;
  branch_detail: number;
  natural_variation: number;
  shadow_strength: number;
  background_color: string;
  line_color: string;
  monochrome: boolean;
  fills: boolean;
  textures: boolean;
  background_vegetation_opacity: number;
  custom?: boolean;
}

export interface ProjectSettings {
  snap_enabled: boolean;
  grid_size: number; // in source units; 0 = off
  snap_to_ground: boolean;
}

export interface Project {
  schema_version: 1;
  app: 'architectural-vegetation-studio';
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  active_mode: DrawingMode;
  views: Record<DrawingMode, ViewData>;
  species: Species[];
  plants: PlantInstance[];
  areas: PlantingArea[];
  lines: LinearPlanting[];
  ground_lines: GroundLine[];
  layers: Layer[];
  height_classes: HeightClass[];
  style: StyleSettings;
  settings: ProjectSettings;
  id_counters: Record<string, number>;
}

export type SelKind = 'plant' | 'area' | 'line' | 'ground';
export interface SelItem {
  kind: SelKind;
  id: string;
}
