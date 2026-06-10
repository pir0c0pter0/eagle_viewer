# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06-10

Complete frontend modernization: the single legacy script (IE6-era) was replaced
by native ES modules and a new dark "instrumentation bench" UI.

### Added

- Net inspection: hovering a trace, via or copper pour highlights the whole net
  in copper and shows the signal name in the HUD (plus native tooltip).
- HUD overlay (oscilloscope-style OSD): hovered signal, cursor position in mm
  and zoom percentage.
- Layer panel with per-layer color chips and Top / Bottom / All presets.
- Drag-and-drop loading of `.brd` files anywhere on the window (file-drag only,
  with visual drop overlay).
- Fit-to-view button; initial fit uses the Dimension layer (board outline), so
  oversized copper texts don't shrink the board on load.
- Pad shapes: octagon, long and offset pads render with real geometry
  (previously drawn as circles); pad and SMD rotation (`rot`) honored.
- Package text rendering: literal texts in package definitions, `>NAME` /
  `>VALUE` placeholders substituted per element instance, and smashed elements
  honor their repositioned `<attribute>` texts at absolute board coordinates,
  painted above all packages.
- Full EAGLE `rot` grammar parsing (`S` spin, `M` mirror, `R<angle>`), fixing
  mirrored/rotated elements such as `rot="SMR0"` and `MR90`.
- Copper separation outline: a subtle white halo follows the outer contour of
  connected copper (per-layer halo/stroke buckets) at a constant on-screen
  thickness across zoom levels; pads/vias get a hairline outline via
  `paint-order`.
- Silkscreen/overlay layers (tPlace, names, values, docu) paint above the
  copper in translucent white (`--silk-opacity`, `--pad-opacity` CSS knobs).
- Touch/pen support via PointerEvents (multi-touch-safe panning) and
  trackpad-aware wheel zoom anchored at the cursor, clamped 5%–100000%.
- Keyboard-accessible file open control with visible focus ring.

### Changed

- Architecture: `src/index.js` replaced by ES modules `src/js/{main,render,
  viewport,ui}.js`; pan/zoom now mutates the SVG `viewBox` instead of moving an
  absolutely-positioned SVG and rewriting transform matrices.
- UI: dark charcoal theme with millimeter grid background, copper accent,
  IBM Plex Mono / Archivo Narrow typography.
- Board loading uses `fetch`/`FileReader.text()` (no more synchronous XHR);
  a user-loaded board can no longer be clobbered by the sample-board fetch.
- Dynamic per-layer styles escape untrusted `.brd` values (`CSS.escape`).
- Grunt `watch` now watches `src/` recursively (covers `src/js/`).

### Removed

- **Breaking:** legacy browser support (Internet Explorer fallbacks:
  `ActiveXObject`, `attachEvent`, `DOMMouseScroll`). Requires a modern browser
  with ES modules and PointerEvents.
- `src/index.js` (replaced by the modules above).

## [1.0.0]

Initial release: web-based EAGLE `.brd` viewer rendering boards to SVG with
layer visibility checkboxes, pan/zoom and a sample Arduino MEGA 2560 board.
