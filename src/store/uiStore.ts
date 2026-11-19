import { create } from 'zustand';
import type { DrawingMode, Pt, SelItem } from '../model/types';
import type { Lang } from '../i18n';

export type Tool = 'select' | 'hand' | 'place' | 'polygon' | 'protected' | 'line' | 'ground' | 'pick' | 'calibrate';
export type ViewMode = 'composite' | 'identification' | 'vegetation' | 'original';
export type Dialog = null | 'species' | 'export' | 'ai' | 'calibrate' | 'style' | 'projects' | 'settings' | 'markers' | 'help';

export interface Camera {
  tx: number;
  ty: number;
  k: number;
}

export interface PickedElement {
  id: string | null;
  tag: string;
  points: Pt[];
  closed: boolean;
}

interface UIState {
  lang: Lang;
  tool: Tool;
  activeSpeciesId: string | null;
  selection: SelItem[];
  viewMode: ViewMode;
  preview: boolean;
  cameras: Record<DrawingMode, Camera | null>;
  dialog: Dialog;
  dialogArg: string | null;
  drawPoints: Pt[];
  calibPoints: Pt[];
  picked: PickedElement | null;
  toast: string | null;
  fitRequest: number;
  showGrid: boolean;
  set: (p: Partial<UIState>) => void;
  setSelection: (s: SelItem[]) => void;
  openDialog: (d: Dialog, arg?: string | null) => void;
  notify: (msg: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

const initialLang = ((): Lang => {
  try {
    return (localStorage.getItem('avs.lang') as Lang) || 'he';
  } catch {
    return 'he';
  }
})();

export const useUI = create<UIState>((set) => ({
  lang: initialLang,
  tool: 'select',
  activeSpeciesId: null,
  selection: [],
  viewMode: 'composite',
  preview: false,
  cameras: { plan: null, section: null },
  dialog: null,
  dialogArg: null,
  drawPoints: [],
  calibPoints: [],
  picked: null,
  toast: null,
  fitRequest: 0,
  showGrid: false,
  set: (p) => set(p),
  setSelection: (selection) => set({ selection }),
  openDialog: (dialog, dialogArg = null) => set({ dialog, dialogArg }),
  notify: (toast) => {
    set({ toast });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
}));
