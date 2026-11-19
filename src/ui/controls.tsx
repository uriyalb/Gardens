import { useEffect, useState, type ReactNode } from 'react';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label" title={hint}>
        {label}
      </span>
      <span className="field-control">{children}</span>
    </label>
  );
}

export function NumberInput({ value, onChange, step = 0.1, min, max, mixed, width }: { value: number | null; onChange: (v: number) => void; step?: number; min?: number; max?: number; mixed?: boolean; width?: number }) {
  const [txt, setTxt] = useState(value === null ? '' : String(round(value)));
  useEffect(() => setTxt(value === null ? '' : String(round(value))), [value]);
  return (
    <input
      className="num"
      type="number"
      step={step}
      min={min}
      max={max}
      style={width ? { width } : undefined}
      value={txt}
      placeholder={mixed ? '—' : ''}
      onChange={(e) => {
        setTxt(e.target.value);
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  unit,
  mixed,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  mixed?: boolean;
  hint?: string;
}) {
  return (
    <div className="slider-row" title={hint}>
      <div className="slider-head">
        <span>{label}</span>
        <span className="slider-num">
          <NumberInput value={value} onChange={onChange} step={step} min={min} mixed={mixed} width={64} />
          {unit && <span className="unit">{unit}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value ?? (min + max) / 2} className={mixed ? 'mixed' : ''} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange, mixed }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void; mixed?: boolean }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value as T)}>
      {(mixed || value === null) && <option value="">—</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="panel-section">
      <div className="panel-section-head">
        <h3>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

// Simple line icons (no external assets)
const I = (d: string) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
export const Icons = {
  select: I('M5 3l12 8-6 1 3 7-2 1-3-7-4 4z'),
  hand: I('M8 12V5a1.5 1.5 0 013 0v6M11 11V4a1.5 1.5 0 013 0v7M14 11V5.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-4a1.5 1.5 0 012.5-1.5L8 13'),
  place: I('M12 21v-7M12 14c-4 0-7-2.5-7-6a7 7 0 0114 0c0 3.5-3 6-7 6z'),
  polygon: I('M4 7l7-4 9 5-3 11H6z'),
  protected: I('M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z'),
  line: I('M3 18c4-8 6 2 9-4s5-6 9-8'),
  ground: I('M2 16h6l2-3h6l2 3h4M2 20h20'),
  pick: I('M3 3h7v7H3zM14 14l7 3-3 1-1 3z'),
  ruler: I('M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2'),
  undo: I('M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-4'),
  redo: I('M15 14l5-5-5-5M20 9H9a5 5 0 000 10h4'),
  zoomIn: I('M11 4a7 7 0 110 14 7 7 0 010-14zM21 21l-5-5M8 11h6M11 8v6'),
  zoomOut: I('M11 4a7 7 0 110 14 7 7 0 010-14zM21 21l-5-5M8 11h6'),
  fit: I('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'),
  eye: I('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 110 6 3 3 0 010-6z'),
  eyeOff: I('M3 3l18 18M10.6 6.1A10 10 0 0112 6c6 0 10 6 10 6a17 17 0 01-3 3.5M6.5 7.5C4 9.3 2 12 2 12s4 6 10 6a9 9 0 004-1'),
  lock: I('M6 11h12v9H6zM8 11V8a4 4 0 018 0v3'),
  unlock: I('M6 11h12v9H6zM8 11V8a4 4 0 017.5-2'),
  up: I('M12 19V5M5 12l7-7 7 7'),
  down: I('M12 5v14M5 12l7 7 7-7'),
  trash: I('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'),
  copy: I('M8 8h12v12H8zM4 16V4h12'),
  save: I('M5 3h11l3 3v15H5zM8 3v6h8M8 21v-7h8v7'),
  file: I('M6 2h8l5 5v15H6zM14 2v5h5'),
  plus: I('M12 5v14M5 12h14'),
  import: I('M12 3v12M7 10l5 5 5-5M4 21h16'),
  export: I('M12 15V3M7 8l5-5 5 5M4 21h16'),
  gear: I('M12 9a3 3 0 110 6 3 3 0 010-6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 7.5 4 7 3 10l2 1v2l-2 1 1 3 2-.5L7.5 18 7 20l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z'),
  sparkle: I('M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z'),
  play: I('M7 4l13 8-13 8z'),
  brush: I('M3 21c3 0 5-2 5-5l9-9a2 2 0 00-3-3l-9 9c-3 0-2 3-2 8zM14 5l5 5'),
  help: I('M12 21a9 9 0 110-18 9 9 0 010 18zM9.5 9a2.5 2.5 0 015 .5c0 2-2.5 2-2.5 4M12 17h.01'),
};
