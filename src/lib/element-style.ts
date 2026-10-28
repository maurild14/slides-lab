/**
 * Effects, filters and frames as pure string transformations.
 *
 * Everything here is expressed with native CSS the Puppeteer export already
 * walks past untouched — no canvas passes, no server work. Keeping it out of
 * the components means the whole surface is testable from node.
 */

/* ------------------------------------------------------------ text effects */

/**
 * Every property any effect writes. Switching effects clears the whole set
 * first, otherwise a neon glow would still be under the new outline.
 *
 * Deliberately narrow: no background, no padding. A highlighted chip is a
 * fill, and the Relleno section already owns fills.
 */
export const TEXT_EFFECT_PROPS = [
  "text-shadow",
  "-webkit-text-stroke",
  "paint-order",
] as const;

export interface TextEffect {
  id: string;
  label: string;
  /** `color` is the effect's own colour, never the text's. */
  css: (color: string) => Record<string, string>;
}

export const TEXT_EFFECTS: TextEffect[] = [
  { id: "none", label: "None", css: () => ({}) },
  {
    id: "shadow",
    label: "Shadow",
    css: (c) => ({ "text-shadow": `0 6px 16px ${withAlpha(c, 0.45)}` }),
  },
  {
    id: "outline",
    label: "Outline",
    css: (c) => ({
      // Without paint-order the stroke is painted over the glyph and eats
      // half its weight.
      "-webkit-text-stroke": `3px ${c}`,
      "paint-order": "stroke fill",
    }),
  },
  {
    id: "neon",
    label: "Neon",
    css: (c) => ({
      "text-shadow": `0 0 6px ${c}, 0 0 22px ${c}, 0 0 48px ${withAlpha(c, 0.6)}`,
    }),
  },
  {
    id: "echo",
    label: "Echo",
    css: (c) => ({
      "text-shadow": `6px 6px 0 ${withAlpha(c, 0.45)}, 12px 12px 0 ${withAlpha(c, 0.2)}`,
    }),
  },
  {
    id: "emboss",
    label: "Lift",
    css: () => ({
      "text-shadow": "0 1px 0 rgb(255 255 255 / 0.6), 0 -1px 0 rgb(0 0 0 / 0.35)",
    }),
  },
];

/**
 * Which effect the element is wearing, read back from its own inline style.
 *
 * ponytail: shape-matching on the value we wrote, not a general parser. It is
 * only ever asked about strings this module produced; anything else falls
 * back to "sombra", which is the honest answer for an unknown text-shadow.
 */
export function readTextEffect(style: {
  textShadow?: string;
  webkitTextStroke?: string;
}): string {
  const stroke = (style.webkitTextStroke || "").trim();
  if (stroke && !/^0(px)?(\s|$)/.test(stroke)) return "outline";
  const shadow = (style.textShadow || "").trim();
  if (!shadow || shadow === "none") return "none";
  const layers = shadow.split(/,(?![^(]*\))/);
  if (layers.length >= 3) return "neon";
  if (layers.length === 2) return /-1px/.test(shadow) ? "emboss" : "echo";
  return "shadow";
}

/** `#rrggbb` → `rgb(r g b / a)`. Any other notation is passed through. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return color;
  const n = Number.parseInt(hex[1], 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`;
}

/* ---------------------------------------------------------------- filters */

export interface FilterDef {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** The value that means "untouched"; omitted from the built string. */
  base: number;
}

export const FILTER_DEFS: FilterDef[] = [
  { key: "brightness", label: "Brightness", unit: "%", min: 0, max: 200, base: 100 },
  { key: "contrast", label: "Contrast", unit: "%", min: 0, max: 200, base: 100 },
  { key: "saturate", label: "Saturation", unit: "%", min: 0, max: 300, base: 100 },
  { key: "grayscale", label: "Black and white", unit: "%", min: 0, max: 100, base: 0 },
  { key: "sepia", label: "Sepia", unit: "%", min: 0, max: 100, base: 0 },
  { key: "hue-rotate", label: "Hue", unit: "deg", min: 0, max: 360, base: 0 },
  { key: "blur", label: "Blur", unit: "px", min: 0, max: 40, base: 0 },
];

const FILTER_UNIT: Record<string, string> = Object.fromEntries(
  FILTER_DEFS.map((d) => [d.key, d.unit])
);
const FILTER_BASE: Record<string, number> = Object.fromEntries(
  FILTER_DEFS.map((d) => [d.key, d.base])
);

export type FilterValues = Record<string, number>;

/** Defaults for everything the caller did not set. */
export function baseFilters(): FilterValues {
  return { ...FILTER_BASE };
}

export function parseFilters(css: string | null | undefined): FilterValues {
  const out = baseFilters();
  if (!css || css === "none") return out;
  for (const match of css.matchAll(/([a-z-]+)\(([^)]*)\)/gi)) {
    const key = match[1].toLowerCase();
    if (!(key in out)) continue;
    const raw = match[2];
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) continue;
    // A bare number on a percentage filter is the 0–1 form: saturate(1.5).
    out[key] = FILTER_UNIT[key] === "%" && !raw.includes("%") ? n * 100 : n;
  }
  return out;
}

export function buildFilters(values: FilterValues): string {
  const parts: string[] = [];
  for (const def of FILTER_DEFS) {
    const v = values[def.key];
    if (v === undefined || Math.abs(v - def.base) < 0.001) continue;
    parts.push(`${def.key}(${round(v)}${def.unit})`);
  }
  return parts.join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export const FILTER_PRESETS: { id: string; label: string; values: FilterValues }[] = [
  { id: "none", label: "Original", values: {} },
  { id: "vivid", label: "Vivid", values: { saturate: 150, contrast: 115 } },
  { id: "soft", label: "Soft", values: { saturate: 85, brightness: 108, contrast: 92 } },
  { id: "bw", label: "Black and white", values: { grayscale: 100, contrast: 110 } },
  { id: "sepia", label: "Sepia", values: { sepia: 80, saturate: 120 } },
  { id: "cold", label: "Cool", values: { "hue-rotate": 190, saturate: 120 } },
  { id: "warm", label: "Warm", values: { sepia: 30, saturate: 130, brightness: 105 } },
  // ponytail: duotone approximated with stacked native filters. A real
  // two-colour map needs an SVG feComponentTransfer — add that if the
  // approximation stops passing as one.
  {
    id: "duotone",
    label: "Duotone",
    values: { grayscale: 100, sepia: 100, saturate: 300, "hue-rotate": 200 },
  },
];

export function presetFilters(id: string): FilterValues {
  const preset = FILTER_PRESETS.find((p) => p.id === id);
  return { ...baseFilters(), ...(preset?.values ?? {}) };
}

/* ------------------------------------------------------------------- flip */

const FLIP: Record<"x" | "y", RegExp> = {
  x: /scaleX\(\s*-1\s*\)/i,
  y: /scaleY\(\s*-1\s*\)/i,
};

export function hasFlip(transform: string, axis: "x" | "y"): boolean {
  return FLIP[axis].test(transform || "");
}

/**
 * Mirroring goes in front of the rotation so `setRotation`, which strips and
 * re-appends `rotate()`, leaves the order stable.
 */
export function toggleFlipTransform(transform: string, axis: "x" | "y"): string {
  const current = transform || "";
  if (hasFlip(current, axis)) {
    return current.replace(FLIP[axis], "").replace(/\s+/g, " ").trim();
  }
  return `scale${axis.toUpperCase()}(-1) ${current}`.trim();
}

/* ----------------------------------------------------------------- frames */

export const IMAGE_FRAMES: { id: string; label: string; clip: string }[] = [
  { id: "none", label: "No frame", clip: "" },
  { id: "circle", label: "Circle", clip: "circle(50%)" },
  { id: "arch", label: "Arch", clip: "inset(0 round 50% 50% 0 0)" },
  { id: "pill", label: "Pill", clip: "inset(0 round 999px)" },
  {
    id: "star",
    label: "Star",
    clip:
      "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
  },
  {
    id: "blob",
    label: "Drop",
    clip:
      "polygon(30% 2%, 62% 0%, 88% 14%, 100% 42%, 96% 72%, 76% 94%, 46% 100%, 18% 92%, 2% 68%, 0% 36%, 10% 12%)",
  },
];

/* ----------------------------------------------------------------- shadow */

export const SHADOW_PRESETS: { id: string; label: string; value: string }[] = [
  { id: "none", label: "No shadow", value: "" },
  { id: "soft", label: "Soft", value: "0 4px 14px rgb(0 0 0 / 0.12)" },
  { id: "medium", label: "Medium shadow", value: "0 14px 34px rgb(0 0 0 / 0.18)" },
  { id: "strong", label: "Strong", value: "0 26px 60px rgb(0 0 0 / 0.28)" },
  { id: "hard", label: "Hard", value: "10px 10px 0 rgb(0 0 0 / 0.85)" },
];

/* ------------------------------------------------------------ copy style */

/**
 * What "copy style" carries from one element to another.
 *
 * Deliberately excludes everything that says *where* the element is or *how
 * big* it is (`left`, `top`, `width`, `height`, `transform`, `z-index`) and
 * everything that says what it contains. Pasting a style must never move the
 * target or resize it — that is what makes it feel like a brush instead of a
 * duplicate.
 */
export const STYLE_COPY_PROPS = [
  // typography
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration",
  "color",
  // text effects
  ...TEXT_EFFECT_PROPS,
  // fill and frame. Longhands only: the computed value of a shorthand like
  // `background` is a seven-part serialization that means nothing to read back.
  "background-color",
  "background-image",
  "border-width",
  "border-style",
  "border-color",
  "border-radius",
  "box-shadow",
  "opacity",
  // padding, because a chip without its padding is not the same chip
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  // images
  "filter",
  "clip-path",
  "object-fit",
  "object-position",
] as const;

export type StyleSnapshot = Record<string, string>;

/**
 * The look of an element, read from its *computed* style.
 *
 * Reading the inline style instead looks tempting and is wrong: a heading
 * whose size comes from a `<style>` block — which is most of what the agent
 * writes — has no inline `font-size`, so the snapshot would carry none, and
 * the paste below would clear the target's own size and drop it to the
 * browser default. Computed style is always complete, which is what makes
 * "clear everything, then apply" safe.
 */
export function readStyleSnapshot(el: HTMLElement): StyleSnapshot {
  const win = el.ownerDocument?.defaultView;
  const computed = win ? win.getComputedStyle(el) : null;
  const out: StyleSnapshot = {};
  for (const prop of STYLE_COPY_PROPS) {
    // A few properties have no computed value worth the name
    // (`-webkit-text-stroke` serializes empty when the sides differ), so the
    // inline declaration is the fallback rather than the source.
    const value = computed?.getPropertyValue(prop) || el.style.getPropertyValue(prop);
    if (value) out[prop] = value;
  }
  return out;
}

/**
 * Every copyable property, cleared first and then re-applied from the
 * snapshot. Clearing matters: pasting a plain style over a neon title has to
 * remove the glow, not leave it underneath.
 */
export function styleSnapshotPatch(snapshot: StyleSnapshot): StyleSnapshot {
  const patch: StyleSnapshot = {};
  for (const prop of STYLE_COPY_PROPS) patch[prop] = "";
  return { ...patch, ...snapshot };
}
