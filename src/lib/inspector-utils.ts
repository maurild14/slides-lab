/**
 * Utilities for the inline slide inspector.
 * Handles selection bookkeeping, computed style reads, and color parsing.
 */

export const OC_ATTR_HOVER = "data-oc-hover";
export const OC_ATTR_SELECTED = "data-oc-selected";

export const INSPECTOR_STYLE_ID = "__oc_inspector_styles__";

export const INSPECTOR_STYLE = `
  [${OC_ATTR_HOVER}] {
    outline: 2px solid rgba(59, 130, 246, 0.35) !important;
    outline-offset: 1px;
    cursor: pointer !important;
  }
  [${OC_ATTR_SELECTED}] {
    outline: 2px solid #3b82f6 !important;
    outline-offset: 1px;
    cursor: pointer !important;
  }
`;

/**
 * Returns true if the user can meaningfully select this element from the
 * inspector. We exclude root nodes that aren't useful to edit.
 *
 * NOTE: we deliberately avoid `instanceof HTMLElement` here. Elements live
 * inside a sandboxed iframe with its own JS realm, so their constructor is
 * the iframe's HTMLElement — not the parent's. Use duck typing instead.
 */
export function isSelectable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  // ELEMENT_NODE === 1; works across realms (iframe vs parent)
  if (el.nodeType !== 1) return false;
  if (typeof (el as HTMLElement).style === "undefined") return false;
  const tag = el.tagName?.toLowerCase();
  return tag !== "html" && tag !== "body" && tag !== "head";
}

/**
 * RGB(A) → #rrggbb hex (drops alpha). Falls back to #000000 if unparseable.
 */
export function rgbToHex(input: string | null | undefined): string {
  if (!input) return "#000000";
  const trimmed = input.trim();
  if (trimmed.startsWith("#")) {
    // Normalize 3-char hex to 6-char
    if (trimmed.length === 4) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return trimmed.length >= 7 ? trimmed.slice(0, 7).toLowerCase() : "#000000";
  }
  const match = trimmed.match(/rgba?\(([^)]+)\)/);
  if (!match) return "#000000";
  const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
  const [r, g, b] = parts;
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#000000";
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
}

/**
 * Read a CSS property as a px number (from inline or computed style).
 * Returns null if not a length value.
 */
export function readPx(
  el: HTMLElement,
  prop: string,
  win: Window
): number | null {
  const inline = (el.style as unknown as Record<string, string>)[prop];
  const computed = win.getComputedStyle(el).getPropertyValue(prop);
  const value = inline || computed;
  const match = value && value.match(/(-?\d+(\.\d+)?)px/);
  if (!match) return null;
  return parseFloat(match[1]);
}

/**
 * Returns a short, human-readable breadcrumb of the element ancestry.
 * E.g.: body › div › h1
 */
export function getBreadcrumb(el: HTMLElement, max = 4): string[] {
  const stack: string[] = [];
  let node: HTMLElement | null = el;
  while (node && node.tagName.toLowerCase() !== "html") {
    stack.unshift(node.tagName.toLowerCase());
    node = node.parentElement;
  }
  if (stack.length > max) {
    return ["…", ...stack.slice(stack.length - max)];
  }
  return stack;
}

/**
 * True if the element should expose a text-content editor.
 * We treat an element as "text-bearing" when its direct children are
 * mostly text nodes (no nested element-block structure to break).
 */
export function isTextEditable(el: HTMLElement): boolean {
  if (el.children.length === 0) return el.textContent !== null;
  // If element has children that are only inline spans of text, still allow.
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase();
    if (!["span", "b", "i", "em", "strong", "br"].includes(tag)) return false;
  }
  return true;
}

/**
 * Replace the visible text of `el` with `newText` while preserving inline
 * formatting (child <span>/<b>/<i>/<em>/<strong> runs).
 *
 * Naively assigning `el.textContent = newText` destroys every child node, so a
 * styled run like `<span style="color:green">después</span>` collapses into a
 * plain text node and loses its color/italic. Instead we diff the old and new
 * plain text: the common prefix and suffix are kept untouched (the formatted
 * runs spanning them survive), and only the differing middle region is rewritten
 * across the affected text nodes. Inserted text at a run boundary joins the
 * *preceding* run, so typing right after a styled word continues that style.
 */
export function replaceTextPreservingFormatting(
  el: HTMLElement,
  newText: string
): void {
  const oldText = el.textContent ?? "";
  if (oldText === newText) return;

  // No inline children → safe to set textContent directly (nothing to lose).
  if (el.children.length === 0) {
    el.textContent = newText;
    return;
  }

  // Longest common prefix.
  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix++;

  // Longest common suffix (without overlapping the prefix).
  let suffix = 0;
  const maxSuffix = Math.min(oldText.length - prefix, newText.length - prefix);
  while (
    suffix < maxSuffix &&
    oldText[oldText.length - 1 - suffix] ===
      newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const removeStart = prefix;
  const removeEnd = oldText.length - suffix; // exclusive
  const insertText = newText.slice(prefix, newText.length - suffix);

  // Map every text node to its [start, end) range in the concatenated text.
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number; end: number }[] = [];
  let offset = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    nodes.push({ node: t, start: offset, end: offset + t.data.length });
    offset += t.data.length;
  }

  if (nodes.length === 0) {
    el.textContent = newText;
    return;
  }

  // Pick the insertion node: the run whose range ends at (or contains)
  // removeStart. Preferring the run that *ends* at the boundary makes inserted
  // text inherit the preceding run's style.
  let insertNode: Text | null = null;
  for (const entry of nodes) {
    if (removeStart > entry.start && removeStart <= entry.end) {
      insertNode = entry.node;
      break;
    }
  }
  if (!insertNode) insertNode = nodes[0].node; // removeStart === 0

  // Rewrite each text node: drop its overlap with [removeStart, removeEnd),
  // and splice insertText into the chosen insertion node.
  for (const { node, start, end } of nodes) {
    const len = end - start;
    const localStart = Math.max(0, Math.min(len, removeStart - start));
    const localEnd = Math.max(0, Math.min(len, removeEnd - start));
    const head = node.data.slice(0, localStart);
    const tail = node.data.slice(localEnd);
    node.data = node === insertNode ? head + insertText + tail : head + tail;
  }

  // Clean up runs that were fully emptied so we don't persist empty spans.
  for (const { node } of nodes) {
    if (node.data.length > 0) continue;
    const parent = node.parentElement;
    node.remove();
    if (
      parent &&
      parent !== el &&
      parent.childNodes.length === 0 &&
      ["span", "b", "i", "em", "strong"].includes(parent.tagName.toLowerCase())
    ) {
      parent.remove();
    }
  }
}

/**
 * Strip inspector marker attributes from an HTML string so they aren't
 * persisted to slide storage.
 */
export function stripInspectorAttrs(html: string): string {
  return html
    .replace(new RegExp(`\\s${OC_ATTR_HOVER}(="[^"]*")?`, "g"), "")
    .replace(new RegExp(`\\s${OC_ATTR_SELECTED}(="[^"]*")?`, "g"), "");
}
