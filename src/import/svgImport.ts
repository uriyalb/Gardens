// Safe, non-destructive import of architectural drawings.
import DOMPurify from 'dompurify';
import type { Background, Species, ViewBox } from '../model/types';
import { hexToRgb, rgbToHex } from '../render/style';

export const BG_SCOPE_CLASS = 'avs-bg-scope';

function num(v: string | null): number | null {
  if (!v) return null;
  const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)/i.exec(v);
  return m ? parseFloat(m[1]) : null;
}

/** Prefix CSS selectors so styles inside an imported SVG cannot leak into the app or overlay. */
export function scopeCss(css: string, scope: string): string {
  css = css.replace(/@import[^;]+;/gi, '').replace(/url\(\s*['"]?(?!#|data:)[^)]*\)/gi, 'none');
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const sel = css.slice(i, open).trim();
    if (sel.startsWith('@media') || sel.startsWith('@supports')) {
      // find matching close brace
      let depth = 1,
        j = open + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      out += `${sel}{${scopeCss(css.slice(open + 1, j - 1), scope)}}`;
      i = j;
      continue;
    }
    const close = css.indexOf('}', open);
    const body = css.slice(open + 1, close < 0 ? css.length : close);
    if (sel.startsWith('@')) out += `${sel}{${body}}`;
    else
      out += `${sel
        .split(',')
        .map((s) => {
          const t = s.trim();
          if (!t) return '';
          if (/^(svg|:root)\b/i.test(t)) return `.${scope}${t.replace(/^(svg|:root)/i, '')}`;
          return `.${scope} ${t}`;
        })
        .filter(Boolean)
        .join(',')}{${body}}`;
    i = close < 0 ? css.length : close + 1;
  }
  return out;
}

export interface SvgImportResult {
  background: Background;
  warnings: string[];
}

export function importSvgText(svgText: string, name: string, assetId: string): SvgImportResult {
  const warnings: string[] = [];
  const clean = DOMPurify.sanitize(svgText, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed'],
    WHOLE_DOCUMENT: false,
  }) as unknown as string;
  if (clean.length < svgText.length * 0.5) warnings.push('sanitizer_removed_content');
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('invalid_svg');
  }
  // remove external references (only internal #refs and inline data images are kept)
  root.querySelectorAll('*').forEach((n) => {
    for (const attr of ['href', 'xlink:href']) {
      const v = n.getAttribute(attr);
      if (v && !v.startsWith('#') && !v.startsWith('data:image/')) {
        n.removeAttribute(attr);
        warnings.push('external_reference_removed');
      }
    }
    for (const a of Array.from(n.attributes)) if (/^on/i.test(a.name)) n.removeAttribute(a.name);
  });
  root.querySelectorAll('style').forEach((s) => {
    s.textContent = scopeCss(s.textContent ?? '', BG_SCOPE_CLASS);
  });

  let vb: ViewBox | null = null;
  const vbAttr = root.getAttribute('viewBox');
  if (vbAttr) {
    const p = vbAttr.split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every(Number.isFinite) && p[2] > 0 && p[3] > 0) vb = { x: p[0], y: p[1], w: p[2], h: p[3] };
  }
  const wAttr = num(root.getAttribute('width'));
  const hAttr = num(root.getAttribute('height'));
  if (!vb) {
    vb = { x: 0, y: 0, w: wAttr ?? 1000, h: hAttr ?? 1000 };
    warnings.push(wAttr && hAttr ? 'viewbox_from_size' : 'viewbox_missing_default');
  }
  const ids: string[] = [];
  root.querySelectorAll('[id]').forEach((n) => ids.push(n.getAttribute('id')!));
  root.setAttribute('x', String(vb.x));
  root.setAttribute('y', String(vb.y));
  root.setAttribute('width', String(vb.w));
  root.setAttribute('height', String(vb.h));
  root.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  root.setAttribute('overflow', 'visible');
  root.setAttribute('class', `${root.getAttribute('class') ?? ''} ${BG_SCOPE_CLASS}`.trim());
  root.removeAttribute('style');
  const markup = new XMLSerializer().serializeToString(root);
  return {
    background: {
      kind: 'svg',
      name,
      viewBox: vb,
      width: wAttr ?? vb.w,
      height: hAttr ?? vb.h,
      asset_id: assetId,
      svg_markup: markup,
      data_url: null,
      element_ids: ids,
    },
    warnings: Array.from(new Set(warnings)),
  };
}

export async function importRaster(file: File, assetId: string): Promise<Background> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const size = await new Promise<{ w: number; h: number }>((res, rej) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => rej(new Error('invalid_image'));
    img.src = dataUrl;
  });
  return {
    kind: 'raster',
    name: file.name,
    viewBox: { x: 0, y: 0, w: size.w, h: size.h },
    width: size.w,
    height: size.h,
    asset_id: assetId,
    svg_markup: null,
    data_url: dataUrl,
    element_ids: [],
  };
}

/** Markup that draws the background inside the document coordinate frame (= its viewBox). */
export function backgroundMarkup(bg: Background | null): string {
  if (!bg) return '';
  if (bg.kind === 'svg' && bg.svg_markup) return bg.svg_markup;
  if (bg.kind === 'raster' && bg.data_url)
    return `<image href="${bg.data_url}" x="${bg.viewBox.x}" y="${bg.viewBox.y}" width="${bg.viewBox.w}" height="${bg.viewBox.h}" preserveAspectRatio="none"/>`;
  return '';
}

// ---------------- dedicated marker layer parsing (vector imports only) ----------------

export interface DetectedMarker {
  element_id: string | null;
  x: number;
  y: number;
  color: string | null;
  species_id: string | null;
  match: 'element_id' | 'data_attribute' | 'marker_color' | 'none';
  ambiguous: boolean;
  candidates: string[];
}

function normColor(c: string | null): string | null {
  if (!c || c === 'none') return null;
  c = c.trim();
  if (c.startsWith('#')) return rgbToHex(...hexToRgb(c)).toUpperCase();
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  if (m) return rgbToHex(+m[1], +m[2], +m[3]).toUpperCase();
  return null;
}

const MARKER_LAYER_RE = /(marker|annotation|plant[-_ ]?id|identification)/i;

/** Parses marker shapes only from dedicated marker layers or elements with data-species. */
export function detectMarkers(bg: Background, species: Species[]): DetectedMarker[] {
  if (bg.kind !== 'svg' || !bg.svg_markup) return [];
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden';
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bg.viewBox.x} ${bg.viewBox.y} ${bg.viewBox.w} ${bg.viewBox.h}" width="${bg.viewBox.w}" height="${bg.viewBox.h}">${bg.svg_markup}</svg>`;
  document.body.appendChild(host);
  const out: DetectedMarker[] = [];
  try {
    const outer = host.firstElementChild as SVGSVGElement;
    const root = outer.firstElementChild as SVGSVGElement;
    const groups = Array.from(root.querySelectorAll('g')).filter((gEl) =>
      MARKER_LAYER_RE.test([gEl.id, gEl.getAttribute('inkscape:label'), gEl.getAttribute('data-layer'), gEl.getAttribute('data-name')].filter(Boolean).join(' ')),
    );
    const cands = new Set<Element>();
    groups.forEach((gEl) => gEl.querySelectorAll('circle,ellipse,rect,path,use,polygon').forEach((e) => cands.add(e)));
    root.querySelectorAll('[data-species],[data-plant]').forEach((e) => cands.add(e));
    const rootM = (outer as SVGGraphicsElement).getScreenCTM();
    const byColor = new Map<string, string[]>();
    species.forEach((s) => {
      const c = normColor(s.marker_color)!;
      byColor.set(c, [...(byColor.get(c) ?? []), s.species_id]);
    });
    const codes = species.map((s) => s.species_id).sort((a, b) => b.length - a.length);
    cands.forEach((e) => {
      const ge = e as SVGGraphicsElement;
      let x = 0,
        y = 0;
      try {
        const b = ge.getBBox();
        const m = ge.getScreenCTM();
        if (!m || !rootM) return;
        const pt = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(rootM.inverse().multiply(m));
        x = pt.x;
        y = pt.y;
      } catch {
        return;
      }
      const cs = getComputedStyle(e);
      const color = normColor(e.getAttribute('fill')) ?? normColor(cs.fill);
      const id = e.getAttribute('id');
      const dataSp = e.getAttribute('data-species') ?? e.getAttribute('data-plant');
      let species_id: string | null = null;
      let match: DetectedMarker['match'] = 'none';
      let candidates: string[] = [];
      if (id) {
        const code = codes.find((c) => new RegExp(`^${c}(?:[_\\-\\s.:]|\\d|$)`, 'i').test(id));
        if (code) {
          species_id = code;
          match = 'element_id';
        }
      }
      if (!species_id && dataSp) {
        const code = codes.find((c) => c.toLowerCase() === dataSp.toLowerCase());
        if (code) {
          species_id = code;
          match = 'data_attribute';
        }
      }
      if (!species_id && color) {
        candidates = byColor.get(color) ?? [];
        if (candidates.length === 1) {
          species_id = candidates[0];
          match = 'marker_color';
        }
      }
      out.push({ element_id: id, x, y, color, species_id, match, ambiguous: !species_id || candidates.length > 1, candidates });
    });
  } finally {
    host.remove();
  }
  return out;
}
