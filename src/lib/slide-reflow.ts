/**
 * Re-laying a slide out when the canvas changes shape.
 *
 * Every Instagram format is 1080px wide, so the only thing that ever changes
 * is the height. Scaling x and y independently would stretch every circle and
 * every glyph, so the whole slide is scaled by one factor — `min(sx, sy)` —
 * and the result is re-centred in the new canvas. That is an approximation by
 * nature: no automatic reflow gets it right every time, which is why the UI
 * asks first and every slide keeps its previous version on the server.
 *
 * The string half lives here so it can be checked from node.
 */

/**
 * Declarations whose px values move with the canvas. Anything not listed is
 * copied through untouched — scaling `border-width` on a hairline rule turns
 * it into a smudge, and scaling `background-position` moves art off frame.
 */
const SCALABLE_PROPS = new Set([
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "font-size",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "gap",
  "row-gap",
  "column-gap",
  "border-radius",
  "box-shadow",
  "text-shadow",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "inset",
]);

const PX = /(-?\d*\.?\d+)px/g;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Multiply every px length in the scalable declarations of a style attribute. */
export function scaleStyleLengths(style: string, k: number): string {
  if (!style || k === 1) return style;
  // Split on semicolons that are not inside parentheses, so a
  // `linear-gradient(a, b)` value survives intact.
  return style
    .split(/;(?![^(]*\))/)
    .map((decl) => {
      const colon = decl.indexOf(":");
      if (colon === -1) return decl;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      if (!SCALABLE_PROPS.has(prop)) return decl;
      const value = decl
        .slice(colon + 1)
        .replace(PX, (_, n: string) => `${round(Number.parseFloat(n) * k)}px`);
      return `${decl.slice(0, colon)}:${value}`;
    })
    .join(";");
}

/**
 * The uniform factor and the offset that re-centres the scaled content.
 *
 * `bounds` is the union box of the slide's own children, measured before
 * scaling. When the slide is empty the offset is zero and only the canvas
 * changes size.
 */
export function reflowTransform(
  from: { width: number; height: number },
  to: { width: number; height: number },
  bounds: { left: number; top: number; width: number; height: number } | null
): { k: number; dx: number; dy: number } {
  const k = Math.min(to.width / from.width, to.height / from.height);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { k, dx: 0, dy: 0 };
  }
  const dx = round((to.width - bounds.width * k) / 2 - bounds.left * k);
  const dy = round((to.height - bounds.height * k) / 2 - bounds.top * k);
  return { k, dx, dy };
}
