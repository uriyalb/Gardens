// Minimal SVG string builders. All renderers produce plain SVG markup, so the same
// output is used by the interactive canvas and by every exporter.

export type Attrs = Record<string, string | number | null | undefined | false>;

export const f = (n: number) => {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 100) / 100;
  return String(r);
};

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attrs(a: Attrs): string {
  let s = '';
  for (const k in a) {
    const v = a[k];
    if (v === null || v === undefined || v === false) continue;
    s += ` ${k}="${typeof v === 'number' ? f(v) : esc(String(v))}"`;
  }
  return s;
}

export const el = (tag: string, a: Attrs, children = '') => (children ? `<${tag}${attrs(a)}>${children}</${tag}>` : `<${tag}${attrs(a)}/>`);
export const g = (a: Attrs, children: string) => (children ? `<g${attrs(a)}>${children}</g>` : '');
export const path = (d: string, a: Attrs) => (d ? el('path', { d, ...a }) : '');
export const circle = (cx: number, cy: number, r: number, a: Attrs) => el('circle', { cx, cy, r, ...a });
export const text = (x: number, y: number, s: string, a: Attrs) => `<text${attrs({ x, y, ...a })}>${esc(s)}</text>`;
