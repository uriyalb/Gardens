import { useProject } from '../store/projectStore';
import { useUI } from '../store/uiStore';
import { speciesName, useT } from '../i18n';
import { Field, NumberInput, Section, Select, Slider, Toggle } from './controls';
import type { DepthRole, Distribution, LayerId, LineDistribution, PlantInstance, SpatialCharacter } from '../model/types';
import { SPATIAL_CHARACTERS, VEGETATION_LAYERS } from '../model/defaults';
import {
  applyToAllOfSpecies,
  changeSpecies,
  convertAreaToPlants,
  deleteSelection,
  duplicateSelection,
  finishShape,
  groupSelection,
  saveAsSpeciesDefaults,
  ungroupSelection,
  updateArea,
  updateLine,
  updatePlants,
  groundSnap,
} from '../store/actions';
import { generatedPlants } from '../render/scene';
import { polygonArea, yAtX } from '../geometry/polygon';
import { randomSeed } from '../geometry/rng';
import { exportPlantSvg } from '../export/svgExport';
import { downloadText } from '../export/download';
import { LayersPanel } from './LayersPanel';
import { ValidationPanel } from './ValidationPanel';
import { updateProject } from '../store/projectStore';

const SC_LABELS: Record<SpatialCharacter, [string, string]> = {
  none: ['ללא', 'None'],
  open_space: ['מרחב פתוח', 'Open space'],
  filtered_overhead_canopy: ['חופה מסננת', 'Filtered overhead canopy'],
  dense_overhead_canopy: ['חופה צפופה', 'Dense overhead canopy'],
  shaded_outdoor_room: ['חדר חוץ מוצל', 'Shaded outdoor room'],
  low_planted_boundary: ['גבול שתול נמוך', 'Low planted boundary'],
  tall_vegetated_enclosure: ['תיחום צמחי גבוה', 'Tall vegetated enclosure'],
  visual_screening: ['מסוך ויזואלי', 'Visual screening'],
  transitional_planting: ['שתילת מעבר', 'Transitional planting'],
  informal_mature_urban_garden: ['גינה עירונית בוגרת', 'Informal mature urban garden'],
};

function common<T>(vals: T[]): { v: T | null; mixed: boolean } {
  if (!vals.length) return { v: null, mixed: false };
  const f = vals[0];
  const mixed = vals.some((x) => JSON.stringify(x) !== JSON.stringify(f));
  return { v: mixed ? null : f, mixed };
}

export function PropertiesPanel() {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const selection = useUI((s) => s.selection);
  const picked = useUI((s) => s.picked);
  const tool = useUI((s) => s.tool);
  const project = useProject((s) => s.project);
  const mode = project.active_mode;
  const upm = project.views[mode].calibration.units_per_meter;
  const verified = project.views[mode].calibration.status === 'verified';
  const plants = project.plants.filter((p) => selection.some((s) => s.kind === 'plant' && s.id === p.instance_id));
  const area = selection.length === 1 && selection[0].kind === 'area' ? project.areas.find((a) => a.area_id === selection[0].id) : undefined;
  const line = selection.length === 1 && selection[0].kind === 'line' ? project.lines.find((a) => a.line_id === selection[0].id) : undefined;
  const ground = selection.length === 1 && selection[0].kind === 'ground' ? project.ground_lines.find((a) => a.ground_id === selection[0].id) : undefined;
  const spOptions = project.species.map((s) => ({ value: s.species_id, label: `${s.species_id} — ${speciesName(lang, s)}` }));
  const layerOptions = VEGETATION_LAYERS.map((l) => ({ value: l, label: t('layer_' + l) }));
  const scOptions = SPATIAL_CHARACTERS.map((c) => ({ value: c, label: SC_LABELS[c][lang === 'he' ? 0 : 1] }));
  const approx = verified ? '' : ' ≈';

  let body: React.ReactNode = <p className="muted">{t('nothing_selected')}</p>;

  if (tool === 'pick' && picked) {
    body = (
      <Section title={t('element')}>
        <p className="mono">
          &lt;{picked.tag}&gt; {picked.id ? `#${picked.id}` : ''} · {picked.points.length} {t('vertices')}
        </p>
        <div className="btn-col">
          {mode === 'section' && <button onClick={() => (finishShape('ground', picked.points, null, picked.id), useUI.getState().set({ picked: null, tool: 'select' }))}>{t('use_as_ground')}</button>}
          {picked.closed && picked.points.length >= 3 && mode === 'plan' && (
            <>
              <button
                onClick={() => {
                  finishShape('polygon', picked.points, useUI.getState().activeSpeciesId, picked.id);
                  useUI.getState().set({ picked: null, tool: 'select' });
                }}
              >
                {t('use_as_area')}
              </button>
              <button onClick={() => (finishShape('protected', picked.points, null, picked.id), useUI.getState().set({ picked: null, tool: 'select' }))}>{t('use_as_protected')}</button>
            </>
          )}
          {picked.points.length >= 2 && <button onClick={() => (finishShape('line', picked.points, useUI.getState().activeSpeciesId, picked.id), useUI.getState().set({ picked: null, tool: 'select' }))}>{t('use_as_line')}</button>}
        </div>
      </Section>
    );
  } else if (plants.length) {
    const ids = plants.map((p) => p.instance_id);
    const c = <K extends keyof PlantInstance>(k: K) => common(plants.map((p) => p[k]));
    const set = (patch: Partial<PlantInstance>, key: string) => updatePlants(ids, patch, key + ids.join());
    const one = plants.length === 1 ? plants[0] : null;
    const sp = one ? project.species.find((s) => s.species_id === one.species_id) : undefined;
    const isTree = plants.every((p) => project.species.find((s) => s.species_id === p.species_id)?.category === 'tree');
    const sc = c('species_id');
    const gl = one && mode === 'section' ? project.ground_lines.map((g) => yAtX(g.points, one.position.x)).find((y) => y !== null) : null;
    body = (
      <>
        {plants.length > 1 && (
          <p className="multi-note">
            {plants.length} {t('multi_selected')}
          </p>
        )}
        <Section title={one ? one.instance_id : t('properties')} right={one && sp ? <span className="swatch" style={{ background: sp.marker_color }} /> : null}>
          <Field label={t('species')}>
            <Select value={sc.v} mixed={sc.mixed} options={spOptions} onChange={(v) => changeSpecies(ids, v)} />
          </Field>
          {one && (
            <div className="xy">
              <Field label="x">
                <NumberInput value={one.position.x} onChange={(v) => set({ position: { ...one.position, x: v } }, 'x')} step={1} />
              </Field>
              <Field label="y">
                <NumberInput value={one.position.y} onChange={(v) => set({ position: { ...one.position, y: v } }, 'y')} step={1} />
              </Field>
            </div>
          )}
          {one && (
            <p className="muted small" dir="ltr">
              {mode === 'plan' ? 'trunk centre' : 'ground contact'} · source_svg · {one.verified_position ? t('verified') : t('approx')}
              {gl !== null && gl !== undefined ? ` · ${((gl - one.position.y) / upm).toFixed(2)} m ${t('above_ground')}` : ''}
            </p>
          )}
          {one && mode === 'section' && (
            <button
              className="small-btn"
              onClick={() => {
                const g = groundSnap(one.position);
                set({ position: { ...one.position, x: g.pt.x, y: Math.round(g.pt.y * 100) / 100 }, ground_line_id: g.ground_id }, 'snap');
              }}
            >
              {t('snap_to_ground')}
            </button>
          )}
        </Section>
        <Section title={t('properties')}>
          <Slider label={t('height') + approx} unit="m" min={0.02} max={30} step={0.05} value={c('height_m').v} mixed={c('height_m').mixed} onChange={(v) => set({ height_m: v }, 'h')} />
          <Slider label={t('crown_diameter') + approx} unit="m" min={0.1} max={30} step={0.05} value={c('crown_diameter_m').v} mixed={c('crown_diameter_m').mixed} onChange={(v) => set({ crown_diameter_m: v }, 'cd')} />
          {isTree && (
            <>
              <Slider label={t('crown_base')} unit="m" min={0} max={12} step={0.05} value={c('crown_base_height_m').v} mixed={c('crown_base_height_m').mixed} onChange={(v) => set({ crown_base_height_m: v }, 'cb')} />
              <Slider label={t('trunk_width')} unit="m" min={0.02} max={2} step={0.01} value={c('trunk_width_m').v} mixed={c('trunk_width_m').mixed} onChange={(v) => set({ trunk_width_m: v }, 'tw')} />
            </>
          )}
          {mode === 'plan' && <Slider label={t('rotation')} unit="°" min={0} max={360} step={1} value={c('rotation_deg').v} mixed={c('rotation_deg').mixed} onChange={(v) => set({ rotation_deg: v }, 'rot')} />}
          <Slider label={t('foliage_density')} min={0.05} max={1} value={c('foliage_density').v} mixed={c('foliage_density').mixed} onChange={(v) => set({ foliage_density: v }, 'fd')} />
          <Slider label={t('transparency')} min={0} max={0.95} value={c('canopy_transparency').v} mixed={c('canopy_transparency').mixed} onChange={(v) => set({ canopy_transparency: v }, 'tr')} />
          <Slider label={t('irregularity')} min={0} max={1} value={c('natural_irregularity').v} mixed={c('natural_irregularity').mixed} onChange={(v) => set({ natural_irregularity: v }, 'ir')} />
          <Slider label={t('branch_visibility')} min={0} max={1} value={c('branch_visibility').v} mixed={c('branch_visibility').mixed} onChange={(v) => set({ branch_visibility: v }, 'bv')} />
          <Slider label={t('opacity')} min={0.05} max={1} value={c('opacity').v} mixed={c('opacity').mixed} onChange={(v) => set({ opacity: v }, 'op')} />
          <Field label={t('spatial_character')}>
            <Select value={c('spatial_character').v} mixed={c('spatial_character').mixed} options={scOptions} onChange={(v) => set({ spatial_character: v }, 'sc')} />
          </Field>
          <Field label={t('layer')}>
            <Select<LayerId> value={c('layer').v} mixed={c('layer').mixed} options={layerOptions} onChange={(v) => set({ layer: v }, 'layer')} />
          </Field>
          <Field label={t('depth_role')}>
            <Select<DepthRole>
              value={c('depth_role').v}
              mixed={c('depth_role').mixed}
              options={[
                { value: 'foreground', label: lang === 'he' ? 'חזית' : 'Foreground' },
                { value: 'midground', label: lang === 'he' ? 'אמצע' : 'Midground' },
                { value: 'background', label: lang === 'he' ? 'רקע (צמחיית רקע)' : 'Background vegetation' },
              ]}
              onChange={(v) => set({ depth_role: v }, 'depth')}
            />
          </Field>
          {one && (
            <Field label={t('seed')}>
              <span className="row-gap">
                <NumberInput value={one.random_seed} step={1} onChange={(v) => set({ random_seed: Math.round(v) }, 'seed')} />
                <button className="small-btn" onClick={() => set({ random_seed: randomSeed() }, 'reseed' + Date.now())}>
                  {t('reseed')}
                </button>
              </span>
            </Field>
          )}
          <div className="toggles">
            <Toggle label={t('locked')} checked={!!c('locked').v} onChange={(v) => set({ locked: v }, 'lock')} />
            {mode === 'plan' && <Toggle label={t('footprint')} checked={!!c('show_footprint').v} onChange={(v) => set({ show_footprint: v }, 'fp')} />}
          </div>
        </Section>
        <div className="btn-col">
          <div className="row-gap wrap">
            <button onClick={duplicateSelection}>{t('duplicate')}</button>
            <button onClick={deleteSelection}>{t('delete')}</button>
            {plants.length > 1 && <button onClick={groupSelection}>{t('group')}</button>}
            {plants.some((p) => p.group_id) && <button onClick={ungroupSelection}>{t('ungroup')}</button>}
          </div>
          {one && (
            <>
              <button onClick={() => applyToAllOfSpecies(one)}>{t('apply_to_species')}</button>
              <button onClick={() => saveAsSpeciesDefaults(one)}>{t('save_as_defaults')}</button>
              <button onClick={() => changeSpecies([one.instance_id], one.species_id)}>{t('reset_defaults')}</button>
              <button onClick={() => downloadText(exportPlantSvg(project, one), `${one.instance_id}_${one.species_id}.svg`, 'image/svg+xml')}>{t('export_plant_svg')}</button>
            </>
          )}
        </div>
      </>
    );
  } else if (area) {
    const k = (s: string) => s + area.area_id;
    const gen = area.kind === 'planting' ? generatedPlants(area, project, mode) : [];
    const sp = project.species.find((s) => s.species_id === area.species_id);
    const gc = sp && (sp.category === 'grass' || sp.category === 'groundcover');
    body = (
      <>
        <Section title={`${area.kind === 'protected' ? t('protected_zone') : t('area')} · ${area.area_id}`} right={sp ? <span className="swatch" style={{ background: sp.marker_color }} /> : null}>
          <p className="muted small">
            {(polygonArea(area.points) / (upm * upm)).toFixed(1)} m²{approx} · {area.points.length} {t('vertices')}
            {area.source_element_id ? ` · ${t('source_element')}: #${area.source_element_id}` : ''}
          </p>
          <Field label={t('label')}>
            <input value={area.label} onChange={(e) => updateArea(area.area_id, { label: e.target.value }, k('label'))} />
          </Field>
          {area.kind === 'planting' && (
            <>
              <Field label={t('species')}>
                <Select value={area.species_id} options={spOptions} onChange={(v) => updateArea(area.area_id, { species_id: v })} />
              </Field>
              {!gc && (
                <>
                  <Field label={t('distribution')}>
                    <Select<Distribution>
                      value={area.distribution}
                      options={(['uniform', 'clustered', 'irregular'] as const).map((d) => ({ value: d, label: t(d) }))}
                      onChange={(v) => updateArea(area.area_id, { distribution: v })}
                    />
                  </Field>
                  <Slider label={t('spacing')} unit="m" min={0.2} max={15} step={0.05} value={area.spacing_m} onChange={(v) => updateArea(area.area_id, { spacing_m: v }, k('sp'))} />
                  <Field label={`${t('plant_count')} (${t('auto')}: 0)`}>
                    <NumberInput value={area.plant_count ?? 0} step={1} min={0} onChange={(v) => updateArea(area.area_id, { plant_count: v > 0 ? Math.round(v) : null }, k('cnt'))} />
                  </Field>
                  <Slider label={t('setback')} unit="m" min={0} max={5} step={0.05} value={area.edge_setback_m} onChange={(v) => updateArea(area.area_id, { edge_setback_m: v }, k('sb'))} />
                  <Slider label={t('plant_size')} unit="m" min={0.1} max={20} step={0.05} value={area.plant_size_m} onChange={(v) => updateArea(area.area_id, { plant_size_m: v }, k('ps'))} />
                  <Slider label={t('plant_height')} unit="m" min={0.05} max={25} step={0.05} value={area.plant_height_m} onChange={(v) => updateArea(area.area_id, { plant_height_m: v }, k('ph'))} />
                  <Slider label={t('size_variation')} min={0} max={1} value={area.size_variation} onChange={(v) => updateArea(area.area_id, { size_variation: v }, k('sv'))} />
                  <Toggle label={t('clip_boundary')} checked={area.clip_to_boundary} onChange={(v) => updateArea(area.area_id, { clip_to_boundary: v })} />
                </>
              )}
              <Slider label={t('opacity')} min={0.05} max={1} value={area.opacity} onChange={(v) => updateArea(area.area_id, { opacity: v }, k('op'))} />
              <Field label={t('spatial_character')}>
                <Select value={area.spatial_character} options={scOptions} onChange={(v) => updateArea(area.area_id, { spatial_character: v })} />
              </Field>
              <Field label={t('layer')}>
                <Select<LayerId> value={area.layer} options={layerOptions} onChange={(v) => updateArea(area.area_id, { layer: v })} />
              </Field>
              <Field label={t('seed')}>
                <span className="row-gap">
                  <NumberInput value={area.random_seed} step={1} onChange={(v) => updateArea(area.area_id, { random_seed: Math.round(v) }, k('seed'))} />
                  <button className="small-btn" onClick={() => updateArea(area.area_id, { random_seed: randomSeed() })}>
                    {t('reseed')}
                  </button>
                </span>
              </Field>
              {!gc && (
                <p className="muted small">
                  {t('generated')}: <b>{gen.length}</b>
                </p>
              )}
            </>
          )}
          <Toggle label={t('locked')} checked={area.locked} onChange={(v) => updateArea(area.area_id, { locked: v })} />
          <p className="muted small">{t('vertex_hint')}</p>
        </Section>
        <div className="btn-col">
          <div className="row-gap">
            <button onClick={duplicateSelection}>{t('duplicate')}</button>
            <button onClick={deleteSelection}>{t('delete')}</button>
          </div>
          {gen.length > 0 && <button onClick={() => convertAreaToPlants(area)}>{t('convert_to_plants')}</button>}
        </div>
      </>
    );
  } else if (line) {
    const k = (s: string) => s + line.line_id;
    const gen = generatedPlants(line, project, mode);
    const sp = project.species.find((s) => s.species_id === line.species_id);
    body = (
      <>
        <Section title={`${t('line')} · ${line.line_id}`} right={sp ? <span className="swatch" style={{ background: sp.marker_color }} /> : null}>
          <Field label={t('species')}>
            <Select value={line.species_id} options={spOptions} onChange={(v) => updateLine(line.line_id, { species_id: v })} />
          </Field>
          <Field label={t('distribution')}>
            <Select<LineDistribution> value={line.distribution} options={(['even', 'natural', 'staggered'] as const).map((d) => ({ value: d, label: t(d) }))} onChange={(v) => updateLine(line.line_id, { distribution: v })} />
          </Field>
          <Slider label={t('spacing')} unit="m" min={0.2} max={20} step={0.05} value={line.spacing_m} onChange={(v) => updateLine(line.line_id, { spacing_m: v }, k('sp'))} />
          <Field label={`${t('plant_count')} (${t('auto')}: 0)`}>
            <NumberInput value={line.plant_count ?? 0} step={1} min={0} onChange={(v) => updateLine(line.line_id, { plant_count: v > 0 ? Math.round(v) : null }, k('cnt'))} />
          </Field>
          <Slider label={t('start_offset')} unit="m" min={0} max={20} step={0.05} value={line.start_offset_m} onChange={(v) => updateLine(line.line_id, { start_offset_m: v }, k('so'))} />
          <Slider label={t('end_offset')} unit="m" min={0} max={20} step={0.05} value={line.end_offset_m} onChange={(v) => updateLine(line.line_id, { end_offset_m: v }, k('eo'))} />
          <Slider label={t('spacing_variation')} min={0} max={1} value={line.spacing_variation} onChange={(v) => updateLine(line.line_id, { spacing_variation: v }, k('var'))} />
          {mode === 'plan' && <Slider label={t('strip_width')} unit="m" min={0} max={10} step={0.05} value={line.strip_width_m} onChange={(v) => updateLine(line.line_id, { strip_width_m: v }, k('sw'))} />}
          <Slider label={t('plant_size')} unit="m" min={0.1} max={20} step={0.05} value={line.plant_size_m} onChange={(v) => updateLine(line.line_id, { plant_size_m: v }, k('ps'))} />
          <Slider label={t('plant_height')} unit="m" min={0.05} max={25} step={0.05} value={line.plant_height_m} onChange={(v) => updateLine(line.line_id, { plant_height_m: v }, k('ph'))} />
          <Slider label={t('opacity')} min={0.05} max={1} value={line.opacity} onChange={(v) => updateLine(line.line_id, { opacity: v }, k('op'))} />
          <Field label={t('layer')}>
            <Select<LayerId> value={line.layer} options={layerOptions} onChange={(v) => updateLine(line.line_id, { layer: v })} />
          </Field>
          <Field label={t('seed')}>
            <span className="row-gap">
              <NumberInput value={line.random_seed} step={1} onChange={(v) => updateLine(line.line_id, { random_seed: Math.round(v) }, k('seed'))} />
              <button className="small-btn" onClick={() => updateLine(line.line_id, { random_seed: randomSeed() })}>
                {t('reseed')}
              </button>
            </span>
          </Field>
          <p className="muted small">
            {t('generated')}: <b>{gen.length}</b>
          </p>
          <Toggle label={t('locked')} checked={line.locked} onChange={(v) => updateLine(line.line_id, { locked: v })} />
          <p className="muted small">{t('vertex_hint')}</p>
        </Section>
        <div className="btn-col">
          <div className="row-gap">
            <button onClick={duplicateSelection}>{t('duplicate')}</button>
            <button onClick={deleteSelection}>{t('delete')}</button>
          </div>
          {gen.length > 0 && <button onClick={() => convertAreaToPlants(line)}>{t('convert_to_plants')}</button>}
        </div>
      </>
    );
  } else if (ground) {
    body = (
      <>
        <Section title={`${t('ground_line')} · ${ground.ground_id}`}>
          <p className="muted small">
            {ground.points.length} {t('vertices')}
            {ground.source_element_id ? ` · ${t('source_element')}: #${ground.source_element_id}` : ''}
          </p>
          <p className="muted small">{t('vertex_hint')}</p>
        </Section>
        <div className="btn-col">
          <button onClick={deleteSelection}>{t('delete')}</button>
        </div>
      </>
    );
  }

  return (
    <aside className="sidebar props" aria-label={t('properties')}>
      <div className="panel-title">
        <h2>{t('properties')}</h2>
      </div>
      <div className="props-body">{body}</div>
      <LayersPanel />
      <ValidationPanel />
      <SettingsQuick />
    </aside>
  );
}

function SettingsQuick() {
  const t = useT();
  const s = useProject((x) => x.project.settings);
  const showGrid = useUI((x) => x.showGrid);
  const mode = useProject((x) => x.project.active_mode);
  return (
    <Section title={t('snap')}>
      <div className="toggles">
        <Toggle label={t('grid')} checked={showGrid} onChange={(v) => useUI.getState().set({ showGrid: v })} />
        <Toggle label={t('snap')} checked={s.snap_enabled} onChange={(v) => updateProject((d) => void (d.settings.snap_enabled = v))} />
        {mode === 'section' && <Toggle label={t('snap_to_ground')} checked={s.snap_to_ground} onChange={(v) => updateProject((d) => void (d.settings.snap_to_ground = v))} />}
      </div>
      <Field label={t('grid_size')}>
        <NumberInput value={s.grid_size} step={1} min={0} onChange={(v) => updateProject((d) => void (d.settings.grid_size = Math.max(0, v)), 'grid')} />
      </Field>
    </Section>
  );
}
