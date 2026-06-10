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

// Overlay layers drawn above the copper: t/bPlace, t/bNames, t/bValues,
// t/bDocu. Routed into translucent "silk" groups painted last.
const SILK_LAYERS = new Set(["21", "22", "25", "26", "27", "28", "51", "52"]);

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

// Thin light outline drawn under the copper so overlapping same-color
// shapes stay distinguishable. The halo width tracks the on-screen zoom
// through the --halo-extra custom property set in main.js (see .halo in
// index.css); --w carries the item's own stroke width in board units.
function makeHalo(node) {
    const halo = node.cloneNode(false);
    halo.setAttribute("class", node.getAttribute("class").replace(/\bwire\b/, "halo"));
    halo.removeAttribute("data-signal");
    halo.style.strokeWidth = "";
    halo.style.setProperty("--w", parseFloat(node.style.strokeWidth) || 0);
    return halo;
}

// Buckets stroked copper per layer: all of a layer's halos paint in one
// group under a sibling group with all of that layer's strokes, so the
// halo only shows along the outer contour of connected copper instead of
// outlining every individual segment.
class StrokeLayers {
    #dest;
    #groups = new Map();

    constructor(dest) {
        this.#dest = dest;
    }

    target(layer, kind) {
        let g = this.#groups.get(layer);
        if (!g) {
            g = { halo: el("g"), stroke: el("g") };
            this.#dest.appendChild(g.halo);
            this.#dest.appendChild(g.stroke);
            this.#groups.set(layer, g);
        }
        return g[kind];
    }
}

// EAGLE rot attribute: optional S (spin), optional M (mirror), then R<angle>,
// e.g. "R90", "MR180", "SMR0".
function parseRot(rot) {
    const m = /^(S?)(M?)R(-?[\d.]+)$/.exec(rot ?? "");
    if (!m) return { spin: false, mirrored: false, angle: 0 };
    return { spin: m[1] === "S", mirrored: m[2] === "M", angle: parseFloat(m[3]) || 0 };
}

function addWire(strokes, wire, signalName) {
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
    const layer = wire.getAttribute("layer");
    node.setAttribute("class", `wire layer${layer}`);
    strokeWidth(node, wire.getAttribute("width"));
    setSignalName(node, signalName);
    strokes.target(layer, "halo").appendChild(makeHalo(node));
    strokes.target(layer, "stroke").appendChild(node);
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

// Regular octagon with distance across flats = 2r (EAGLE octagon pad).
function octagonPath(x, y, r) {
    const circum = r / Math.cos(Math.PI / 8);
    const points = [];
    for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        points.push(`${x + circum * Math.cos(a)} ${y + circum * Math.sin(a)}`);
    }
    return `M${points.join(" L")} Z`;
}

// Capsule of radius r along x between circle centers x1 and x2.
function stadiumPath(x1, x2, y, r) {
    return (
        `M${x1} ${y - r}` +
        ` L${x2} ${y - r}` +
        ` A${r} ${r} 0 0 1 ${x2} ${y + r}` +
        ` L${x1} ${y + r}` +
        ` A${r} ${r} 0 0 1 ${x1} ${y - r} Z`
    );
}

function addVia(dest, via, actuallyPad, signalName) {
    const x = parseFloat(via.getAttribute("x"));
    const y = parseFloat(via.getAttribute("y"));
    const drill = parseFloat(via.getAttribute("drill")) / 2;
    let radius = drill + 0.4064; // 16 mils annular ring default
    const diameter = via.getAttribute("diameter");
    if (diameter !== null) radius = parseFloat(diameter) / 2;

    const shape = via.getAttribute("shape");
    let d;
    if (shape === "square") {
        d =
            `M${x - radius} ${y - radius}` +
            ` L${x + radius} ${y - radius}` +
            ` L${x + radius} ${y + radius}` +
            ` L${x - radius} ${y + radius} Z`;
    } else if (shape === "octagon") {
        d = octagonPath(x, y, radius);
    } else if (shape === "long") {
        d = stadiumPath(x - radius, x + radius, y, radius);
    } else if (shape === "offset") {
        d = stadiumPath(x, x + 2 * radius, y, radius); // drill in the round end
    } else {
        d = ring(x, y, radius);
    }
    d += ring(x, y, drill);

    const path = el("path", {
        d,
        "fill-rule": "evenodd", // outer shape + drill hole
        class: `via layer${actuallyPad ? PAD_LAYER : VIA_LAYER}`,
    });
    const { angle } = parseRot(via.getAttribute("rot"));
    if (angle) path.setAttribute("transform", `rotate(${angle} ${x} ${y})`);
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
    const { angle } = parseRot(smd.getAttribute("rot"));
    if (angle) rect.setAttribute("transform", `rotate(${angle} ${x} ${y})`);
    dest.appendChild(rect);
}

function addText(dest, text, content = text.textContent) {
    const { mirrored, angle } = parseRot(text.getAttribute("rot"));
    let transform = `translate(${text.getAttribute("x")} ${text.getAttribute("y")})`;
    if (angle) transform += ` rotate(${angle})`;
    transform += " scale(1, -1)"; // glyphs back to y-down text space
    if (mirrored) transform += " scale(-1, 1)"; // EAGLE shows mirrored text mirrored
    const t = el("text", {
        "font-family": "IBM Plex Mono, monospace",
        "font-size": `${parseFloat(text.getAttribute("size")) * 1.4}px`,
        transform,
        class: `layer${text.getAttribute("layer")}`,
    });
    t.textContent = content;
    dest.appendChild(t);
}

function addCircle(strokes, circle) {
    const layer = circle.getAttribute("layer");
    const c = el("circle", {
        cx: circle.getAttribute("x"),
        cy: circle.getAttribute("y"),
        r: circle.getAttribute("radius"),
        class: `wire layer${layer}`,
    });
    c.style.strokeWidth = circle.getAttribute("width");
    strokes.target(layer, "halo").appendChild(makeHalo(c));
    strokes.target(layer, "stroke").appendChild(c);
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

// Mirrored elements sit on the opposite board side: their layers swap
// (1 Top ↔ 16 Bottom and every t/b pair), so colors and visibility must
// follow the bottom layers.
const MIRROR_LAYER = {
    1: 16, 16: 1,
    21: 22, 22: 21,
    23: 24, 24: 23,
    25: 26, 26: 25,
    27: 28, 28: 27,
    29: 30, 30: 29,
    31: 32, 32: 31,
    33: 34, 34: 33,
    35: 36, 36: 35,
    37: 38, 38: 37,
    39: 40, 40: 39,
    41: 42, 42: 41,
    51: 52, 52: 51,
};

function mirrorClasses(root) {
    for (const node of [root, ...root.querySelectorAll("[class]")]) {
        const cls = node.getAttribute("class");
        if (!cls) continue;
        node.setAttribute(
            "class",
            cls.replace(/\blayer(\d+)\b/g, (_, n) => `layer${MIRROR_LAYER[n] ?? n}`)
        );
    }
}

// A mirrored element can't share the normal package def — its layer
// classes must be swapped. Clone the def lazily on first mirrored use.
function ensureMirroredPackage(packagesGroup, packageId) {
    const mirroredId = `${packageId}___MIRROR`;
    if (!document.getElementById(mirroredId)) {
        const clone = document.getElementById(packageId).cloneNode(true);
        clone.setAttribute("id", mirroredId);
        mirrorClasses(clone);
        packagesGroup.appendChild(clone);
    }
    return mirroredId;
}

function addElement(dest, element, packageTexts, deferredTexts, packagesGroup) {
    const packageId = `${element.getAttribute("library")}___${element.getAttribute("package")}`;
    const { mirrored, angle } = parseRot(element.getAttribute("rot"));
    const instanceTransform = `${mirrored ? "scale(-1 1) " : ""}rotate(${angle})`;

    const use = el("use");
    const useId = mirrored ? ensureMirroredPackage(packagesGroup, packageId) : packageId;
    use.setAttribute("href", `#${useId}`);
    if (mirrored || angle) use.setAttribute("transform", instanceTransform);

    const group = el("g", {
        transform: `translate(${element.getAttribute("x")} ${element.getAttribute("y")})`,
    });
    group.appendChild(use);

    // >NAME / >VALUE placeholders are per-instance, so they can't live in
    // the shared package <defs> — instantiate them here with real values.
    // Smashed elements override them with <attribute> children positioned
    // in absolute board coordinates.
    if (element.getAttribute("smashed") === "yes") {
        for (const attr of element.querySelectorAll("attribute")) {
            if (attr.getAttribute("x") === null || attr.getAttribute("size") === null) continue;
            const key = attr.getAttribute("name");
            let content;
            if (key === "NAME") content = element.getAttribute("name");
            else if (key === "VALUE") content = element.getAttribute("value");
            else content = attr.getAttribute("value");
            // deferred so labels paint above every package, not under them
            if (content) deferredTexts.push([attr, content]);
        }
    } else {
        const placeholders = packageTexts.get(packageId) ?? [];
        if (placeholders.length) {
            const textGroup = el("g", { class: "silk" });
            if (mirrored || angle) textGroup.setAttribute("transform", instanceTransform);
            for (const text of placeholders) {
                let content;
                if (text.textContent === ">NAME") content = element.getAttribute("name");
                else if (text.textContent === ">VALUE") content = element.getAttribute("value");
                if (content) addText(textGroup, text, content);
            }
            if (mirrored) mirrorClasses(textGroup);
            group.appendChild(textGroup);
        }
    }

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

    const boardStrokes = new StrokeLayers(boardGroup);
    // silkscreen paints above everything else (appended last, see below)
    const silkGroup = el("g", { class: "silk" });
    const silkStrokes = new StrokeLayers(silkGroup);
    const isSilk = (node) => SILK_LAYERS.has(node.getAttribute("layer"));

    const plain = board.querySelector("plain");
    if (plain) {
        for (const wire of plain.querySelectorAll("wire"))
            addWire(isSilk(wire) ? silkStrokes : boardStrokes, wire);
        for (const rect of plain.querySelectorAll("rectangle"))
            addRect(isSilk(rect) ? silkGroup : boardGroup, rect);
        for (const text of plain.querySelectorAll("text"))
            addText(isSilk(text) ? silkGroup : boardGroup, text);
    }

    const packageTexts = new Map();
    for (const library of board.querySelectorAll("libraries > library")) {
        for (const pack of library.querySelectorAll("packages > package")) {
            const packageId = `${library.getAttribute("name")}___${pack.getAttribute("name")}`;
            const group = el("g", { id: packageId });
            const packSilk = el("g", { class: "silk" });
            const packStrokes = new StrokeLayers(group);
            const packSilkStrokes = new StrokeLayers(packSilk);
            for (const circle of pack.querySelectorAll("circle"))
                addCircle(isSilk(circle) ? packSilkStrokes : packStrokes, circle);
            for (const pad of pack.querySelectorAll("pad")) addVia(group, pad, true);
            for (const smd of pack.querySelectorAll("smd")) addSmd(group, smd);
            for (const wire of pack.querySelectorAll("wire"))
                addWire(isSilk(wire) ? packSilkStrokes : packStrokes, wire);
            // literal texts are shared; >PLACEHOLDER texts are instantiated
            // per element with the element's name/value (see addElement)
            const placeholders = [];
            for (const text of pack.querySelectorAll("text")) {
                if (text.textContent.startsWith(">")) placeholders.push(text);
                else addText(isSilk(text) ? packSilk : group, text);
            }
            if (placeholders.length) packageTexts.set(packageId, placeholders);
            group.appendChild(packSilk); // package silk above its own pads
            packagesGroup.appendChild(group);
        }
    }

    for (const signal of board.querySelectorAll("signals > signal")) {
        const name = signal.getAttribute("name");
        for (const wire of signal.querySelectorAll("wire")) addWire(boardStrokes, wire, name);
        for (const polygon of signal.querySelectorAll("polygon"))
            addPolygon(boardGroup, polygon, name);
        for (const via of signal.querySelectorAll("via")) addVia(boardGroup, via, false, name);
    }

    const deferredTexts = [];
    for (const element of board.querySelectorAll("elements > element"))
        addElement(boardGroup, element, packageTexts, deferredTexts, packagesGroup);
    for (const [attr, content] of deferredTexts)
        addText(isSilk(attr) ? silkGroup : boardGroup, attr, content);

    boardGroup.appendChild(silkGroup);
}
