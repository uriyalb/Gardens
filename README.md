# Architectural Vegetation Studio · סטודיו צמחייה אדריכלית

A vector-based landscape illustration editor for architects and landscape designers. Import an architectural drawing (SVG / PNG / JPEG), assign plant species to exact locations and areas, and generate refined, botanically differentiated vegetation directly in SVG — in two projections:

- **Planting Plan Editor** – orthographic top view (trunk-centred crowns, planting polygons, linear plantings, lawn surfaces, transparent canopy layer).
- **Landscape Section Editor** – orthographic elevation (plants grow upward from a ground-contact point, ground lines, background vegetation).

No AI service is needed. AI prompt/JSON export is an optional extra for refinement in external tools.

Default UI language is Hebrew (RTL); English is available from the toolbar. Data and JSON keys are English.

## Run locally

```bash
npm install
npm run dev
```

```bash
npm test        # unit tests (geometry, determinism, export, project round-trip, AI JSON)
npm run build   # production build into dist/
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds, tests and deploys `dist/` to GitHub Pages on pushes to `main` (and the development branch) or manually via *Run workflow*. One-time repository settings:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. If deploying from a branch other than the default one: **Settings → Environments → github-pages → Deployment branches** must allow that branch.

The Vite `base` is relative (`./`), so the site works under any repository name.

## What works

- SVG import with sanitising (DOMPurify; scripts, event handlers, external references removed; embedded CSS scoped so it cannot leak into the app). Original viewBox, geometry, colours and IDs are preserved as a locked, non-destructive background. PNG/JPEG import as locked raster references.
- Scale calibration: unit equivalence, paper scale (1:N), or two-point known distance; uncalibrated mode flags all dimensions as approximate.
- Species library (8 Mediterranean defaults: TAM, CEL, OLE, PIT, LAV, ROS, LAW, MIX) with search, category filter, add / duplicate / edit / delete, plan & section thumbnails, marker colour + code, mixes, saved to IndexedDB.
- Procedural, deterministic (seeded) renderers with species-specific geometry: feathery Tamarix, dense layered Celtis, granular asymmetric olive, compact Pittosporum, upright lavender, linear-leaved rosemary, quiet lawn surface; section renderers with trunk, primary/secondary branching and species foliage.
- Editing: place, select, marquee & shift multi-select, drag move, crown/rotation/height/width handles, vertex editing (drag, Alt+click delete, double-click insert), duplicate, delete, group/ungroup, lock, change species/layer/opacity, batch editing of multiple plants, undo/redo, snapping (grid, vertices, ground line), keyboard shortcuts.
- Planting polygons (uniform / clustered / irregular, spacing or count, edge setback, clipping to boundary), linear plantings (spacing, count, offsets, variation, strip width, even/natural/staggered), protected boundaries, conversion of generated plants to individual instances.
- Picking elements of an imported SVG (by ID) to create planting areas, linear plantings, protected boundaries or ground lines; vector marker-layer detection on import (ID → data attribute → marker colour precedence, ambiguous ones need confirmation).
- 10 layers with visibility, locking, opacity and reordering; spatial-character presets; background/midground depth roles.
- Views: original drawing, identification overlay, generated vegetation, composite; preview mode.
- Style engine with 6 presets (incl. *Historic Mediterranean Urban Garden — Tel Aviv White City*) and custom saved styles; every slider changes the drawing.
- Validation warnings (missing species, invalid polygons, duplicate IDs, ambiguous marker colours, out-of-drawing coordinates, invalid dimensions, crowns overlapping protected boundaries, uncalibrated scale).
- Exports: complete SVG, vegetation-only SVG, single plant SVG (anchor at 0,0), CAD-simplified outline SVG, PNG (up to 8000 px, transparent option), project JSON (re-importable), AI package (prompt.json, prompt.txt, base/ID-map/composite/vegetation PNGs, source drawing) as ZIP.
- Local autosave to IndexedDB, stored-project browser, project file import.

## Known limitations

- Marker recognition is only done for dedicated marker layers / `data-species` attributes in vector SVGs. Raster images are never auto-interpreted; place plants manually.
- Planting polygons are a plan-mode feature; section mode uses individual plants, linear rows and ground lines.
- CAD export is a simplified outline SVG, not DXF; decorative textures do not translate into native CAD geometry.
- AI exports describe the intended result; external generators cannot guarantee geometric fidelity. The app's SVG is the authoritative output.
