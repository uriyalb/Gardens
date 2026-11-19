// Builds AI image-editing packages dynamically from the current project state.
import { SPATIAL_DESCRIPTIONS } from '../model/defaults';
import type { DrawingMode, PlantInstance, Project, Species } from '../model/types';
import { centroid, polygonArea } from '../geometry/polygon';
import { generatedPlants, speciesMap } from '../render/scene';
import { frameOf } from './svgExport';

export type AiProfile = 'chatgpt' | 'gemini' | 'generic';

const r2 = (v: number) => Math.round(v * 100) / 100;

export const PRESERVATION_RULES = [
  'Edit the existing drawing; do not redraw or recreate the architecture.',
  'Keep the original canvas size, aspect ratio, framing and viewBox registration.',
  'Do not move, widen, narrow or reshape buildings, roads, sidewalks, paths or pedestrian routes.',
  'Do not add stairs, walls, planters, terraces, mounds, retaining walls or any new built structures.',
  'Do not invent terrain slopes or change ground elevations.',
  'Only add vegetation at the listed plant locations and inside the listed planting areas.',
  'Do not add unmarked planting, extra trees or decorative landscaping.',
  'Keep tree canopies visually transparent enough that the ground-plane geometry under them stays readable.',
  'Keep all architectural linework legible.',
];

export const NEGATIVE_INSTRUCTIONS = [
  'no photorealism',
  'no perspective, isometric or oblique camera (orthographic only)',
  'no dramatic lighting or heavy shadows',
  'no tropical jungle aesthetic',
  'no perfectly symmetrical or identical repeated tree symbols',
  'no photographic plant cutouts',
  'no saturated artificial greens',
  'no new buildings or architectural additions',
  'no text, labels or identification markers in the final image',
  'do not reproduce the identification marker colours as plant colours',
];

function norm(p: Project, mode: DrawingMode, x: number, y: number) {
  const vb = frameOf(p, mode);
  return { x: Math.round(((x - vb.x) / vb.w) * 1000), y: Math.round(((y - vb.y) / vb.h) * 1000) };
}

function heightClassOf(p: Project, h: number) {
  const hc = [...p.height_classes].reverse().find((c) => h >= c.min_m) ?? p.height_classes[0];
  return hc?.id;
}

function speciesEntry(sp: Species) {
  return {
    species_id: sp.species_id,
    scientific_name: sp.scientific_name,
    common_name: sp.common_name,
    hebrew_name: sp.hebrew_name,
    category: sp.category,
    marker_color: sp.marker_color,
    height_class: sp.height_class,
    default_height_m: sp.default_height_m,
    default_crown_diameter_m: sp.default_crown_diameter_m,
    growth_habit: sp.growth_habit,
    foliage_type: sp.foliage_type,
    foliage_density: sp.foliage_density,
    canopy_transparency: sp.canopy_transparency,
    branch_visibility: sp.branch_visibility,
    natural_irregularity: sp.natural_irregularity,
    botanical_palette: sp.foliage_colors,
    flower_color: sp.flower_color ?? null,
    mix: sp.mix ?? null,
    visual_character: sp.description ?? '',
  };
}

function instanceEntry(p: Project, mode: DrawingMode, pl: PlantInstance, upm: number, verified: boolean) {
  const n = norm(p, mode, pl.position.x, pl.position.y);
  return {
    instance_id: pl.instance_id,
    species_id: pl.species_id,
    position_source: { x: r2(pl.position.x), y: r2(pl.position.y), coordinate_space: 'source_svg' },
    position_normalized_1000: n,
    anchor: mode === 'plan' ? 'trunk_center' : 'ground_contact_point',
    height_m: r2(pl.height_m),
    crown_diameter_m: r2(pl.crown_diameter_m),
    crown_base_height_m: r2(pl.crown_base_height_m),
    crown_radius_source_units: r2((pl.crown_diameter_m * upm) / 2),
    height_source_units: r2(pl.height_m * upm),
    height_class: heightClassOf(p, pl.height_m),
    rotation_deg: pl.rotation_deg,
    foliage_density: pl.foliage_density,
    canopy_transparency: pl.canopy_transparency,
    opacity: pl.opacity,
    layer: pl.layer,
    depth_role: pl.depth_role,
    spatial_character: pl.spatial_character,
    dimensions_status: verified ? 'scaled_from_calibrated_drawing' : 'illustrative_uncalibrated',
  };
}

export function buildAiJson(p: Project, mode: DrawingMode, profile: AiProfile) {
  const view = p.views[mode];
  const vb = frameOf(p, mode);
  const upm = view.calibration.units_per_meter;
  const verified = view.calibration.status === 'verified';
  const spMap = speciesMap(p);
  const plants = p.plants.filter((x) => x.drawing_mode === mode);
  const areas = p.areas.filter((x) => x.drawing_mode === mode);
  const lines = p.lines.filter((x) => x.drawing_mode === mode);
  const used = new Set<string>();
  plants.forEach((x) => used.add(x.species_id));
  [...areas, ...lines].forEach((a) => a.species_id && used.add(a.species_id));
  [...used].forEach((id) => spMap.get(id)?.mix?.forEach((m) => used.add(m.species_id)));
  const characters = new Set([...plants.map((x) => x.spatial_character), ...areas.map((a) => a.spatial_character), ...lines.map((l) => l.spatial_character)].filter((c) => c !== 'none'));

  const data = {
    format: 'architectural-vegetation-studio/ai-edit-package',
    format_version: 1,
    target_profile: profile,
    generated_at: new Date().toISOString(),
    project_name: p.name,
    drawing_type: mode === 'plan' ? 'orthographic_planting_plan_top_view' : 'orthographic_landscape_section_elevation',
    source_drawing: {
      file_name: view.background?.name ?? null,
      kind: view.background?.kind ?? 'none',
      original_canvas: { width: view.background?.width ?? vb.w, height: view.background?.height ?? vb.h },
      original_viewBox: { x: vb.x, y: vb.y, width: vb.w, height: vb.h },
      coordinate_note:
        'position_source uses the original drawing viewBox coordinates (y grows downward). position_normalized_1000 maps the viewBox to 0–1000 on each axis independently (x by width, y by height).',
    },
    drawing_scale: {
      status: view.calibration.status,
      method: view.calibration.method,
      source_units_per_meter: r2(upm),
      scale_denominator: view.calibration.scale_denominator,
      note: verified ? 'Scale calibrated by the user.' : 'Scale NOT calibrated: all metre values are approximate illustrative dimensions, not verified site data.',
    },
    plant_dictionary: [...used].map((id) => spMap.get(id)).filter(Boolean).map((s) => speciesEntry(s!)),
    plant_instances: plants.map((pl) => instanceEntry(p, mode, pl, upm, verified)),
    planting_areas: areas.map((a) => {
      const gen = a.kind === 'planting' ? generatedPlants(a, p, mode) : [];
      const c = centroid(a.points);
      return {
        area_id: a.area_id,
        kind: a.kind,
        species_id: a.species_id,
        polygon_source: a.points.map((q) => ({ x: r2(q.x), y: r2(q.y) })),
        polygon_normalized_1000: a.points.map((q) => norm(p, mode, q.x, q.y)),
        centroid_normalized_1000: norm(p, mode, c.x, c.y),
        area_m2: r2(polygonArea(a.points) / (upm * upm)),
        distribution: a.distribution,
        spacing_m: a.spacing_m,
        plant_count: a.plant_count ?? gen.length,
        edge_setback_m: a.edge_setback_m,
        plant_diameter_m: a.plant_size_m,
        plant_height_m: a.plant_height_m,
        layer: a.layer,
        spatial_character: a.spatial_character,
        rendering: a.kind === 'protected' ? 'protected_no_planting' : gen.length ? 'individual_masses_clipped_to_boundary' : 'continuous_surface',
      };
    }),
    linear_plantings: lines.map((l) => ({
      line_id: l.line_id,
      species_id: l.species_id,
      path_source: l.points.map((q) => ({ x: r2(q.x), y: r2(q.y) })),
      path_normalized_1000: l.points.map((q) => norm(p, mode, q.x, q.y)),
      spacing_m: l.spacing_m,
      plant_count: l.plant_count ?? generatedPlants(l, p, mode).length,
      distribution: l.distribution,
      strip_width_m: l.strip_width_m,
      plant_height_m: l.plant_height_m,
    })),
    height_classes: p.height_classes,
    spatial_character_definitions: Object.fromEntries([...characters].map((c) => [c, SPATIAL_DESCRIPTIONS[c]])),
    global_illustration_style: {
      ...p.style,
      description: styleDescription(p),
    },
    layers: p.layers.map((l) => ({ id: l.id, visible: l.visible, opacity: l.opacity })),
    preservation_rules: PRESERVATION_RULES,
    negative_instructions: NEGATIVE_INSTRUCTIONS,
    reference_images: {
      base_drawing: 'base_drawing.png',
      identification_map: 'identification_map.png',
      composite_preview: 'composite_preview.png',
      vegetation_only: 'vegetation_only.png',
      note: 'The identification map uses marker colours only to identify species; marker colours are NOT botanical colours.',
    },
    fidelity_disclaimer:
      'External image generators cannot guarantee exact geometric fidelity. The SVG produced by Architectural Vegetation Studio remains the authoritative geometry-preserving output.',
  };
  if (profile === 'gemini') {
    return {
      instruction_type: 'image_edit',
      inputs: ['base_drawing.png (image to edit)', 'identification_map.png (spatial guide)', 'composite_preview.png (target composition reference)'],
      ...data,
    };
  }
  if (profile === 'chatgpt') {
    return { task: 'edit_uploaded_image', attach_images_in_order: ['base_drawing.png', 'identification_map.png', 'composite_preview.png'], ...data };
  }
  return data;
}

function styleDescription(p: Project): string {
  const s = p.style;
  if (s.monochrome) return 'Minimal black-and-white architectural CAD-like linework, no fills.';
  const parts = [
    'Refined architectural hand drawing in the manner of a Procreate iPad sketch',
    s.line_irregularity > 0.4 ? 'loose, visibly hand-drawn pencil-like lines' : 'fine, controlled, slightly irregular ink lines',
    'mostly consistent thin line weights with slightly stronger outlines for important contours',
    s.watercolor_opacity > 0.05 ? `restrained translucent watercolour-like fills (~${Math.round(s.watercolor_opacity * 100)}% opacity)` : 'almost no colour fill',
    'muted sage, dusty olive, grey-green and pale eucalyptus greens, warm beige accents, muted lavender for flowering plants, soft charcoal linework',
    s.shadow_strength > 0.1 ? 'light soft shadows' : 'minimal shadows',
    `clean ${s.background_color.toUpperCase() === '#FFFFFF' ? 'white' : s.background_color} background`,
    'no photorealism, no dramatic lighting',
  ];
  return parts.join('; ') + '.';
}

export function buildPrompt(p: Project, mode: DrawingMode, profile: AiProfile): string {
  const j = buildAiJson(p, mode, profile) as ReturnType<typeof buildAiJson> & Record<string, unknown>;
  const spMap = speciesMap(p);
  const view = p.views[mode];
  const isPlan = mode === 'plan';
  const L: string[] = [];
  const sec = (t: string) => L.push('', `## ${t}`);
  L.push(`# Image-editing brief — ${p.name}`);
  sec('TASK');
  L.push(
    isPlan
      ? 'Edit the attached architectural planting plan (orthographic top view). Add hand-drawn architectural vegetation ONLY at the specified positions and areas. Do not recreate the architecture.'
      : 'Edit the attached architectural section/elevation (orthographic). Add hand-drawn vegetation in elevation ONLY at the specified ground-contact points. Do not recreate the architecture.',
  );
  if (profile === 'chatgpt') L.push('Use image 1 (base drawing) as the image to edit, image 2 (identification map) as the exact placement guide, and image 3 (composite preview) as the target composition.');
  if (profile === 'gemini') L.push('Input images: base_drawing.png is the image to edit; identification_map.png shows exact positions by marker colour; composite_preview.png shows the intended composition.');
  sec('SOURCE DRAWING');
  const vb = j.source_drawing.original_viewBox;
  L.push(`- File: ${j.source_drawing.file_name ?? '(blank working frame)'} (${j.source_drawing.kind}).`);
  L.push(`- Original viewBox: x=${vb.x}, y=${vb.y}, width=${vb.width}, height=${vb.height}. Keep this exact framing and aspect ratio (${(vb.width / vb.height).toFixed(3)}:1).`);
  L.push(`- Coordinates below are given in source viewBox units and normalised 0–1000 (x by width, y by height; origin top-left).`);
  sec('GEOMETRIC CONSTRAINTS');
  j.preservation_rules.forEach((r: string) => L.push(`- ${r}`));
  sec('PLANT SPECIES MAPPING');
  L.push('Marker colours are identification colours only — never use them as plant colours.');
  j.plant_dictionary.forEach((s: ReturnType<typeof speciesEntry>) => {
    L.push(
      `- ${s.species_id} = ${s.scientific_name} (${s.common_name}${s.hebrew_name ? ' / ' + s.hebrew_name : ''}), ${s.category}, class ${s.height_class}, marker ${s.marker_color}. Character: ${s.visual_character || s.growth_habit + ', ' + s.foliage_type}. Botanical palette: ${s.botanical_palette.join(', ')}${s.flower_color ? `, flowers ${s.flower_color}` : ''}.`,
    );
  });
  sec('PLANT LOCATIONS');
  if (!j.plant_instances.length && !j.planting_areas.length && !j.linear_plantings.length) L.push('- (no plants defined)');
  j.plant_instances.forEach((pl: ReturnType<typeof instanceEntry>) => {
    const sp = spMap.get(pl.species_id);
    L.push(
      `- ${pl.instance_id}: ${sp?.scientific_name ?? pl.species_id} at source (${pl.position_source.x}, ${pl.position_source.y}) ≈ normalised (${pl.position_normalized_1000.x}, ${pl.position_normalized_1000.y}); ${isPlan ? `trunk centre; crown Ø ${pl.crown_diameter_m} m (radius ${pl.crown_radius_source_units} units)` : `ground contact point; grows upward ${pl.height_m} m (${pl.height_source_units} units), crown width ${pl.crown_diameter_m} m, crown base ${pl.crown_base_height_m} m`}; height ${pl.height_m} m (${pl.height_class}); foliage density ${pl.foliage_density}, transparency ${pl.canopy_transparency}${pl.depth_role !== 'foreground' ? `; ${pl.depth_role} (muted, low contrast)` : ''}${pl.spatial_character !== 'none' ? `; spatial character: ${pl.spatial_character}` : ''}.`,
    );
  });
  j.planting_areas.forEach((a: (typeof j.planting_areas)[number]) => {
    const sp = a.species_id ? spMap.get(a.species_id) : undefined;
    if (a.kind === 'protected') {
      L.push(`- ${a.area_id}: PROTECTED boundary — no planting, keep geometry unchanged. Polygon (normalised): ${a.polygon_normalized_1000.map((q) => `(${q.x},${q.y})`).join(' ')}.`);
      return;
    }
    L.push(
      `- ${a.area_id}: ${sp?.scientific_name ?? a.species_id} planting area, ${a.area_m2} m², ${a.rendering === 'continuous_surface' ? 'continuous quiet surface' : `${a.plant_count} plants, ${a.distribution} distribution, ~${a.spacing_m} m spacing, plant Ø ${a.plant_diameter_m} m, height ${a.plant_height_m} m, setback ${a.edge_setback_m} m`}; stay strictly inside polygon (normalised): ${a.polygon_normalized_1000.map((q) => `(${q.x},${q.y})`).join(' ')}.`,
    );
  });
  j.linear_plantings.forEach((l: (typeof j.linear_plantings)[number]) => {
    const sp = l.species_id ? spMap.get(l.species_id) : undefined;
    L.push(`- ${l.line_id}: ${sp?.scientific_name ?? l.species_id} linear planting, ${l.plant_count} plants (${l.distribution}, ${l.spacing_m} m spacing) along path (normalised): ${l.path_normalized_1000.map((q) => `(${q.x},${q.y})`).join(' ')}.`);
  });
  sec('HEIGHT AND SCALE');
  L.push(
    view.calibration.status === 'verified'
      ? `- Drawing scale calibrated: ${r2(view.calibration.units_per_meter)} source units per metre.`
      : `- Scale is NOT calibrated (${r2(view.calibration.units_per_meter)} units/m assumed for illustration). Treat all dimensions as approximate.`,
  );
  L.push('- Height classes: ' + p.height_classes.map((h) => `${h.id} ${h.label} ${h.min_m}–${h.max_m} m`).join('; ') + '.');
  L.push(
    isPlan
      ? '- Make the height hierarchy readable: ground cover nearly flat and quiet; low shrubs as small textured masses; medium shrubs as distinct volumes and low edges; tall shrubs as dense screening; trees with visible trunks and large, partly transparent overhead canopy projections. Do not just use darker greens for taller plants.'
      : '- Each plant grows upward from its ground-contact point; never move the base. Trees: trunk, primary and secondary branches, species-specific foliage, natural gaps. Shrubs stay at their stated height.',
  );
  sec('SPATIAL COMPOSITION');
  const sc = Object.entries(j.spatial_character_definitions);
  if (sc.length) sc.forEach(([k, v]) => L.push(`- ${k}: ${v}`));
  else L.push('- Communicate the spaces created by vegetation (open ground, low boundaries, enclosure, overhead canopy) without adding geometry.');
  if (isPlan) L.push('- Tree canopies are a separate overhead layer: keep paths, lawns and seating areas underneath readable through the canopy.');
  else L.push('- Background vegetation (if listed) is muted at ~25% opacity behind the section plane; foreground trees stay dominant.');
  sec('GRAPHIC STYLE');
  L.push(`- ${j.global_illustration_style.description}`);
  L.push(`- Style preset: ${p.style.name}.`);
  sec('NEGATIVE PROMPT');
  L.push(j.negative_instructions.join('; ') + '.');
  sec('FINAL QUALITY REQUIREMENTS');
  L.push('- Output the same canvas size and framing as the base drawing, white background, print-quality architectural illustration.');
  L.push('- Every listed plant appears exactly once at its location; no plants elsewhere.');
  L.push('- Species must be visually distinguishable by geometry (e.g. feathery airy Tamarix vs. fuller layered Celtis vs. granular silvery olive), not only by colour.');
  L.push(`- Note: ${j.fidelity_disclaimer}`);
  return L.join('\n');
}
