// Pan/zoom for an inline SVG by mutating its viewBox.
// Pointer events handle mouse/touch/pen; wheel zooms anchored at the cursor.

const ZOOM_STEP = 1.1;
const FIT_MARGIN = 0.05;
const MIN_ZOOM = 0.05; // 5% of the fit view
const MAX_ZOOM = 1000; // 100000% of the fit view

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
        if (e.button !== 0 || this.#drag) return;
        this.#drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.#svg.setPointerCapture(e.pointerId);
        this.#svg.classList.add("dragging");
    }

    #onPointerMove(e) {
        if (!this.#drag || e.pointerId !== this.#drag.id) return;
        const s = this.#scale();
        this.#view.x -= (e.clientX - this.#drag.x) * s;
        this.#view.y -= (e.clientY - this.#drag.y) * s;
        this.#drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.#apply();
    }

    #onPointerUp(e) {
        if (this.#drag && e.pointerId !== this.#drag.id) return;
        this.#drag = null;
        this.#svg.classList.remove("dragging");
        if (this.#svg.hasPointerCapture(e.pointerId)) {
            this.#svg.releasePointerCapture(e.pointerId);
        }
    }

    #onWheel(e) {
        e.preventDefault();
        if (!e.deltaY) return;
        // deltaMode 1 = lines (classic wheel); 0 = pixels (trackpads)
        const pixels = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        const exponent = Math.max(-3, Math.min(3, -pixels / 100));
        let k = Math.pow(ZOOM_STEP, exponent);
        // keep zoom within [MIN_ZOOM, MAX_ZOOM] of the fit view
        const targetW = Math.min(
            this.#fitView.w / MIN_ZOOM,
            Math.max(this.#fitView.w / MAX_ZOOM, this.#view.w / k)
        );
        k = this.#view.w / targetW;
        if (k === 1) return;
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
