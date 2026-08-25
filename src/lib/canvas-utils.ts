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
  // ponytail: an <svg> root has no offset* boxes (Blink dropped them in 2016,
  // no other engine ever had them), so an arrow or an icon read back as NaN
  // and refused to move. Fall back to the computed style, which is relative to
  // the parent's padding box: a slide root with a border would shift these by
  // that width. Nothing we generate has one.
  if (typeof el.offsetWidth !== "number") {
    const cs = el.ownerDocument?.defaultView?.getComputedStyle(el);
    const n = (v: string | undefined) => Number.parseFloat(v || "") || 0;
    return {
      left: n(cs?.left),
      top: n(cs?.top),
      width: n(cs?.width),
      height: n(cs?.height),
    };
  }
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

/**
 * Insert one element from markup as a floating layer, centred on a point.
 *
 * The element is appended first and measured second: a text preset's height
 * depends on how the slide's own CSS wraps it, and guessing would drop it in
 * the wrong place. `fallback` covers the case where the browser reports zero
 * because nothing has loaded yet — an <img> is the usual culprit.
 */
export function insertSnippet(
  doc: Document,
  html: string,
  center: { x: number; y: number },
  slideW: number,
  slideH: number,
  fallback?: { width: number; height: number }
): HTMLElement | null {
  const root = getSlideRoot(doc);
  ensurePositioned(root);

  const template = doc.createElement("template");
  template.innerHTML = html;
  const node = Array.from(template.content.children).find(isElementNode);
  if (!node) return null;

  root.appendChild(node);
  node.style.position = "absolute";
  node.style.zIndex = String(nextZIndex(root));

  const width = node.offsetWidth || fallback?.width || slideW * DROP_WIDTH_RATIO;
  const height = node.offsetHeight || fallback?.height || width;

  applyBox(node, {
    left: clamp(center.x - width / 2, 0, Math.max(0, slideW - width)),
    top: clamp(center.y - height / 2, 0, Math.max(0, slideH - height)),
  });
  return node;
}

/** Insert an image as a floating layer and return it. */
export function insertFloatingImage(
  doc: Document,
  url: string,
  center: { x: number; y: number },
  slideW: number,
  slideH: number
): HTMLImageElement {
  const width = Math.round(slideW * DROP_WIDTH_RATIO);
  // Height stays auto so the natural aspect ratio survives; the transform
  // overlay writes an explicit height only once the user resizes.
  const img = insertSnippet(
    doc,
    `<img src="${url}" alt="" style="width:${width}px;height:auto">`,
    center,
    slideW,
    slideH,
    { width, height: width }
  ) as HTMLImageElement;
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

/* ======================================================================== */
/*  Rotation                                                                */
/* ======================================================================== */

/** Rotate a vector by `deg` degrees (screen axes: +y points down). */
export function rotateVec(x: number, y: number, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

const ROTATE_RE = /rotate\(\s*(-?[\d.]+)deg\s*\)/i;

/** Degrees from the element's own `transform`, 0 when it has none. */
export function getRotation(el: HTMLElement): number {
  const match = ROTATE_RE.exec(el.style.transform || "");
  const deg = match ? Number.parseFloat(match[1]) : 0;
  return Number.isFinite(deg) ? deg : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Write the rotation back, leaving any other transform function in place —
 * generated slides use `translate()` and `scale()` for their own layout and
 * clobbering the whole property would move the element.
 */
export function setRotation(el: HTMLElement, deg: number): void {
  const normalized = ((deg % 360) + 360) % 360;
  const current = el.style.transform || "";
  const rest = current.replace(ROTATE_RE, "").trim();
  const rotation = normalized === 0 ? "" : `rotate(${round2(normalized)}deg)`;
  const next = [rest, rotation].filter(Boolean).join(" ");
  if (next) {
    el.style.transform = next;
    // Without an explicit origin the slide's own CSS could rotate about a
    // corner, which breaks every anchor calculation below.
    el.style.transformOrigin = "50% 50%";
  } else {
    el.style.removeProperty("transform");
    el.style.removeProperty("transform-origin");
  }
}

/** Angle of a point around a centre, 0 degrees pointing straight up. */
export function angleFromCenter(
  center: { x: number; y: number },
  point: { x: number; y: number }
): number {
  const deg = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
  return (deg + 90 + 360) % 360;
}

export function snapAngle(deg: number, step = 15): number {
  return (((Math.round(deg / step) * step) % 360) + 360) % 360;
}

/* ======================================================================== */
/*  Resize                                                                  */
/* ======================================================================== */

export const MIN_ELEMENT_SIZE = 16;

export interface ResizeInput {
  start: Box;
  /** Handle id: any combination of n/s and e/w. */
  handle: string;
  /** Pointer delta in slide pixels. */
  dx: number;
  dy: number;
  /** Current rotation of the element, in degrees. */
  angle: number;
  keepRatio: boolean;
  minSize?: number;
}

/**
 * Resize a possibly-rotated box from one of its handles.
 *
 * Two things make this more than `width += dx`. First, the pointer delta is in
 * screen axes but the element grows along *its own* axes, so the delta is
 * projected back through -angle. Second, CSS rotates about the box centre, so
 * growing the box moves both of its edges; the opposite edge (the anchor) is
 * pinned by recomputing the centre from it.
 */
export function resizeBox(input: ResizeInput): Box {
  const { start, handle, dx, dy, angle, keepRatio } = input;
  const min = input.minSize ?? MIN_ELEMENT_SIZE;

  const signX = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const signY = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;

  const local = rotateVec(dx, dy, -angle);
  let width = start.width + local.x * signX;
  let height = start.height + local.y * signY;

  if (keepRatio && signX !== 0 && signY !== 0) {
    const ratio = start.height > 0 ? start.width / start.height : 1;
    // Drive from whichever axis the pointer moved further along, so the corner
    // keeps tracking the cursor instead of lagging on one axis.
    if (Math.abs(local.x) >= Math.abs(local.y)) height = width / ratio;
    else width = height * ratio;
  }

  width = Math.max(min, width);
  height = Math.max(min, height);

  const cx = start.left + start.width / 2;
  const cy = start.top + start.height / 2;
  const toAnchor = rotateVec(
    (-signX * start.width) / 2,
    (-signY * start.height) / 2,
    angle
  );
  const anchorX = cx + toAnchor.x;
  const anchorY = cy + toAnchor.y;
  const fromAnchor = rotateVec((signX * width) / 2, (signY * height) / 2, angle);

  return {
    left: anchorX + fromAnchor.x - width / 2,
    top: anchorY + fromAnchor.y - height / 2,
    width,
    height,
  };
}

/* ======================================================================== */
/*  Multi-selection geometry                                                */
/* ======================================================================== */

/**
 * Axis-aligned box covering every input box.
 *
 * ponytail: rotated members are measured by their *unrotated* box, so a tilted
 * element can poke slightly outside the group frame. Computing the true rotated
 * hull needs the four corners of each member; add it if the overhang ever
 * becomes visible in practice.
 */
export function unionBox(boxes: Box[]): Box {
  if (boxes.length === 0) return { left: 0, top: 0, width: 0, height: 0 };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of boxes) {
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.left + b.width);
    bottom = Math.max(bottom, b.top + b.height);
  }
  return { left, top, width: right - left, height: bottom - top };
}

/** Map a box from one enclosing frame into another, scaling proportionally. */
export function scaleBoxWithin(box: Box, from: Box, to: Box): Box {
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  return {
    left: to.left + (box.left - from.left) * sx,
    top: to.top + (box.top - from.top) * sy,
    width: box.width * sx,
    height: box.height * sy,
  };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/** Normalise a drag between two points into a positive-size box. */
export function boxFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number }
): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/* ======================================================================== */
/*  Align and distribute                                                    */
/* ======================================================================== */

export type AlignMode =
  | "left"
  | "center-h"
  | "right"
  | "top"
  | "center-v"
  | "bottom";

/** Offset that moves `box` into alignment with `bounds`. */
export function alignOffset(
  box: Box,
  bounds: Box,
  mode: AlignMode
): { dx: number; dy: number } {
  switch (mode) {
    case "left":
      return { dx: bounds.left - box.left, dy: 0 };
    case "center-h":
      return {
        dx: bounds.left + bounds.width / 2 - (box.left + box.width / 2),
        dy: 0,
      };
    case "right":
      return { dx: bounds.left + bounds.width - (box.left + box.width), dy: 0 };
    case "top":
      return { dx: 0, dy: bounds.top - box.top };
    case "center-v":
      return {
        dx: 0,
        dy: bounds.top + bounds.height / 2 - (box.top + box.height / 2),
      };
    case "bottom":
      return { dx: 0, dy: bounds.top + bounds.height - (box.top + box.height) };
  }
}

/**
 * Equal *gaps* between boxes along one axis (what Canva calls "space evenly").
 * The outermost two boxes stay put; everything between them is respaced.
 * Returns one offset per input box, in the original order.
 */
export function distributeOffsets(boxes: Box[], axis: "x" | "y"): number[] {
  const offsets = new Array<number>(boxes.length).fill(0);
  if (boxes.length < 3) return offsets;

  const size = (b: Box) => (axis === "x" ? b.width : b.height);
  const start = (b: Box) => (axis === "x" ? b.left : b.top);

  const order = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => start(a.box) - start(b.box));

  const first = order[0].box;
  const last = order[order.length - 1].box;
  const span = start(last) + size(last) - start(first);
  const used = order.reduce((sum, o) => sum + size(o.box), 0);
  const gap = (span - used) / (order.length - 1);

  let cursor = start(first) + size(first) + gap;
  for (let i = 1; i < order.length - 1; i++) {
    offsets[order[i].index] = cursor - start(order[i].box);
    cursor += size(order[i].box) + gap;
  }
  return offsets;
}

/* ======================================================================== */
/*  Zoom and pan                                                            */
/* ======================================================================== */

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/**
 * Pan correction that keeps `slidePoint` under the cursor across a zoom change.
 *
 * The slide is centred in its viewport and then translated by `pan`, so a
 * client x is `viewportCentre - slideW*k/2 + panX + s*k`. Solving that for the
 * pan that leaves the client position unchanged when k becomes k' collapses to
 * a single term per axis.
 */
export function zoomPanAt(
  pan: { x: number; y: number },
  slidePoint: { x: number; y: number },
  slideW: number,
  slideH: number,
  from: number,
  to: number
): { x: number; y: number } {
  const d = to - from;
  return {
    x: pan.x + d * (slideW / 2 - slidePoint.x),
    y: pan.y + d * (slideH / 2 - slidePoint.y),
  };
}

export function clampZoom(scale: number, fit: number): number {
  // Fit can legitimately sit below the 25% floor on a tall slide in a short
  // viewport; never make "fit to screen" unreachable.
  return clamp(scale, Math.min(MIN_ZOOM, fit), MAX_ZOOM);
}

/* ======================================================================== */
/*  Slide DOM contract                                                      */
/* ======================================================================== */

/** Marks an element the user has pinned: not selectable from the canvas. */
export const OC_LOCK = "data-oc-lock";
/** Marks a container that behaves as a single element. */
export const OC_GROUP = "data-oc-group";

function isElementNode(node: Node | null): node is HTMLElement {
  // ELEMENT_NODE === 1. Never `instanceof HTMLElement`: iframe nodes come from
  // another JS realm and would fail the check.
  return !!node && node.nodeType === 1 && typeof (node as HTMLElement).style !== "undefined";
}

export function elementChildren(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(isElementNode);
}

export function isLocked(el: HTMLElement): boolean {
  return el.hasAttribute(OC_LOCK);
}

export function setLocked(el: HTMLElement, locked: boolean): void {
  if (locked) el.setAttribute(OC_LOCK, "");
  else el.removeAttribute(OC_LOCK);
}

/** Marks a layer the user switched off from the layer list. */
export const OC_HIDDEN = "data-oc-hidden";

export function isHidden(el: HTMLElement): boolean {
  return el.hasAttribute(OC_HIDDEN);
}

/**
 * Hide a layer without removing it. `display:none` rather than an attribute
 * selector: the export renders the raw HTML with no stylesheet of ours, so
 * the rule has to travel with the element or hidden layers reappear in the PNG.
 */
export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (hidden) {
    el.setAttribute(OC_HIDDEN, el.style.display || "");
    el.style.display = "none";
  } else {
    el.style.display = el.getAttribute(OC_HIDDEN) || "";
    el.removeAttribute(OC_HIDDEN);
  }
}

export function isGroup(el: HTMLElement): boolean {
  return el.hasAttribute(OC_GROUP);
}

/**
 * What a click on `el` should actually select: the outermost group it belongs
 * to, or the element itself. Returns null when it or an ancestor is locked —
 * a locked element is reachable from the layers list, never from the canvas.
 */
export function resolveTarget(
  el: HTMLElement,
  root: HTMLElement
): HTMLElement | null {
  // A click on an arrow lands on its <line>, not on the <svg>. The guts of a
  // vector are never a layer: the <svg> is.
  const hit = (el.closest?.("svg") as HTMLElement | null) ?? el;
  let node: HTMLElement | null = hit;
  let group: HTMLElement | null = null;
  let locked = false;
  while (node && node !== root) {
    if (isLocked(node)) locked = true;
    if (isGroup(node)) group = node;
    node = node.parentElement;
  }
  if (locked) return null;
  return group ?? hit;
}

/** Every element on the slide a marquee or "select all" can reach. */
export function selectableElements(root: HTMLElement): HTMLElement[] {
  return elementChildren(root).filter((el) => !isLocked(el));
}

function px(n: number): string {
  return `${Math.round(n)}px`;
}

/* ------------------------------------------------------------- grouping */

/**
 * Wrap elements in a positioned container that moves, rotates and scales as
 * one. Requires a common parent — grouping across nesting levels would have to
 * reparent arbitrary generated markup, which is not worth the failure modes.
 */
export function groupElements(els: HTMLElement[]): HTMLElement | null {
  if (els.length < 2) return null;
  const parent = els[0].parentElement;
  if (!parent || els.some((el) => el.parentElement !== parent)) return null;

  const frame = unionBox(els.map(readBox));
  const doc = parent.ownerDocument;
  const group = doc.createElement("div");
  group.setAttribute(OC_GROUP, "");
  group.style.cssText = [
    "position:absolute",
    `left:${px(frame.left)}`,
    `top:${px(frame.top)}`,
    `width:${px(frame.width)}`,
    `height:${px(frame.height)}`,
    `z-index:${nextZIndex(parent)}`,
  ].join(";");

  // Keep the members in document order so their stacking survives the move.
  const ordered = elementChildren(parent).filter((el) => els.includes(el));
  parent.insertBefore(group, ordered[0]);
  for (const el of ordered) {
    const box = readBox(el);
    group.appendChild(el);
    el.style.position = "absolute";
    el.style.left = px(box.left - frame.left);
    el.style.top = px(box.top - frame.top);
  }
  return group;
}

/**
 * ponytail: children are put back at their laid-out offsets, so a group that
 * was rotated before ungrouping leaves its members axis-aligned at their
 * pre-rotation spots. Baking the group rotation into each child needs a full
 * corner transform per member; add it if rotated groups get common.
 */
export function ungroupElement(group: HTMLElement): HTMLElement[] {
  const parent = group.parentElement;
  if (!parent) return [];
  const frame = readBox(group);
  const released: HTMLElement[] = [];
  for (const child of elementChildren(group)) {
    const box = readBox(child);
    parent.insertBefore(child, group);
    child.style.position = "absolute";
    child.style.left = px(box.left + frame.left);
    child.style.top = px(box.top + frame.top);
    released.push(child);
  }
  group.remove();
  return released;
}

/** Scale a group's contents to match a resized frame. */
export function scaleGroupChildren(
  group: HTMLElement,
  from: { width: number; height: number },
  to: { width: number; height: number }
): void {
  const fromFrame = { left: 0, top: 0, width: from.width, height: from.height };
  const toFrame = { left: 0, top: 0, width: to.width, height: to.height };
  for (const child of elementChildren(group)) {
    // ponytail: geometry only. Font size does not scale with the frame, so a
    // text member keeps its size while its box grows. Scale fontSize here if
    // that reads wrong.
    applyBox(child, scaleBoxWithin(readBox(child), fromFrame, toFrame));
  }
}

/* --------------------------------------------------------- stacking order */

export type LayerAction = "front" | "forward" | "backward" | "back";

/**
 * Reorder within the parent and renumber every sibling's z-index, so DOM order
 * and z-index can never disagree — mixed sources of truth here produce a
 * "brought to front but still behind" bug that is miserable to chase.
 */
export function reorderLayer(el: HTMLElement, action: LayerAction): void {
  const parent = el.parentElement;
  if (!parent) return;
  const siblings = elementChildren(parent);
  const index = siblings.indexOf(el);
  if (index === -1) return;

  if (action === "front") {
    parent.appendChild(el);
  } else if (action === "back") {
    parent.insertBefore(el, siblings[0]);
  } else if (action === "forward" && index < siblings.length - 1) {
    parent.insertBefore(el, siblings[index + 1].nextSibling);
  } else if (action === "backward" && index > 0) {
    parent.insertBefore(el, siblings[index - 1]);
  }

  renumberLayers(parent);
}

/** DOM order is the stacking order; z-index is written to agree with it. */
export function renumberLayers(parent: HTMLElement): void {
  elementChildren(parent).forEach((sibling, i) => {
    sibling.style.zIndex = String(i + 1);
  });
}

/**
 * Move an element to an absolute position among its siblings, counted from
 * the bottom of the stack. Used by the layer list, where you drop a row at an
 * arbitrary index rather than nudging it one step at a time.
 */
export function moveLayerTo(el: HTMLElement, index: number): void {
  const parent = el.parentElement;
  if (!parent) return;
  const siblings = elementChildren(parent).filter((s) => s !== el);
  const target = clamp(index, 0, siblings.length);
  parent.insertBefore(el, siblings[target] ?? null);
  renumberLayers(parent);
}

/* --------------------------------------------------- duplicate and paste */

export const PASTE_OFFSET = 24;

/** Slide-space HTML for a selection, ready to hand to `pasteHtml`. */
export function serializeSelection(els: HTMLElement[]): string {
  return els.map((el) => el.outerHTML).join("");
}

/**
 * Insert serialized elements into a slide as floating layers.
 * Returns what was inserted so the caller can select it.
 */
export function pasteHtml(
  doc: Document,
  html: string,
  offset = PASTE_OFFSET
): HTMLElement[] {
  const root = getSlideRoot(doc);
  ensurePositioned(root);

  const template = doc.createElement("template");
  template.innerHTML = html;
  const inserted: HTMLElement[] = [];

  for (const node of Array.from(template.content.children)) {
    if (!isElementNode(node)) continue;
    root.appendChild(node);
    node.style.position = "absolute";
    const box = readBox(node);
    applyBox(node, { left: box.left + offset, top: box.top + offset });
    node.style.zIndex = String(nextZIndex(root));
    inserted.push(node);
  }
  return inserted;
}

export function duplicateElements(
  els: HTMLElement[],
  offset = PASTE_OFFSET
): HTMLElement[] {
  if (els.length === 0) return [];
  return pasteHtml(els[0].ownerDocument, serializeSelection(els), offset);
}

export function ensurePositioned(root: HTMLElement): void {
  const win = root.ownerDocument.defaultView;
  if (win && win.getComputedStyle(root).position === "static") {
    root.style.position = "relative";
  }
}

/**
 * Make an element freely positionable without moving it. Slide markup is
 * mostly flow-laid-out, so the first drag of a heading has to convert it —
 * reading the laid-out box first is what keeps it visually still.
 */
export function makeFloating(el: HTMLElement): void {
  if (isFloating(el)) return;
  const parent = el.parentElement;
  if (parent) ensurePositioned(parent);
  const box = readBox(el);
  el.style.position = "absolute";
  applyBox(el, box);
}
