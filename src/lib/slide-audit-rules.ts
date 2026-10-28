// The pure half of the slide audit: measured boxes in, warnings out.
//
// Kept free of imports on purpose. `npm run check:canvas` runs these rules
// under plain node, and a self-check that had to boot headless Chrome to
// verify arithmetic would stop being run.

/** One element of the slide, as the browser actually laid it out. */
export interface MeasuredBox {
  name: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Content extents. Larger than the box means the content is being cut off. */
  scrollWidth: number;
  scrollHeight: number;
  /** Has a background, an image or a border — i.e. it paints something. */
  painted: boolean;
  childCount: number;
}

// Sub-pixel noise: a 919.6px box reported against a 920px declaration is not a
// bug worth a line of the agent's attention.
const SLACK = 2;

function label(b: MeasuredBox): string {
  return b.name || b.text.slice(0, 30) || "unnamed element";
}

/**
 * Geometry-only defects, from measured boxes.
 *
 * Only geometry on purpose: every check here is arithmetic with an exact
 * answer, so it cannot cry wolf. Contrast, collision and Instagram's safe area
 * were considered and left out — they need a judgement call about intent, and
 * a warning the agent learns to ignore is worse than no warning at all.
 *
 * Messages are in English, like the rest of the system prompt: they reach
 * only the agent, which answers the user in the UI's language.
 */
export function findIssues(
  boxes: MeasuredBox[],
  width: number,
  height: number
): string[] {
  const out: string[] = [];

  for (const b of boxes) {
    const name = label(b);
    const right = b.left + b.width;
    const bottom = b.top + b.height;
    const hasText = b.text.trim().length > 0;

    if (right <= 0 || bottom <= 0 || b.left >= width || b.top >= height) {
      out.push(
        `"${name}" is not visible: it is entirely outside the canvas (left ${Math.round(b.left)}px, top ${Math.round(b.top)}px, ${Math.round(b.width)}x${Math.round(b.height)}px).`
      );
      continue; // already invisible; the other checks add nothing
    }

    if (b.width === 0 || b.height === 0) {
      out.push(
        `"${name}" has ${b.width === 0 ? "width" : "height"} 0px — it is not visible.`
      );
      continue;
    }

    if (!hasText && b.childCount === 0 && !b.painted) {
      out.push(
        `"${name}" is empty: no text, no background and no children. Delete it or give it content.`
      );
      continue;
    }

    // ponytail: partial overflow is only reported for text. A shape bleeding
    // off the edge is deliberate design; cut-off text never is. Telling them
    // apart better needs to know whether the element is decorative, and
    // nothing declares that today.
    if (!hasText) continue;

    const sides: string[] = [];
    if (b.left < -SLACK) sides.push(`${Math.round(-b.left)}px on the left`);
    if (b.top < -SLACK) sides.push(`${Math.round(-b.top)}px at the top`);
    if (right > width + SLACK)
      sides.push(`${Math.round(right - width)}px on the right`);
    if (bottom > height + SLACK)
      sides.push(`${Math.round(bottom - height)}px at the bottom`);
    if (sides.length > 0) {
      out.push(`"${name}" overflows the canvas: ${sides.join(" and ")}.`);
    }

    if (b.scrollWidth > b.width + SLACK) {
      out.push(
        `"${name}" is cut off: the text is ${Math.round(b.scrollWidth)}px wide and the box ${Math.round(b.width)}px. Enlarge the box or shrink the font.`
      );
    }
    if (b.scrollHeight > b.height + SLACK) {
      out.push(
        `"${name}" is cut off: the text is ${Math.round(b.scrollHeight)}px tall and the box ${Math.round(b.height)}px. Enlarge the box or shrink the font.`
      );
    }
  }

  return out;
}
