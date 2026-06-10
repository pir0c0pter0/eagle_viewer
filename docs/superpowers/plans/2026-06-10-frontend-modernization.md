# Frontend Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the EAGLE board viewer: ES modules, viewBox-based pan/zoom with PointerEvents, and a dark "instrumentation bench" UI with layer panel, HUD and net highlighting.

**Architecture:** The single legacy `src/index.js` (IE6-era, sync XHR, globals) is replaced by four ES modules under `src/js/`: `render.js` (EAGLE XML → SVG), `viewport.js` (pan/zoom via SVG viewBox + PointerEvents), `ui.js` (layer panel, signal hover, drag-drop), `main.js` (bootstrap/wiring). `index.html` and `index.css` are rewritten last, flipping the app to the new code in one commit. No framework, no build step — native ES modules.

**Tech Stack:** Vanilla JS (ES2022 modules), SVG, CSS. Fonts: IBM Plex Mono + Archivo Narrow (Google Fonts, with fallbacks).

---

## Context for workers (read first)

- Repo root: `/var/home/mariostjr/Projetos/EagleViewer/eagle_viewer`. App lives in `src/`.
- A dev server is already running: `http://localhost:8000` serving `src/` (`python3 -m http.server 8000 -d src`). If it's down, restart it in background.
- Sample board: `src/Arduino_MEGA2560_ref.brd` (EAGLE 6.x XML). Structure: `eagle > drawing > layers > layer` and `eagle > drawing > board` containing `plain`, `libraries > library > packages > package`, `signals > signal`, `elements > element`.
- Coordinate system: EAGLE is mm, y-up. SVG is y-down. The board group carries `transform="scale(1,-1)"`; therefore content occupies y ∈ [-maxY, -minY] in root SVG coords. `getBBox()` on the board group returns EAGLE coords (pre-transform); flip with `y' = -(y + height)`.
- **Commit hook rules (enforced):** conventional commit format (`feat:`, `refactor:`, ...), subject ≤ 50 chars, NO AI attribution lines (no `Co-Authored-By: Claude...`). If the hook rejects, files get unstaged — `git add` again before retrying.
- Syntax-check ES modules with: `node --input-type=module --check < FILE`.
- Tasks 1–3 create modules that are NOT yet loaded by the page — the legacy app keeps working until Task 4 flips `index.html`.

---

### Task 1: Rendering module `src/js/render.js`

**Files:**
- Create: `src/js/render.js`

This is a faithful port of the rendering logic currently in `src/index.js` (see git HEAD), modernized: ES module, `const`/`let`, template literals, `querySelectorAll`, `href` instead of `xlink:href`. New behaviors vs legacy: text elements get a `fill` color via the layer stylesheet (handled in Task 3), packages go into `<defs>`, and `renderBoard`/`parseLayers` are pure functions over an XML Document.

- [ ] **Step 1: Write the file exactly as below**

```js
// Renders an EAGLE 6.x board XML document into SVG.
// Coordinates are EAGLE board units (mm, y-up); the caller flips the
// y axis with a scale(1,-1) transform on the destination group.

const SVG_NS = "http://www.w3.org/2000/svg";

export const LAYER_COLORS = [
    "#000000", // 0
    "#23238D", // 1
    "#238D23", // 2
    "#238D8D", // 3
    "#8D2323", // 4
    "#8D238D", // 5
    "#8D8D23", // 6
    "#8D8D8D", // 7
    "#272727", // 8
    "#0000B4", // 9
    "#00B400", // 10
    "#00B4B4", // 11
    "#B40000", // 12
    "#B400B4", // 13
    "#B4B400", // 14
    "#B4B4B4", // 15
];

const PAD_LAYER = 17;
const VIA_LAYER = 18;
const TORIGIN_LAYER = 23;
const BORIGIN_LAYER = 24;

function el(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) {
        node.setAttribute(key, value);
    }
    return node;
}

function setSignalName(node, signalName) {
    if (!signalName) return;
    node.setAttribute("data-signal", signalName);
    const title = el("title");
    title.textContent = signalName;
    node.appendChild(title);
}

function strokeWidth(node, width) {
    const w = parseFloat(width);
    node.style.strokeWidth = w > 0 ? w : 0.5;
}

function addWire(dest, wire, signalName) {
    const curve = wire.getAttribute("curve");
    let node;
    if (curve !== null) {
        const x1 = parseFloat(wire.getAttribute("x1"));
        const y1 = parseFloat(wire.getAttribute("y1"));
        const x2 = parseFloat(wire.getAttribute("x2"));
        const y2 = parseFloat(wire.getAttribute("y2"));
        const arcAngle = (parseFloat(curve) * Math.PI) / 180;
        const length = Math.hypot(x2 - x1, y2 - y1);
        const rotAngle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        const radius = Math.abs(length / Math.sin(arcAngle / 2)) / 2;
        const largeArc = Math.abs(arcAngle) > Math.PI ? 1 : 0;
        const sweep = arcAngle > 0 ? 1 : 0;
        node = el("path", {
            d: `M${x1} ${y1} A${radius} ${radius} ${rotAngle} ${largeArc} ${sweep} ${x2} ${y2}`,
        });
    } else {
        node = el("line", {
            x1: wire.getAttribute("x1"),
            y1: wire.getAttribute("y1"),
            x2: wire.getAttribute("x2"),
            y2: wire.getAttribute("y2"),
        });
    }
    node.setAttribute("class", `wire layer${wire.getAttribute("layer")}`);
    strokeWidth(node, wire.getAttribute("width"));
    setSignalName(node, signalName);
    dest.appendChild(node);
}

function addRect(dest, rectangle) {
    const x1 = parseFloat(rectangle.getAttribute("x1"));
    const y1 = parseFloat(rectangle.getAttribute("y1"));
    const x2 = parseFloat(rectangle.getAttribute("x2"));
    const y2 = parseFloat(rectangle.getAttribute("y2"));
    const rect = el("rect", {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        class: `rect layer${rectangle.getAttribute("layer")}`,
    });
    dest.appendChild(rect);
}

function addPolygon(dest, polygon, signalName) {
    const points = [...polygon.querySelectorAll("vertex")]
        .map((v) => `${v.getAttribute("x")},${v.getAttribute("y")}`)
        .join(" ");
    const poly = el("polygon", {
        points,
        class: `poly layer${polygon.getAttribute("layer")}`,
    });
    poly.style.strokeWidth = polygon.getAttribute("width");
    setSignalName(poly, signalName);
    dest.appendChild(poly);
}

function ring(x, y, r) {
    return (
        ` M${x - r} ${y}` +
        ` A${r} ${r} 45 0 1 ${x} ${y - r}` +
        ` A${r} ${r} 45 0 1 ${x + r} ${y}` +
        ` A${r} ${r} 45 0 1 ${x} ${y + r}` +
        ` A${r} ${r} 45 0 1 ${x - r} ${y} Z`
    );
}

function addVia(dest, via, actuallyPad, signalName) {
    const x = parseFloat(via.getAttribute("x"));
    const y = parseFloat(via.getAttribute("y"));
    const drill = parseFloat(via.getAttribute("drill")) / 2;
    let radius = drill + 0.4064; // 16 mils annular ring default
    const diameter = via.getAttribute("diameter");
    if (diameter !== null) radius = parseFloat(diameter) / 2;

    let d = "";
    // TODO other shapes besides square and round (octagon, long, offset)
    if (via.getAttribute("shape") === "square") {
        d =
            `M${x - radius} ${y - radius}` +
            ` L${x + radius} ${y - radius}` +
            ` L${x + radius} ${y + radius}` +
            ` L${x - radius} ${y + radius} Z`;
    } else {
        d = ring(x, y, radius);
    }
    d += ring(x, y, drill);

    const path = el("path", {
        d,
        class: `via layer${actuallyPad ? PAD_LAYER : VIA_LAYER}`,
    });
    setSignalName(path, signalName);
    dest.appendChild(path);
}

function addSmd(dest, smd) {
    const x = parseFloat(smd.getAttribute("x"));
    const y = parseFloat(smd.getAttribute("y"));
    const dx = parseFloat(smd.getAttribute("dx"));
    const dy = parseFloat(smd.getAttribute("dy"));
    const rect = el("rect", {
        x: x - dx / 2,
        y: y - dy / 2,
        width: dx,
        height: dy,
        class: `via layer${smd.getAttribute("layer")}`,
    });
    dest.appendChild(rect);
}

function addText(dest, text) {
    const t = el("text", {
        "font-family": "IBM Plex Mono, monospace",
        "font-size": `${parseFloat(text.getAttribute("size")) * 1.4}px`,
        transform: `translate(${text.getAttribute("x")} ${text.getAttribute("y")}) scale(1, -1)`,
        class: `layer${text.getAttribute("layer")}`,
    });
    t.textContent = text.textContent;
    dest.appendChild(t);
}

function addCircle(dest, circle) {
    const c = el("circle", {
        cx: circle.getAttribute("x"),
        cy: circle.getAttribute("y"),
        r: circle.getAttribute("radius"),
        class: `wire layer${circle.getAttribute("layer")}`,
    });
    c.style.strokeWidth = circle.getAttribute("width");
    dest.appendChild(c);
}

function addOrigin(dest, size, className) {
    const radius = Math.max(0.5, Math.min(size.width, size.height) * 0.2);
    dest.appendChild(
        el("line", { x1: -radius, y1: 0, x2: radius, y2: 0, class: `origin ${className}` })
    );
    dest.appendChild(
        el("line", { x1: 0, y1: -radius, x2: 0, y2: radius, class: `origin ${className}` })
    );
}

function addElement(dest, element) {
    const use = el("use");
    use.setAttribute(
        "href",
        `#${element.getAttribute("library")}___${element.getAttribute("package")}`
    );
    const rot = element.getAttribute("rot");
    let mirrored = false;
    if (rot !== null) {
        mirrored = rot.startsWith("M");
        const angle = rot.slice(mirrored ? 2 : 1) || "0";
        use.setAttribute("transform", `${mirrored ? "scale(-1 1) " : ""}rotate(${angle})`);
    }
    const group = el("g", {
        transform: `translate(${element.getAttribute("x")} ${element.getAttribute("y")})`,
    });
    group.appendChild(use);
    dest.appendChild(group);
    // getBBox needs the <use> to be in the live document
    addOrigin(group, use.getBBox(), `layer${mirrored ? BORIGIN_LAYER : TORIGIN_LAYER}`);
}

export function parseLayers(xmlDoc) {
    return [...xmlDoc.querySelectorAll("eagle > drawing > layers > layer")].map((layer) => ({
        number: layer.getAttribute("number"),
        name: layer.getAttribute("name"),
        color: parseInt(layer.getAttribute("color"), 10) || 0,
        visible: layer.getAttribute("visible") !== "no",
        active: layer.getAttribute("active") === "yes",
    }));
}

// boardGroup/packagesGroup must already be attached to a live SVG
// (addElement measures package instances with getBBox).
export function renderBoard(xmlDoc, { boardGroup, packagesGroup }) {
    boardGroup.replaceChildren();
    packagesGroup.replaceChildren();

    const board = xmlDoc.querySelector("eagle > drawing > board");
    if (!board) throw new Error("Not an EAGLE board file: missing <board> element");

    const plain = board.querySelector("plain");
    if (plain) {
        for (const wire of plain.querySelectorAll("wire")) addWire(boardGroup, wire);
        for (const rect of plain.querySelectorAll("rectangle")) addRect(boardGroup, rect);
        for (const text of plain.querySelectorAll("text")) addText(boardGroup, text);
    }

    for (const library of board.querySelectorAll("libraries > library")) {
        for (const pack of library.querySelectorAll("packages > package")) {
            const group = el("g", {
                id: `${library.getAttribute("name")}___${pack.getAttribute("name")}`,
            });
            for (const circle of pack.querySelectorAll("circle")) addCircle(group, circle);
            for (const pad of pack.querySelectorAll("pad")) addVia(group, pad, true);
            for (const smd of pack.querySelectorAll("smd")) addSmd(group, smd);
            for (const wire of pack.querySelectorAll("wire")) addWire(group, wire);
            packagesGroup.appendChild(group);
        }
    }

    for (const signal of board.querySelectorAll("signals > signal")) {
        const name = signal.getAttribute("name");
        for (const wire of signal.querySelectorAll("wire")) addWire(boardGroup, wire, name);
        for (const polygon of signal.querySelectorAll("polygon"))
            addPolygon(boardGroup, polygon, name);
        for (const via of signal.querySelectorAll("via")) addVia(boardGroup, via, false, name);
    }

    for (const element of board.querySelectorAll("elements > element"))
        addElement(boardGroup, element);
}
```

- [ ] **Step 2: Syntax check**

Run: `node --input-type=module --check < src/js/render.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/js/render.js
git commit -m "refactor: add ES module board renderer"
```

---

### Task 2: Viewport module `src/js/viewport.js`

**Files:**
- Create: `src/js/viewport.js`

Pan/zoom by mutating the SVG `viewBox` (replaces the legacy approach of moving an absolutely-positioned SVG and rewriting a transform matrix). PointerEvents cover mouse/touch/pen; wheel zoom is anchored at the cursor.

- [ ] **Step 1: Write the file exactly as below**

```js
// Pan/zoom for an inline SVG by mutating its viewBox.
// Pointer events handle mouse/touch/pen; wheel zooms anchored at the cursor.

const ZOOM_STEP = 1.1;
const FIT_MARGIN = 0.05;

export class Viewport {
    #svg;
    #onChange;
    #view = { x: 0, y: 0, w: 100, h: 100 };
    #fitView = { x: 0, y: 0, w: 100, h: 100 };
    #drag = null;

    constructor(svg, { onChange } = {}) {
        this.#svg = svg;
        this.#onChange = onChange;
        svg.addEventListener("pointerdown", (e) => this.#onPointerDown(e));
        svg.addEventListener("pointermove", (e) => this.#onPointerMove(e));
        svg.addEventListener("pointerup", (e) => this.#onPointerUp(e));
        svg.addEventListener("pointercancel", (e) => this.#onPointerUp(e));
        svg.addEventListener("wheel", (e) => this.#onWheel(e), { passive: false });
    }

    get zoomPercent() {
        return (this.#fitView.w / this.#view.w) * 100;
    }

    // bbox in root SVG coordinates (y already flipped by the caller)
    setContent(bbox) {
        const mx = bbox.width * FIT_MARGIN || 1;
        const my = bbox.height * FIT_MARGIN || 1;
        this.#fitView = {
            x: bbox.x - mx,
            y: bbox.y - my,
            w: bbox.width + 2 * mx,
            h: bbox.height + 2 * my,
        };
        this.fit();
    }

    fit() {
        this.#view = { ...this.#fitView };
        this.#apply();
    }

    clientToBoard(clientX, clientY) {
        const ctm = this.#svg.getScreenCTM();
        if (!ctm) return { x: 0, y: 0 };
        const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
        return { x: p.x, y: p.y };
    }

    // board units per CSS pixel (preserveAspectRatio "meet")
    #scale() {
        const rect = this.#svg.getBoundingClientRect();
        return Math.max(this.#view.w / rect.width, this.#view.h / rect.height);
    }

    #onPointerDown(e) {
        if (e.button !== 0) return;
        this.#drag = { x: e.clientX, y: e.clientY };
        this.#svg.setPointerCapture(e.pointerId);
        this.#svg.classList.add("dragging");
    }

    #onPointerMove(e) {
        if (!this.#drag) return;
        const s = this.#scale();
        this.#view.x -= (e.clientX - this.#drag.x) * s;
        this.#view.y -= (e.clientY - this.#drag.y) * s;
        this.#drag = { x: e.clientX, y: e.clientY };
        this.#apply();
    }

    #onPointerUp(e) {
        this.#drag = null;
        this.#svg.classList.remove("dragging");
        if (this.#svg.hasPointerCapture(e.pointerId)) {
            this.#svg.releasePointerCapture(e.pointerId);
        }
    }

    #onWheel(e) {
        e.preventDefault();
        const k = Math.pow(ZOOM_STEP, e.deltaY < 0 ? 1 : -1);
        const p = this.clientToBoard(e.clientX, e.clientY);
        this.#view = {
            x: p.x - (p.x - this.#view.x) / k,
            y: p.y - (p.y - this.#view.y) / k,
            w: this.#view.w / k,
            h: this.#view.h / k,
        };
        this.#apply();
    }

    #apply() {
        const { x, y, w, h } = this.#view;
        this.#svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
        this.#onChange?.(this);
    }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --input-type=module --check < src/js/viewport.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/js/viewport.js
git commit -m "refactor: add viewBox-based pan/zoom module"
```

---

### Task 3: UI + bootstrap modules `src/js/ui.js`, `src/js/main.js`

**Files:**
- Create: `src/js/ui.js`
- Create: `src/js/main.js`

`ui.js`: layer panel (color chips, eye-toggles, Top/Bottom/All presets), signal hover (HUD + whole-net copper highlight via a dynamic stylesheet), drag-and-drop. `main.js`: wires everything, fetches the sample board. These reference DOM ids that Task 4 will create (`boardSvg`, `boardGroup`, `packagesGroup`, `layerList`, `styleSheetLayerColors`, `styleSheetLayerVisibility`, `styleSheetHighlight`, `hudSignal`, `hudCoords`, `hudZoom`, `boardName`, `fileInput`, `fitButton`, `dropOverlay`, plus class `layer-presets`).

- [ ] **Step 1: Write `src/js/ui.js` exactly as below**

```js
import { LAYER_COLORS } from "./render.js";

// EAGLE layer numbers: 1 Top, 16 Bottom, 17 Pads, 18 Vias, 20 Dimension,
// 21/22 t/bPlace, 23/24 t/bOrigins, 25/26 t/bNames.
const PRESETS = {
    top: ["1", "17", "18", "20", "21", "23", "25"],
    bottom: ["16", "17", "18", "20", "22", "24", "26"],
    all: null,
};

export class LayerPanel {
    #listEl;
    #colorStyleEl;
    #visibilityStyleEl;
    #layers = [];
    #visibility = new Map();

    constructor({ listEl, presetsEl, colorStyleEl, visibilityStyleEl }) {
        this.#listEl = listEl;
        this.#colorStyleEl = colorStyleEl;
        this.#visibilityStyleEl = visibilityStyleEl;
        presetsEl.addEventListener("click", (e) => {
            const preset = e.target.closest("button[data-preset]")?.dataset.preset;
            if (preset) this.applyPreset(preset);
        });
    }

    setLayers(layers) {
        this.#layers = layers;
        this.#visibility = new Map(layers.map((l) => [l.number, l.visible]));
        this.#colorStyleEl.textContent = layers
            .map((l) => {
                const c = LAYER_COLORS[l.color % LAYER_COLORS.length];
                return (
                    `.poly.layer${l.number}, .wire.layer${l.number} { stroke: ${c}; }\n` +
                    `.via.layer${l.number}, .rect.layer${l.number} { fill: ${c}; }\n` +
                    `text.layer${l.number} { fill: ${c}; }`
                );
            })
            .join("\n");
        this.#rebuildList();
        this.#applyVisibility();
    }

    applyPreset(name) {
        const wanted = PRESETS[name];
        for (const layer of this.#layers) {
            if (!layer.active) continue;
            this.#visibility.set(layer.number, wanted === null || wanted.includes(layer.number));
        }
        this.#rebuildList();
        this.#applyVisibility();
    }

    #rebuildList() {
        this.#listEl.replaceChildren();
        for (const layer of this.#layers) {
            if (!layer.active) continue;
            const item = document.createElement("li");
            const label = document.createElement("label");

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = this.#visibility.get(layer.number);
            checkbox.addEventListener("change", () => {
                this.#visibility.set(layer.number, checkbox.checked);
                this.#applyVisibility();
            });

            const chip = document.createElement("span");
            chip.className = "layer-chip";
            chip.style.background = LAYER_COLORS[layer.color % LAYER_COLORS.length];

            const num = document.createElement("span");
            num.className = "layer-num";
            num.textContent = layer.number;

            const name = document.createElement("span");
            name.className = "layer-name";
            name.textContent = layer.name;

            label.append(checkbox, chip, num, name);
            item.appendChild(label);
            this.#listEl.appendChild(item);
        }
    }

    #applyVisibility() {
        let css = "";
        for (const [number, visible] of this.#visibility) {
            if (!visible) css += `.layer${number} { display: none; }\n`;
        }
        this.#visibilityStyleEl.textContent = css;
    }
}

// Highlights the whole net under the cursor and reports it to the HUD.
// The #boardGroup id selector outranks the .wire.layerN color rules.
export function initSignalHover(svg, highlightStyleEl, hudSignalEl) {
    const set = (name) => {
        if (name) {
            const sel = `[data-signal="${CSS.escape(name)}"]`;
            highlightStyleEl.textContent =
                `#boardGroup ${sel} { stroke: var(--copper); }\n` +
                `#boardGroup .via${sel}, #boardGroup .rect${sel} { fill: var(--copper); stroke: none; }`;
            hudSignalEl.textContent = name;
        } else {
            highlightStyleEl.textContent = "";
            hudSignalEl.textContent = "";
        }
    };
    svg.addEventListener("pointerover", (e) => set(e.target.getAttribute?.("data-signal")));
    svg.addEventListener("pointerout", () => set(null));
}

export function initDragDrop(zone, overlay, onFile) {
    let depth = 0;
    zone.addEventListener("dragenter", (e) => {
        e.preventDefault();
        depth++;
        overlay.classList.add("visible");
    });
    zone.addEventListener("dragover", (e) => e.preventDefault());
    zone.addEventListener("dragleave", () => {
        if (--depth <= 0) {
            depth = 0;
            overlay.classList.remove("visible");
        }
    });
    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        depth = 0;
        overlay.classList.remove("visible");
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
    });
}
```

- [ ] **Step 2: Write `src/js/main.js` exactly as below**

```js
import { renderBoard, parseLayers } from "./render.js";
import { Viewport } from "./viewport.js";
import { LayerPanel, initSignalHover, initDragDrop } from "./ui.js";

const SAMPLE_BOARD = "Arduino_MEGA2560_ref.brd";

const svg = document.getElementById("boardSvg");
const boardGroup = document.getElementById("boardGroup");
const packagesGroup = document.getElementById("packagesGroup");
const hudSignal = document.getElementById("hudSignal");
const hudCoords = document.getElementById("hudCoords");
const hudZoom = document.getElementById("hudZoom");
const boardName = document.getElementById("boardName");

const panel = new LayerPanel({
    listEl: document.getElementById("layerList"),
    presetsEl: document.querySelector(".layer-presets"),
    colorStyleEl: document.getElementById("styleSheetLayerColors"),
    visibilityStyleEl: document.getElementById("styleSheetLayerVisibility"),
});

const viewport = new Viewport(svg, {
    onChange: (vp) => {
        hudZoom.textContent = `${Math.round(vp.zoomPercent)}%`;
    },
});

function loadBoardXml(text, name) {
    const xmlDoc = new DOMParser().parseFromString(text, "application/xml");
    if (xmlDoc.querySelector("parsererror")) {
        boardName.textContent = "parse error — not an EAGLE XML board";
        return;
    }
    try {
        renderBoard(xmlDoc, { boardGroup, packagesGroup });
    } catch (err) {
        boardName.textContent = err.message;
        return;
    }
    panel.setLayers(parseLayers(xmlDoc));
    const b = boardGroup.getBBox();
    // board group is scale(1,-1): flip bbox into root SVG coords
    viewport.setContent({ x: b.x, y: -(b.y + b.height), width: b.width, height: b.height });
    boardName.textContent = name;
    boardGroup.classList.remove("board-in");
    svg.getBoundingClientRect(); // restart the entry animation
    boardGroup.classList.add("board-in");
}

async function loadFile(file) {
    loadBoardXml(await file.text(), file.name);
}

document.getElementById("fileInput").addEventListener("change", (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
});

document.getElementById("fitButton").addEventListener("click", () => viewport.fit());

initSignalHover(svg, document.getElementById("styleSheetHighlight"), hudSignal);
initDragDrop(document.body, document.getElementById("dropOverlay"), loadFile);

svg.addEventListener("pointermove", (e) => {
    const p = viewport.clientToBoard(e.clientX, e.clientY);
    hudCoords.textContent = `${p.x.toFixed(2)}, ${(-p.y).toFixed(2)} mm`;
});

fetch(SAMPLE_BOARD)
    .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
    })
    .then((text) => loadBoardXml(text, SAMPLE_BOARD))
    .catch(() => {
        boardName.textContent = "drop a .brd file to start";
    });
```

- [ ] **Step 3: Syntax check both files**

Run: `node --input-type=module --check < src/js/ui.js && node --input-type=module --check < src/js/main.js`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/js/ui.js src/js/main.js
git commit -m "refactor: add UI and bootstrap modules"
```

---

### Task 4: New shell — rewrite `src/index.html` + `src/index.css`, delete `src/index.js`

**Files:**
- Modify (full rewrite): `src/index.html`
- Modify (full rewrite): `src/index.css`
- Delete: `src/index.js`

This flips the app to the new modules and applies the "instrumentation bench" theme: deep charcoal, millimeter grid background, copper accent, IBM Plex Mono for data, Archivo Narrow for labels, OSD-style HUD bottom-right of the canvas.

- [ ] **Step 1: Replace `src/index.html` with exactly this**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>EAGLE Board Viewer</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="index.css">
    <script type="module" src="js/main.js"></script>
</head>
<body>
<header id="topBar">
    <h1 class="brand">EAGLE<span>VIEWER</span></h1>
    <label class="file-button" for="fileInput">Open .brd</label>
    <input type="file" id="fileInput" accept=".brd,.xml">
    <span id="boardName"></span>
    <button id="fitButton" title="Fit board to view">Fit</button>
</header>
<div id="bottomAreaContainer">
    <aside id="sideBar">
        <h2 class="panel-title">Layers</h2>
        <div class="layer-presets">
            <button data-preset="top">Top</button>
            <button data-preset="bottom">Bottom</button>
            <button data-preset="all">All</button>
        </div>
        <ul id="layerList"></ul>
    </aside>
    <main id="scrollView">
        <svg id="boardSvg" xmlns="http://www.w3.org/2000/svg">
            <style id="styleSheetLayerColors"></style>
            <style id="styleSheetLayerVisibility"></style>
            <style id="styleSheetHighlight"></style>
            <defs id="packagesGroup"></defs>
            <g id="boardGroup" transform="scale(1,-1)"></g>
        </svg>
        <div id="hud">
            <span id="hudSignal"></span>
            <span id="hudCoords">0.00, 0.00 mm</span>
            <span id="hudZoom">100%</span>
        </div>
        <div id="dropOverlay">Drop .brd file</div>
    </main>
</div>
</body>
</html>
```

- [ ] **Step 2: Replace `src/index.css` with exactly this**

```css
:root {
    --bg: #0f1112;
    --panel: #16191b;
    --panel-edge: #262b2e;
    --ink: #d6dbde;
    --muted: #79838a;
    --copper: #e8965a;
    --copper-dim: #9a5f33;
    --grid: rgba(255, 255, 255, 0.035);
    --font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace;
    --font-label: "Archivo Narrow", "Arial Narrow", sans-serif;
}

* { box-sizing: border-box; }

html, body {
    height: 100%;
    margin: 0;
}

body {
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--font-label);
}

/* ---- top bar ---- */

#topBar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    background: var(--panel);
    border-bottom: 1px solid var(--panel-edge);
}

.brand {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.14em;
}

.brand span { color: var(--copper); }

#fileInput { display: none; }

.file-button,
#fitButton {
    border: 1px solid var(--copper-dim);
    background: none;
    color: var(--copper);
    padding: 6px 14px;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
}

.file-button:hover,
#fitButton:hover {
    background: var(--copper);
    border-color: var(--copper);
    color: #14110d;
}

#boardName {
    flex: 1 1 auto;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ---- layout ---- */

#bottomAreaContainer {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
}

/* ---- layer panel ---- */

#sideBar {
    flex: 0 0 220px;
    background: var(--panel);
    border-right: 1px solid var(--panel-edge);
    padding: 14px;
    overflow-y: auto;
}

.panel-title {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--muted);
}

.layer-presets {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
}

.layer-presets button {
    flex: 1;
    background: none;
    border: 1px solid var(--panel-edge);
    color: var(--muted);
    padding: 5px 0;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
}

.layer-presets button:hover {
    border-color: var(--copper-dim);
    color: var(--copper);
}

#layerList {
    list-style: none;
    margin: 0;
    padding: 0;
}

#layerList label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 2px;
    font-family: var(--font-mono);
    font-size: 12px;
    cursor: pointer;
}

#layerList label:hover { color: var(--copper); }

#layerList input { accent-color: var(--copper); }

.layer-chip {
    flex: none;
    width: 11px;
    height: 11px;
    border-radius: 2px;
}

.layer-num {
    width: 2.5ch;
    text-align: right;
    font-size: 10px;
    color: var(--muted);
}

.layer-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ---- canvas ---- */

#scrollView {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    background-color: var(--bg);
    background-image:
        linear-gradient(var(--grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--grid) 1px, transparent 1px);
    background-size: 24px 24px;
}

#scrollView::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 120px rgba(0, 0, 0, 0.55);
}

#boardSvg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: grab;
    user-select: none;
    touch-action: none;
}

#boardSvg.dragging { cursor: grabbing; }

/* board primitives (moved from the old inline SVG <style>) */
.wire, .poly { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.poly { stroke-dasharray: 0.5, 3; }
.via { fill-rule: evenodd; }
.rect, .via { stroke: none; }
.origin {
    stroke: #949494;
    stroke-width: 1;
    fill: none;
    vector-effect: non-scaling-stroke;
}
#boardSvg text { cursor: default; user-select: none; }

.board-in { animation: board-in 0.4s ease-out; }
@keyframes board-in { from { opacity: 0; } }

/* ---- HUD ---- */

#hud {
    position: absolute;
    right: 14px;
    bottom: 14px;
    display: flex;
    gap: 18px;
    align-items: baseline;
    padding: 8px 14px;
    background: rgba(10, 12, 13, 0.72);
    border: 1px solid var(--panel-edge);
    backdrop-filter: blur(4px);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--muted);
    pointer-events: none;
}

#hudSignal {
    min-width: 8ch;
    color: var(--copper);
    font-weight: 600;
}

#hudSignal:empty::before {
    content: "\2014";
    color: var(--panel-edge);
}

/* ---- drop overlay ---- */

#dropOverlay {
    position: absolute;
    inset: 12px;
    z-index: 5;
    display: none;
    place-items: center;
    border: 2px dashed var(--copper-dim);
    background: rgba(15, 17, 18, 0.7);
    color: var(--copper);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    pointer-events: none;
}

#dropOverlay.visible { display: grid; }
```

- [ ] **Step 3: Delete the legacy script**

```bash
git rm src/index.js
```

- [ ] **Step 4: Smoke-check over HTTP**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/index.html
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/js/main.js
```
Expected: `200` twice. (If the server is down: `python3 -m http.server 8000 -d src` in background.)

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/index.css
git commit -m "feat: instrument-style dark UI on ES modules"
```

---

### Task 5: End-to-end verification in a real browser

**Files:** none created (fixes only if verification fails).

- [ ] **Step 1: Load browser tools**

Use `ToolSearch` with query `select:mcp__claude-flow__browser_open,mcp__claude-flow__browser_eval,mcp__claude-flow__browser_screenshot,mcp__claude-flow__browser_close` to load the schemas, then open `http://localhost:8000`.

- [ ] **Step 2: Verify rendering with browser_eval**

Evaluate and check each:

```js
// board rendered: thousands of shapes for the Arduino MEGA sample
document.querySelectorAll('#boardGroup *').length            // expect > 1000
// layer panel populated
document.querySelectorAll('#layerList li').length            // expect > 5
// viewBox was set by the viewport (not the default "")
document.getElementById('boardSvg').getAttribute('viewBox')  // expect 4 numbers
// signal hover machinery present
document.querySelectorAll('[data-signal]').length            // expect > 100
```

- [ ] **Step 3: Take a screenshot** and confirm visually: dark charcoal background with grid, copper-accent top bar, layer list with color chips on the left, HUD bottom-right, the Arduino board rendered and centered.

- [ ] **Step 4: Check for console errors** (browser_eval on `window.__errors` is not available — instead re-run `browser_open` and verify the page didn't blank; any uncaught module error leaves `#boardGroup` empty, which Step 2 already detects).

- [ ] **Step 5: Report.** If any check fails, fix the root cause (systematic-debugging), re-verify, and commit the fix as `fix: <subject ≤50 chars>`. If all pass and nothing changed, no commit is needed.

---

## Out of scope (deliberately)

- Grunt replacement / GitHub Actions deploy: `Gruntfile.js` `src/**/*` glob already copies the new `js/` subfolder, so the existing build keeps working. Infra change is a separate decision.
- Octagon/long pad shapes, package text rendering: pre-existing TODOs, unchanged.
- IE/legacy browser support: dropped intentionally (ES modules, PointerEvents).
