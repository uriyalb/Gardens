import { VEGETATION_LAYERS } from '../model/defaults';
import type { DrawingMode, LayerId, PlantInstance, Project } from '../model/types';
import { backgroundMarkup } from '../import/svgImport';
import { buildVegetationLayers, contextFor, renderAnnotations, renderPlantLocal, speciesMap } from '../render/scene';
import { esc, f } from '../render/svg';

export type SvgExportKind = 'complete' | 'vegetation' | 'base' | 'identification' | 'cad';

export interface SvgExportOptions {
  kind: SvgExportKind;
  includeMarkers?: boolean;
  transparent?: boolean;
  scale?: number; // pixel size multiplier (for width/height attributes)
}

export function frameOf(p: Project, mode: DrawingMode) {
  const v = p.views[mode];
  return v.background?.viewBox ?? v.canvas;
}

function layerGroup(id: LayerId, opacity: number, inner: string) {
  return inner ? `<g id="avs-layer-${id}" data-layer="${id}"${opacity < 1 ? ` opacity="${f(opacity)}"` : ''}>${inner}</g>` : '';
}

/** Builds a standalone SVG that preserves the source viewBox and coordinate registration. */
export function exportSvg(p: Project, mode: DrawingMode, o: SvgExportOptions): string {
  const vb = frameOf(p, mode);
  const view = p.views[mode];
  const rc = contextFor(p, mode, o.kind === 'cad');
  const layersState = new Map(p.layers.map((l) => [l.id, l]));
  const scale = o.scale ?? 1;
  const bgMarkup = backgroundMarkup(view.background);
  const withBg = o.kind === 'complete' || o.kind === 'base' || o.kind === 'identification' || o.kind === 'cad';
  const withVeg = o.kind === 'complete' || o.kind === 'vegetation' || o.kind === 'cad';
  const veg = withVeg ? buildVegetationLayers(p, mode, rc) : {};
  let body = '';
  for (const { id } of p.layers) {
    const L = layersState.get(id);
    if (!L || !L.visible) continue;
    if (id === 'background') {
      if (withBg && bgMarkup) body += layerGroup(id, o.kind === 'identification' ? 0.45 * L.opacity : L.opacity, bgMarkup);
      continue;
    }
    if (id === 'architectural_overlay') {
      if (withBg && withVeg && bgMarkup) body += layerGroup(id, L.opacity, bgMarkup.replace(/\sid="[^"]*"/g, ''));
      continue;
    }
    if (id === 'annotations') continue;
    if (VEGETATION_LAYERS.includes(id) && veg[id]) body += layerGroup(id, L.opacity, veg[id]!);
  }
  if (o.kind === 'identification' || o.includeMarkers) body += layerGroup('annotations', 1, renderAnnotations(p, mode, rc));
  const bg = o.transparent || o.kind === 'vegetation' ? '' : `<rect id="avs-paper" x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${esc(p.style.background_color)}"/>`;
  const meta = `<metadata><avs:project xmlns:avs="https://avs.local/ns" name="${esc(p.name)}" mode="${mode}" kind="${o.kind}" units_per_meter="${f(view.calibration.units_per_meter)}" scale_verified="${view.calibration.status === 'verified'}"/></metadata>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" width="${f(vb.w * scale)}" height="${f(vb.h * scale)}">
<title>${esc(p.name)} — ${mode === 'plan' ? 'Planting plan' : 'Landscape section'}</title>${meta}${bg}${body}</svg>`;
}

/** Standalone symbol of one plant: tight bounds, transparent background, anchor at insertion point. */
export function exportPlantSvg(p: Project, plant: PlantInstance): string {
  const mode = plant.drawing_mode;
  const sp = speciesMap(p).get(plant.species_id);
  if (!sp) return '';
  const rc = contextFor(p, mode);
  const local: PlantInstance = { ...plant, rotation_deg: mode === 'plan' ? plant.rotation_deg : 0 };
  const parts = renderPlantLocal(local, sp, rc, mode);
  const R = (plant.crown_diameter_m * rc.upm) / 2;
  const H = plant.height_m * rc.upm;
  const pad = R * 0.25 + rc.px * 4;
  const vb = mode === 'plan' ? { x: -R - pad, y: -R - pad, w: 2 * (R + pad), h: 2 * (R + pad) } : { x: -R - pad, y: -H - pad, w: 2 * (R + pad), h: H + pad * 1.4 };
  let inner = '';
  for (const { id } of p.layers) if (parts[id]) inner += `<g data-layer="${id}">${parts[id]}</g>`;
  const rot = mode === 'plan' && plant.rotation_deg ? ` transform="rotate(${f(plant.rotation_deg)})"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vb.x)} ${f(vb.y)} ${f(vb.w)} ${f(vb.h)}" width="${f(vb.w)}" height="${f(vb.h)}">
<title>${esc(sp.scientific_name)} — ${esc(plant.instance_id)} (${mode})</title>
<desc>Insertion anchor at (0,0): ${mode === 'plan' ? 'trunk centre' : 'ground contact point'}. Units: ${f(rc.upm)} per metre.</desc>
<g id="${esc(plant.instance_id)}"${rot}>${inner}</g>
<circle id="insertion-anchor" cx="0" cy="0" r="${f(rc.px * 0.8)}" fill="none" stroke="none"/>
</svg>`;
}
