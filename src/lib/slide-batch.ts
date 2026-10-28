/**
 * Operations that rewrite a slide's stored HTML without opening it.
 *
 * "Apply to all" and the aspect-ratio reflow both have to touch
 * slides that are not on screen. Mounting eight iframes to do it would be
 * absurd, so these parse the markup with `DOMParser`, mutate it, and hand back
 * body-level HTML — the same shape `updateSlide` stores.
 *
 * Browser-only: `DOMParser` is not in the node build. Everything here is
 * called from event handlers, never from a server component.
 */

import { scaleStyleLengths, reflowTransform } from "./slide-reflow";
import type { Box } from "./canvas-utils";

function parse(html: string): { doc: Document; root: HTMLElement } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const first = Array.from(doc.body.children).find(
    (el): el is HTMLElement => el instanceof HTMLElement
  );
  return { doc, root: first ?? doc.body };
}

function serialize(doc: Document): string {
  // Trimmed because the iframe's own indentation rides along on every save,
  // and each pass through here would otherwise add another line to the front.
  return doc.body.innerHTML.trim();
}

/** Replace the slide background, leaving everything else alone. */
export function applyBackgroundToHtml(html: string, css: string): string {
  const { doc, root } = parse(html);
  // Both, because a slide authored with the shorthand keeps a longhand colour
  // underneath that would otherwise win.
  root.style.removeProperty("background-image");
  root.style.removeProperty("background-color");
  root.style.background = css;
  return serialize(doc);
}

/** Append one serialized element on top of the slide's own stacking order. */
export function appendElementToHtml(html: string, elementHtml: string): string {
  const { doc, root } = parse(html);
  const template = doc.createElement("template");
  template.innerHTML = elementHtml;

  let z = 1;
  for (const child of Array.from(root.children)) {
    const value = Number.parseInt((child as HTMLElement).style?.zIndex || "", 10);
    if (Number.isFinite(value)) z = Math.max(z, value + 1);
  }

  for (const node of Array.from(template.content.children)) {
    if (!(node instanceof HTMLElement)) continue;
    // The source element was already absolute on its own slide; keep the
    // coordinates so "aplicar a todas" lands the footer in the same corner.
    node.style.position = node.style.position || "absolute";
    node.style.zIndex = String(z++);
    root.appendChild(node);
  }
  return serialize(doc);
}

/**
 * Read a box from inline styles alone.
 *
 * The parsed document is never laid out — it has no view — so `offsetLeft` and
 * friends all report 0. Elements the generator wrote in flow (no `left`) are
 * skipped rather than guessed at: they follow the root's own box and re-centre
 * with it.
 */
function inlineBox(el: HTMLElement): Box | null {
  const px = (v: string) => {
    const n = Number.parseFloat(v);
    return v.endsWith("px") && Number.isFinite(n) ? n : null;
  };
  const left = px(el.style.left);
  const top = px(el.style.top);
  const width = px(el.style.width);
  const height = px(el.style.height);
  if (left === null || top === null || width === null || height === null) return null;
  return { left, top, width, height };
}

function unionOf(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Rescale a slide onto a canvas of a different shape and re-centre it.
 *
 * ponytail: one uniform factor plus a translation, no content-aware reflow.
 * A real re-layout would need to know which elements are captions and which
 * are art. If the approximation stops passing, the upgrade is per-element
 * anchoring (pin to top / bottom / centre) declared in a data attribute.
 */
export function reflowSlideHtml(
  html: string,
  from: { width: number; height: number },
  to: { width: number; height: number }
): string {
  const { doc, root } = parse(html);

  const children = Array.from(root.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  );
  const bounds = unionOf(
    children.map(inlineBox).filter((b): b is Box => b !== null)
  );
  const { k, dx, dy } = reflowTransform(from, to, bounds);

  // Every descendant's lengths scale; only the slide's own children move,
  // because a child of a group is positioned inside its already-moved parent.
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of all) {
    const style = el.getAttribute("style");
    if (style) el.setAttribute("style", scaleStyleLengths(style, k));
  }

  for (const child of children) {
    const box = inlineBox(child);
    if (!box) continue;
    child.style.left = `${Math.round(box.left + dx)}px`;
    child.style.top = `${Math.round(box.top + dy)}px`;
  }

  // The canvas itself is set, not scaled: it is the new format exactly.
  root.style.width = `${to.width}px`;
  root.style.height = `${to.height}px`;
  return serialize(doc);
}
