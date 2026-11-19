import { createProject, emptyView } from '../model/factory';
import { defaultHeightClasses, defaultLayers, DEFAULT_STYLE } from '../model/defaults';
import type { Project } from '../model/types';

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

/** Parses and normalises a project file. Throws on files that are not AVS projects. */
export function parseProject(text: string): Project {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || raw.app !== 'architectural-vegetation-studio') throw new Error('not_an_avs_project');
  if (raw.schema_version !== 1) throw new Error('unsupported_schema_version');
  const base = createProject(raw.name ?? 'Imported project');
  const p: Project = {
    ...base,
    ...raw,
    views: {
      plan: { ...emptyView('plan'), ...(raw.views?.plan ?? {}) },
      section: { ...emptyView('section'), ...(raw.views?.section ?? {}) },
    },
    layers: mergeLayers(raw.layers),
    height_classes: Array.isArray(raw.height_classes) ? raw.height_classes : defaultHeightClasses(),
    style: { ...DEFAULT_STYLE, ...(raw.style ?? {}) },
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    species: Array.isArray(raw.species) ? raw.species : base.species,
    plants: Array.isArray(raw.plants) ? raw.plants : [],
    areas: Array.isArray(raw.areas) ? raw.areas : [],
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    ground_lines: Array.isArray(raw.ground_lines) ? raw.ground_lines : [],
    id_counters: raw.id_counters ?? {},
  };
  return p;
}

function mergeLayers(raw: unknown) {
  const def = defaultLayers();
  if (!Array.isArray(raw)) return def;
  const ids = new Set(raw.map((l: { id: string }) => l.id));
  return [...raw.filter((l: { id: string }) => def.some((d) => d.id === l.id)), ...def.filter((d) => !ids.has(d.id))];
}
