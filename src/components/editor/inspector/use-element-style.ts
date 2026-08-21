"use client";

import { useCallback, useMemo } from "react";
import {
  getBreadcrumb,
  isTextEditable,
  readPx,
  rgbToHex,
} from "@/lib/inspector-utils";
import { getRotation, isFloating } from "@/lib/canvas-utils";
import {
  IMAGE_FRAMES,
  SHADOW_PRESETS,
  TEXT_EFFECT_PROPS,
  hasFlip,
  parseFilters,
  readTextEffect,
  toggleFlipTransform,
  type FilterValues,
} from "@/lib/element-style";

export interface ElementProps {
  tag: string;
  breadcrumb: string[];
  isImage: boolean;
  isTextLike: boolean;
  text: string;

  color: string;
  backgroundColor: string;
  fontFamily: string;
  fontSize: number | null;
  fontWeight: string;
  lineHeight: number | null;
  letterSpacing: number | null;
  textAlign: string;
  italic: boolean;
  underline: boolean;
  uppercase: boolean;
  textEffect: string;

  borderRadius: number | null;
  borderWidth: number | null;
  borderColor: string;
  shadow: string;

  paddingTop: number | null;
  paddingRight: number | null;
  paddingBottom: number | null;
  paddingLeft: number | null;

  filters: FilterValues;
  frame: string;
  objectFit: string;
  objectX: number;
  objectY: number;
  flipX: boolean;
  flipY: boolean;
  src: string;
  alt: string;

  isFloating: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  opacity: number;
  zIndex: number;
}

/**
 * One read of the selected element, shared by the floating toolbar and the
 * advanced panel so the two can never disagree about what is selected.
 *
 * `tick` is the page's mutation counter: the DOM is the model, so any write —
 * ours, a drag on the canvas, an undo, the agent — has to invalidate this.
 */
export function useElementStyle(
  el: HTMLElement | null,
  tick: number,
  onMutate: () => void
) {
  const props = useMemo<ElementProps | null>(() => {
    void tick;
    if (!el || !el.isConnected) return null;
    const win = el.ownerDocument.defaultView;
    if (!win) return null;
    const cs = win.getComputedStyle(el);
    const inline = el.style;
    const objectPosition = (cs.objectPosition || "50% 50%").split(/\s+/);

    return {
      tag: el.tagName.toLowerCase(),
      breadcrumb: getBreadcrumb(el),
      isImage: el.tagName.toLowerCase() === "img",
      isTextLike: isTextEditable(el),
      text: el.textContent || "",

      color: rgbToHex(cs.color),
      backgroundColor: rgbToHex(cs.backgroundColor),
      fontFamily: cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim(),
      fontSize: readPx(el, "fontSize", win),
      fontWeight: cs.fontWeight || "400",
      lineHeight: cs.lineHeight === "normal" ? null : readPx(el, "lineHeight", win),
      letterSpacing:
        cs.letterSpacing === "normal" ? 0 : readPx(el, "letterSpacing", win),
      textAlign: cs.textAlign || "left",
      italic: cs.fontStyle === "italic",
      underline: (cs.textDecorationLine || "").includes("underline"),
      uppercase: cs.textTransform === "uppercase",
      textEffect: readTextEffect({
        textShadow: inline.textShadow || cs.textShadow,
        webkitTextStroke: inline.getPropertyValue("-webkit-text-stroke"),
      }),

      borderRadius: readPx(el, "borderRadius", win),
      borderWidth: readPx(el, "borderTopWidth", win),
      borderColor: rgbToHex(cs.borderTopColor),
      shadow:
        SHADOW_PRESETS.find((p) => p.value && inline.boxShadow === p.value)?.id ??
        (inline.boxShadow ? "custom" : "none"),

      paddingTop: readPx(el, "paddingTop", win),
      paddingRight: readPx(el, "paddingRight", win),
      paddingBottom: readPx(el, "paddingBottom", win),
      paddingLeft: readPx(el, "paddingLeft", win),

      filters: parseFilters(inline.filter || cs.filter),
      frame:
        IMAGE_FRAMES.find(
          (f) => f.clip && normalizeClip(inline.clipPath) === normalizeClip(f.clip)
        )?.id ?? "none",
      objectFit: cs.objectFit || "fill",
      objectX: percentOf(objectPosition[0]),
      objectY: percentOf(objectPosition[1] ?? objectPosition[0]),
      flipX: hasFlip(inline.transform, "x"),
      flipY: hasFlip(inline.transform, "y"),
      src: (el as HTMLImageElement).src || "",
      alt: (el as HTMLImageElement).alt || "",

      isFloating: isFloating(el),
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
      angle: getRotation(el),
      opacity: Math.round((Number.parseFloat(cs.opacity) || 1) * 100),
      zIndex: Number.parseInt(el.style.zIndex || cs.zIndex, 10) || 0,
    };
  }, [el, tick]);

  /** Run an arbitrary DOM edit and register it as one undo step. */
  const mutate = useCallback(
    (fn: (el: HTMLElement) => void) => {
      if (!el || !el.isConnected) return;
      fn(el);
      onMutate();
    },
    [el, onMutate]
  );

  /** Write CSS properties. An empty value removes the property outright. */
  const setStyle = useCallback(
    (styles: Record<string, string>) =>
      mutate((node) => {
        for (const [prop, value] of Object.entries(styles)) {
          if (value === "") node.style.removeProperty(prop);
          else node.style.setProperty(prop, value);
        }
      }),
    [mutate]
  );

  /** Swap the text effect, clearing whatever the previous one wrote. */
  const setTextEffect = useCallback(
    (css: Record<string, string>) => {
      const cleared: Record<string, string> = {};
      for (const prop of TEXT_EFFECT_PROPS) cleared[prop] = "";
      setStyle({ ...cleared, ...css });
    },
    [setStyle]
  );

  const flip = useCallback(
    (axis: "x" | "y") =>
      mutate((node) => {
        const next = toggleFlipTransform(node.style.transform, axis);
        if (next) {
          node.style.transform = next;
          node.style.transformOrigin = "50% 50%";
        } else {
          node.style.removeProperty("transform");
        }
      }),
    [mutate]
  );

  return { props, mutate, setStyle, setTextEffect, flip };
}

export type ElementStyleApi = ReturnType<typeof useElementStyle>;

/** Whitespace and quoting differ between what we write and what CSSOM echoes. */
function normalizeClip(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function percentOf(token: string | undefined): number {
  if (!token) return 50;
  if (token === "left" || token === "top") return 0;
  if (token === "right" || token === "bottom") return 100;
  if (token === "center") return 50;
  const n = Number.parseFloat(token);
  return Number.isFinite(n) && token.includes("%") ? n : 50;
}
