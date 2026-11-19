import { useProject } from '../store/projectStore';
import { useT } from '../i18n';
import { Icons, Section } from './controls';
import { moveLayer, setLayerProp } from '../store/actions';

export function LayersPanel() {
  const t = useT();
  const layers = useProject((s) => s.project.layers);
  // top of list = drawn last (on top)
  const list = [...layers].reverse();
  return (
    <Section title={t('layers')}>
      <ul className="layers">
        {list.map((l, i) => (
          <li key={l.id} className={l.visible ? '' : 'off'}>
            <button className="icon-btn sm" title={t('visible')} onClick={() => setLayerProp(l.id, { visible: !l.visible })} aria-pressed={l.visible}>
              {l.visible ? Icons.eye : Icons.eyeOff}
            </button>
            <button className="icon-btn sm" title={t('lock')} onClick={() => setLayerProp(l.id, { locked: !l.locked })} aria-pressed={l.locked}>
              {l.locked ? Icons.lock : Icons.unlock}
            </button>
            <span className="layer-name" title={l.id}>
              {t('layer_' + l.id)}
            </span>
            <input type="range" min={0} max={1} step={0.05} value={l.opacity} onChange={(e) => setLayerProp(l.id, { opacity: parseFloat(e.target.value) }, 'lop' + l.id)} title={t('opacity')} />
            <button className="icon-btn sm" disabled={i === 0} title={t('move_up')} onClick={() => moveLayer(l.id, 1)}>
              {Icons.up}
            </button>
            <button className="icon-btn sm" disabled={i === list.length - 1} title={t('move_down')} onClick={() => moveLayer(l.id, -1)}>
              {Icons.down}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
