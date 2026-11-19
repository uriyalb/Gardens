import { useProject, updateProject } from '../store/projectStore';
import { useUI, type Tool, type ViewMode } from '../store/uiStore';
import { useT } from '../i18n';
import { Icons } from './controls';
import { importDrawing, newProject, saveNow } from './fileOps';
import { zoomBy } from './Canvas';
import type { DrawingMode } from '../model/types';

export function TopToolbar() {
  const t = useT();
  const name = useProject((s) => s.project.name);
  const mode = useProject((s) => s.project.active_mode);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const cal = useProject((s) => s.project.views[s.project.active_mode].calibration);
  const ui = useUI();
  const setMode = (m: DrawingMode) => {
    updateProject((d) => void (d.active_mode = m));
    useUI.getState().set({ selection: [], drawPoints: [], picked: null, tool: ui.tool === 'polygon' && m === 'section' ? 'select' : ui.tool });
  };
  return (
    <header className="toolbar">
      <div className="tb-group brand">
        <span className="logo" aria-hidden>
          <svg viewBox="0 0 32 32" width="22" height="22">
            <circle cx="16" cy="13" r="10" fill="#A9B79C" stroke="#4a4d48" strokeWidth="1.3" />
            <path d="M16 13v15M16 17l-4-4M16 15l4-3" stroke="#4a4d48" strokeWidth="1.3" fill="none" />
          </svg>
        </span>
        <input className="project-name" value={name} onChange={(e) => updateProject((d) => void (d.name = e.target.value), 'name')} aria-label={t('project_name')} />
      </div>
      <div className="tb-group">
        <button className="tb-btn" onClick={newProject} title={t('new_project')}>
          {Icons.file}
          <span>{t('new_project')}</span>
        </button>
        <button className="tb-btn" onClick={() => ui.openDialog('projects')} title={t('open_project')}>
          {Icons.import}
          <span>{t('open_project')}</span>
        </button>
        <button className="tb-btn" onClick={saveNow} title={t('save_project') + ' (Ctrl+S)'}>
          {Icons.save}
          <span>{t('save_project')}</span>
        </button>
      </div>
      <div className="tb-group seg" role="tablist">
        <button className={mode === 'plan' ? 'on' : ''} onClick={() => setMode('plan')} role="tab" aria-selected={mode === 'plan'}>
          {t('plan_mode')}
        </button>
        <button className={mode === 'section' ? 'on' : ''} onClick={() => setMode('section')} role="tab" aria-selected={mode === 'section'}>
          {t('section_mode')}
        </button>
      </div>
      <div className="tb-group">
        <button className="icon-btn" disabled={!canUndo} onClick={() => useProject.getState().undo()} title={t('undo') + ' (Ctrl+Z)'}>
          {Icons.undo}
        </button>
        <button className="icon-btn" disabled={!canRedo} onClick={() => useProject.getState().redo()} title={t('redo') + ' (Ctrl+Shift+Z)'}>
          {Icons.redo}
        </button>
      </div>
      <div className="tb-group">
        <button className="icon-btn" onClick={() => zoomBy(1 / 1.25)} title={t('zoom_out')}>
          {Icons.zoomOut}
        </button>
        <button className="icon-btn" onClick={() => zoomBy(1.25)} title={t('zoom_in')}>
          {Icons.zoomIn}
        </button>
        <button className="icon-btn" onClick={() => ui.set({ fitRequest: ui.fitRequest + 1 })} title={t('fit') + ' (F)'}>
          {Icons.fit}
        </button>
      </div>
      <div className="tb-group">
        <select value={ui.viewMode} onChange={(e) => ui.set({ viewMode: e.target.value as ViewMode })} aria-label="view">
          <option value="original">{t('view_original')}</option>
          <option value="identification">{t('view_identification')}</option>
          <option value="vegetation">{t('view_vegetation')}</option>
          <option value="composite">{t('view_composite')}</option>
        </select>
        <button className={'tb-btn' + (ui.preview ? ' on' : '')} onClick={() => ui.set({ preview: !ui.preview, viewMode: 'composite', selection: [] })} title={t('preview')}>
          {Icons.play}
          <span>{t('preview')}</span>
        </button>
      </div>
      <div className="tb-group">
        <button className="tb-btn" onClick={importDrawing} title={t('import_drawing')}>
          {Icons.import}
          <span>{t('import_drawing')}</span>
        </button>
        <button className={'tb-btn' + (cal.status === 'verified' ? '' : ' warn')} onClick={() => ui.openDialog('calibrate')} title={cal.status === 'verified' ? `${t('calibrated')}: ${cal.units_per_meter.toFixed(2)} ${t('units_per_meter')}` : t('uncalibrated')}>
          {Icons.ruler}
          <span>{cal.status === 'verified' ? `${t('scale')} ✓` : `${t('scale')} ≈`}</span>
        </button>
        <button className="tb-btn" onClick={() => ui.openDialog('style')} title={t('style')}>
          {Icons.brush}
          <span>{t('style')}</span>
        </button>
      </div>
      <div className="tb-group end">
        <button className="tb-btn primary" onClick={() => ui.openDialog('export')} title={t('export')}>
          {Icons.export}
          <span>{t('export')}</span>
        </button>
        <button className="tb-btn" onClick={() => ui.openDialog('ai')} title={t('ai_export')}>
          {Icons.sparkle}
          <span>{t('ai_export')}</span>
        </button>
        <button
          className="icon-btn lang"
          onClick={() => {
            const lang = ui.lang === 'he' ? 'en' : 'he';
            ui.set({ lang });
            try {
              localStorage.setItem('avs.lang', lang);
            } catch {
              /* ignore */
            }
          }}
          title={t('language')}
        >
          {ui.lang === 'he' ? 'EN' : 'עב'}
        </button>
        <button className="icon-btn" onClick={() => ui.openDialog('settings')} title={t('settings')}>
          {Icons.gear}
        </button>
        <button className="icon-btn" onClick={() => ui.openDialog('help')} title={t('help')}>
          {Icons.help}
        </button>
      </div>
    </header>
  );
}

export function ToolPalette() {
  const t = useT();
  const tool = useUI((s) => s.tool);
  const mode = useProject((s) => s.project.active_mode);
  const hasSvgBg = useProject((s) => s.project.views[s.project.active_mode].background?.kind === 'svg');
  const tools: { id: Tool; icon: React.ReactNode; label: string; show?: boolean }[] = [
    { id: 'select', icon: Icons.select, label: t('tool_select') },
    { id: 'hand', icon: Icons.hand, label: t('tool_hand') },
    { id: 'place', icon: Icons.place, label: t('tool_place') },
    { id: 'polygon', icon: Icons.polygon, label: t('tool_polygon'), show: mode === 'plan' },
    { id: 'protected', icon: Icons.protected, label: t('tool_protected'), show: mode === 'plan' },
    { id: 'line', icon: Icons.line, label: t('tool_line') },
    { id: 'ground', icon: Icons.ground, label: t('tool_ground'), show: mode === 'section' },
    { id: 'pick', icon: Icons.pick, label: t('tool_pick'), show: hasSvgBg },
    { id: 'calibrate', icon: Icons.ruler, label: t('tool_calibrate') },
  ];
  return (
    <div className="tool-palette" role="toolbar">
      {tools
        .filter((x) => x.show !== false)
        .map((x) => (
          <button key={x.id} className={'tool' + (tool === x.id ? ' on' : '')} title={x.label} aria-label={x.label} data-tool={x.id} onClick={() => useUI.getState().set({ tool: x.id, drawPoints: [], calibPoints: [], picked: null })}>
            {x.icon}
          </button>
        ))}
    </div>
  );
}
