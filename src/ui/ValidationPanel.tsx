import { useMemo } from 'react';
import { useProject } from '../store/projectStore';
import { useUI } from '../store/uiStore';
import { useT } from '../i18n';
import { Section } from './controls';
import { validateProject } from '../validate/validate';

export function ValidationPanel() {
  const t = useT();
  const project = useProject((s) => s.project);
  const issues = useMemo(() => validateProject(project, project.active_mode), [project]);
  return (
    <Section title={`${t('validation')} (${issues.filter((i) => i.level !== 'info').length})`}>
      {!issues.length && <p className="muted small">{t('no_issues')}</p>}
      <ul className="issues">
        {issues.map((i, n) => (
          <li key={n} className={'issue ' + i.level} onClick={() => i.item && useUI.getState().setSelection([i.item])} dir="ltr">
            <span className="lvl">{i.level === 'error' ? '●' : i.level === 'warning' ? '▲' : 'ℹ'}</span> {i.message}
          </li>
        ))}
      </ul>
    </Section>
  );
}
