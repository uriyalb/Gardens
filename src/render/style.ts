import type { StyleSettings } from '../model/types';

// ---------- colour utilities ----------
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}
export function adjust(hex: string, satMul: number, lightAdd = 0): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const [r, g, b] = hslToRgb(h, Math.max(0, Math.min(1, s * satMul)), Math.max(0, Math.min(1, l + lightAdd)));
  return rgbToHex(r, g, b);
}
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a),
    B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function colorDistance(a: string, b: string): number {
  const A = hexToRgb(a),
    B = hexToRgb(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

// ---------- render context ----------
export interface RenderContext {
  upm: number; // source units per metre
  px: number; // base stroke unit in source units
  style: StyleSettings;
  idPrefix: string;
  simplified: boolean; // CAD-friendly outline output
}

export function makeContext(style: StyleSettings, upm: number, frameDiag: number, simplified = false): RenderContext {
  return { upm, px: Math.max(frameDiag / 1600, 1e-3), style: simplified ? simplifiedStyle(style) : style, idPrefix: 'avs', simplified };
}

export function simplifiedStyle(s: StyleSettings): StyleSettings {
  return {
    ...s,
    line_irregularity: 0,
    watercolor_opacity: 0,
    fills: false,
    textures: false,
    monochrome: true,
    foliage_detail: Math.min(s.foliage_detail, 0.25),
    branch_detail: Math.min(s.branch_detail, 0.3),
    shadow_strength: 0,
    line_color: '#000000',
  };
}

/** Saturation factor: 0.35 (default) leaves the species palette unchanged. */
export function satFactor(s: StyleSettings) {
  return 0.15 + s.color_saturation * 2.43;
}

export function foliage(rc: RenderContext, hex: string, lightAdd = 0): string {
  if (rc.style.monochrome) return '#FFFFFF';
  return adjust(hex, satFactor(rc.style), lightAdd);
}

export function ink(rc: RenderContext): string {
  return rc.style.line_color || '#3F4240';
}

export function lw(rc: RenderContext, mul = 1): number {
  return rc.px * (0.35 + rc.style.line_weight * 1.3) * mul;
}

export function fillOpacity(rc: RenderContext, mul = 1): number {
  if (!rc.style.fills) return 0;
  return Math.max(0, Math.min(1, rc.style.watercolor_opacity * mul));
}

export const TRUNK_COLOR = '#8C7E6A';
export const BRANCH_COLOR = '#6B6152';
