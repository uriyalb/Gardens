// Resolves a plant instance + species + style into effective render parameters.
import { SPATIAL_MODIFIERS } from './defaults';
import type { PlantInstance, Species, StyleSettings } from './types';

export interface EffectiveParams {
  R: number; // crown radius, source units
  H: number; // total height, source units
  Hb: number; // crown base height, source units
  tw: number; // trunk width, source units
  density: number; // 0..1
  transparency: number; // 0..0.95
  irregularity: number; // 0..1.2
  branchVis: number; // 0..1
  outlineMul: number;
  clusterMul: number;
  shadowMul: number;
  seed: number;
  depth: PlantInstance['depth_role'];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function resolveParams(p: PlantInstance, sp: Species, style: StyleSettings, upm: number): EffectiveParams {
  const m = SPATIAL_MODIFIERS[p.spatial_character] ?? SPATIAL_MODIFIERS.none;
  return {
    R: Math.max(0.01, (p.crown_diameter_m * upm) / 2),
    H: Math.max(0.01, p.height_m * upm),
    Hb: clamp(p.crown_base_height_m, 0, p.height_m * 0.9) * upm,
    tw: Math.max(0, p.trunk_width_m * upm),
    density: clamp(p.foliage_density * m.density, 0.05, 1),
    transparency: clamp(p.canopy_transparency + m.transparency, 0, 0.95),
    irregularity: clamp(p.natural_irregularity * (0.4 + style.natural_variation) + m.irregularity, 0, 1.2),
    branchVis: clamp(p.branch_visibility * m.branch, 0, 1),
    outlineMul: m.outline * (0.3 + style.outline_strength),
    clusterMul: m.clusters,
    shadowMul: m.shadow,
    seed: p.random_seed >>> 0,
    depth: p.depth_role,
  };
}
