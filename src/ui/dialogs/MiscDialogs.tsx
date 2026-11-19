import { useEffect, useState } from 'react';
import { useProject, updateProject } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { useT } from '../../i18n';
import { Field, Modal, NumberInput, Select, Slider, Toggle } from '../controls';
import type { LengthUnit, StyleSettings } from '../../model/types';
import { clearCalibration, setCalibration, placePlant } from '../../store/actions';
import { STYLE_PRESETS } from '../../model/defaults';
import { loadStyles, saveStyles, listProjects, deleteProject, type ProjectSummary } from '../../persist/db';
import { openStoredProject, importProjectFile, loadDemo, pendingMarkers } from '../fileOps';

const toM: Record<LengthUnit, number> = { m: 1, cm: 0.01, mm: 0.001 };

export function CalibrationDialog() {
  const t = useT();
  const arg = useUI((s) => s.dialogArg);
  const calibPoints = useUI((s) => s.calibPoints);
  const project = useProject((s) => s.project);
  const mode = project.active_mode;
  const cal = project.views[mode].calibration;
  const [method, setMethod] = useState<'unit_equivalence' | 'paper_scale' | 'two_point'>(arg === 'two_point' ? 'two_point' : 'unit_equivalence');
  const [unitVal, setUnitVal] = useState(1);
  const [unit, setUnit] = useState<LengthUnit>('cm');
  const [denom, setDenom] = useState(100);
  const [paperUnit, setPaperUnit] = useState<LengthUnit>('mm');
  const [dist, setDist] = useState(10);
  const [distUnit, setDistUnit] = useState<LengthUnit>('m');
  const close = () => useUI.getState().set({ dialog: null, calibPoints: [], tool: 'select' });
  const d = calibPoints.length === 2 ? Math.hypot(calibPoints[1].x - calibPoints[0].x, calibPoints[1].y - calibPoints[0].y) : 0;
  let upm: number | null = null;
  if (method === 'unit_equivalence' && unitVal > 0) upm = 1 / (unitVal * toM[unit]);
  if (method === 'paper_scale' && denom > 0) upm = 1 / (toM[paperUnit] * denom);
  if (method === 'two_point' && d > 0 && dist > 0) upm = d / (dist * toM[distUnit]);
  const units: { value: LengthUnit; label: string }[] = [
    { value: 'm', label: 'm' },
    { value: 'cm', label: 'cm' },
    { value: 'mm', label: 'mm' },
  ];
  return (
    <Modal
      title={t('calibrate')}
      onClose={close}
      footer={
        <>
          <button onClick={() => (clearCalibration(mode), close())}>Uncalibrated mode</button>
          <button onClick={close}>{t('cancel')}</button>
          <button
            className="primary"
            disabled={!upm}
            onClick={() => {
              const note =
                method === 'two_point'
                  ? `Two-point: ${d.toFixed(2)} units = ${dist} ${distUnit}`
                  : method === 'paper_scale'
                    ? `Paper scale 1:${denom}, 1 unit = 1 ${paperUnit} on paper`
                    : `1 drawing unit = ${unitVal} ${unit}`;
              setCalibration(mode, upm!, method, method === 'paper_scale' ? denom : null, note);
              close();
            }}
          >
            {t('apply')}
          </button>
        </>
      }
    >
      <p className="muted small">
        {t('scale')}: {cal.status === 'verified' ? `${t('calibrated')} — ${cal.units_per_meter.toFixed(3)} ${t('units_per_meter')} (${cal.note})` : t('uncalibrated')}
      </p>
      <div className="tabs">
        {(['unit_equivalence', 'paper_scale', 'two_point'] as const).map((m) => (
          <button key={m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>
            {m === 'unit_equivalence' ? 'Unit equivalence' : m === 'paper_scale' ? 'Drawing scale' : 'Known distance'}
          </button>
        ))}
      </div>
      {method === 'unit_equivalence' && (
        <Field label="1 drawing unit =">
          <span className="row-gap">
            <NumberInput value={unitVal} onChange={setUnitVal} step={0.1} />
            <Select value={unit} options={units} onChange={setUnit} />
          </span>
        </Field>
      )}
      {method === 'paper_scale' && (
        <>
          <Field label="Scale 1 :">
            <NumberInput value={denom} onChange={setDenom} step={10} />
          </Field>
          <Field label="1 drawing unit on paper =">
            <Select value={paperUnit} options={units} onChange={setPaperUnit} />
          </Field>
        </>
      )}
      {method === 'two_point' && (
        <>
          <p className="small">{calibPoints.length === 2 ? `Measured: ${d.toFixed(2)} drawing units` : t('hint_calib')}</p>
          <button
            onClick={() => {
              useUI.getState().set({ dialog: null, tool: 'calibrate', calibPoints: [] });
            }}
          >
            {t('tool_calibrate')}
          </button>
          <Field label="Real distance">
            <span className="row-gap">
              <NumberInput value={dist} onChange={setDist} step={0.1} />
              <Select value={distUnit} options={units} onChange={setDistUnit} />
            </span>
          </Field>
        </>
      )}
      {upm && (
        <p className="ok small">
          → {upm.toFixed(4)} {t('units_per_meter')}
        </p>
      )}
    </Modal>
  );
}

export function StyleDialog() {
  const t = useT();
  const style = useProject((s) => s.project.style);
  const [custom, setCustom] = useState<StyleSettings[]>([]);
  useEffect(() => {
    loadStyles().then(setCustom).catch(() => {});
  }, []);
  const set = (patch: Partial<StyleSettings>, key: string) => updateProject((d) => void Object.assign(d.style, patch), 'style-' + key);
  const all = [...STYLE_PRESETS, ...custom];
  const close = () => useUI.getState().openDialog(null);
  const S = (k: keyof StyleSettings, label: string, min = 0, max = 1) => <Slider label={label} min={min} max={max} value={style[k] as number} onChange={(v) => set({ [k]: v }, k)} />;
  return (
    <Modal title={t('style')} onClose={close} wide>
      <div className="editor-grid">
        <div>
          <Field label="Preset">
            <Select value={style.style_id} options={all.map((s) => ({ value: s.style_id, label: s.name }))} onChange={(v) => updateProject((d) => void (d.style = { ...all.find((s) => s.style_id === v)! }))} />
          </Field>
          {S('line_weight', 'line_weight', 0.1, 2)}
          {S('line_irregularity', 'line_irregularity')}
          {S('outline_strength', 'outline_strength')}
          {S('watercolor_opacity', 'watercolor_opacity')}
          {S('color_saturation', 'color_saturation')}
          {S('foliage_detail', 'foliage_detail')}
        </div>
        <div>
          {S('branch_detail', 'branch_detail')}
          {S('natural_variation', 'natural_variation')}
          {S('shadow_strength', 'shadow_strength')}
          {S('background_vegetation_opacity', 'background_vegetation_opacity', 0.05, 1)}
          <Field label="background_color">
            <input type="color" value={style.background_color} onChange={(e) => set({ background_color: e.target.value.toUpperCase() }, 'bg')} />
          </Field>
          <Field label="line_color">
            <input type="color" value={style.line_color} onChange={(e) => set({ line_color: e.target.value.toUpperCase() }, 'lc')} />
          </Field>
          <div className="toggles">
            <Toggle label="fills" checked={style.fills} onChange={(v) => set({ fills: v }, 'f')} />
            <Toggle label="textures" checked={style.textures} onChange={(v) => set({ textures: v }, 't')} />
            <Toggle label="monochrome" checked={style.monochrome} onChange={(v) => set({ monochrome: v }, 'm')} />
          </div>
          <button
            onClick={async () => {
              const name = prompt('Style name', style.name + ' (custom)');
              if (!name) return;
              const s: StyleSettings = { ...style, style_id: 'custom_' + Date.now().toString(36), name, custom: true };
              const next = [...custom, s];
              setCustom(next);
              await saveStyles(next);
              updateProject((d) => void (d.style = s));
              useUI.getState().notify(t('saved'));
            }}
          >
            Save as custom style
          </button>
          <p className="muted small">Styles change graphics only — plant data and project geometry are never altered.</p>
        </div>
      </div>
    </Modal>
  );
}

export function ProjectsDialog() {
  const t = useT();
  const [list, setList] = useState<ProjectSummary[]>([]);
  const refresh = () => listProjects().then(setList).catch(() => setList([]));
  useEffect(() => {
    refresh();
  }, []);
  const close = () => useUI.getState().openDialog(null);
  return (
    <Modal title={t('open_project')} onClose={close}>
      <div className="btn-col">
        <button className="primary" onClick={() => importProjectFile().then((ok) => ok && close())}>
          {t('import_project_file')}
        </button>
        <button onClick={() => (loadDemo(), close())}>{t('load_demo')}</button>
      </div>
      <h4>{t('stored_projects')}</h4>
      <ul className="project-list">
        {list.map((p) => (
          <li key={p.project_id}>
            <div>
              <b>{p.name}</b>
              <div className="muted small" dir="ltr">
                {new Date(p.updated_at).toLocaleString()} · {p.plants} {t('plants_count')}
              </div>
            </div>
            <span className="row-gap">
              <button onClick={() => openStoredProject(p.project_id).then(close)}>{t('open')}</button>
              <button
                className="mini"
                onClick={async () => {
                  if (confirm(t('delete') + '?')) {
                    await deleteProject(p.project_id);
                    refresh();
                  }
                }}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function MarkersDialog() {
  const t = useT();
  const project = useProject((s) => s.project);
  const [list, setList] = useState(() => pendingMarkers.list.map((m) => ({ ...m, use: !!m.species_id })));
  const close = () => useUI.getState().openDialog(null);
  return (
    <Modal
      title={t('markers_detected')}
      onClose={close}
      wide
      footer={
        <>
          <button onClick={close}>{t('cancel')}</button>
          <button
            className="primary"
            onClick={() => {
              for (const m of list) if (m.use && m.species_id) placePlant({ x: m.x, y: m.y }, m.species_id, { source_element_id: m.element_id, verified_position: true });
              useUI.getState().setSelection([]);
              close();
            }}
          >
            {t('create_plants')} ({list.filter((m) => m.use && m.species_id).length})
          </button>
        </>
      }
    >
      <p className="muted small">Matched by precedence: element ID → data attribute → marker colour (dedicated marker layer only). Ambiguous markers need manual confirmation.</p>
      <table className="tbl" dir="ltr">
        <thead>
          <tr>
            <th />
            <th>element</th>
            <th>x</th>
            <th>y</th>
            <th>colour</th>
            <th>match</th>
            <th>species</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m, i) => (
            <tr key={i} className={m.ambiguous ? 'amb' : ''}>
              <td>
                <input type="checkbox" checked={m.use} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, use: e.target.checked } : x)))} />
              </td>
              <td>{m.element_id ?? '—'}</td>
              <td>{m.x.toFixed(1)}</td>
              <td>{m.y.toFixed(1)}</td>
              <td>{m.color && <span className="swatch" style={{ background: m.color }} />} {m.color}</td>
              <td>{m.match}{m.ambiguous ? ' ⚠' : ''}</td>
              <td>
                <Select value={m.species_id} options={project.species.map((s) => ({ value: s.species_id, label: s.species_id }))} onChange={(v) => setList(list.map((x, j) => (j === i ? { ...x, species_id: v, use: true } : x)))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function SettingsDialog() {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const project = useProject((s) => s.project);
  const close = () => useUI.getState().openDialog(null);
  return (
    <Modal title={t('settings')} onClose={close}>
      <Field label={t('language')}>
        <Select
          value={lang}
          options={[
            { value: 'he', label: 'עברית (RTL)' },
            { value: 'en', label: 'English (LTR)' },
          ]}
          onChange={(v) => {
            useUI.getState().set({ lang: v });
            try {
              localStorage.setItem('avs.lang', v);
            } catch {
              /* ignore */
            }
          }}
        />
      </Field>
      <h4>Height classes (editable project defaults)</h4>
      <table className="tbl" dir="ltr">
        <tbody>
          {project.height_classes.map((h, i) => (
            <tr key={h.id}>
              <td>
                <b>{h.id}</b>
              </td>
              <td>
                <input value={h.label} onChange={(e) => updateProject((d) => void (d.height_classes[i].label = e.target.value), 'hcl' + i)} />
              </td>
              <td>
                <NumberInput value={h.min_m} onChange={(v) => updateProject((d) => void (d.height_classes[i].min_m = v), 'hcmin' + i)} width={60} />
              </td>
              <td>
                <NumberInput value={h.max_m} onChange={(v) => updateProject((d) => void (d.height_classes[i].max_m = v), 'hcmax' + i)} width={60} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t('autosave')}: IndexedDB (projects, drawings and images are stored locally in this browser; nothing is uploaded).</p>
    </Modal>
  );
}

export function HelpDialog() {
  const close = () => useUI.getState().openDialog(null);
  return (
    <Modal title="Help · עזרה" onClose={close} wide>
      <div className="help" dir="ltr">
        <h4>Workflow</h4>
        <ol>
          <li>Import an SVG/PNG/JPEG drawing (toolbar ⬇). SVG is preferred: its viewBox and geometry are preserved unchanged.</li>
          <li>Choose Planting Plan or Landscape Section mode. Each mode keeps its own drawing, scale and plants.</li>
          <li>Calibrate the scale (ruler). Without calibration dimensions are flagged as approximate.</li>
          <li>Select a species in the library and click to place (plan: trunk centre; section: ground-contact point).</li>
          <li>Draw planting areas (G), linear plantings (L), ground lines (K, section) or pick existing drawing elements (E).</li>
          <li>Edit in the properties panel; switch views (original / identification / vegetation / composite); export.</li>
        </ol>
        <h4>Shortcuts</h4>
        <p>V select · H pan (or hold Space / middle mouse) · P place · G area · L line · K ground line · E pick element · Del delete · Ctrl+D duplicate · Ctrl+G group · Ctrl+Shift+G ungroup · Ctrl+Z / Ctrl+Shift+Z undo/redo · arrows nudge (Shift ×10) · Enter finish shape · Esc cancel · F fit · Alt+click vertex delete · double-click edge insert vertex.</p>
        <h4>Known limitations</h4>
        <ul>
          <li>Marker recognition is only performed on dedicated marker layers / data-species attributes in vector SVGs. Raster images are locked references; place plants manually.</li>
          <li>Polygon planting areas are available in plan mode; section mode uses individual plants, linear rows and ground lines.</li>
          <li>The CAD-simplified SVG exports outlines; no DXF export. Decorative textures do not become native CAD geometry.</li>
          <li>AI prompts describe the intended result; external generators cannot guarantee geometric fidelity.</li>
        </ul>
      </div>
    </Modal>
  );
}
