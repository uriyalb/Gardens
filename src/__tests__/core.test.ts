import { describe, expect, it } from 'vitest';
import { distributeInPolygon } from '../geometry/distribute';
import { pointInPolygon, distToPolygonEdge } from '../geometry/polygon';
import { buildDemoProject } from '../demo/demo';
import { exportSvg } from '../export/svgExport';
import { parseProject, serializeProject } from '../export/projectFile';
import { buildAiJson, buildPrompt } from '../export/aiExport';
import { createPlant } from '../model/factory';
import { contextFor, renderPlantLocal } from '../render/scene';

const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
const lshape = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 90 }, { x: 0, y: 90 }];

describe('geometry', () => {
  it('point in polygon', () => {
    expect(pointInPolygon({ x: 10, y: 10 }, square)).toBe(true);
    expect(pointInPolygon({ x: 80, y: 70 }, lshape)).toBe(false);
  });
  for (const distribution of ['uniform', 'clustered', 'irregular'] as const) {
    it(`distribution ${distribution} stays inside with setback`, () => {
      const pts = distributeInPolygon({ poly: lshape, spacing: 6, count: null, setback: 3, distribution, seed: 7, sizeVariation: 0.3 });
      expect(pts.length).toBeGreaterThan(10);
      for (const p of pts) {
        expect(pointInPolygon(p, lshape)).toBe(true);
        expect(distToPolygonEdge(p, lshape)).toBeGreaterThanOrEqual(3 - 1e-9);
      }
      const again = distributeInPolygon({ poly: lshape, spacing: 6, count: null, setback: 3, distribution, seed: 7, sizeVariation: 0.3 });
      expect(again).toEqual(pts);
    });
  }
});

describe('rendering', () => {
  it('is deterministic and species-specific', () => {
    const p = buildDemoProject();
    const rc = contextFor(p, 'plan');
    const tam = p.species.find((s) => s.species_id === 'TAM')!;
    const cel = p.species.find((s) => s.species_id === 'CEL')!;
    const pl = createPlant(p, tam, { x: 100, y: 100 }, 'plan', { random_seed: 1 });
    const a = renderPlantLocal(pl, tam, rc, 'plan');
    const b = renderPlantLocal({ ...pl }, tam, rc, 'plan');
    expect(a).toEqual(b);
    const c = renderPlantLocal({ ...pl, species_id: 'CEL' }, cel, rc, 'plan');
    expect(c.tree_canopies).not.toEqual(a.tree_canopies);
    expect(a.tree_trunks).toBeTruthy();
  });
  it('exports svg with viewBox and instance ids', () => {
    const p = buildDemoProject();
    const svg = exportSvg(p, 'plan', { kind: 'complete' });
    expect(svg).toContain('viewBox="0 0 1200 800"');
    expect(svg).toContain('data-instance-id="TREE_001"');
    expect(svg).toContain('translate(240 420)');
    const sec = exportSvg(p, 'section', { kind: 'complete' });
    expect(sec).toContain('viewBox="0 0 1600 700"');
  });
});

describe('project io + ai', () => {
  it('roundtrips', () => {
    const p = buildDemoProject();
    const q = parseProject(serializeProject(p));
    expect(q.plants).toEqual(p.plants);
    expect(q.views.plan.background?.viewBox).toEqual(p.views.plan.background?.viewBox);
    expect(exportSvg(q, 'plan', { kind: 'complete' })).toEqual(exportSvg(p, 'plan', { kind: 'complete' }));
  });
  it('ai json reflects current state', () => {
    const p = buildDemoProject();
    p.plants[0].species_id = 'CEL';
    p.plants[0].height_m = 13.5;
    const j = buildAiJson(p, 'plan', 'generic');
    const inst = j.plant_instances.find((x) => x.instance_id === p.plants[0].instance_id)!;
    expect(inst.species_id).toBe('CEL');
    expect(inst.height_m).toBe(13.5);
    const prompt = buildPrompt(p, 'plan', 'chatgpt');
    expect(prompt).toContain(`${p.plants[0].instance_id}: Celtis australis`);
    expect(prompt).toContain('height 13.5 m');
  });
});
