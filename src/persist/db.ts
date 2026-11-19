// IndexedDB persistence: projects (without large assets), assets (drawings/images), species library, styles.
import { openDB, type IDBPDatabase } from 'idb';
import type { Project, Species, StyleSettings } from '../model/types';

interface Asset {
  asset_id: string;
  svg_markup: string | null;
  data_url: string | null;
}

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbp)
    dbp = openDB('architectural-vegetation-studio', 1, {
      upgrade(d) {
        d.createObjectStore('projects', { keyPath: 'project_id' });
        d.createObjectStore('assets', { keyPath: 'asset_id' });
        d.createObjectStore('kv');
      },
    });
  return dbp;
}

export interface ProjectSummary {
  project_id: string;
  name: string;
  updated_at: string;
  plants: number;
}

export async function saveProject(p: Project): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'assets', 'kv'], 'readwrite');
  const stripped: Project = structuredClone({ ...p, views: { plan: { ...p.views.plan }, section: { ...p.views.section } } });
  for (const mode of ['plan', 'section'] as const) {
    const bg = p.views[mode].background;
    if (bg) {
      await tx.objectStore('assets').put({ asset_id: bg.asset_id, svg_markup: bg.svg_markup, data_url: bg.data_url } satisfies Asset);
      stripped.views[mode].background = { ...bg, svg_markup: null, data_url: null };
    }
  }
  await tx.objectStore('projects').put(stripped);
  await tx.objectStore('kv').put(p.project_id, 'last_project_id');
  await tx.done;
}

export async function loadProject(id: string): Promise<Project | null> {
  const d = await db();
  const p = (await d.get('projects', id)) as Project | undefined;
  if (!p) return null;
  for (const mode of ['plan', 'section'] as const) {
    const bg = p.views[mode].background;
    if (bg) {
      const a = (await d.get('assets', bg.asset_id)) as Asset | undefined;
      if (a) {
        bg.svg_markup = a.svg_markup;
        bg.data_url = a.data_url;
      }
    }
  }
  return p;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const d = await db();
  const all = (await d.getAll('projects')) as Project[];
  return all
    .map((p) => ({ project_id: p.project_id, name: p.name, updated_at: p.updated_at, plants: p.plants.length }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function deleteProject(id: string) {
  const d = await db();
  await d.delete('projects', id);
}

export async function lastProjectId(): Promise<string | null> {
  const d = await db();
  return ((await d.get('kv', 'last_project_id')) as string | undefined) ?? null;
}

export async function saveLibrary(species: Species[]) {
  const d = await db();
  await d.put('kv', species, 'species_library');
}
export async function loadLibrary(): Promise<Species[] | null> {
  const d = await db();
  return ((await d.get('kv', 'species_library')) as Species[] | undefined) ?? null;
}
export async function saveStyles(styles: StyleSettings[]) {
  const d = await db();
  await d.put('kv', styles, 'custom_styles');
}
export async function loadStyles(): Promise<StyleSettings[]> {
  const d = await db();
  return ((await d.get('kv', 'custom_styles')) as StyleSettings[] | undefined) ?? [];
}
