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
        "fill-rule": "evenodd", // outer ring + drill hole
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
        // TODO handle EAGLE spin flag, e.g. rot="SMR0" (legacy parity bug:
        // mirror is misdetected and the rotate() becomes invalid)
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
