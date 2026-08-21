/**
 * The catalog of things you can put on a slide, and how to name what is
 * already there.
 *
 * Everything here is a pure string builder: the panels use it to show a
 * preview, the canvas uses it to insert, and the layer list uses the
 * describe half. No DOM, so `scripts/check-canvas.ts` can exercise it.
 */

export type ElementKind = "text" | "image" | "icon" | "shape" | "group";

/** A thing the Elements/Text panels can drop onto the slide. */
export interface SlideElementSpec {
  id: string;
  label: string;
  kind: ElementKind;
  /** Body HTML for one element. `insertSnippet` positions it. */
  html: string;
  /** Natural size in slide pixels; the drop uses it as-is. */
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ svg */

export type IconNode = [string, Record<string, string>][];

const SVG_ATTRS = [
  'xmlns="http://www.w3.org/2000/svg"',
  'viewBox="0 0 24 24"',
  'fill="none"',
  'stroke="currentColor"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
].join(" ");

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Serialize a Lucide icon node into standalone SVG markup. */
export function iconSvgMarkup(
  node: IconNode,
  opts: { color?: string; strokeWidth?: number; size?: number } = {}
): string {
  const { color = "#111111", strokeWidth = 2, size = 200 } = opts;
  const children = node
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
          .join(" ")}/>`
    )
    .join("");
  return (
    `<svg ${SVG_ATTRS} stroke-width="${strokeWidth}" ` +
    `width="${size}" height="${size}" style="color:${escapeAttr(color)}">` +
    `${children}</svg>`
  );
}

/* --------------------------------------------------------------- shapes */

const CLIP = {
  triangle: "polygon(50% 0%, 100% 100%, 0% 100%)",
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  hexagon: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
  star:
    "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
  pentagon: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
} as const;

function box(style: string): string {
  return `<div style="${style}"></div>`;
}

/**
 * Shapes a container can express (a radius, a clip path) stay containers:
 * they resize without deforming a stroke and the PNG export walks straight
 * past them. Only genuinely curved artwork would need vectors.
 */
export function shapeCatalog(color: string): SlideElementSpec[] {
  const fill = `background:${color}`;
  const size = 260;
  const make = (
    id: string,
    label: string,
    style: string,
    width = size,
    height = size
  ): SlideElementSpec => ({
    id,
    label,
    kind: "shape",
    html: box(`${fill};width:${width}px;height:${height}px;${style}`),
    width,
    height,
  });

  return [
    make("square", "Cuadrado", ""),
    make("rect", "Rectángulo", "", 360, 220),
    make("rounded", "Redondeado", "border-radius:32px", 360, 220),
    make("circle", "Círculo", "border-radius:50%"),
    make("pill", "Píldora", "border-radius:999px", 360, 140),
    make("triangle", "Triángulo", `clip-path:${CLIP.triangle}`),
    make("diamond", "Rombo", `clip-path:${CLIP.diamond}`),
    make("pentagon", "Pentágono", `clip-path:${CLIP.pentagon}`),
    make("hexagon", "Hexágono", `clip-path:${CLIP.hexagon}`),
    make("star", "Estrella", `clip-path:${CLIP.star}`),
    make(
      "ring",
      "Anillo",
      `background:transparent;border:16px solid ${color};border-radius:50%`
    ),
    make(
      "outline",
      "Marco",
      `background:transparent;border:8px solid ${color};border-radius:16px`,
      360,
      220
    ),
  ];
}

/* -------------------------------------------------------- lines & arrows */

/**
 * ponytail: arrows are SVG with a viewBox, so a non-uniform resize stretches
 * the head along with the shaft. Shift-resize keeps the ratio. Give each head
 * its own fixed-size marker if that ever becomes annoying.
 */
function arrow(
  color: string,
  dashed: boolean,
  both: boolean,
  width: number,
  height: number
): string {
  const dash = dashed ? ' stroke-dasharray="6 5"' : "";
  const head = (x: number, dir: 1 | -1) =>
    `<path d="M${x} 12 l${-7 * dir} -6 M${x} 12 l${-7 * dir} 6"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 24" ` +
    `preserveAspectRatio="none" fill="none" stroke="${escapeAttr(color)}" ` +
    `stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ` +
    // Percentage dimensions on an SVG resolve against the slide root, not
    // against its own box, so it would land 1080px wide. Explicit pixels.
    `style="width:${width}px;height:${height}px;display:block">` +
    `<line x1="${both ? 8 : 2}" y1="12" x2="118" y2="12"${dash}/>` +
    head(118, 1) +
    (both ? head(2, -1) : "") +
    `</svg>`
  );
}

export function lineCatalog(color: string): SlideElementSpec[] {
  const w = 420;
  const spec = (
    id: string,
    label: string,
    html: string,
    height: number
  ): SlideElementSpec => ({ id, label, kind: "shape", html, width: w, height });

  return [
    spec(
      "line",
      "Línea",
      box(`background:${color};width:${w}px;height:6px;border-radius:3px`),
      6
    ),
    spec(
      "line-thick",
      "Línea gruesa",
      box(`background:${color};width:${w}px;height:16px;border-radius:8px`),
      16
    ),
    spec(
      "line-dashed",
      "Punteada",
      box(
        `width:${w}px;height:6px;background:repeating-linear-gradient(90deg,${color} 0 18px,transparent 18px 30px)`
      ),
      6
    ),
    spec("arrow", "Flecha", arrow(color, false, false, w, 48), 48),
    spec("arrow-dashed", "Flecha punteada", arrow(color, true, false, w, 48), 48),
    spec("arrow-both", "Doble flecha", arrow(color, false, true, w, 48), 48),
  ];
}

/* ----------------------------------------------------------------- text */

export interface TextPresetInput {
  headingFont: string;
  bodyFont: string;
  color: string;
  accent: string;
}

const q = (font: string) => `'${font.replace(/'/g, "")}', sans-serif`;

/** Presets land already wearing the brand's type and colour. */
export function textCatalog({
  headingFont,
  bodyFont,
  color,
  accent,
}: TextPresetInput): SlideElementSpec[] {
  const spec = (
    id: string,
    label: string,
    html: string,
    width: number,
    height: number
  ): SlideElementSpec => ({ id, label, kind: "text", html, width, height });

  const base = (font: string) =>
    `font-family:${q(font)};color:${color};margin:0;width:760px`;

  return [
    spec(
      "title",
      "Título",
      `<h1 style="${base(headingFont)};font-size:92px;font-weight:700;line-height:1.05;letter-spacing:-0.02em">Escribí tu título</h1>`,
      760,
      200
    ),
    spec(
      "subtitle",
      "Subtítulo",
      `<h2 style="${base(headingFont)};font-size:56px;font-weight:600;line-height:1.15">Un subtítulo que acompaña</h2>`,
      760,
      130
    ),
    spec(
      "body",
      "Cuerpo",
      `<p style="${base(bodyFont)};font-size:36px;font-weight:400;line-height:1.5">Texto de cuerpo para explicar la idea con calma y en dos o tres renglones.</p>`,
      760,
      170
    ),
    spec(
      "quote",
      "Cita",
      `<blockquote style="${base(bodyFont)};font-size:44px;font-style:italic;line-height:1.4;border-left:8px solid ${accent};padding-left:32px">&ldquo;La frase que querés que se recuerde.&rdquo;</blockquote>`,
      760,
      140
    ),
    spec(
      "label",
      "Etiqueta",
      `<span style="font-family:${q(bodyFont)};display:inline-block;font-size:24px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${accent}">Etiqueta</span>`,
      260,
      40
    ),
    spec(
      "badge",
      "Chip",
      `<span style="font-family:${q(bodyFont)};display:inline-block;font-size:26px;font-weight:600;color:#ffffff;background:${accent};padding:14px 32px;border-radius:999px">Novedad</span>`,
      220,
      64
    ),
    spec(
      "number",
      "Número",
      `<span style="font-family:${q(headingFont)};display:inline-block;font-size:160px;font-weight:800;line-height:1;color:${accent}">01</span>`,
      220,
      170
    ),
  ];
}

/* ---------------------------------------------------- font combinations */

export interface FontPair {
  id: string;
  heading: string;
  body: string;
  mood: string;
}

/** ponytail: a hand-picked shortlist, not a generated matrix. All Google
 *  Fonts, so `wrapSlideHtml` already knows how to load them. */
export const FONT_PAIRS: FontPair[] = [
  { id: "editorial", heading: "Playfair Display", body: "Inter", mood: "Editorial" },
  { id: "moderno", heading: "Poppins", body: "Inter", mood: "Moderno" },
  { id: "tecnico", heading: "Space Grotesk", body: "IBM Plex Sans", mood: "Técnico" },
  { id: "calido", heading: "Fraunces", body: "Nunito Sans", mood: "Cálido" },
  { id: "neutro", heading: "Inter", body: "Inter", mood: "Neutro" },
  { id: "impacto", heading: "Archivo Black", body: "Roboto", mood: "Impacto" },
];

/* ------------------------------------------------------------- describe */

export const OC_NAME = "data-oc-name";

/** The subset of an element the describe helpers read. Keeps them testable. */
interface Describable {
  getAttribute: (name: string) => string | null;
  tagName: string;
  textContent: string | null;
}

/**
 * What to call an element in the layer list. A stored name wins; otherwise
 * derive one, because "DIV" tells nobody anything.
 */
export function elementLabel(el: Describable): string {
  const stored = el.getAttribute(OC_NAME);
  if (stored) return stored;

  const tag = el.tagName.toLowerCase();
  if (tag === "img") return el.getAttribute("alt") || "Imagen";
  if (tag === "svg") return "Icono";
  if (el.getAttribute("data-oc-group") !== null) return "Grupo";

  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 36 ? `${text.slice(0, 36)}…` : text;

  return tag === "div" ? "Forma" : tag.toUpperCase();
}

export function elementKind(el: Describable): ElementKind {
  if (el.getAttribute("data-oc-group") !== null) return "group";
  const tag = el.tagName.toLowerCase();
  if (tag === "img") return "image";
  if (tag === "svg") return "icon";
  if ((el.textContent || "").trim()) return "text";
  return "shape";
}

/* ------------------------------------------------------------- dragging */

/** What the panels hand to the canvas when you drag or click an item. */
export interface DragPayload {
  html: string;
  width: number;
  height: number;
  /** Image URL for the cursor ghost; without one the ghost renders `html`. */
  previewUrl?: string;
}
