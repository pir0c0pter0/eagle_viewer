import { renderBoard, parseLayers } from "./render.js";
import { Viewport } from "./viewport.js";
import { LayerPanel, initSignalHover, initDragDrop } from "./ui.js";

const SAMPLE_BOARD = "Arduino_MEGA2560_ref.brd";

let boardLoaded = false;

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

const HALO_PX = 1.2; // separation outline thickness on screen, in pixels

// The copper separation outline keeps a constant on-screen thickness:
// --halo-extra is in board units, so it must follow the zoom.
function setHaloWidth(vp) {
    svg.style.setProperty("--halo-extra", `${(vp.unitsPerPixel * HALO_PX).toFixed(5)}px`);
}

const viewport = new Viewport(svg, {
    onChange: (vp) => {
        hudZoom.textContent = `${Math.round(vp.zoomPercent)}%`;
        setHaloWidth(vp);
    },
});

window.addEventListener("resize", () => setHaloWidth(viewport));

// Fit to the Dimension layer (20, the physical board outline) when present,
// so oversized copper texts don't inflate the fit view. Only nodes inside
// untransformed top-level groups are considered — they share boardGroup's
// coordinate space (stroked wires live one level down, in StrokeLayers groups).
function fitBBox() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of boardGroup.querySelectorAll(
        ":scope > .layer20, :scope > g > .wire.layer20"
    )) {
        const b = node.getBBox();
        if (b.width === 0 && b.height === 0) continue;
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
    }
    if (minX === Infinity) return boardGroup.getBBox();
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

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
    const b = fitBBox();
    // board group is scale(1,-1): flip bbox into root SVG coords
    viewport.setContent({ x: b.x, y: -(b.y + b.height), width: b.width, height: b.height });
    boardName.textContent = name;
    boardLoaded = true;
    boardGroup.classList.remove("board-in");
    svg.getBoundingClientRect(); // restart the entry animation
    boardGroup.classList.add("board-in");
}

async function loadFile(file) {
    try {
        loadBoardXml(await file.text(), file.name);
    } catch {
        boardName.textContent = `could not read ${file.name}`;
    }
}

document.getElementById("fileInput").addEventListener("change", (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
    e.target.value = "";
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
    .then((text) => {
        if (!boardLoaded) loadBoardXml(text, SAMPLE_BOARD);
    })
    .catch(() => {
        if (!boardLoaded) boardName.textContent = "drop a .brd file to start";
    });
