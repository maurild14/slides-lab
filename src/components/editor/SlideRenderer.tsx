"use client";

import {
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
} from "react";
import { wrapSlideHtml } from "@/lib/slide-html";
import {
  INSPECTOR_STYLE,
  INSPECTOR_STYLE_ID,
  OC_ATTR_HOVER,
  OC_ATTR_SELECTED,
  isSelectable,
} from "@/lib/inspector-utils";
import type { AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

interface SlideRendererProps {
  html: string;
  aspectRatio: AspectRatio;
  className?: string;
  style?: React.CSSProperties;
  /** Edit mode lets users click inside the iframe to select elements. */
  editable?: boolean;
  /** Called when the user clicks an element in editable mode. */
  onSelectElement?: (el: HTMLElement | null) => void;
  /** Currently selected element (used to draw the selection ring). */
  selectedElement?: HTMLElement | null;
  /** Called when iframe (re)loads — selection refs become stale. */
  onIframeReady?: (iframe: HTMLIFrameElement) => void;
}

export function SlideRenderer({
  html,
  aspectRatio,
  className,
  style,
  editable = false,
  onSelectElement,
  selectedElement,
  onIframeReady,
}: SlideRendererProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const { width: slideW, height: slideH } = DIMENSIONS[aspectRatio];

  const srcDoc = useMemo(
    () => wrapSlideHtml(html, aspectRatio),
    [html, aspectRatio]
  );

  const measure = useCallback(() => {
    const el = outerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDims({ w: rect.width, h: rect.height });
    }
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => measure());
    obs.observe(el);
    measure();
    return () => obs.disconnect();
  }, [measure]);

  // Stable refs to the latest callbacks so the attach effect doesn't re-run
  // on every render (parents typically pass inline arrows for these).
  const onSelectRef = useRef(onSelectElement);
  const onReadyRef = useRef(onIframeReady);
  useEffect(() => {
    onSelectRef.current = onSelectElement;
    onReadyRef.current = onIframeReady;
  });

  // Attach inspector listeners inside the iframe when editable.
  // We re-attach on every iframe load (srcDoc change forces a reload).
  useEffect(() => {
    if (!editable) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    let detach: (() => void) | null = null;

    const attach = () => {
      detach?.();
      detach = null;
      let doc: Document | null = null;
      try {
        doc = iframe.contentDocument;
      } catch {
        return;
      }
      if (!doc || !doc.body) return;

      let styleEl = doc.getElementById(
        INSPECTOR_STYLE_ID
      ) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = doc.createElement("style");
        styleEl.id = INSPECTOR_STYLE_ID;
        styleEl.textContent = INSPECTOR_STYLE;
        doc.head.appendChild(styleEl);
      }

      const docFinal = doc;
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const target = e.target as Element | null;
        onSelectRef.current?.(isSelectable(target) ? target : null);
      };
      const onMouseOver = (e: MouseEvent) => {
        const target = e.target as Element | null;
        docFinal
          .querySelectorAll(`[${OC_ATTR_HOVER}]`)
          .forEach((n) => n.removeAttribute(OC_ATTR_HOVER));
        if (isSelectable(target)) target.setAttribute(OC_ATTR_HOVER, "");
      };
      const onMouseOut = () => {
        docFinal
          .querySelectorAll(`[${OC_ATTR_HOVER}]`)
          .forEach((n) => n.removeAttribute(OC_ATTR_HOVER));
      };

      docFinal.addEventListener("click", onClick, true);
      docFinal.addEventListener("mouseover", onMouseOver, true);
      docFinal.addEventListener("mouseout", onMouseOut, true);

      detach = () => {
        docFinal.removeEventListener("click", onClick, true);
        docFinal.removeEventListener("mouseover", onMouseOver, true);
        docFinal.removeEventListener("mouseout", onMouseOut, true);
      };

      onReadyRef.current?.(iframe);
    };

    const onLoad = () => attach();
    iframe.addEventListener("load", onLoad);

    // If the iframe has already loaded by the time this effect runs,
    // attach immediately. Use a microtask so contentDocument has settled.
    if (iframe.contentDocument?.body) {
      attach();
    } else {
      // Fallback: poll briefly until body exists (srcdoc commit is async).
      const interval = window.setInterval(() => {
        if (iframe.contentDocument?.body) {
          window.clearInterval(interval);
          attach();
        }
      }, 30);
      window.setTimeout(() => window.clearInterval(interval), 2000);
    }

    return () => {
      iframe.removeEventListener("load", onLoad);
      detach?.();
    };
  }, [editable]);

  // Reflect selected element via attribute (drawn by injected stylesheet)
  useEffect(() => {
    if (!editable) return;
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;
    doc
      .querySelectorAll(`[${OC_ATTR_SELECTED}]`)
      .forEach((n) => n.removeAttribute(OC_ATTR_SELECTED));
    if (selectedElement && doc.contains(selectedElement)) {
      selectedElement.setAttribute(OC_ATTR_SELECTED, "");
    }
  }, [editable, selectedElement]);

  // Calculate scale to fit the slide into the container
  const scale = dims ? Math.min(dims.w / slideW, dims.h / slideH) : 0;
  const scaledW = Math.floor(slideW * scale);
  const scaledH = Math.floor(slideH * scale);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {scale > 0 && (
        <div
          style={{
            width: scaledW,
            height: scaledH,
            overflow: "hidden",
            borderRadius: 8,
            position: "relative",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <iframe
            key={editable ? "edit" : "view"}
            ref={iframeRef}
            sandbox={editable ? "allow-same-origin" : ""}
            srcDoc={srcDoc}
            title="Slide preview"
            style={{
              width: slideW,
              height: slideH,
              border: "none",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: editable ? "auto" : "none",
            }}
          />
        </div>
      )}
    </div>
  );
}
