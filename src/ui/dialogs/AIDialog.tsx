import { useMemo, useState } from 'react';
import { useProject } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { useT } from '../../i18n';
import { Field, Modal, Select, Toggle } from '../controls';
import { buildAiJson, buildPrompt, type AiProfile } from '../../export/aiExport';
import { copyText, downloadBlob, downloadText, safeName } from '../../export/download';
import { buildAiZip, renderPng } from '../../export/aiPackage';

export function AIDialog() {
  const t = useT();
  const project = useProject((s) => s.project);
  const mode = project.active_mode;
  const [profile, setProfile] = useState<AiProfile>('chatgpt');
  const [tab, setTab] = useState<'prompt' | 'json'>('prompt');
  const [includeSource, setIncludeSource] = useState(true);
  const [busy, setBusy] = useState(false);
  const json = useMemo(() => JSON.stringify(buildAiJson(project, mode, profile), null, 2), [project, mode, profile]);
  const prompt = useMemo(() => buildPrompt(project, mode, profile), [project, mode, profile]);
  const base = `${safeName(project.name)}_${mode}_${profile}`;
  const close = () => useUI.getState().openDialog(null);
  const copy = async (s: string) => (await copyText(s)) && useUI.getState().notify(t('copied'));
  const img = async (kind: 'base' | 'identification' | 'complete' | 'vegetation', name: string) => {
    setBusy(true);
    try {
      downloadBlob(await renderPng(project, mode, kind, 2400, kind === 'vegetation'), `${base}_${name}.png`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t('ai_export')} onClose={close} wide>
      <p className="muted small">
        Optional refinement workflow. Content is generated from the current project state. External image generators cannot guarantee exact geometric fidelity — the app's SVG remains the authoritative output.
      </p>
      <div className="row-gap wrap">
        <Field label="Profile">
          <Select<AiProfile>
            value={profile}
            options={[
              { value: 'chatgpt', label: 'ChatGPT image generation' },
              { value: 'gemini', label: 'Gemini / Nano Banana' },
              { value: 'generic', label: 'Generic image-editing model' },
            ]}
            onChange={setProfile}
          />
        </Field>
        <div className="tabs">
          <button className={tab === 'prompt' ? 'on' : ''} onClick={() => setTab('prompt')}>
            Prompt
          </button>
          <button className={tab === 'json' ? 'on' : ''} onClick={() => setTab('json')}>
            JSON
          </button>
        </div>
      </div>
      <textarea className="code" readOnly value={tab === 'prompt' ? prompt : json} dir="ltr" data-testid="ai-output" />
      <div className="row-gap wrap">
        <button className="primary" onClick={() => copy(tab === 'prompt' ? prompt : json)}>
          {t('copy')}
        </button>
        <button onClick={() => downloadText(prompt, `${base}_prompt.txt`)}>prompt.txt</button>
        <button onClick={() => downloadText(json, `${base}_prompt.json`, 'application/json')}>prompt.json</button>
        <button disabled={busy} onClick={() => img('base', 'base_drawing')}>
          base_drawing.png
        </button>
        <button disabled={busy} onClick={() => img('identification', 'identification_map')}>
          identification_map.png
        </button>
        <button disabled={busy} onClick={() => img('complete', 'composite_preview')}>
          composite.png
        </button>
        <button disabled={busy} onClick={() => img('vegetation', 'vegetation_only')}>
          vegetation.png
        </button>
      </div>
      <div className="row-gap wrap" style={{ marginTop: 10 }}>
        <Toggle label="Include source drawing in package" checked={includeSource} onChange={setIncludeSource} />
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              downloadBlob(await buildAiZip(project, mode, profile, includeSource), `${base}_ai_package.zip`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '…' : 'Download ZIP package'}
        </button>
      </div>
    </Modal>
  );
}
