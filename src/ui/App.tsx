import { useEffect, useState } from 'react';
import { useProject } from '../store/projectStore';
import { useUI } from '../store/uiStore';
import { TopToolbar, ToolPalette } from './Toolbar';
import { PlantLibrary } from './PlantLibrary';
import { Canvas } from './Canvas';
import { PropertiesPanel } from './PropertiesPanel';
import { SpeciesEditor } from './dialogs/SpeciesEditor';
import { ExportDialog } from './dialogs/ExportDialog';
import { AIDialog } from './dialogs/AIDialog';
import { CalibrationDialog, HelpDialog, MarkersDialog, ProjectsDialog, SettingsDialog, StyleDialog } from './dialogs/MiscDialogs';
import { deleteSelection, duplicateSelection, groupSelection, moveItems, ungroupSelection } from '../store/actions';
import { lastProjectId, loadProject, saveProject } from '../persist/db';
import { buildDemoProject } from '../demo/demo';
import { parseProject } from '../export/projectFile';
import { saveNow } from './fileOps';
import { useT } from '../i18n';

function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement || tgt instanceof HTMLSelectElement || tgt.isContentEditable) return;
      const ui = useUI.getState();
      if (ui.dialog) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) useProject.getState().redo();
        else useProject.getState().undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        useProject.getState().redo();
      } else if (mod && k === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if (mod && k === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
      } else if (mod && k === 's') {
        e.preventDefault();
        saveNow();
      } else if (mod && k === 'a') {
        e.preventDefault();
        const p = useProject.getState().project;
        ui.setSelection(p.plants.filter((x) => x.drawing_mode === p.active_mode && !x.locked).map((x) => ({ kind: 'plant' as const, id: x.instance_id })));
      } else if ((k === 'delete' || k === 'backspace') && !ui.drawPoints.length) {
        e.preventDefault();
        deleteSelection();
      } else if (k.startsWith('arrow') && ui.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        moveItems(ui.selection, dx, dy, 'nudge');
      } else if (!mod) {
        const map: Record<string, Parameters<typeof ui.set>[0]['tool']> = { v: 'select', h: 'hand', p: 'place', g: 'polygon', l: 'line', k: 'ground', e: 'pick' };
        if (map[k]) ui.set({ tool: map[k], drawPoints: [] });
        if (k === 'f') ui.set({ fitRequest: ui.fitRequest + 1 });
        if (k === 'escape') ui.set({ selection: [], tool: ui.drawPoints.length ? ui.tool : 'select' });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

function useAutosave(ready: boolean) {
  const revision = useProject((s) => s.revision);
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      saveProject(useProject.getState().project).catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [revision, ready]);
}

export function App() {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const dialog = useUI((s) => s.dialog);
  const toast = useUI((s) => s.toast);
  const preview = useUI((s) => s.preview);
  const [ready, setReady] = useState(false);
  useShortcuts();
  useAutosave(ready);
  useEffect(() => {
    // re-fit after the workspace layout changes (preview hides the side panels)
    const id = setTimeout(() => useUI.getState().set({ fitRequest: useUI.getState().fitRequest + 1 }), 50);
    return () => clearTimeout(id);
  }, [preview]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.title = t('app_title');
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        const id = await lastProjectId();
        const p = id ? await loadProject(id) : null;
        useProject.getState().load(p ? parseProject(JSON.stringify(p)) : buildDemoProject());
      } catch {
        useProject.getState().load(buildDemoProject());
      }
      setReady(true);
    })();
  }, []);

  return (
    <div className={'app' + (preview ? ' is-preview' : '')}>
      <TopToolbar />
      <main className="workspace">
        {!preview && <PlantLibrary />}
        <div className="center">
          {!preview && <ToolPalette />}
          {ready ? <Canvas /> : <div className="loading">…</div>}
          {preview && (
            <button className="exit-preview" onClick={() => useUI.getState().set({ preview: false })}>
              ✕ {t('preview')}
            </button>
          )}
        </div>
        {!preview && <PropertiesPanel />}
      </main>
      {dialog === 'species' && <SpeciesEditor />}
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'ai' && <AIDialog />}
      {dialog === 'calibrate' && <CalibrationDialog />}
      {dialog === 'style' && <StyleDialog />}
      {dialog === 'projects' && <ProjectsDialog />}
      {dialog === 'markers' && <MarkersDialog />}
      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'help' && <HelpDialog />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
