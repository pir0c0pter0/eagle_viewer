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
