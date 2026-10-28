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

  const fit = dims ? Math.min(dims.w / slideW, dims.h / slideH) : 0;

  // Stable refs so the load effect doesn't re-run for inline arrow props.
  const onReadyRef = useRef(onIframeReady);
  const onFitRef = useRef(onFitScale);
  useEffect(() => {
    onReadyRef.current = onIframeReady;
    onFitRef.current = onFitScale;
  });

  useEffect(() => {
    if (fit > 0) onFitRef.current?.(fit);
  }, [fit]);

  // Inject the feedback stylesheet and announce the iframe on every load.
  // srcDoc changes reload the document, so this has to survive re-runs.
  useEffect(() => {
    if (!interactive) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const attach = () => {
      let doc: Document | null = null;
      try {
        doc = iframe.contentDocument;
      } catch {
        return false;
      }
      // A freshly created iframe is about:blank until srcdoc commits, and
      // attaching to that document would seed the undo history with an empty
      // slide. The viewport meta only exists in the document we wrote.
      if (!doc?.body || !doc.querySelector('meta[name="viewport"]')) return false;

      if (!doc.getElementById(INSPECTOR_STYLE_ID)) {
        const styleEl = doc.createElement("style");
        styleEl.id = INSPECTOR_STYLE_ID;
        styleEl.textContent = INSPECTOR_STYLE;
        doc.head.appendChild(styleEl);
      }
      onReadyRef.current?.(iframe);
      return true;
    };

    iframe.addEventListener("load", attach);
    // srcdoc commits asynchronously, so the document may not exist yet when
    // this effect runs — and if it already loaded, no further load event is
    // coming. Poll briefly to cover both.
    if (!attach()) {
      const interval = window.setInterval(() => {
        if (attach()) window.clearInterval(interval);
      }, 30);
      const stop = window.setTimeout(() => window.clearInterval(interval), 4000);
      return () => {
        iframe.removeEventListener("load", attach);
        window.clearInterval(interval);
        window.clearTimeout(stop);
      };
    }
    return () => iframe.removeEventListener("load", attach);
  }, [interactive, srcDoc]);

  const requested = scaleProp && scaleProp > 0 ? scaleProp : fit;
  // The container has not been measured yet on the very first render. The
  // iframe still has to mount now: returning early instead would leave the
  // attach effect below with nothing to attach to, and it would never re-run.
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
          ref={iframeRef}
          // Never allow-scripts: the slide is untrusted generated markup and
          // every interaction is driven from the parent document instead.
          sandbox={interactive ? "allow-same-origin" : ""}
          srcDoc={srcDoc}
          // ponytail: native lazy loading for read-only thumbnails — the
          // dashboard mounts one full slide document per card. The editable
          // canvas must never defer: the attach effect below waits on its
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
