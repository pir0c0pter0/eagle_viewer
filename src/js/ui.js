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
                const n = CSS.escape(l.number); // untrusted .brd attribute
                return (
                    `.poly.layer${n}, .wire.layer${n} { stroke: ${c}; }\n` +
                    `.via.layer${n}, .rect.layer${n} { fill: ${c}; }\n` +
                    `text.layer${n} { fill: ${c}; }`
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
            if (!visible) css += `.layer${CSS.escape(number)} { display: none; }\n`;
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
        if (!e.dataTransfer?.types.includes("Files")) return;
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
