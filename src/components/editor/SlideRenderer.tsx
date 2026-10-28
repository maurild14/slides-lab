"use client";

import { useT } from "@/components/locale-provider";
import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { wrapSlideHtml } from "@/lib/slide-html";
import { INSPECTOR_STYLE, INSPECTOR_STYLE_ID } from "@/lib/inspector-utils";
import type { AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

interface SlideRendererProps {
  html: string;
  aspectRatio: AspectRatio;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Prepares the iframe for direct manipulation: same-origin access so the
   * canvas can read the DOM, pointer events, and the feedback stylesheet.
   * Off for thumbnails and the fullscreen preview, which are read-only.
   */
  interactive?: boolean;
  /** Absolute render scale. Omit to fit the slide to the container. */
  scale?: number;
  /** Offset in screen pixels, applied after centring. */
  pan?: { x: number; y: number };
  /** Reports the scale that fits the container, so callers can offer "fit". */
  onFitScale?: (fit: number) => void;
  /** Called on every (re)load — element references from before are stale. */
  onIframeReady?: (iframe: HTMLIFrameElement) => void;
}

export function SlideRenderer({
  html,
  aspectRatio,
  className,
  style,
  interactive = false,
  scale: scaleProp,
  pan,
  onFitScale,
  onIframeReady,
}: SlideRendererProps) {
  const t = useT();
  const outerRef = useRef<HTMLDivElement>(null);
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

  const fit = dims ? Math.min(dims.w / slideW, dims.h / slideH) : 0;

  // Stable ref so inline arrow props do not re-run the fit effect.
  const onFitRef = useRef(onFitScale);
  useEffect(() => {
    onFitRef.current = onFitScale;
  });

  useEffect(() => {
    if (fit > 0) onFitRef.current?.(fit);
  }, [fit]);

  // Only load announces a document: an effect after a srcDoc change can still
  // see the previous DOM and pin that stale HTML over the agent's new slide.
  const handleLoad = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
    if (!interactive) return;
    const iframe = event.currentTarget;
    const doc = iframe.contentDocument;
    if (!doc?.body || !doc.querySelector('meta[name="viewport"]')) return;
    if (!doc.getElementById(INSPECTOR_STYLE_ID)) {
      const styleEl = doc.createElement("style");
      styleEl.id = INSPECTOR_STYLE_ID;
      styleEl.textContent = INSPECTOR_STYLE;
      doc.head.appendChild(styleEl);
    }
    onIframeReady?.(iframe);
  };

  const requested = scaleProp && scaleProp > 0 ? scaleProp : fit;
  // The container has not been measured yet on the very first render. The
  // iframe still has to mount now: returning early instead would leave the
  // load handler with no document to announce to the editor.
  const measured = requested > 0;
  const scale = measured ? requested : 0.001;
  const offset = pan ? `translate(${pan.x}px, ${pan.y}px)` : "";

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
    >
      <div
        style={{
          // Centred, then panned. The canvas geometry assumes exactly this
          // layout when it corrects the pan for a zoom about the cursor.
          position: "absolute",
          left: "50%",
          top: "50%",
          width: slideW * scale,
          height: slideH * scale,
          transform: `translate(-50%, -50%) ${offset}`,
          visibility: measured ? "visible" : "hidden",
          overflow: "hidden",
          borderRadius: 8,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
          border: "1px solid rgba(0,0,0,0.06)",
          background: "#fff",
        }}
      >
        <iframe
          // Never allow-scripts: the slide is untrusted generated markup and
          // every interaction is driven from the parent document instead.
          sandbox={interactive ? "allow-same-origin" : ""}
          srcDoc={srcDoc}
          onLoad={handleLoad}
          // ponytail: native lazy loading for read-only thumbnails — the
          // dashboard mounts one full slide document per card. The editable
          // canvas must never defer: the load handler waits on its
          // document. Swap for an IntersectionObserver only if a browser we
          // care about drops srcdoc support for this attribute.
          loading={interactive ? "eager" : "lazy"}
          title={t("Slide preview")}
          style={{
            width: slideW,
            height: slideH,
            border: "none",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: interactive ? "auto" : "none",
          }}
        />
      </div>
    </div>
  );
}
