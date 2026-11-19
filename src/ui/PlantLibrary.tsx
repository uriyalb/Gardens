import { memo, useMemo, useState } from 'react';
import { useProject } from '../store/projectStore';
import { useUI } from '../store/uiStore';
import { speciesName, useT } from '../i18n';
import type { Category, PlantInstance, Species, StyleSettings } from '../model/types';
import { makeContext } from '../render/style';
import { renderPlantLocal } from '../render/scene';
import { LAYER_ORDER, layerForSpecies } from '../model/defaults';
import { deleteSpecies, upsertSpecies } from '../store/actions';
import { Icons } from './controls';
import { saveLibrary } from '../persist/db';

const CATS: (Category | 'all')[] = ['all', 'tree', 'shrub', 'groundcover', 'grass', 'climber', 'custom'];

function thumbPlant(sp: Species, mode: 'plan' | 'section'): PlantInstance {
  return {
    instance_id: 'THUMB',
    species_id: sp.species_id,
    drawing_mode: mode,
    position: { x: 0, y: 0, coordinate_space: 'source_svg' },
    height_m: sp.default_height_m,
    crown_diameter_m: sp.default_crown_diameter_m,
    crown_base_height_m: sp.default_crown_base_height_m,
    trunk_width_m: sp.default_trunk_width_m,
    rotation_deg: 0,
    foliage_density: sp.foliage_density,
    canopy_transparency: sp.canopy_transparency,
    natural_irregularity: sp.natural_irregularity,
    branch_visibility: sp.branch_visibility,
    opacity: 1,
    layer: layerForSpecies(sp),
    depth_role: 'foreground',
    spatial_character: 'none',
    random_seed: 12345,
    locked: false,
    show_footprint: false,
    group_id: null,
    source_element_id: null,
    ground_line_id: null,
    verified_position: true,
  };
}

export const SpeciesThumb = memo(function SpeciesThumb({ sp, mode, style, size = 46 }: { sp: Species; mode: 'plan' | 'section'; style: StyleSettings; size?: number }) {
  const html = useMemo(() => {
    const ground = sp.category === 'grass' || sp.category === 'groundcover';
    const upm = 10;
    const R = (sp.default_crown_diameter_m * upm) / 2;
    const H = Math.max(sp.default_height_m * upm, ground ? 4 : 1);
    const ext = mode === 'plan' ? R * 1.1 : Math.max(R, H / 2) * 1.08;
    const rc = makeContext(style, upm, (ext / 22) * 1600);
    const parts = renderPlantLocal(thumbPlant(sp, mode), sp, rc, mode);
    let inner = '';
    for (const id of LAYER_ORDER) if (parts[id]) inner += parts[id];
    const vb = mode === 'plan' ? `${-ext} ${-ext} ${ext * 2} ${ext * 2}` : `${-ext} ${-ext * 2 + ext * 0.08} ${ext * 2} ${ext * 2}`;
    const groundLine = mode === 'section' ? `<line x1="${-ext}" y1="0" x2="${ext}" y2="0" stroke="#999" stroke-width="${ext / 60}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}">${groundLine}${inner}</svg>`;
  }, [sp, mode, style, size]);
  return <span className="thumb" dangerouslySetInnerHTML={{ __html: html }} />;
});

export function PlantLibrary() {
  const t = useT();
  const species = useProject((s) => s.project.species);
  const style = useProject((s) => s.project.style);
  const mode = useProject((s) => s.project.active_mode);
  const lang = useUI((s) => s.lang);
  const active = useUI((s) => s.activeSpeciesId);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const list = species.filter((s) => {
    if (cat !== 'all' && !(cat === 'custom' ? s.custom : s.category === cat)) return false;
    if (!q) return true;
    const ql = q.toLowerCase();
    return [s.common_name, s.scientific_name, s.hebrew_name, s.species_id].some((x) => x.toLowerCase().includes(ql));
  });
  const choose = (id: string) => {
    const ui = useUI.getState();
    ui.set({ activeSpeciesId: id, tool: ['polygon', 'line'].includes(ui.tool) ? ui.tool : 'place' });
  };
  const dup = (sp: Species) => {
    let code = sp.species_id + '2';
    let n = 2;
    while (species.some((s) => s.species_id === code)) code = sp.species_id + ++n;
    upsertSpecies({ ...structuredClone(sp), species_id: code, common_name: sp.common_name + ' (copy)', hebrew_name: sp.hebrew_name + ' (עותק)', custom: true }, null, false);
  };
  return (
    <aside className="sidebar library" aria-label={t('library')}>
      <div className="panel-title">
        <h2>{t('library')}</h2>
        <div className="row-gap">
          <button className="icon-btn" title={t('add_species')} onClick={() => useUI.getState().openDialog('species', null)}>
            {Icons.plus}
          </button>
          <button
            className="icon-btn"
            title={t('save_library')}
            onClick={async () => {
              await saveLibrary(species);
              useUI.getState().notify(t('saved'));
            }}
          >
            {Icons.save}
          </button>
        </div>
      </div>
      <input className="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {CATS.map((c) => (
          <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
            {c === 'all' ? t('all') : t('cat_' + c)}
          </button>
        ))}
      </div>
      <ul className="species-list">
        {list.map((sp) => (
          <li
            key={sp.species_id}
            className={'species-card' + (active === sp.species_id ? ' active' : '')}
            onClick={() => choose(sp.species_id)}
            onDoubleClick={() => useUI.getState().openDialog('species', sp.species_id)}
            draggable={false}
            data-species={sp.species_id}
          >
            <div className="thumbs">
              <SpeciesThumb sp={sp} mode="plan" style={style} />
              <SpeciesThumb sp={sp} mode="section" style={style} />
            </div>
            <div className="species-meta">
              <div className="species-top">
                <span className="swatch" style={{ background: sp.marker_color }} title={sp.marker_color} />
                <b>{sp.species_id}</b>
                <span className="hc">{sp.height_class}</span>
              </div>
              <div className="nm">{speciesName(lang, sp)}</div>
              <div className="sci">{sp.scientific_name}</div>
              <div className="sci">{lang === 'he' ? sp.common_name : sp.hebrew_name}</div>
            </div>
            <div className="card-actions" onClick={(e) => e.stopPropagation()}>
              <button className="mini" title={t('edit')} onClick={() => useUI.getState().openDialog('species', sp.species_id)}>
                ✎
              </button>
              <button className="mini" title={t('duplicate')} onClick={() => dup(sp)}>
                ⧉
              </button>
              <button
                className="mini"
                title={t('delete')}
                onClick={() => {
                  if (confirm(t('confirm_delete_species'))) deleteSpecies(sp.species_id);
                }}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="library-foot">{mode === 'plan' ? t('plan_mode') : t('section_mode')} · {list.length}</div>
    </aside>
  );
}
