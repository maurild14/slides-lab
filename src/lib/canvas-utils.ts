// No value imports on purpose: this module stays loadable by plain node so
// scripts/check-canvas.ts can exercise the snapping math without a bundler.

/**
 * Geometry for dropping and moving floating elements on a slide.
 *
 * The iframe is laid out at true slide size (1080xH) and scaled down with a CSS
 * transform, so getBoundingClientRect() gives the *visual* box while everything
 * inside the document still uses slide pixels. Every conversion below is just
 * that one ratio.
 */

export type SlideMetrics = {
  /** Visual box of the slide on screen. */
  rect: DOMRect;
  scale: number;
  slideW: number;
  slideH: number;
  doc: Document;
};

export type Box = { left: number; top: number; width: number; height: number };

export type Guide =
  | { axis: "x"; at: number }
  | { axis: "y"; at: number };

export const SAFE_MARGIN = 80;
export const SNAP_THRESHOLD = 8;
/** A dropped image starts at 30% of the slide width. */
export const DROP_WIDTH_RATIO = 0.3;

export function getSlideMetrics(
  iframe: HTMLIFrameElement | null,
  dimensions: { width: number; height: number }
): SlideMetrics | null {
  if (!iframe) return null;
  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    return null;
  }
  if (!doc?.body) return null;

  const rect = iframe.getBoundingClientRect();
  const { width: slideW, height: slideH } = dimensions;
  if (rect.width <= 0) return null;

  return { rect, scale: rect.width / slideW, slideW, slideH, doc };
}

export function toSlideCoords(
  clientX: number,
  clientY: number,
  m: SlideMetrics
): { x: number; y: number } {
  return {
    x: (clientX - m.rect.left) / m.scale,
    y: (clientY - m.rect.top) / m.scale,
  };
}

export function isInsideSlide(
  clientX: number,
  clientY: number,
  m: SlideMetrics
): boolean {
  return (
    clientX >= m.rect.left &&
    clientX <= m.rect.right &&
    clientY >= m.rect.top &&
    clientY <= m.rect.bottom
  );
}

/**
 * The slide's own root element. Slides are authored as a single sized div, but
 * that is a convention of the generator, not a guarantee — fall back to body.
 */
export function getSlideRoot(doc: Document): HTMLElement {
  const first = Array.from(doc.body.children).find(
    (el): el is HTMLElement => el instanceof (doc.defaultView?.HTMLElement ?? HTMLElement)
  );
  return first ?? doc.body;
}

/** True for elements that can be freely positioned (and so, dragged). */
export function isFloating(el: HTMLElement | null): boolean {
  if (!el) return false;
  const win = el.ownerDocument?.defaultView;
  if (!win) return false;
  const pos = win.getComputedStyle(el).position;
  return pos === "absolute" || pos === "fixed";
}

export function readBox(el: HTMLElement): Box {
  return {
    left: el.offsetLeft,
    top: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

export function applyBox(el: HTMLElement, box: Partial<Box>) {
  if (box.left !== undefined) el.style.left = `${Math.round(box.left)}px`;
  if (box.top !== undefined) el.style.top = `${Math.round(box.top)}px`;
  if (box.width !== undefined) el.style.width = `${Math.round(box.width)}px`;
  if (box.height !== undefined) el.style.height = `${Math.round(box.height)}px`;
}

/** Insert an image as a floating layer and return it. */
export function insertFloatingImage(
  doc: Document,
  url: string,
  center: { x: number; y: number },
  slideW: number,
  slideH: number
): HTMLImageElement {
  const root = getSlideRoot(doc);
  const win = root.ownerDocument.defaultView;
  if (win && win.getComputedStyle(root).position === "static") {
    root.style.position = "relative";
  }

  const width = Math.round(slideW * DROP_WIDTH_RATIO);
  const img = doc.createElement("img");
  img.src = url;
  img.alt = "";
  // Height stays auto so the natural aspect ratio survives; the transform
  // overlay writes an explicit height only once the user resizes.
  img.style.cssText = [
    "position:absolute",
    `left:${Math.round(clamp(center.x - width / 2, 0, slideW - width))}px`,
    `top:${Math.round(clamp(center.y - width / 2, 0, slideH - 40))}px`,
    `width:${width}px`,
    "height:auto",
    `z-index:${nextZIndex(root)}`,
  ].join(";");

  root.appendChild(img);
  return img;
}

export function nextZIndex(root: HTMLElement): number {
  const win = root.ownerDocument.defaultView;
  let max = 0;
  for (const child of Array.from(root.children)) {
    if (!(child instanceof (win?.HTMLElement ?? HTMLElement))) continue;
    const z = Number.parseInt(
      (child as HTMLElement).style.zIndex ||
        win?.getComputedStyle(child as HTMLElement).zIndex ||
        "0",
      10
    );
    if (Number.isFinite(z)) max = Math.max(max, z);
  }
  return max + 1;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Sibling boxes a dragged element can align against. */
export function siblingBoxes(el: HTMLElement): Box[] {
  const parent = el.parentElement;
  if (!parent) return [];
  const win = el.ownerDocument.defaultView;
  return Array.from(parent.children)
    .filter(
      (c): c is HTMLElement =>
        c !== el && c instanceof (win?.HTMLElement ?? HTMLElement)
    )
    .map(readBox)
    .filter((b) => b.width > 0 && b.height > 0);
}

/**
 * Snap a moving box to slide centers, safe margins and sibling edges.
 * Returns the adjusted position plus the guides to draw for it.
 */
export function computeSnap(
  box: Box,
  siblings: Box[],
  slideW: number,
  slideH: number,
  threshold = SNAP_THRESHOLD
): { left: number; top: number; guides: Guide[] } {
  const targetsX = [
    slideW / 2,
    SAFE_MARGIN,
    slideW - SAFE_MARGIN,
    0,
    slideW,
    ...siblings.flatMap((s) => [s.left, s.left + s.width / 2, s.left + s.width]),
  ];
  const targetsY = [
    slideH / 2,
    SAFE_MARGIN,
    slideH - SAFE_MARGIN,
    0,
    slideH,
    ...siblings.flatMap((s) => [s.top, s.top + s.height / 2, s.top + s.height]),
  ];

  // Each edge of the moving box can latch onto any target; keep the closest.
  const edgesX = [
    { offset: 0, value: box.left },
    { offset: box.width / 2, value: box.left + box.width / 2 },
    { offset: box.width, value: box.left + box.width },
  ];
  const edgesY = [
    { offset: 0, value: box.top },
    { offset: box.height / 2, value: box.top + box.height / 2 },
    { offset: box.height, value: box.top + box.height },
  ];

  const best = (
    edges: { offset: number; value: number }[],
    targets: number[]
  ): { position: number; guide: number } | null => {
    let winner: { position: number; guide: number; distance: number } | null =
      null;
    for (const edge of edges) {
      for (const target of targets) {
        const distance = Math.abs(edge.value - target);
        if (distance > threshold) continue;
        if (!winner || distance < winner.distance) {
          winner = { position: target - edge.offset, guide: target, distance };
        }
      }
    }
    return winner ? { position: winner.position, guide: winner.guide } : null;
  };

  const snapX = best(edgesX, targetsX);
  const snapY = best(edgesY, targetsY);
  const guides: Guide[] = [];
  if (snapX) guides.push({ axis: "x", at: snapX.guide });
  if (snapY) guides.push({ axis: "y", at: snapY.guide });

  return {
    left: snapX ? snapX.position : box.left,
    top: snapY ? snapY.position : box.top,
    guides,
  };
}
