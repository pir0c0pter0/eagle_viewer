# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web-based viewer for EAGLE PCB board files (`.brd`, which are XML). Pure vanilla JavaScript ES modules — no framework, no bundler, no tests. App code lives in `src/`: `index.html`, `index.css`, and `js/{main,render,viewport,ui}.js`. `src/Arduino_MEGA2560_ref.brd` is the sample board fetched on startup. Targets modern browsers only (ES modules, PointerEvents); IE-era support was dropped in the 2026-06 modernization.

## Commands

- `npm install` — install Grunt dev dependencies
- `npx grunt` — build (copies `src/` recursively to `dist/`)
- `npx grunt watch` — rebuild on changes under `src/`
- `npx grunt publish` — build and deploy `dist/` to GitHub Pages
- Syntax-check a module: `node --input-type=module --check < src/js/render.js`

To run locally, serve `src/` over HTTP (e.g. `python3 -m http.server 8000 -d src`) and open http://localhost:8000. A plain `file://` open fails: the page fetches the sample `.brd` on load, and ES modules don't load cross-origin from `file://`.

## Commit rules (enforced by a hook)

Conventional commit format (`feat:`, `fix:`, ...), subject ≤ 50 chars, no AI-attribution lines (no `Co-Authored-By: Claude`). When the hook rejects, staged files are unstaged — `git add` again before retrying.

## Architecture

- **`js/main.js`** — bootstrap. Resolves DOM refs, wires the other modules, fetches the sample board (guarded by `boardLoaded` so it can't clobber a user-loaded file). `loadBoardXml()` orchestrates: parse XML → `renderBoard` → `panel.setLayers` → fit viewport. `fitBBox()` prefers the union bbox of EAGLE's Dimension layer (20, the physical board outline) so oversized copper text doesn't inflate the fit view.
- **`js/render.js`** — EAGLE XML → SVG. Exports `LAYER_COLORS` (16-entry palette), `parseLayers(xmlDoc)`, `renderBoard(xmlDoc, {boardGroup, packagesGroup})`. Library packages render once into `<defs>` as `<g id="lib___pkg">` and are instantiated per `<element>` via `<use>` (this is why `renderBoard` needs live-DOM groups — `getBBox()` for origin markers). `>NAME`/`>VALUE` package texts can't live in the shared defs — they're instantiated per element in `addElement` with the element's name/value. `parseRot` handles the EAGLE `rot` grammar (`S` spin, `M` mirror, `R<angle>`); pad shapes square/octagon/long/offset are real geometry. Class contract: `wire`/`poly` get stroke, `via`/`rect` get fill, `<text>` carries a bare `layerN` class; signal-owned elements get `data-signal` + an SVG `<title>`; every stroked wire/circle gets a white `halo layerN` sibling underneath (separation outline; filled shapes get theirs from the `.via/.rect paint-order` rule in `index.css`).
- **`js/viewport.js`** — `Viewport` class: pan/zoom by mutating the SVG `viewBox`. PointerEvents with capture and pointer-id tracking (multi-touch safe); wheel zoom anchored at cursor, deltaMode-normalized, clamped to 5%–100000% of the fit view.
- **`js/ui.js`** — `LayerPanel` (chips/checkboxes/presets; visibility + colors via two dynamic `<style>` elements, untrusted layer numbers passed through `CSS.escape`), `initSignalHover` (whole-net highlight via a third stylesheet; `#boardGroup [data-signal=...]` outranks the `.wire.layerN` color rules by id specificity), `initDragDrop`.
- **Coordinate system**: EAGLE is mm, y-up; SVG is y-down. `#boardGroup` carries `transform="scale(1,-1)"`; bboxes flip into root coords with `y' = -(y + height)`; the HUD negates y for display; `<text>` re-flips itself with `scale(1, -1)`.
- **Cross-file contracts**: `index.html` provides the DOM ids the modules look up (`boardSvg`, `boardGroup`, `packagesGroup`, the three `styleSheet*` style elements, `hud*`, `boardName`, `fileInput`, `fitButton`, `dropOverlay`, `.layer-presets`). `index.css` carries load-bearing rules: `.via { fill-rule: evenodd }` (drill holes; also set as an attribute in `addVia`), `.board-in` animation, `#boardSvg.dragging`, `touch-action: none` on the svg, and the `--copper` variable used by the hover highlight.

Known simplifications: non-spin text is not normalized to stay readable under rotation (may render upside down for some angles); mirrored elements keep their texts on the original t-layers for visibility toggling; SMD `roundness` is ignored.
