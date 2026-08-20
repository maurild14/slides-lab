"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyBox,
  computeSnap,
  getSlideMetrics,
  insertFloatingImage,
  isFloating,
  isInsideSlide,
  readBox,
  siblingBoxes,
  toSlideCoords,
  type Box,
  type Guide,
  type SlideMetrics,
} from "@/lib/canvas-utils";

/** Corner and edge handles, named by the edges each one moves. */
const HANDLES = [
  { id: "nw", x: 0, y: 0 },
  { id: "n", x: 0.5, y: 0 },
  { id: "ne", x: 1, y: 0 },
  { id: "e", x: 1, y: 0.5 },
  { id: "se", x: 1, y: 1 },
  { id: "s", x: 0.5, y: 1 },
  { id: "sw", x: 0, y: 1 },
  { id: "w", x: 0, y: 0.5 },
] as const;

const CURSORS: Record<string, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

const MIN_SIZE = 24;
const DRAG_THRESHOLD = 4;

/** Slide-space guide → a 1px viewport-positioned line. */
function toScreenGuide(g: Guide, m: SlideMetrics): Box {
  return g.axis === "x"
    ? {
        left: m.rect.left + g.at * m.scale,
        top: m.rect.top,
        width: 1,
        height: m.rect.height,
      }
    : {
        left: m.rect.left,
        top: m.rect.top + g.at * m.scale,
        width: m.rect.width,
        height: 1,
      };
}

interface SlideCanvasProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  dimensions: { width: number; height: number };
  active: boolean;
  selectedElement: HTMLElement | null;
  onSelectElement: (el: HTMLElement | null) => void;
  /** Image being dragged in from the panel, if any. */
  dragUrl: string | null;
  onDragResolved: () => void;
  onMutate: () => void;
  /** Bumped when the iframe reloads — screen geometry is stale after that. */
  iframeReadyTick: number;
}

/**
 * Direct manipulation layer for floating elements on a slide.
 *
 * Everything here is drawn in the parent document and positioned in viewport
 * coordinates from the iframe's own rect. Nothing is injected into the slide:
 * it renders under `sandbox="allow-same-origin"` with no script permission, so
 * a drag runtime could not run inside it even if we wanted one.
 */
export function SlideCanvas({
  iframeRef,
  dimensions,
  active,
  selectedElement,
  onSelectElement,
  dragUrl,
  onDragResolved,
  onMutate,
  iframeReadyTick,
}: SlideCanvasProps) {
  // Both pieces of state carry the thing they describe (element / url) so the
  // render can discard a stale value by comparing, instead of an effect having
  // to null it out — React 19 rejects setState in an effect body.
  const [screenBox, setScreenBox] = useState<{
    el: HTMLElement;
    box: Box;
  } | null>(null);
  // Guides are stored already converted to viewport pixels: the render pass
  // must not read the metrics ref (React 19 forbids ref access during render).
  const [screenGuides, setScreenGuides] = useState<Box[]>([]);
  const [ghost, setGhost] = useState<{
    url: string;
    x: number;
    y: number;
    over: boolean;
  } | null>(null);
  const metricsRef = useRef<SlideMetrics | null>(null);

  const readMetrics = useCallback(
    () => getSlideMetrics(iframeRef.current, dimensions),
    [iframeRef, dimensions]
  );

  const floating = active && isFloating(selectedElement);

  // Track the selected element's on-screen box. A frame loop rather than
  // observers: the box moves for scroll, resize, panel toggles and our own
  // mutations, and one getBoundingClientRect per frame is far cheaper than
  // keeping five listeners in sync.
  useEffect(() => {
    if (!floating || !selectedElement) return;

    let raf = 0;
    let last: Box | null = null;
    const tick = () => {
      const m = readMetrics();
      metricsRef.current = m;
      if (m && selectedElement.isConnected) {
        const b = readBox(selectedElement);
        const box = {
          left: m.rect.left + b.left * m.scale,
          top: m.rect.top + b.top * m.scale,
          width: b.width * m.scale,
          height: b.height * m.scale,
        };
        // Only commit when the geometry actually moved. Without this the loop
        // re-renders 60 times a second while nothing happens, which is enough
        // to starve the main thread.
        if (
          !last ||
          Math.abs(last.left - box.left) > 0.5 ||
          Math.abs(last.top - box.top) > 0.5 ||
          Math.abs(last.width - box.width) > 0.5 ||
          Math.abs(last.height - box.height) > 0.5
        ) {
          last = box;
          setScreenBox({ el: selectedElement, box });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [floating, selectedElement, readMetrics, iframeReadyTick]);

  // ------------------------------------------------------- drop from panel

  useEffect(() => {
    if (!dragUrl) return;

    let moved = false;

    const onMove = (e: PointerEvent) => {
      moved = true;
      const m = readMetrics();
      setGhost({
        url: dragUrl,
        x: e.clientX,
        y: e.clientY,
        over: !!m && isInsideSlide(e.clientX, e.clientY, m),
      });
    };

    const onUp = (e: PointerEvent) => {
      const m = readMetrics();
      if (m) {
        // A plain click (no drag) drops the image in the middle of the slide.
        // Dragging is the nice path, but it must not be the only one.
        const point = moved
          ? isInsideSlide(e.clientX, e.clientY, m)
            ? toSlideCoords(e.clientX, e.clientY, m)
            : null
          : { x: m.slideW / 2, y: m.slideH / 2 };

        if (point) {
          const img = insertFloatingImage(
            m.doc,
            dragUrl,
            point,
            m.slideW,
            m.slideH
          );
          onSelectElement(img);
          onMutate();
        }
      }
      onDragResolved();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDragResolved();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragUrl, readMetrics, onSelectElement, onMutate, onDragResolved]);

  // ------------------------------------------------------- move and resize

  const startGesture = useCallback(
    (event: React.PointerEvent, handle: string | null) => {
      if (!selectedElement) return;
      event.preventDefault();
      event.stopPropagation();

      const m = metricsRef.current ?? readMetrics();
      if (!m) return;

      const start = readBox(selectedElement);
      const siblings = siblingBoxes(selectedElement);
      const originX = event.clientX;
      const originY = event.clientY;
      // An <img> dropped with height:auto has no explicit height; freeze the
      // measured ratio so resizing from a corner stays proportional.
      const ratio = start.height > 0 ? start.width / start.height : 1;
      let moved = false;

      const onMove = (e: PointerEvent) => {
        const dx = (e.clientX - originX) / m.scale;
        const dy = (e.clientY - originY) / m.scale;
        if (!moved && Math.hypot(e.clientX - originX, e.clientY - originY) < DRAG_THRESHOLD) {
          return;
        }
        moved = true;

        if (!handle) {
          const snapped = computeSnap(
            { ...start, left: start.left + dx, top: start.top + dy },
            siblings,
            m.slideW,
            m.slideH
          );
          applyBox(selectedElement, { left: snapped.left, top: snapped.top });
          setScreenGuides(snapped.guides.map((g) => toScreenGuide(g, m)));
          return;
        }

        const next = { ...start };
        if (handle.includes("e")) next.width = start.width + dx;
        if (handle.includes("w")) {
          next.width = start.width - dx;
          next.left = start.left + dx;
        }
        if (handle.includes("s")) next.height = start.height + dy;
        if (handle.includes("n")) {
          next.height = start.height - dy;
          next.top = start.top + dy;
        }

        // Corners keep the aspect ratio unless shift is held; edges are free.
        const isCorner = handle.length === 2;
        if (isCorner && !e.shiftKey) {
          next.height = next.width / ratio;
          if (handle.includes("n")) next.top = start.top + start.height - next.height;
        }

        next.width = Math.max(MIN_SIZE, next.width);
        next.height = Math.max(MIN_SIZE, next.height);
        applyBox(selectedElement, next);
        setScreenGuides([]);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setScreenGuides([]);
        // Persist once per gesture: the save endpoint keeps only five
        // versions, so a continuous drag must not spend them all.
        if (moved) onMutate();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [selectedElement, readMetrics, onMutate]
  );

  // ------------------------------------------------------------- keyboard

  useEffect(() => {
    if (!floating || !selectedElement) return;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Never steal keys from the inspector's own inputs.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        selectedElement.remove();
        onSelectElement(null);
        onMutate();
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = delta[e.key];
      if (!move) return;

      e.preventDefault();
      const b = readBox(selectedElement);
      applyBox(selectedElement, { left: b.left + move[0], top: b.top + move[1] });
      onMutate();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floating, selectedElement, onSelectElement, onMutate]);

  // ---------------------------------------------------------------- render

  if (!active && !dragUrl) return null;

  return (
    <>
      {/* Alignment guides, drawn across the whole slide */}
      {screenGuides.map((g, i) => (
        <div
          key={`${g.left}-${g.top}-${i}`}
          className="fixed z-50 pointer-events-none bg-accent"
          style={{ left: g.left, top: g.top, width: g.width, height: g.height }}
        />
      ))}

      {/* Selection box + resize handles */}
      {screenBox && screenBox.el === selectedElement && floating && (
        <div
          className="fixed z-50 cursor-move"
          style={{
            left: screenBox.box.left,
            top: screenBox.box.top,
            width: screenBox.box.width,
            height: screenBox.box.height,
            outline: "1px solid var(--accent)",
          }}
          onPointerDown={(e) => startGesture(e, null)}
          role="presentation"
        >
          {HANDLES.map((h) => (
            <div
              key={h.id}
              onPointerDown={(e) => startGesture(e, h.id)}
              className="absolute bg-surface"
              style={{
                left: `calc(${h.x * 100}% - 5px)`,
                top: `calc(${h.y * 100}% - 5px)`,
                width: 10,
                height: 10,
                borderRadius: 2,
                border: "1px solid var(--accent)",
                cursor: CURSORS[h.id],
              }}
            />
          ))}
        </div>
      )}

      {/* Ghost that follows the pointer while dragging an image in */}
      {ghost && ghost.url === dragUrl && (
        <div
          className="fixed z-[60] pointer-events-none"
          style={{
            left: ghost.x,
            top: ghost.y,
            transform: "translate(-50%, -50%)",
            opacity: ghost.over ? 0.95 : 0.5,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ghost.url}
            alt=""
            style={{
              width: 120,
              height: "auto",
              maxHeight: 120,
              objectFit: "contain",
              outline: "1px solid oklch(0 0 0 / 0.1)",
              filter: "drop-shadow(0 8px 16px oklch(0 0 0 / 0.25))",
            }}
          />
        </div>
      )}
    </>
  );
}
