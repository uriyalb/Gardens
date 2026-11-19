import { getProject, updateProject, useProject } from '../store/projectStore';
import { useUI } from '../store/uiStore';
import { detectMarkers, importRaster, importSvgText, type DetectedMarker } from '../import/svgImport';
import { createProject, uncalibrated } from '../model/factory';
import { parseProject, serializeProject } from '../export/projectFile';
import { loadLibrary, loadProject, saveProject } from '../persist/db';
import { buildDemoProject } from '../demo/demo';
import { pickFile, downloadText, safeName } from '../export/download';
import { translate } from '../i18n';

export const pendingMarkers: { list: DetectedMarker[] } = { list: [] };

const tr = (k: string) => translate(useUI.getState().lang, k);

export async function importDrawing() {
  const file = await pickFile('.svg,image/svg+xml,image/png,image/jpeg');
  if (!file) return;
  const mode = getProject().active_mode;
  const assetId = 'ASSET_' + Date.now().toString(36);
  try {
    let bg;
    let warnings: string[] = [];
    if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) {
      const res = importSvgText(await file.text(), file.name, assetId);
      bg = res.background;
      warnings = res.warnings;
    } else bg = await importRaster(file, assetId);
    updateProject((d) => {
      d.views[mode].background = bg!;
      d.views[mode].canvas = { ...bg!.viewBox };
      if (d.views[mode].calibration.status !== 'verified') d.views[mode].calibration = uncalibrated(bg!.viewBox);
    });
    const ui = useUI.getState();
    ui.set({ cameras: { ...ui.cameras, [mode]: null }, fitRequest: ui.fitRequest + 1 });
    ui.notify(`${file.name} · viewBox ${bg.viewBox.x} ${bg.viewBox.y} ${bg.viewBox.w} ${bg.viewBox.h}${warnings.length ? ' · ' + warnings.join(', ') : ''}`);
    if (bg.kind === 'svg') {
      const markers = detectMarkers(bg, getProject().species);
      if (markers.length) {
        pendingMarkers.list = markers;
        ui.openDialog('markers');
      }
    }
  } catch (e) {
    useUI.getState().notify('Import failed: ' + (e as Error).message);
  }
}

export async function newProject() {
  if (!confirm(tr('confirm_new'))) return;
  const lib = await loadLibrary().catch(() => null);
  const p = createProject('Untitled project', lib ?? undefined);
  useProject.getState().load(p);
  useUI.getState().set({ selection: [], cameras: { plan: null, section: null } });
}

export async function saveNow() {
  try {
    await saveProject(getProject());
    useUI.getState().notify(tr('saved'));
  } catch (e) {
    // IndexedDB unavailable (private mode): offer file download instead
    downloadText(serializeProject(getProject()), `${safeName(getProject().name)}.avs.json`, 'application/json');
    useUI.getState().notify('IndexedDB unavailable — project downloaded as file. ' + (e as Error).message);
  }
}

export async function openStoredProject(id: string) {
  const p = await loadProject(id);
  if (!p) return;
  useProject.getState().load(parseProject(JSON.stringify(p)));
  useUI.getState().set({ selection: [], cameras: { plan: null, section: null } });
}

export async function importProjectFile(): Promise<boolean> {
  const f = await pickFile('.json,application/json');
  if (!f) return false;
  try {
    const p = parseProject(await f.text());
    useProject.getState().load(p);
    useUI.getState().set({ selection: [], cameras: { plan: null, section: null } });
    return true;
  } catch (e) {
    useUI.getState().notify('Not a valid project file: ' + (e as Error).message);
    return false;
  }
}

export async function loadDemo() {
  useProject.getState().load(buildDemoProject());
  useUI.getState().set({ selection: [], cameras: { plan: null, section: null } });
}
