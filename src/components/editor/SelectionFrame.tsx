"use client";

import { useT } from "@/components/locale-provider";
import { Lock, RefreshCw } from "lucide-react";
import type { Box } from "@/lib/canvas-utils";

/** Corner and edge handles, named by the edges each one moves. */
export const HANDLES = [
  { id: "nw", x: 0, y: 0 },
  { id: "n", x: 0.5, y: 0 },
  { id: "ne", x: 1, y: 0 },
  { id: "e", x: 1, y: 0.5 },
  { id: "se", x: 1, y: 1 },
  { id: "s", x: 0.5, y: 1 },
  { id: "sw", x: 0, y: 1 },
  { id: "w", x: 0, y: 0.5 },
] as const;

/**
 * Resize cursors, indexed by handle and rotated with the element.
 *
 * A handle on a 90°-rotated element points a different way than its name
 * suggests, and a cursor that disagrees with the direction the box actually
 * grows is worse than no cursor at all. Rounding the angle to the nearest 45°
 * picks the right one out of the four the platform offers.
 */
const CURSOR_RING = [
  "nwse-resize", // nw
  "ns-resize", // n
  "nesw-resize", // ne
  "ew-resize", // e
  "nwse-resize", // se
  "ns-resize", // s
  "nesw-resize", // sw
  "ew-resize", // w
] as const;

const HANDLE_ORDER: Record<string, number> = {
  nw: 0,
  n: 1,
  ne: 2,
  e: 3,
  se: 4,
  s: 5,
  sw: 6,
  w: 7,
};

export function handleCursor(handle: string, angle: number): string {
  const base = HANDLE_ORDER[handle] ?? 0;
  const turned = Math.round(angle / 45);
  return CURSOR_RING[(((base + turned) % 8) + 8) % 8];
}

/** Below this the edge handles would sit on top of the corner ones. */
const EDGE_HANDLE_MIN = 44;
/** Canva hangs the rotate handle under the box, clear of the bottom handles. */
const ROTATE_GAP = 18;

interface SelectionFrameProps {
  /** Screen box relative to the overlay container. */
  box: Box;
  angle: number;
  /** True for a multi-selection frame: no rotation, dashed outline. */
  multi?: boolean;
  locked?: boolean;
  interactive?: boolean;
  onBodyPointerDown?: (e: React.PointerEvent) => void;
  onHandlePointerDown?: (handle: string, e: React.PointerEvent) => void;
  onRotatePointerDown?: (e: React.PointerEvent) => void;
}

export function SelectionFrame({
  box,
  angle,
  multi = false,
  locked = false,
  interactive = true,
  onBodyPointerDown,
  onHandlePointerDown,
  onRotatePointerDown,
}: SelectionFrameProps) {
  const t = useT();
  const showEdges =
    box.width >= EDGE_HANDLE_MIN && box.height >= EDGE_HANDLE_MIN;
  const canResize = interactive && !locked;

  return (
    <div
      className="absolute"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        transform: angle ? `rotate(${angle}deg)` : undefined,
        transformOrigin: "50% 50%",
        // The frame itself catches the move drag; handles opt back in.
        pointerEvents: interactive && !locked ? "auto" : "none",
        cursor: locked ? "not-allowed" : "move",
        zIndex: 1,
      }}
      onPointerDown={locked ? undefined : onBodyPointerDown}
      role="presentation"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          outline: `1.5px ${multi ? "dashed" : "solid"} var(--canvas-selection)`,
          outlineOffset: 0,
          opacity: locked ? 0.55 : 1,
        }}
      />

      {locked && (
        <span
          className="pointer-events-none absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
          aria-hidden
        >
          <Lock className="h-3 w-3" />
        </span>
      )}

      {canResize &&
        HANDLES.map((h) => {
          const isCorner = h.id.length === 2;
          if (!isCorner && !showEdges) return null;
          return (
            <div
              key={h.id}
              data-oc-handle={h.id}
              onPointerDown={(e) => onHandlePointerDown?.(h.id, e)}
              // A 10px square is the visual; the padding around it is what the
              // pointer actually has to hit.
              className="absolute flex items-center justify-center"
              style={{
                left: `calc(${h.x * 100}% - 10px)`,
                top: `calc(${h.y * 100}% - 10px)`,
                width: 20,
                height: 20,
                cursor: handleCursor(h.id, angle),
                touchAction: "none",
              }}
            >
              <span
                className="block"
                style={{
                  width: "var(--handle-size)",
                  height: "var(--handle-size)",
                  borderRadius: 2,
                  background: "var(--canvas-handle)",
                  border: "1.5px solid var(--canvas-selection)",
                  boxShadow: "0 1px 2px rgb(0 0 0 / 0.25)",
                }}
              />
            </div>
          );
        })}

      {canResize && !multi && (
        <button
          type="button"
          aria-label={t("Rotate")}
          onPointerDown={onRotatePointerDown}
          className="oc-focus absolute flex items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-raised hover:text-foreground active:cursor-grabbing"
          style={{
            left: "calc(50% - 14px)",
            top: `calc(100% + ${ROTATE_GAP}px)`,
            width: 28,
            height: 28,
            // The handle keeps its own upright orientation inside a rotated
            // frame; a spinning icon reads as noise.
            transform: angle ? `rotate(${-angle}deg)` : undefined,
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Live position/size (or angle) readout pinned under the selection. */
export function GestureReadout({
  box,
  text,
}: {
  box: Box;
  text: string;
}) {
  return (
    <div
      className="pointer-events-none absolute rounded-sm bg-foreground px-2 py-1 text-micro font-medium tabular-nums text-background shadow-float"
      style={{
        left: box.left + box.width / 2,
        top: box.top + box.height + 52,
        transform: "translateX(-50%)",
        whiteSpace: "nowrap",
        zIndex: 3,
      }}
    >
      {text}
    </div>
  );
}
