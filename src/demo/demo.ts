// Bundled demo drawings (authored for this app) so the editor opens with something to test.
import { createArea, createGroundLine, createLine, createPlant, createProject } from '../model/factory';
import type { Project, Species } from '../model/types';
import { importSvgText } from '../import/svgImport';

// Plan: 1200 × 800 units, authored at 20 units = 1 m (60 m × 40 m).
export const DEMO_PLAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
<style>.wall{fill:#f4f2ee;stroke:#2b2b2b;stroke-width:2.2}.pave{fill:#efe9dc;stroke:#8a8270;stroke-width:0.8}.edge{fill:none;stroke:#555;stroke-width:1}.thin{fill:none;stroke:#888;stroke-width:0.6}.txt{font:14px Arial,sans-serif;fill:#555}</style>
<g id="site">
  <rect id="street" x="0" y="690" width="1200" height="110" fill="#e6e4df" stroke="none"/>
  <line x1="0" y1="745" x2="1200" y2="745" stroke="#fff" stroke-width="2" stroke-dasharray="24 18"/>
  <rect id="sidewalk" x="0" y="650" width="1200" height="40" class="pave"/>
  <g id="sidewalk-joints" class="thin">${Array.from({ length: 30 }, (_, i) => `<line x1="${i * 40}" y1="650" x2="${i * 40}" y2="690"/>`).join('')}</g>
  <path id="boundary" d="M60 640 L60 60 L1140 60 L1140 640" class="edge" stroke-dasharray="10 4"/>
</g>
<g id="buildings">
  <path id="building-north" class="wall" d="M80 70 H700 V200 H560 V230 H360 V200 H80 Z"/>
  <path id="building-east" class="wall" d="M900 70 H1130 V520 H980 V420 H900 Z"/>
  <g class="thin"><line x1="140" y1="70" x2="140" y2="200"/><line x1="260" y1="70" x2="260" y2="200"/><line x1="460" y1="70" x2="460" y2="230"/><line x1="600" y1="70" x2="600" y2="200"/><line x1="900" y1="200" x2="1130" y2="200"/><line x1="900" y1="320" x2="1130" y2="320"/></g>
  <text x="300" y="140" class="txt">BUILDING A</text><text x="960" y="260" class="txt">BUILDING B</text>
</g>
<g id="hardscape">
  <path id="main-path" class="pave" d="M540 650 L540 520 Q540 470 590 460 L880 430 L880 390 L900 390 L900 470 L600 500 Q580 505 580 530 L580 650 Z"/>
  <path id="seating-area" class="pave" d="M640 520 L820 505 L830 600 L650 615 Z"/>
  <g class="thin"><line x1="660" y1="540" x2="810" y2="528"/><line x1="664" y1="570" x2="815" y2="557"/></g>
  <rect id="bench-1" x="680" y="590" width="60" height="10" fill="#d8d2c4" stroke="#555" stroke-width="0.8"/>
  <path id="entry-path" class="pave" d="M360 230 L400 230 L400 650 L360 650 Z"/>
</g>
<g id="planting-beds" class="edge">
  <path id="lawn-bed" d="M110 270 L340 250 L345 600 L120 620 Z"/>
  <path id="shrub-bed-east" d="M920 540 L1110 540 L1110 630 L920 630 Z"/>
  <path id="shrub-bed-north" d="M720 220 L880 210 L880 380 L720 400 Z"/>
  <path id="herb-bed" d="M430 260 L520 255 L525 480 L430 500 Z"/>
</g>
<g id="north-arrow" transform="translate(1090 140)"><circle r="22" fill="none" stroke="#555"/><path d="M0 -18 L6 8 L0 3 L-6 8 Z" fill="#333"/><text x="-5" y="-26" class="txt">N</text></g>
<g id="scale-bar" transform="translate(80 775)"><rect width="200" height="6" fill="none" stroke="#333"/><rect width="100" height="6" fill="#333"/><text x="0" y="-6" class="txt" style="font-size:11px">0</text><text x="190" y="-6" class="txt" style="font-size:11px">10 m</text></g>
</svg>`;

// Section: 1600 × 700 units, authored at 20 units = 1 m.
export const DEMO_SECTION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 700" width="1600" height="700">
<style>.cut{fill:#2b2b2b}.wall{fill:#f6f4f0;stroke:#2b2b2b;stroke-width:2}.thin{fill:none;stroke:#888;stroke-width:0.7}.txt{font:14px Arial,sans-serif;fill:#555}</style>
<g id="ground">
  <path id="ground-line" d="M0 560 L260 560 L260 548 L520 548 L520 560 L1080 560 L1080 548 L1340 548 L1340 560 L1600 560" fill="none" stroke="#111" stroke-width="2.6"/>
  <path id="earth-poche" d="M0 560 L260 560 L260 548 L520 548 L520 560 L1080 560 L1080 548 L1340 548 L1340 560 L1600 560 L1600 700 L0 700 Z" fill="#ece8df" stroke="none"/>
  <g class="thin">${Array.from({ length: 40 }, (_, i) => `<line x1="${i * 40}" y1="700" x2="${i * 40 + 60}" y2="580"/>`).join('')}</g>
</g>
<g id="buildings">
  <path id="building-west" class="wall" d="M20 548 L20 270 L240 270 L240 548 Z"/>
  <g class="thin"><line x1="20" y1="340" x2="240" y2="340"/><line x1="20" y1="410" x2="240" y2="410"/><line x1="20" y1="480" x2="240" y2="480"/></g>
  <rect x="236" y="300" width="8" height="30" class="cut"/><rect x="236" y="370" width="8" height="30" class="cut"/>
  <path id="building-east" class="wall" d="M1360 548 L1360 250 L1580 250 L1580 548 Z"/>
  <g class="thin"><line x1="1360" y1="320" x2="1580" y2="320"/><line x1="1360" y1="400" x2="1580" y2="400"/><line x1="1360" y1="475" x2="1580" y2="475"/></g>
  <text x="70" y="250" class="txt">EXISTING BUILDING</text><text x="1400" y="230" class="txt">EXISTING BUILDING</text>
</g>
<g id="street-elements">
  <text x="330" y="590" class="txt">SIDEWALK</text><text x="740" y="590" class="txt">GARDEN</text><text x="1150" y="590" class="txt">SIDEWALK</text>
  <line x1="520" y1="548" x2="520" y2="560" stroke="#111" stroke-width="2"/>
</g>
<g id="datum" class="thin"><line x1="0" y1="560" x2="1600" y2="560" stroke-dasharray="4 6"/><text x="1520" y="575" class="txt" style="font-size:11px">±0.00</text></g>
</svg>`;

export function buildDemoProject(species?: Species[]): Project {
  const p = createProject('Demo — Mediterranean urban garden', species);
  p.style = { ...p.style };
  const plan = importSvgText(DEMO_PLAN_SVG, 'demo_plan.svg', 'ASSET_DEMO_PLAN').background;
  const sec = importSvgText(DEMO_SECTION_SVG, 'demo_section.svg', 'ASSET_DEMO_SECTION').background;
  const calib = (note: string) => ({ status: 'verified' as const, method: 'unit_equivalence' as const, units_per_meter: 20, scale_denominator: null, display_unit: 'm' as const, note });
  p.views.plan = { background: plan, canvas: plan.viewBox, calibration: calib('Demo drawing authored at 20 units = 1 m.') };
  p.views.section = { background: sec, canvas: sec.viewBox, calibration: calib('Demo drawing authored at 20 units = 1 m.') };
  const sp = (id: string) => p.species.find((s) => s.species_id === id)!;

  // ---- plan ----
  const lawn = createArea(p, [{ x: 110, y: 270 }, { x: 340, y: 250 }, { x: 345, y: 600 }, { x: 120, y: 620 }], 'plan', sp('LAW'));
  lawn.source_element_id = 'lawn-bed';
  p.areas.push(lawn);
  const pit = createArea(p, [{ x: 920, y: 540 }, { x: 1110, y: 540 }, { x: 1110, y: 630 }, { x: 920, y: 630 }], 'plan', sp('PIT'));
  pit.source_element_id = 'shrub-bed-east';
  pit.random_seed = 4242;
  p.areas.push(pit);
  const pitN = createArea(p, [{ x: 720, y: 220 }, { x: 880, y: 210 }, { x: 880, y: 380 }, { x: 720, y: 400 }], 'plan', sp('PIT'));
  pitN.source_element_id = 'shrub-bed-north';
  pitN.random_seed = 777;
  pitN.spatial_character = 'tall_vegetated_enclosure';
  pitN.plant_height_m = 2.2;
  pitN.layer = 'tall_shrubs';
  p.areas.push(pitN);
  const herb = createArea(p, [{ x: 430, y: 260 }, { x: 520, y: 255 }, { x: 525, y: 480 }, { x: 430, y: 500 }], 'plan', sp('LAV'));
  herb.source_element_id = 'herb-bed';
  herb.random_seed = 99;
  herb.distribution = 'irregular';
  p.areas.push(herb);
  const mix = createLine(p, [{ x: 610, y: 640 }, { x: 610, y: 545 }, { x: 640, y: 510 }, { x: 870, y: 488 }], 'plan', sp('MIX'));
  mix.random_seed = 2024;
  mix.distribution = 'natural';
  p.lines.push(mix);
  p.plants.push(createPlant(p, sp('TAM'), { x: 240, y: 420 }, 'plan', { random_seed: 14027, crown_diameter_m: 9, spatial_character: 'filtered_overhead_canopy' }));
  p.plants.push(createPlant(p, sp('CEL'), { x: 735, y: 560 }, 'plan', { random_seed: 5151, spatial_character: 'shaded_outdoor_room' }));
  p.plants.push(createPlant(p, sp('OLE'), { x: 475, y: 590 }, 'plan', { random_seed: 3131 }));
  p.plants.push(createPlant(p, sp('OLE'), { x: 1010, y: 470 }, 'plan', { random_seed: 8080, crown_diameter_m: 5, height_m: 5 }));

  // ---- section ----
  const gl = createGroundLine(p, [{ x: 0, y: 560 }, { x: 260, y: 560 }, { x: 260, y: 548 }, { x: 520, y: 548 }, { x: 520, y: 560 }, { x: 1080, y: 560 }, { x: 1080, y: 548 }, { x: 1340, y: 548 }, { x: 1340, y: 560 }, { x: 1600, y: 560 }], 'ground-line');
  p.ground_lines.push(gl);
  const sec2 = (id: string, x: number, y: number, o: Parameters<typeof createPlant>[4] = {}) =>
    p.plants.push(createPlant(p, sp(id), { x, y }, 'section', { ground_line_id: gl.ground_id, ...o }));
  sec2('CEL', 760, 560, { random_seed: 5151 });
  sec2('TAM', 1000, 560, { random_seed: 14027, height_m: 11 });
  sec2('OLE', 400, 548, { random_seed: 3131 });
  sec2('CEL', 880, 560, { random_seed: 9191, depth_role: 'background', height_m: 13, crown_diameter_m: 11 });
  sec2('TAM', 620, 560, { random_seed: 6262, depth_role: 'background', height_m: 9 });
  const hedge = createLine(p, [{ x: 560, y: 560 }, { x: 700, y: 560 }], 'section', sp('PIT'));
  hedge.random_seed = 31;
  p.lines.push(hedge);
  const lav = createLine(p, [{ x: 820, y: 560 }, { x: 940, y: 560 }], 'section', sp('MIX'));
  lav.random_seed = 32;
  p.lines.push(lav);
  return p;
}
