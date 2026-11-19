import { create } from 'zustand';
import { produce, setAutoFreeze } from 'immer';
import type { Project } from '../model/types';
import { createProject } from '../model/factory';

setAutoFreeze(false);

const HISTORY_MAX = 120;
const COALESCE_MS = 700;

interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  lastKey: string | null;
  lastTime: number;
  revision: number;
  /** Apply a change. Changes with the same coalesce key within a short window become one undo step. */
  update: (fn: (draft: Project) => void, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  load: (p: Project) => void;
}

export const useProject = create<ProjectState>((set, get) => ({
  project: createProject(),
  past: [],
  future: [],
  lastKey: null,
  lastTime: 0,
  revision: 0,
  update: (fn, coalesceKey) => {
    const s = get();
    const next = produce(s.project, (d) => {
      fn(d);
      d.updated_at = new Date().toISOString();
    });
    if (next === s.project) return;
    const now = Date.now();
    const coalesce = !!coalesceKey && coalesceKey === s.lastKey && now - s.lastTime < COALESCE_MS;
    set({
      project: next,
      past: coalesce ? s.past : [...s.past, s.project].slice(-HISTORY_MAX),
      future: [],
      lastKey: coalesceKey ?? null,
      lastTime: now,
      revision: s.revision + 1,
    });
  },
  undo: () => {
    const s = get();
    if (!s.past.length) return;
    const prev = s.past[s.past.length - 1];
    set({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], lastKey: null, revision: s.revision + 1 });
  },
  redo: () => {
    const s = get();
    if (!s.future.length) return;
    const nxt = s.future[0];
    set({ project: nxt, past: [...s.past, s.project], future: s.future.slice(1), lastKey: null, revision: s.revision + 1 });
  },
  load: (p) => set({ project: p, past: [], future: [], lastKey: null, revision: get().revision + 1 }),
}));

export const getProject = () => useProject.getState().project;
export const updateProject = (fn: (d: Project) => void, key?: string) => useProject.getState().update(fn, key);
