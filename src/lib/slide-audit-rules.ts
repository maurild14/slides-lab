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
  return b.name || b.text.slice(0, 30) || "elemento sin nombre";
}

/**
 * Geometry-only defects, from measured boxes.
 *
 * Only geometry on purpose: every check here is arithmetic with an exact
 * answer, so it cannot cry wolf. Contrast, collision and Instagram's safe area
 * were considered and left out — they need a judgement call about intent, and
 * a warning the agent learns to ignore is worse than no warning at all.
 *
 * Messages are in Spanish: they reach the agent, which answers the user in
 * Spanish, and they quote layer names that are already Spanish.
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
        `"${name}" no se ve: está completamente fuera del canvas (left ${Math.round(b.left)}px, top ${Math.round(b.top)}px, ${Math.round(b.width)}x${Math.round(b.height)}px).`
      );
      continue; // ya es invisible; el resto de los chequeos no aporta nada
    }

    if (b.width === 0 || b.height === 0) {
      out.push(
        `"${name}" tiene ${b.width === 0 ? "ancho" : "altura"} 0px — no se ve.`
      );
      continue;
    }

    if (!hasText && b.childCount === 0 && !b.painted) {
      out.push(
        `"${name}" está vacío: sin texto, sin fondo y sin hijos. Borralo o ponele contenido.`
      );
      continue;
    }

    // ponytail: el desborde parcial se reporta solo con texto. Una forma que
    // sangra por el borde es diseño deliberado; un texto cortado nunca lo es.
    // Si algún día hace falta distinguirlas mejor, el dato que falta es si el
    // elemento es decorativo, y eso hoy nadie lo declara.
    if (!hasText) continue;

    const sides: string[] = [];
    if (b.left < -SLACK) sides.push(`${Math.round(-b.left)}px por la izquierda`);
    if (b.top < -SLACK) sides.push(`${Math.round(-b.top)}px por arriba`);
    if (right > width + SLACK)
      sides.push(`${Math.round(right - width)}px por la derecha`);
    if (bottom > height + SLACK)
      sides.push(`${Math.round(bottom - height)}px por abajo`);
    if (sides.length > 0) {
      out.push(`"${name}" se sale del canvas: ${sides.join(" y ")}.`);
    }

    if (b.scrollWidth > b.width + SLACK) {
      out.push(
        `"${name}" se corta: el texto mide ${Math.round(b.scrollWidth)}px de ancho y la caja ${Math.round(b.width)}px. Agrandá la caja o achicá la fuente.`
      );
    }
    if (b.scrollHeight > b.height + SLACK) {
      out.push(
        `"${name}" se corta: el texto mide ${Math.round(b.scrollHeight)}px de alto y la caja ${Math.round(b.height)}px. Agrandá la caja o achicá la fuente.`
      );
    }
  }

  return out;
}
