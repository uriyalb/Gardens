import JSZip from 'jszip';
import type { DrawingMode, Project } from '../model/types';
import { buildAiJson, buildPrompt, type AiProfile } from './aiExport';
import { safeName } from './download';
import { svgToPng } from './pngExport';
import { exportSvg, frameOf } from './svgExport';

export async function renderPng(p: Project, mode: DrawingMode, kind: Parameters<typeof exportSvg>[2]['kind'], longSide = 2400, transparent = false, includeMarkers = false) {
  const vb = frameOf(p, mode);
  const k = longSide / Math.max(vb.w, vb.h);
  const svg = exportSvg(p, mode, { kind, transparent, includeMarkers });
  return svgToPng(svg, vb.w * k, vb.h * k);
}

export async function buildAiZip(p: Project, mode: DrawingMode, profile: AiProfile, includeSource: boolean): Promise<Blob> {
  const zip = new JSZip();
  zip.file('prompt.json', JSON.stringify(buildAiJson(p, mode, profile), null, 2));
  zip.file('prompt.txt', buildPrompt(p, mode, profile));
  zip.file('base_drawing.png', await renderPng(p, mode, 'base'));
  zip.file('identification_map.png', await renderPng(p, mode, 'identification'));
  zip.file('composite_preview.png', await renderPng(p, mode, 'complete'));
  zip.file('vegetation_only.png', await renderPng(p, mode, 'vegetation', 2400, true));
  zip.file('composite.svg', exportSvg(p, mode, { kind: 'complete' }));
  const bg = p.views[mode].background;
  if (includeSource && bg) {
    if (bg.kind === 'svg' && bg.svg_markup) zip.file('source_' + safeName(bg.name.replace(/\.svg$/i, '')) + '.svg', bg.svg_markup);
    else if (bg.data_url) zip.file('source_' + safeName(bg.name), bg.data_url.split(',')[1], { base64: true });
  }
  zip.file(
    'README.txt',
    `AI edit package — ${p.name} (${mode})\nProfile: ${profile}\n\n1. Upload base_drawing.png as the image to edit.\n2. Upload identification_map.png (marker colours = species IDs, not plant colours) and composite_preview.png as references.\n3. Paste prompt.txt (or prompt.json for tools that accept structured input).\n\nExternal image generators cannot guarantee exact geometric fidelity. composite.svg is the authoritative geometry-preserving output.\n`,
  );
  return zip.generateAsync({ type: 'blob' });
}
