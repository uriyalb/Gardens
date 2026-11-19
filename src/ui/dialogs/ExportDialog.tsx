import { useState } from 'react';
import { useProject } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { useT } from '../../i18n';
import { Field, Modal, Select, Toggle } from '../controls';
import { exportPlantSvg, exportSvg, frameOf, type SvgExportKind } from '../../export/svgExport';
import { downloadBlob, downloadText, safeName } from '../../export/download';
import { svgToPng } from '../../export/pngExport';
import { serializeProject } from '../../export/projectFile';

export function ExportDialog() {
  const t = useT();
  const project = useProject((s) => s.project);
  const selection = useUI((s) => s.selection);
  const mode = project.active_mode;
  const [markers, setMarkers] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [long, setLong] = useState('3000');
  const [pngKind, setPngKind] = useState<SvgExportKind>('complete');
  const [busy, setBusy] = useState(false);
  const close = () => useUI.getState().openDialog(null);
  const base = `${safeName(project.name)}_${mode}`;
  const sel = selection.length === 1 && selection[0].kind === 'plant' ? project.plants.find((p) => p.instance_id === selection[0].id) : undefined;

  const svg = (kind: SvgExportKind, suffix: string) => downloadText(exportSvg(project, mode, { kind, includeMarkers: markers, transparent }), `${base}_${suffix}.svg`, 'image/svg+xml');
  const png = async () => {
    setBusy(true);
    try {
      const vb = frameOf(project, mode);
      const L = parseInt(long) || 3000;
      const k = L / Math.max(vb.w, vb.h);
      const s = exportSvg(project, mode, { kind: pngKind, includeMarkers: markers, transparent });
      downloadBlob(await svgToPng(s, vb.w * k, vb.h * k), `${base}_${pngKind}_${L}px.png`);
    } catch (e) {
      useUI.getState().notify(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t('export')} onClose={close} wide>
      <div className="export-grid">
        <div className="export-card">
          <h4>1 · Complete SVG</h4>
          <p className="muted small">Architectural background + all visible vegetation layers. Original viewBox and coordinate system preserved.</p>
          <button className="primary" onClick={() => svg('complete', 'complete')}>
            {t('download')} SVG
          </button>
        </div>
        <div className="export-card">
          <h4>2 · Vegetation-only SVG</h4>
          <p className="muted small">Generated vegetation only, transparent background, same viewBox — overlay in Illustrator/Inkscape.</p>
          <button className="primary" onClick={() => svg('vegetation', 'vegetation')}>
            {t('download')} SVG
          </button>
        </div>
        <div className="export-card">
          <h4>3 · Selected plant SVG</h4>
          <p className="muted small">Isolated symbol, tight bounds, transparent background, insertion anchor at (0,0).</p>
          <button className="primary" disabled={!sel} onClick={() => sel && downloadText(exportPlantSvg(project, sel), `${sel.instance_id}_${sel.species_id}.svg`, 'image/svg+xml')}>
            {sel ? sel.instance_id : '—'}
          </button>
        </div>
        <div className="export-card">
          <h4>4 · PNG</h4>
          <Field label="Content">
            <Select<SvgExportKind>
              value={pngKind}
              options={[
                { value: 'complete', label: 'Composite' },
                { value: 'vegetation', label: 'Vegetation only' },
                { value: 'base', label: 'Clean base drawing' },
                { value: 'identification', label: 'Identification map' },
              ]}
              onChange={setPngKind}
            />
          </Field>
          <Field label="Long side (px)">
            <Select value={long} options={['1200', '2000', '3000', '5000', '8000'].map((v) => ({ value: v, label: v }))} onChange={setLong} />
          </Field>
          <button className="primary" disabled={busy} onClick={png}>
            {busy ? '…' : `${t('download')} PNG`}
          </button>
        </div>
        <div className="export-card">
          <h4>5 · Project JSON</h4>
          <p className="muted small">Complete editable project (both views, embedded drawings, species, styles). Re-importable.</p>
          <button className="primary" onClick={() => downloadText(serializeProject(project), `${safeName(project.name)}.avs.json`, 'application/json')}>
            {t('download')} JSON
          </button>
        </div>
        <div className="export-card">
          <h4>CAD-simplified SVG</h4>
          <p className="muted small">Outlines only (no washes/textures), black linework — suitable for tracing or further CAD processing. Decorative textures do not translate into native AutoCAD geometry.</p>
          <button className="primary" onClick={() => svg('cad', 'cad_simplified')}>
            {t('download')} SVG
          </button>
        </div>
        <div className="export-card">
          <h4>6 · AI package</h4>
          <p className="muted small">JSON prompt, natural-language prompt, ID map, composite and references as ZIP.</p>
          <button className="primary" onClick={() => useUI.getState().openDialog('ai')}>
            {t('ai_export')}…
          </button>
        </div>
      </div>
      <div className="row-gap wrap" style={{ marginTop: 12 }}>
        <Toggle label="Include identification markers" checked={markers} onChange={setMarkers} />
        <Toggle label="Transparent background" checked={transparent} onChange={setTransparent} />
      </div>
    </Modal>
  );
}
