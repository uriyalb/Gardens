import { useState } from 'react';
import { useProject } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { useT } from '../../i18n';
import { Field, Modal, NumberInput, Select, Slider, Toggle } from '../controls';
import type { Category, HeightClassId, PlanRenderer, SectionRenderer, Species } from '../../model/types';
import { MARKER_PALETTE } from '../../model/defaults';
import { upsertSpecies } from '../../store/actions';
import { SpeciesThumb } from '../PlantLibrary';
import { colorDistance } from '../../render/style';

const PLAN_R: PlanRenderer[] = ['feathery_irregular_canopy', 'dense_rounded_canopy', 'granular_asymmetric_canopy', 'simple_round_canopy', 'compact_mound', 'fine_upright_mound', 'linear_leaf_mass', 'lawn_surface', 'groundcover_texture'];
const SEC_R: SectionRenderer[] = ['branching_airy_tree', 'broad_layered_tree', 'twisted_olive_tree', 'simple_round_tree', 'compact_shrub', 'upright_stem_shrub', 'woody_spreading_shrub', 'grass_strip'];
const CATS: Category[] = ['tree', 'shrub', 'groundcover', 'grass', 'climber', 'custom'];
const HC: HeightClassId[] = ['G0', 'S1', 'S2', 'T1', 'T2'];

function blank(existing: Species[]): Species {
  const color = MARKER_PALETTE.find((c) => existing.every((s) => colorDistance(s.marker_color, c) > 60)) ?? '#888888';
  let n = 1;
  while (existing.some((s) => s.species_id === 'SP' + n)) n++;
  return {
    species_id: 'SP' + n,
    scientific_name: '',
    common_name: 'New species',
    hebrew_name: 'מין חדש',
    category: 'shrub',
    marker_color: color,
    height_class: 'S1',
    default_height_m: 1,
    default_crown_diameter_m: 1,
    default_crown_base_height_m: 0,
    default_trunk_width_m: 0.05,
    growth_habit: 'rounded',
    foliage_type: 'medium',
    foliage_density: 0.7,
    canopy_transparency: 0.15,
    branch_visibility: 0.3,
    natural_irregularity: 0.5,
    plan_renderer: 'compact_mound',
    section_renderer: 'compact_shrub',
    foliage_colors: ['#8A9E7C', '#A3B394', '#6F8463'],
    flower_color: null,
    custom: true,
  };
}

export function SpeciesEditor() {
  const t = useT();
  const arg = useUI((s) => s.dialogArg);
  const project = useProject((s) => s.project);
  const orig = arg ? project.species.find((s) => s.species_id === arg) : undefined;
  const [sp, setSp] = useState<Species>(() => (orig ? structuredClone(orig) : blank(project.species)));
  const [applyAll, setApplyAll] = useState(false);
  const close = () => useUI.getState().openDialog(null);
  const s = <K extends keyof Species>(k: K, v: Species[K]) => setSp((x) => ({ ...x, [k]: v }));
  const codeClash = project.species.some((x) => x.species_id === sp.species_id && x.species_id !== orig?.species_id);
  const colorClash = project.species.find((x) => x.species_id !== orig?.species_id && colorDistance(x.marker_color, sp.marker_color) < 40);
  const others = project.species.filter((x) => x.species_id !== sp.species_id);
  const save = () => {
    if (codeClash || !sp.species_id.trim()) return;
    upsertSpecies({ ...sp, species_id: sp.species_id.trim().toUpperCase() }, orig?.species_id ?? null, applyAll);
    close();
  };
  return (
    <Modal
      title={orig ? `${t('edit')} · ${orig.species_id}` : t('add_species')}
      onClose={close}
      wide
      footer={
        <>
          {orig && <Toggle label="Apply new dimension defaults to all existing instances" checked={applyAll} onChange={setApplyAll} />}
          <button onClick={close}>{t('cancel')}</button>
          <button className="primary" onClick={save} disabled={codeClash}>
            {t('ok')}
          </button>
        </>
      }
    >
      <div className="editor-grid">
        <div>
          <Field label="species_id (code)">
            <input value={sp.species_id} onChange={(e) => s('species_id', e.target.value.toUpperCase())} className={codeClash ? 'bad' : ''} />
          </Field>
          {codeClash && <p className="err small">Duplicate code</p>}
          <Field label="Scientific name">
            <input value={sp.scientific_name} onChange={(e) => s('scientific_name', e.target.value)} dir="ltr" />
          </Field>
          <Field label="Common name">
            <input value={sp.common_name} onChange={(e) => s('common_name', e.target.value)} dir="ltr" />
          </Field>
          <Field label="שם עברי">
            <input value={sp.hebrew_name} onChange={(e) => s('hebrew_name', e.target.value)} dir="rtl" />
          </Field>
          <Field label="Category">
            <Select<Category> value={sp.category} options={CATS.map((c) => ({ value: c, label: t('cat_' + c) }))} onChange={(v) => s('category', v)} />
          </Field>
          <Field label="Height class">
            <Select<HeightClassId> value={sp.height_class} options={HC.map((c) => ({ value: c, label: c }))} onChange={(v) => s('height_class', v)} />
          </Field>
          <Field label="Marker colour (identification only)">
            <span className="row-gap">
              <input type="color" value={sp.marker_color} onChange={(e) => s('marker_color', e.target.value.toUpperCase())} />
              <input value={sp.marker_color} onChange={(e) => s('marker_color', e.target.value)} dir="ltr" style={{ width: 90 }} />
            </span>
          </Field>
          {colorClash && <p className="warn small">Marker colour too close to {colorClash.species_id}</p>}
          <Field label="Botanical colours">
            <span className="row-gap">
              {sp.foliage_colors.map((c, i) => (
                <input key={i} type="color" value={c} onChange={(e) => s('foliage_colors', sp.foliage_colors.map((x, j) => (j === i ? e.target.value : x)))} />
              ))}
              <input type="color" value={sp.flower_color ?? '#9a8ab3'} onChange={(e) => s('flower_color', e.target.value)} title="flower" />
              <Toggle label="flowers" checked={!!sp.flower_color} onChange={(v) => s('flower_color', v ? sp.flower_color ?? '#9A8AB3' : null)} />
            </span>
          </Field>
          <Field label="Plan renderer">
            <Select<PlanRenderer> value={sp.plan_renderer} options={PLAN_R.map((r) => ({ value: r, label: r }))} onChange={(v) => s('plan_renderer', v)} />
          </Field>
          <Field label="Section renderer">
            <Select<SectionRenderer> value={sp.section_renderer} options={SEC_R.map((r) => ({ value: r, label: r }))} onChange={(v) => s('section_renderer', v)} />
          </Field>
          <Field label="Growth habit">
            <input value={sp.growth_habit} onChange={(e) => s('growth_habit', e.target.value)} dir="ltr" />
          </Field>
          <Field label="Foliage type">
            <input value={sp.foliage_type} onChange={(e) => s('foliage_type', e.target.value)} dir="ltr" />
          </Field>
          <Field label="Description">
            <textarea value={sp.description ?? ''} onChange={(e) => s('description', e.target.value)} rows={2} dir="ltr" />
          </Field>
        </div>
        <div>
          <div className="preview-thumbs">
            <SpeciesThumb sp={sp} mode="plan" style={project.style} size={120} />
            <SpeciesThumb sp={sp} mode="section" style={project.style} size={120} />
          </div>
          <p className="muted small">Illustrative editable defaults — not measured site data.</p>
          <Slider label={t('height')} unit="m" min={0.02} max={30} step={0.05} value={sp.default_height_m} onChange={(v) => s('default_height_m', v)} />
          <Slider label={t('crown_diameter')} unit="m" min={0.1} max={30} step={0.05} value={sp.default_crown_diameter_m} onChange={(v) => s('default_crown_diameter_m', v)} />
          <Slider label={t('crown_base')} unit="m" min={0} max={12} step={0.05} value={sp.default_crown_base_height_m} onChange={(v) => s('default_crown_base_height_m', v)} />
          <Slider label={t('trunk_width')} unit="m" min={0} max={2} step={0.01} value={sp.default_trunk_width_m} onChange={(v) => s('default_trunk_width_m', v)} />
          <Slider label={t('foliage_density')} min={0.05} max={1} value={sp.foliage_density} onChange={(v) => s('foliage_density', v)} />
          <Slider label={t('transparency')} min={0} max={0.95} value={sp.canopy_transparency} onChange={(v) => s('canopy_transparency', v)} />
          <Slider label={t('branch_visibility')} min={0} max={1} value={sp.branch_visibility} onChange={(v) => s('branch_visibility', v)} />
          <Slider label={t('irregularity')} min={0} max={1} value={sp.natural_irregularity} onChange={(v) => s('natural_irregularity', v)} />
          <Field label="Mix components (species mix)">
            <div className="mix-list">
              {(sp.mix ?? []).map((m, i) => (
                <span key={i} className="row-gap">
                  <Select value={m.species_id} options={others.map((o) => ({ value: o.species_id, label: o.species_id }))} onChange={(v) => s('mix', sp.mix!.map((x, j) => (j === i ? { ...x, species_id: v } : x)))} />
                  <NumberInput value={m.ratio} step={0.05} min={0} onChange={(v) => s('mix', sp.mix!.map((x, j) => (j === i ? { ...x, ratio: v } : x)))} width={60} />
                  <button className="mini" onClick={() => s('mix', sp.mix!.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </span>
              ))}
              <button className="small-btn" onClick={() => others[0] && s('mix', [...(sp.mix ?? []), { species_id: others[0].species_id, ratio: 0.5 }])}>
                + mix
              </button>
            </div>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
