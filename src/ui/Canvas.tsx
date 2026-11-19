import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useProject } from '../store/projectStore';
import { useUI, type Camera } from '../store/uiStore';
import { VEGETATION_LAYERS } from '../model/defaults';
import type { LayerId, Pt, SelItem } from '../model/types';
import { backgroundMarkup } from '../import/svgImport';
import { elementPoints } from '../import/elementGeometry';
import { contextFor, plantTransform, renderAnnotations, renderArea, renderGroundLines, renderLine, renderPlantLocal, speciesMap, type LayerMarkup } from '../render/scene';
import { expandGroups, finishShape, groundSnap, moveItems, placePlant, snapPoint, updateArea, updateLine, updatePlants } from '../store/actions';
import { updateProject } from '../store/projectStore';
import { distToSegment, yAtX } from '../geometry/polygon';
import { useT } from '../i18n';

export const canvasSize = { w: 800, h: 600 };

export function fitCamera(frame: { x: number; y: number; w: number; h: number }, w: number, h: number): Camera {
  const k = Math.min(w / frame.w, h / frame.h) * 0.9;
  return { k, tx: (w - frame.w * k) / 2 - frame.x * k, ty: (h - frame.h * k) / 2 - frame.y * k };
}

type Gesture =
  | { t: 'pan'; sx: number; sy: number; cam: Camera }
  | { t: 'move'; start: Pt; items: SelItem[]; moved: boolean; toggleId?: SelItem }
  | { t: 'marquee'; start: Pt; additive: boolean }
  | { t: 'handle'; h: 'crown' | 'rotate' | 'height' | 'width' | 'vertex'; kind: SelItem['kind']; id: string; index?: number };

interface ItemRender {
  kind: 'plant' | 'area' | 'line';
  id: string;
  parts: LayerMarkup;
  transform?: string;
}

export function Canvas() {
  const t = useT();
  const project = useProject((s) => s.project);
  const ui = useUI();
  const mode = project.active_mode;
  const view = project.views[mode];
  const frame = view.background?.viewBox ?? view.canvas;
  const upm = view.calibration.units_per_meter;
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const bgRef = useRef<SVGGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const gesture = useRef<Gesture | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number; items: SelItem[] } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [space, setSpace] = useState(false);

  const cam: Camera = ui.cameras[mode] ?? fitCamera(frame, size.w, size.h);
  const setCam = (c: Camera) => useUI.getState().set({ cameras: { ...useUI.getState().cameras, [mode]: c } });

  // resize observer
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      canvasSize.w = r.width;
      canvasSize.h = r.height;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // fit requests
  useEffect(() => {
    if (ui.fitRequest) setCam(fitCamera(frame, size.w, size.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.fitRequest]);
  useEffect(() => {
    if (!ui.cameras[mode] && size.w > 10) setCam(fitCamera(frame, size.w, size.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, size.w > 10, frame.w, frame.h, frame.x, frame.y]);

  // wheel zoom (non-passive)
  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = useUI.getState().cameras[useProject.getState().project.active_mode] ?? cam;
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left,
        my = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const k = Math.max(0.01, Math.min(200, c.k * factor));
      const wx = (mx - c.tx) / c.k,
        wy = (my - c.ty) / c.k;
      setCam({ k, tx: mx - wx * k, ty: my - wy * k });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        setSpace(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const rc = useMemo(() => contextFor(project, mode), [project.style, upm, frame.w, frame.h, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const spMap = useMemo(() => speciesMap(project), [project.species]);

  const items: ItemRender[] = useMemo(() => {
    const out: ItemRender[] = [];
    for (const a of project.areas) if (a.drawing_mode === mode) out.push({ kind: 'area', id: a.area_id, parts: renderArea(a, project, rc, mode) });
    for (const l of project.lines) if (l.drawing_mode === mode) out.push({ kind: 'line', id: l.line_id, parts: renderLine(l, project, rc, mode) });
    for (const p of project.plants) {
      if (p.drawing_mode !== mode) continue;
      const sp = spMap.get(p.species_id);
      if (!sp) continue;
      out.push({ kind: 'plant', id: p.instance_id, parts: renderPlantLocal(p, sp, rc, mode), transform: plantTransform(p, mode) });
    }
    return out;
  }, [project.areas, project.lines, project.plants, project.species, rc, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const bgHtml = useMemo(() => backgroundMarkup(view.background), [view.background]);
  const overlayHtml = useMemo(() => bgHtml.replace(/\sid="[^"]*"/g, ''), [bgHtml]);
  const annotations = useMemo(() => (ui.viewMode === 'identification' ? renderAnnotations(project, mode, rc) : ''), [ui.viewMode, project, mode, rc]);
  const groundHtml = useMemo(() => (mode === 'section' && !ui.preview ? renderGroundLines(project, rc) : ''), [project.ground_lines, mode, rc, ui.preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const layerState = new Map(project.layers.map((l) => [l.id, l]));
  const showBg = ui.viewMode !== 'vegetation';
  const showVeg = ui.viewMode === 'composite' || ui.viewMode === 'vegetation';
  const dragOffset = (kind: string, id: string) => (drag && drag.items.some((s) => s.kind === kind && s.id === id) ? `translate(${drag.dx} ${drag.dy}) ` : '');

  const toDoc = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - cam.tx) / cam.k, y: (e.clientY - r.top - cam.ty) / cam.k };
  };

  // ---------- pointer handling ----------
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toDoc(e);
    const st = useUI.getState();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || space || st.tool === 'hand') {
      gesture.current = { t: 'pan', sx: e.clientX, sy: e.clientY, cam };
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as Element;
    const handle = target.closest('[data-handle]') as SVGElement | null;
    if (handle && st.tool === 'select') {
      const h = handle.dataset.handle as 'crown' | 'rotate' | 'height' | 'width' | 'vertex';
      const kind = handle.dataset.kind as SelItem['kind'];
      const id = handle.dataset.id!;
      const index = handle.dataset.index ? parseInt(handle.dataset.index) : undefined;
      if (h === 'vertex' && e.altKey && index !== undefined) {
        deleteVertex(kind, id, index);
        return;
      }
      gesture.current = { t: 'handle', h, kind, id, index };
      return;
    }
    switch (st.tool) {
      case 'select': {
        const hit = target.closest('[data-hit]') as SVGElement | null;
        if (hit) {
          const item: SelItem = { kind: hit.dataset.kind as SelItem['kind'], id: hit.dataset.id! };
          let sel = st.selection;
          const already = sel.some((s) => s.kind === item.kind && s.id === item.id);
          if (e.shiftKey) {
            if (!already) sel = expandGroups(project, [...sel, item]);
          } else if (!already) sel = e.altKey ? [item] : expandGroups(project, [item]);
          st.setSelection(sel);
          gesture.current = { t: 'move', start: p, items: sel, moved: false, toggleId: e.shiftKey && already ? item : undefined };
        } else {
          gesture.current = { t: 'marquee', start: p, additive: e.shiftKey };
          if (!e.shiftKey) st.setSelection([]);
        }
        return;
      }
      case 'place': {
        if (!st.activeSpeciesId) {
          st.notify(t('hint_place'));
          return;
        }
        placePlant(p, st.activeSpeciesId);
        return;
      }
      case 'polygon':
      case 'protected':
      case 'line':
      case 'ground': {
        const sp = snapVertex(snapPoint(p));
        const last = st.drawPoints[st.drawPoints.length - 1];
        if (last && Math.hypot(last.x - sp.x, last.y - sp.y) * cam.k < 3) return; // ignore repeated clicks (e.g. double-click to finish)
        st.set({ drawPoints: [...st.drawPoints, sp] });
        return;
      }
      case 'calibrate': {
        const pts = [...st.calibPoints, snapPoint(p)];
        if (pts.length >= 2) {
          st.set({ calibPoints: pts.slice(0, 2) });
          st.openDialog('calibrate', 'two_point');
        } else st.set({ calibPoints: pts });
        return;
      }
      case 'pick': {
        pickElement(target);
        return;
      }
    }
  };

  const snapVertex = (p: Pt): Pt => {
    const tol = 8 / cam.k;
    for (const a of project.areas) if (a.drawing_mode === mode) for (const v of a.points) if (Math.hypot(v.x - p.x, v.y - p.y) < tol) return { ...v };
    const dp = useUI.getState().drawPoints;
    if (dp.length > 2 && Math.hypot(dp[0].x - p.x, dp[0].y - p.y) < tol) return { ...dp[0] };
    return p;
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toDoc(e);
    setHover(p);
    const g = gesture.current;
    if (!g) return;
    if (g.t === 'pan') {
      setCam({ k: g.cam.k, tx: g.cam.tx + (e.clientX - g.sx), ty: g.cam.ty + (e.clientY - g.sy) });
    } else if (g.t === 'move') {
      let dx = p.x - g.start.x,
        dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx * cam.k, dy * cam.k) < 3) return;
      g.moved = true;
      const s = project.settings;
      if (s.snap_enabled && s.grid_size > 0) {
        dx = Math.round(dx / s.grid_size) * s.grid_size;
        dy = Math.round(dy / s.grid_size) * s.grid_size;
      }
      setDrag({ dx, dy, items: g.items.filter((it) => !isLocked(it)) });
    } else if (g.t === 'marquee') {
      setMarquee({ a: g.start, b: p });
    } else if (g.t === 'handle') {
      handleDrag(g, p);
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.t === 'move') {
      if (g.moved && drag) {
        if (mode === 'section' && project.settings.snap_to_ground) {
          // keep plant bases on the ground line after moving horizontally
          moveItems(drag.items.filter((s) => s.kind !== 'plant'), drag.dx, drag.dy);
          const plants = drag.items.filter((s) => s.kind === 'plant');
          updateProject((d) => {
            for (const s of plants) {
              const pl = d.plants.find((x) => x.instance_id === s.id);
              if (!pl || pl.locked) continue;
              const target = { x: pl.position.x + drag.dx, y: pl.position.y + drag.dy };
              const gs = groundSnap(target);
              pl.position.x = Math.round(gs.pt.x * 100) / 100;
              pl.position.y = Math.round(gs.pt.y * 100) / 100;
              pl.ground_line_id = gs.ground_id;
            }
          });
        } else moveItems(drag.items, drag.dx, drag.dy);
      } else if (!g.moved && g.toggleId) {
        const st = useUI.getState();
        st.setSelection(st.selection.filter((s) => !(s.kind === g.toggleId!.kind && s.id === g.toggleId!.id)));
      }
      setDrag(null);
    } else if (g.t === 'marquee' && marquee) {
      const x0 = Math.min(marquee.a.x, marquee.b.x),
        x1 = Math.max(marquee.a.x, marquee.b.x),
        y0 = Math.min(marquee.a.y, marquee.b.y),
        y1 = Math.max(marquee.a.y, marquee.b.y);
      const inside = (q: Pt) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
      const found: SelItem[] = [];
      project.plants.forEach((pl) => pl.drawing_mode === mode && !isLocked({ kind: 'plant', id: pl.instance_id }) && inside(pl.position) && found.push({ kind: 'plant', id: pl.instance_id }));
      project.areas.forEach((a) => a.drawing_mode === mode && !a.locked && a.points.every(inside) && found.push({ kind: 'area', id: a.area_id }));
      project.lines.forEach((a) => a.drawing_mode === mode && !a.locked && a.points.every(inside) && found.push({ kind: 'line', id: a.line_id }));
      const st = useUI.getState();
      st.setSelection(g.additive ? [...st.selection, ...found.filter((f) => !st.selection.some((s) => s.kind === f.kind && s.id === f.id))] : found);
      setMarquee(null);
    } else if (g.t === 'marquee') {
      setMarquee(null);
    }
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = useUI.getState();
    if (['polygon', 'protected', 'line', 'ground'].includes(st.tool)) {
      finishDrawing();
      return;
    }
    if (st.tool === 'select' && st.selection.length === 1 && st.selection[0].kind !== 'plant') {
      const s = st.selection[0];
      const p = toDoc(e);
      insertVertex(s, p);
    }
  };

  const finishDrawing = () => {
    const st = useUI.getState();
    const tool = st.tool as 'polygon' | 'protected' | 'line' | 'ground';
    const k = useUI.getState().cameras[useProject.getState().project.active_mode]?.k ?? 1;
    const pts = st.drawPoints.filter((q, i, a) => i === 0 || Math.hypot(q.x - a[i - 1].x, q.y - a[i - 1].y) * k >= 3);
    if (tool === 'polygon' || tool === 'protected') while (pts.length > 3 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) * k < 3) pts.pop();
    finishShape(tool, pts, st.activeSpeciesId);
    st.set({ drawPoints: [], tool: 'select' });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const st = useUI.getState();
      if (e.key === 'Enter' && st.drawPoints.length) finishDrawing();
      if (e.key === 'Escape') st.set({ drawPoints: [], calibPoints: [], picked: null });
      if (e.key === 'Backspace' && st.drawPoints.length) {
        st.set({ drawPoints: st.drawPoints.slice(0, -1) });
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, []);

  function isLocked(it: SelItem): boolean {
    if (it.kind === 'plant') {
      const pl = project.plants.find((x) => x.instance_id === it.id);
      return !pl || pl.locked || !!layerState.get(pl.layer)?.locked;
    }
    if (it.kind === 'area') {
      const a = project.areas.find((x) => x.area_id === it.id);
      return !a || a.locked || !!layerState.get(a.layer)?.locked;
    }
    if (it.kind === 'line') {
      const a = project.lines.find((x) => x.line_id === it.id);
      return !a || a.locked || !!layerState.get(a.layer)?.locked;
    }
    return false;
  }

  function handleDrag(g: Extract<Gesture, { t: 'handle' }>, p: Pt) {
    const key = `handle-${g.h}-${g.id}`;
    if (g.kind === 'plant') {
      const pl = project.plants.find((x) => x.instance_id === g.id);
      if (!pl || pl.locked) return;
      const { x, y } = pl.position;
      if (g.h === 'crown') updatePlants([g.id], { crown_diameter_m: round2(Math.max(0.1, (Math.hypot(p.x - x, p.y - y) * 2) / upm)) }, key);
      else if (g.h === 'rotate') updatePlants([g.id], { rotation_deg: Math.round(((Math.atan2(p.y - y, p.x - x) * 180) / Math.PI + 90 + 360) % 360) }, key);
      else if (g.h === 'height') {
        const h = Math.max(0.05, (y - p.y) / upm);
        updatePlants([g.id], (q) => {
          q.height_m = round2(h);
          if (q.crown_base_height_m >= q.height_m) q.crown_base_height_m = round2(q.height_m * 0.3);
        }, key);
      } else if (g.h === 'width') updatePlants([g.id], { crown_diameter_m: round2(Math.max(0.1, (Math.abs(p.x - x) * 2) / upm)) }, key);
      return;
    }
    if (g.h === 'vertex' && g.index !== undefined) {
      const sp = snapPoint(p);
      updateProject((d) => {
        const obj = g.kind === 'area' ? d.areas.find((a) => a.area_id === g.id) : g.kind === 'line' ? d.lines.find((a) => a.line_id === g.id) : d.ground_lines.find((a) => a.ground_id === g.id);
        if (!obj || (obj as { locked?: boolean }).locked) return;
        obj.points[g.index!] = { x: round2(sp.x), y: round2(sp.y) };
      }, key);
    }
  }

  function deleteVertex(kind: SelItem['kind'], id: string, index: number) {
    updateProject((d) => {
      const obj = kind === 'area' ? d.areas.find((a) => a.area_id === id) : kind === 'line' ? d.lines.find((a) => a.line_id === id) : d.ground_lines.find((a) => a.ground_id === id);
      if (!obj) return;
      const min = kind === 'area' ? 3 : 2;
      if (obj.points.length > min) obj.points.splice(index, 1);
    });
  }

  function insertVertex(s: SelItem, p: Pt) {
    updateProject((d) => {
      const obj = s.kind === 'area' ? d.areas.find((a) => a.area_id === s.id) : s.kind === 'line' ? d.lines.find((a) => a.line_id === s.id) : d.ground_lines.find((a) => a.ground_id === s.id);
      if (!obj) return;
      const closed = s.kind === 'area';
      let best = -1,
        bd = Infinity;
      const n = obj.points.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const dd = distToSegment(p, obj.points[i], obj.points[(i + 1) % n]);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      if (best >= 0 && bd * cam.k < 14) obj.points.splice(best + 1, 0, { x: round2(p.x), y: round2(p.y) });
    });
  }

  function pickElement(target: Element) {
    const bg = bgRef.current;
    if (!bg || !bg.contains(target) || target === bg) {
      useUI.getState().set({ picked: null });
      return;
    }
    const geo = target.closest('path,rect,polygon,polyline,line,circle,ellipse') as SVGGraphicsElement | null;
    if (!geo) return;
    const world = worldRef.current!;
    const toDocM = world.getScreenCTM()!.inverse().multiply(geo.getScreenCTM()!);
    const res = elementPoints(geo, toDocM, 3);
    if (!res) return;
    const idEl = geo.closest('[id]');
    useUI.getState().set({ picked: { id: idEl && bg.contains(idEl) ? idEl.id : null, tag: geo.tagName.toLowerCase(), points: res.points, closed: res.closed } });
  }

  // ---------- rendering ----------
  const k = cam.k;
  const px = 1 / k;
  const layerContent = (id: LayerId) => {
    if (id === 'background') return showBg && bgHtml ? <g ref={bgRef} className="bg-layer" style={{ pointerEvents: ui.tool === 'pick' ? 'auto' : 'none' }} dangerouslySetInnerHTML={{ __html: bgHtml }} /> : null;
    if (id === 'architectural_overlay') return showBg && showVeg && overlayHtml ? <g style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: overlayHtml }} /> : null;
    if (id === 'annotations') return <g style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: annotations + groundHtml }} />;
    if (!showVeg || !VEGETATION_LAYERS.includes(id)) return null;
    return items.map((it) => {
      const s = it.parts[id];
      if (!s) return null;
      const tr = dragOffset(it.kind, it.id) + (it.transform ?? '');
      return <g key={it.kind + it.id} transform={tr || undefined} style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: s }} />;
    });
  };

  const selectedOverlay = () => {
    if (ui.preview) return null;
    const out: React.ReactNode[] = [];
    const single = ui.selection.length === 1;
    for (const s of ui.selection) {
      const off = drag && drag.items.some((d) => d.kind === s.kind && d.id === s.id) ? { dx: drag.dx, dy: drag.dy } : { dx: 0, dy: 0 };
      if (s.kind === 'plant') {
        const pl = project.plants.find((x) => x.instance_id === s.id);
        if (!pl || pl.drawing_mode !== mode) continue;
        const x = pl.position.x + off.dx,
          y = pl.position.y + off.dy;
        const R = (pl.crown_diameter_m * upm) / 2;
        if (mode === 'plan') {
          out.push(
            <g key={'sel' + s.id}>
              <circle cx={x} cy={y} r={R} className="sel-outline" strokeWidth={1.4 * px} strokeDasharray={`${5 * px} ${3 * px}`} />
              <path d={`M${x - 6 * px} ${y}H${x + 6 * px}M${x} ${y - 6 * px}V${y + 6 * px}`} className="sel-outline" strokeWidth={1.4 * px} />
              {single && !pl.locked && (
                <>
                  <line x1={x} y1={y - R} x2={x} y2={y - R - 22 * px} className="sel-outline" strokeWidth={px} />
                  <circle data-handle="rotate" data-kind="plant" data-id={s.id} cx={x + Math.sin((pl.rotation_deg * Math.PI) / 180) * 0} cy={y - R - 22 * px} r={6 * px} className="handle round" strokeWidth={1.2 * px} />
                  <rect data-handle="crown" data-kind="plant" data-id={s.id} x={x + R - 5 * px} y={y - 5 * px} width={10 * px} height={10 * px} className="handle" strokeWidth={1.2 * px} />
                </>
              )}
            </g>,
          );
        } else {
          const H = pl.height_m * upm;
          const Hb = pl.crown_base_height_m * upm;
          out.push(
            <g key={'sel' + s.id}>
              <rect x={x - R} y={y - H} width={2 * R} height={H} className="sel-outline" strokeWidth={1.2 * px} strokeDasharray={`${5 * px} ${3 * px}`} />
              <path d={`M${x - 7 * px} ${y + 7 * px}L${x} ${y}L${x + 7 * px} ${y + 7 * px}Z`} className="sel-base" strokeWidth={px} />
              {single && !pl.locked && (
                <>
                  <rect data-handle="height" data-kind="plant" data-id={s.id} x={x - 5 * px} y={y - H - 5 * px} width={10 * px} height={10 * px} className="handle" strokeWidth={1.2 * px} />
                  <rect data-handle="width" data-kind="plant" data-id={s.id} x={x + R - 5 * px} y={y - Hb - (H - Hb) / 2 - 5 * px} width={10 * px} height={10 * px} className="handle" strokeWidth={1.2 * px} />
                </>
              )}
            </g>,
          );
        }
      } else {
        const obj = s.kind === 'area' ? project.areas.find((a) => a.area_id === s.id) : s.kind === 'line' ? project.lines.find((a) => a.line_id === s.id) : project.ground_lines.find((a) => a.ground_id === s.id);
        if (!obj) continue;
        const pts = obj.points.map((q) => ({ x: q.x + off.dx, y: q.y + off.dy }));
        const d = 'M' + pts.map((q) => `${q.x} ${q.y}`).join('L') + (s.kind === 'area' ? 'Z' : '');
        out.push(
          <g key={'sel' + s.kind + s.id}>
            <path d={d} className="sel-outline" fill="none" strokeWidth={2 * px} />
            {single &&
              !(obj as { locked?: boolean }).locked &&
              pts.map((q, i) => <circle key={i} data-handle="vertex" data-kind={s.kind} data-id={s.id} data-index={i} cx={q.x} cy={q.y} r={5 * px} className="handle round" strokeWidth={1.2 * px} />)}
          </g>,
        );
      }
    }
    return out;
  };

  const hitLayer = () => {
    if (ui.tool !== 'select' || ui.preview) return null;
    const out: React.ReactNode[] = [];
    const visibleLayer = (l: LayerId) => layerState.get(l)?.visible !== false && !layerState.get(l)?.locked;
    for (const a of project.areas) {
      if (a.drawing_mode !== mode || a.locked || !visibleLayer(a.layer)) continue;
      out.push(<path key={'h' + a.area_id} data-hit data-kind="area" data-id={a.area_id} d={'M' + a.points.map((q) => `${q.x} ${q.y}`).join('L') + 'Z'} fill="transparent" stroke="transparent" strokeWidth={8 * px} />);
    }
    for (const l of project.lines) {
      if (l.drawing_mode !== mode || l.locked || !visibleLayer(l.layer)) continue;
      out.push(<path key={'h' + l.line_id} data-hit data-kind="line" data-id={l.line_id} d={'M' + l.points.map((q) => `${q.x} ${q.y}`).join('L')} fill="none" stroke="transparent" strokeWidth={Math.max(14 * px, l.strip_width_m * upm)} />);
    }
    if (mode === 'section')
      for (const gl of project.ground_lines)
        out.push(<path key={'h' + gl.ground_id} data-hit data-kind="ground" data-id={gl.ground_id} d={'M' + gl.points.map((q) => `${q.x} ${q.y}`).join('L')} fill="none" stroke="transparent" strokeWidth={8 * px} />);
    const plants = project.plants.filter((p) => p.drawing_mode === mode && !p.locked && visibleLayer(p.layer)).sort((a, b) => b.crown_diameter_m - a.crown_diameter_m);
    for (const p of plants) {
      const R = Math.max((p.crown_diameter_m * upm) / 2, 7 * px);
      const { x, y } = p.position;
      out.push(
        mode === 'plan' ? (
          <circle key={'h' + p.instance_id} data-hit data-kind="plant" data-id={p.instance_id} cx={x} cy={y} r={R} fill="transparent" />
        ) : (
          <rect key={'h' + p.instance_id} data-hit data-kind="plant" data-id={p.instance_id} x={x - R} y={y - Math.max(p.height_m * upm, 7 * px)} width={2 * R} height={Math.max(p.height_m * upm, 7 * px)} fill="transparent" />
        ),
      );
    }
    return <g className="hit-layer">{out}</g>;
  };

  const drawingPreview = () => {
    const dp = ui.drawPoints;
    if (!dp.length) return null;
    const pts = hover ? [...dp, snapVertex(snapPoint(hover))] : dp;
    const closed = ui.tool === 'polygon' || ui.tool === 'protected';
    const d = 'M' + pts.map((q) => `${q.x} ${q.y}`).join('L') + (closed && pts.length > 2 ? 'Z' : '');
    return (
      <g className="draw-preview">
        <path d={d} strokeWidth={1.6 * px} strokeDasharray={`${6 * px} ${4 * px}`} fill={closed ? 'rgba(40,110,220,0.08)' : 'none'} />
        {dp.map((q, i) => (
          <circle key={i} cx={q.x} cy={q.y} r={4 * px} strokeWidth={px} />
        ))}
      </g>
    );
  };

  const pickedOverlay = () => {
    const pk = ui.picked;
    if (!pk || ui.tool !== 'pick') return null;
    const d = 'M' + pk.points.map((q) => `${q.x} ${q.y}`).join('L') + (pk.closed ? 'Z' : '');
    return <path d={d} className="picked" strokeWidth={3 * px} fill={pk.closed ? 'rgba(255,140,0,0.12)' : 'none'} />;
  };

  const calibOverlay = () => {
    const cp = ui.calibPoints;
    if (!cp.length) return null;
    const pts = cp.length === 1 && hover ? [cp[0], hover] : cp;
    return (
      <g className="calib">
        <path d={'M' + pts.map((q) => `${q.x} ${q.y}`).join('L')} strokeWidth={1.5 * px} />
        {cp.map((q, i) => (
          <path key={i} d={`M${q.x - 8 * px} ${q.y}H${q.x + 8 * px}M${q.x} ${q.y - 8 * px}V${q.y + 8 * px}`} strokeWidth={1.5 * px} />
        ))}
      </g>
    );
  };

  const placeGhost = () => {
    if (ui.tool !== 'place' || !hover || !ui.activeSpeciesId) return null;
    const sp = spMap.get(ui.activeSpeciesId);
    if (!sp) return null;
    let p = snapPoint(hover);
    if (mode === 'section') p = groundSnap(p).pt;
    const R = (sp.default_crown_diameter_m * upm) / 2;
    return mode === 'plan' ? (
      <g className="ghost">
        <circle cx={p.x} cy={p.y} r={R} strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />
        <circle cx={p.x} cy={p.y} r={3 * px} fill={sp.marker_color} />
      </g>
    ) : (
      <g className="ghost">
        <rect x={p.x - R} y={p.y - sp.default_height_m * upm} width={2 * R} height={sp.default_height_m * upm} strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />
        <circle cx={p.x} cy={p.y} r={3 * px} fill={sp.marker_color} />
      </g>
    );
  };

  const grid = () => {
    const gs = project.settings.grid_size;
    if (!ui.showGrid || !(gs > 0) || ui.preview) return null;
    if (gs * k < 6) return null;
    return (
      <>
        <defs>
          <pattern id="avs-grid" width={gs} height={gs} patternUnits="userSpaceOnUse" x={frame.x} y={frame.y}>
            <path d={`M${gs} 0H0V${gs}`} fill="none" stroke="#c9d3e0" strokeWidth={0.6 * px} />
          </pattern>
        </defs>
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="url(#avs-grid)" pointerEvents="none" />
      </>
    );
  };

  const cursor = space || ui.tool === 'hand' ? 'grab' : ui.tool === 'select' ? 'default' : ui.tool === 'pick' ? 'pointer' : 'crosshair';
  const hintKey: Record<string, string> = {
    select: 'hint_select',
    place: mode === 'section' ? 'hint_place_section' : 'hint_place',
    polygon: 'hint_poly',
    protected: 'hint_poly',
    line: 'hint_line',
    ground: 'hint_line',
    pick: 'hint_pick',
    calibrate: 'hint_calib',
    hand: 'tool_hand',
  };
  const groundInfo = () => {
    if (mode !== 'section' || !hover) return '';
    for (const gl of project.ground_lines) {
      const y = yAtX(gl.points, hover.x);
      if (y !== null) return ` · ${((y - hover.y) / upm).toFixed(2)} m ${t('above_ground')}`;
    }
    return '';
  };

  return (
    <div className={'canvas-wrap' + (ui.preview ? ' preview' : '')} ref={wrapRef}>
      <svg
        ref={svgRef}
        className="canvas"
        width={size.w}
        height={size.h}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="canvas"
      >
        <g ref={worldRef} transform={`translate(${cam.tx} ${cam.ty}) scale(${k})`}>
          <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill={project.style.background_color} className="paper" style={{ pointerEvents: 'none' }} />
          {grid()}
          {project.layers.map((L) => {
            if (!L.visible) return null;
            const op = L.id === 'background' && ui.viewMode === 'identification' ? L.opacity * 0.45 : L.opacity;
            return (
              <g key={L.id} data-layer={L.id} opacity={op}>
                {layerContent(L.id)}
              </g>
            );
          })}
          {hitLayer()}
          {selectedOverlay()}
          {pickedOverlay()}
          {drawingPreview()}
          {calibOverlay()}
          {placeGhost()}
          {marquee && (
            <rect className="marquee" x={Math.min(marquee.a.x, marquee.b.x)} y={Math.min(marquee.a.y, marquee.b.y)} width={Math.abs(marquee.b.x - marquee.a.x)} height={Math.abs(marquee.b.y - marquee.a.y)} strokeWidth={px} />
          )}
        </g>
      </svg>
      {!ui.preview && (
        <div className="canvas-status">
          <span>{t(hintKey[ui.tool] ?? '')}</span>
          {hover && (
            <span className="coords" dir="ltr">
              x {hover.x.toFixed(1)} · y {hover.y.toFixed(1)} · ({((hover.x - frame.x) / upm).toFixed(2)} m, {((hover.y - frame.y) / upm).toFixed(2)} m){view.calibration.status !== 'verified' ? ' ≈' : ''}
              {groundInfo()} · {Math.round(k * 100)}%
            </span>
          )}
        </div>
      )}
      {!view.background && !ui.preview && <div className="canvas-empty">{t('no_background')}</div>}
    </div>
  );
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function zoomBy(factor: number) {
  const st = useUI.getState();
  const mode = useProject.getState().project.active_mode;
  const c = st.cameras[mode];
  if (!c) return;
  const mx = canvasSize.w / 2,
    my = canvasSize.h / 2;
  const k = Math.max(0.01, Math.min(200, c.k * factor));
  const wx = (mx - c.tx) / c.k,
    wy = (my - c.ty) / c.k;
  st.set({ cameras: { ...st.cameras, [mode]: { k, tx: mx - wx * k, ty: my - wy * k } } });
}

// re-export to keep imports tidy for panels
export { updateArea, updateLine };
