"use client";

import { useT } from "@/components/locale-provider";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  angleFromCenter,
  applyBox,
  boxFromPoints,
  boxesIntersect,
  computeSnap,
  duplicateElements,
  elementChildren,
  getRotation,
  getSlideMetrics,
  getSlideRoot,
  insertFloatingImage,
  insertSnippet,
  isGroup,
  isLocked,
  makeFloating,
  readBox,
  resolveTarget,
  resizeBox,
  scaleBoxWithin,
  scaleGroupChildren,
  selectableElements,
  setRotation,
  snapAngle,
  toSlideCoords,
  unionBox,
  isInsideSlide,
  type Box,
  type Guide,
  type SlideMetrics,
} from "@/lib/canvas-utils";
import {
  OC_ATTR_BUSY,
  OC_ATTR_HOVER,
  OC_ATTR_SELECTED,
  isSelectable,
} from "@/lib/inspector-utils";
import { elementKind, type DragPayload } from "@/lib/slide-elements";
import { SelectionFrame, GestureReadout } from "./SelectionFrame";
import { CanvasContextMenu } from "./CanvasContextMenu";
import type { CanvasCommands } from "./canvas-commands";

/** Screen pixels the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4;

interface OverlayItem {
  el: HTMLElement;
  box: Box;
  angle: number;
  locked: boolean;
}

interface OverlayState {
  viewport: Box;
  items: OverlayItem[];
  union: Box | null;
}

interface SlideCanvasProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** Element the overlay is clipped to — the preview area. */
  viewportRef: React.RefObject<HTMLElement | null>;
  dimensions: { width: number; height: number };
  /** False while the AI is rewriting this slide: look, don't touch. */
  enabled: boolean;
  selection: HTMLElement[];
  onSelectionChange: (els: HTMLElement[]) => void;
  /** Element being dragged in from a tool panel, if any. */
  dragItem: DragPayload | null;
  onDragResolved: () => void;
  /** Commit one undo step and schedule a save. */
  onCommit: () => void;
  /** Bumped when the iframe reloads — every element reference is stale. */
  iframeReadyTick: number;

  scale: number;
  pan: { x: number; y: number };
  /** Absolute pan, for a drag that captured its own starting offset. */
  onPanTo: (pan: { x: number; y: number }) => void;
  /**
   * Relative pan and zoom. A trackpad fires several wheel events inside one
   * frame, so anything computed from a rendered value would read the same
   * stale offset each time and drop every delta but the last.
   */
  onPanBy: (dx: number, dy: number) => void;
  onZoomBy: (factor: number, focus?: { x: number; y: number }) => void;
  /** Zoom to an absolute scale, keeping `focus` (slide coords) under the cursor. */
  onZoomTo: (scale: number, focus?: { x: number; y: number }) => void;
  onFit: () => void;

  commands: CanvasCommands;
  onUndo: () => void;
  onRedo: () => void;
  /** Upload a pasted or dropped file and return its public URL. */
  onUploadImage: (file: File) => Promise<string | null>;
  /** Propagate the selected element / the slide background to every other slide. */
  onApplyElementToAll?: () => void;
  onApplyBackgroundToAll?: () => void;
}

/**
 * The pan / marquee / move cursor flag. Both realms carry it: the iframe has
 * its own copy of the rules (inspector-utils.ts), the grey work area around it
 * lives in this document and reads them from globals.css.
 */
const markBusy = (el: Element | null | undefined, kind: string | null) => {
  if (!el) return;
  if (kind) el.setAttribute(OC_ATTR_BUSY, kind);
  else el.removeAttribute(OC_ATTR_BUSY);
};

/** Chrome starts its autoscroll on a middle press: it swaps the cursor for the
 * compass and scrolls under us. Cancelling the mouse event leaves the press to
 * our own pan gesture. */
const blockAutoScroll = (event: Event) => {
  if ((event as MouseEvent).button === 1) event.preventDefault();
};

/**
 * Direct manipulation layer for a slide.
 *
 * Everything visible here is drawn in the *parent* document and positioned
 * from the iframe's own rect: the slide renders under `allow-same-origin` with
 * no script permission, so no drag runtime could run inside it even if we
 * wanted one. Pointer events, however, originate in the iframe's realm — hence
 * the two coordinate paths below, one for presses that start on the slide and
 * one for presses that start on a handle.
 */
export function SlideCanvas({
  iframeRef,
  viewportRef,
  dimensions,
  enabled,
  selection,
  onSelectionChange,
  dragItem,
  onDragResolved,
  onCommit,
  iframeReadyTick,
  scale,
  pan,
  onPanTo,
  onPanBy,
  onZoomBy,
  onZoomTo,
  onFit,
  commands,
  onUndo,
  onRedo,
  onUploadImage,
  onApplyElementToAll,
  onApplyBackgroundToAll,
}: SlideCanvasProps) {
  const t = useT();
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [guides, setGuides] = useState<Box[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [readout, setReadout] = useState<string | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<{
    item: DragPayload;
    x: number;
    y: number;
    over: boolean;
  } | null>(null);

  const metricsRef = useRef<SlideMetrics | null>(null);
  const gestureRef = useRef<string | null>(null);
  /** The element currently being typed into, plus how to end the session. */
  const editRef = useRef<{ el: HTMLElement; stop: () => void } | null>(null);
  /** Last press, so a second one on the same element reads as a double click. */
  const lastDownRef = useRef<{ el: HTMLElement; at: number } | null>(null);
  const tryTextEditRef = useRef<(hit: HTMLElement | null, point: { x: number; y: number }) => boolean>(() => false);
  const spaceRef = useRef(false);
  const panRef = useRef(pan);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // Handlers attached inside the iframe outlive several renders, so everything
  // they read lives in one ref that each render refreshes.
  const latest = useRef({
    selection,
    enabled,
    commands,
    onSelectionChange,
    onCommit,
    onPanTo,
    onPanBy,
    onZoomBy,
    onZoomTo,
    onFit,
    onUndo,
    onRedo,
    onUploadImage,
    dimensions,
    scale,
  });
  // Declared before every effect that attaches a listener, so the refreshed
  // values are in place by the time any of them can fire.
  useEffect(() => {
    latest.current = {
      selection,
      enabled,
      commands,
      onSelectionChange,
      onCommit,
      onPanTo,
      onPanBy,
      onZoomBy,
      onZoomTo,
      onFit,
      onUndo,
      onRedo,
      onUploadImage,
      dimensions,
      scale,
    };
  });

  const readMetrics = useCallback(
    () => getSlideMetrics(iframeRef.current, dimensions),
    [iframeRef, dimensions]
  );

  /**
   * Whether a pointer button is down right now, anywhere in this document.
   *
   * A panel arms an insert on `pointerdown`, so this is true for a mouse or a
   * touch and false for a keyboard press — which is how the drop below knows
   * there is no pointerup coming and it has to place the item itself.
   */
  const pointerDownRef = useRef(false);
  useEffect(() => {
    const down = () => (pointerDownRef.current = true);
    const up = () => (pointerDownRef.current = false);
    // Capture, so this lands before React's own handler arms the insert.
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);

  const getDoc = useCallback((): Document | null => {
    try {
      return iframeRef.current?.contentDocument ?? null;
    } catch {
      return null;
    }
  }, [iframeRef]);

  /* ------------------------------------------------------- frame tracking */

  // A frame loop rather than observers: the boxes move for scroll, resize,
  // panel toggles, zoom, pan and our own mutations. One rect read per frame is
  // far cheaper than keeping six listeners in agreement.
  useEffect(() => {
    let raf = 0;
    let signature = "";

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m = readMetrics();
      metricsRef.current = m;
      const host = viewportRef.current;
      if (!m || !host) {
        if (signature !== "") {
          signature = "";
          setOverlay(null);
        }
        return;
      }

      const hostRect = host.getBoundingClientRect();
      const viewport = {
        left: hostRect.left,
        top: hostRect.top,
        width: hostRect.width,
        height: hostRect.height,
      };

      const items: OverlayItem[] = [];
      for (const el of latest.current.selection) {
        if (!el.isConnected) continue;
        const b = readBox(el);
        items.push({
          el,
          box: {
            left: m.rect.left + b.left * m.scale - viewport.left,
            top: m.rect.top + b.top * m.scale - viewport.top,
            width: b.width * m.scale,
            height: b.height * m.scale,
          },
          angle: getRotation(el),
          locked: isLocked(el),
        });
      }
      const union = items.length > 1 ? unionBox(items.map((i) => i.box)) : null;

      // Committing 60 times a second while nothing moves starves the main
      // thread; a rounded signature is enough to tell real motion apart.
      const next =
        `${Math.round(viewport.left)},${Math.round(viewport.top)},${Math.round(viewport.width)},${Math.round(viewport.height)}|` +
        items
          .map(
            (i) =>
              `${Math.round(i.box.left)},${Math.round(i.box.top)},${Math.round(i.box.width)},${Math.round(i.box.height)},${Math.round(i.angle)},${i.locked ? 1 : 0}`
          )
          .join(";");
      if (next !== signature) {
        signature = next;
        setOverlay({ viewport, items, union });
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [readMetrics, viewportRef, iframeReadyTick]);

  /* ------------------------------------------------- selection attributes */

  useEffect(() => {
    const doc = getDoc();
    if (!doc) return;
    doc
      .querySelectorAll(`[${OC_ATTR_SELECTED}]`)
      .forEach((n) => n.removeAttribute(OC_ATTR_SELECTED));
    for (const el of selection) {
      if (doc.contains(el)) el.setAttribute(OC_ATTR_SELECTED, "");
    }
  }, [selection, getDoc, iframeReadyTick]);

  /* -------------------------------------------------------- gesture setup */

  const setBusy = useCallback(
    (kind: string | null) => {
      gestureRef.current = kind;
      markBusy(viewportRef.current, kind);
      const doc = getDoc();
      if (!doc) return;
      markBusy(doc.documentElement, kind);
      if (!kind) {
        doc
          .querySelectorAll(`[${OC_ATTR_HOVER}]`)
          .forEach((n) => n.removeAttribute(OC_ATTR_HOVER));
      }
    },
    [getDoc, viewportRef]
  );

  /**
   * Run a pointer gesture to completion.
   *
   * The capture target decides which realm the follow-up events arrive in;
   * capturing keeps them coming even after the pointer leaves the slide, which
   * is what lets a drag continue over the panels.
   */
  const runGesture = useCallback(
    (opts: {
      kind: string;
      target: Element;
      pointerId: number;
      onMove: (e: PointerEvent) => void;
      onEnd: (e: PointerEvent, moved: boolean) => void;
      origin: { screenX: number; screenY: number };
    }) => {
      const { kind, target, pointerId, origin } = opts;
      let moved = false;
      setBusy(kind);

      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Capture is an optimisation; the listeners below still fire without it.
      }

      const move = (event: Event) => {
        const e = event as PointerEvent;
        if (e.pointerId !== pointerId) return;
        if (
          !moved &&
          Math.hypot(e.screenX - origin.screenX, e.screenY - origin.screenY) <
            DRAG_THRESHOLD
        ) {
          return;
        }
        // A completed drag must not count as the first half of a double click.
        lastDownRef.current = null;
        moved = true;
        opts.onMove(e);
      };

      const end = (event: Event) => {
        const e = event as PointerEvent;
        if (e.pointerId !== pointerId) return;
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", end);
        target.removeEventListener("pointercancel", end);
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // Already released when the pointer was cancelled.
        }
        setBusy(null);
        setGuides([]);
        setMarquee(null);
        setReadout(null);
        opts.onEnd(e, moved);
      };

      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", end);
      target.addEventListener("pointercancel", end);
    },
    [setBusy]
  );

  /* ------------------------------------------------------------ move drag */

  const startMove = useCallback(
    (
      targets: HTMLElement[],
      origin: { x: number; y: number },
      toSlide: (e: PointerEvent) => { x: number; y: number },
      captureTarget: Element,
      pointerId: number,
      screen: { screenX: number; screenY: number },
      onEnd?: (moved: boolean) => void
    ) => {
      const movable = targets.filter((el) => !isLocked(el));
      if (movable.length === 0) return;

      const m = metricsRef.current;
      const slideW = latest.current.dimensions.width;
      const slideH = latest.current.dimensions.height;

      let starts: { el: HTMLElement; box: Box }[] = [];
      let union0: Box = { left: 0, top: 0, width: 0, height: 0 };
      let siblings: Box[] = [];
      let prepared = false;

      // Deferred to the first real movement: converting an element to absolute
      // positioning pulls it out of the layout flow, which must not happen on
      // a click that turns out to be a plain selection.
      const prepare = () => {
        for (const el of movable) makeFloating(el);
        starts = movable.map((el) => ({ el, box: readBox(el) }));
        union0 = unionBox(starts.map((s) => s.box));
        const parent = movable[0].parentElement;
        siblings = parent
          ? elementChildren(parent)
              .filter((c) => !movable.includes(c))
              .map(readBox)
              .filter((b) => b.width > 0 && b.height > 0)
          : [];
        prepared = true;
      };

      runGesture({
        kind: "move",
        target: captureTarget,
        pointerId,
        origin: screen,
        onMove: (e) => {
          if (!prepared) prepare();
          const point = toSlide(e);
          let dx = point.x - origin.x;
          let dy = point.y - origin.y;
          // Shift locks the drag to one axis, the way every design tool does.
          if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) dy = 0;
            else dx = 0;
          }

          const snapped = computeSnap(
            { ...union0, left: union0.left + dx, top: union0.top + dy },
            siblings,
            slideW,
            slideH
          );
          const adx = snapped.left - union0.left;
          const ady = snapped.top - union0.top;

          for (const s of starts) {
            applyBox(s.el, { left: s.box.left + adx, top: s.box.top + ady });
          }

          const metrics = metricsRef.current ?? m;
          if (metrics) {
            setGuides(snapped.guides.map((g) => toScreenGuide(g, metrics, viewportRef.current)));
          }
          setReadout(
            `X ${Math.round(union0.left + adx)}   Y ${Math.round(union0.top + ady)}`
          );
        },
        onEnd: (_e, moved) => {
          if (moved) latest.current.onCommit();
          onEnd?.(moved);
        },
      });
    },
    [runGesture, viewportRef]
  );

  /* ---------------------------------------------------------- resize drag */

  const startResize = useCallback(
    (
      handle: string,
      origin: { x: number; y: number },
      toSlide: (e: PointerEvent) => { x: number; y: number },
      captureTarget: Element,
      pointerId: number,
      screen: { screenX: number; screenY: number }
    ) => {
      const targets = latest.current.selection.filter((el) => !isLocked(el));
      if (targets.length === 0) return;

      const starts = targets.map((el) => ({ el, box: readBox(el) }));
      const union0 = unionBox(starts.map((s) => s.box));
      const single = targets.length === 1 ? targets[0] : null;
      const angle = single ? getRotation(single) : 0;
      const isCorner = handle.length === 2;
      // Images keep their proportion by default, boxes of text do not — and
      // shift flips whichever default applies.
      const ratioByDefault = isCorner && single?.tagName === "IMG";

      runGesture({
        kind: "resize",
        target: captureTarget,
        pointerId,
        origin: screen,
        onMove: (e) => {
          const point = toSlide(e);
          const dx = point.x - origin.x;
          const dy = point.y - origin.y;
          const keepRatio = isCorner && (ratioByDefault ? !e.shiftKey : e.shiftKey);

          if (single) {
            const next = resizeBox({
              start: starts[0].box,
              handle,
              dx,
              dy,
              angle,
              keepRatio,
            });
            if (isGroup(single)) scaleGroupChildren(single, starts[0].box, next);
            applyBox(single, next);
            setReadout(`${Math.round(next.width)} × ${Math.round(next.height)}`);
            return;
          }

          const frame = resizeBox({
            start: union0,
            handle,
            dx,
            dy,
            angle: 0,
            keepRatio: isCorner ? !e.shiftKey : e.shiftKey,
          });
          for (const s of starts) {
            const next = scaleBoxWithin(s.box, union0, frame);
            if (isGroup(s.el)) scaleGroupChildren(s.el, s.box, next);
            applyBox(s.el, next);
          }
          setReadout(`${Math.round(frame.width)} × ${Math.round(frame.height)}`);
        },
        onEnd: (_e, moved) => {
          if (moved) latest.current.onCommit();
        },
      });
    },
    [runGesture]
  );

  /* ---------------------------------------------------------- rotate drag */

  const startRotate = useCallback(
    (
      origin: { x: number; y: number },
      toSlide: (e: PointerEvent) => { x: number; y: number },
      captureTarget: Element,
      pointerId: number,
      screen: { screenX: number; screenY: number }
    ) => {
      const el = latest.current.selection[0];
      if (!el || isLocked(el)) return;

      const box = readBox(el);
      const center = {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      };
      const startAngle = getRotation(el);
      // Where the pointer grabbed the handle, so the element does not jump to
      // the cursor on the first move.
      const grab = angleFromCenter(center, origin);

      runGesture({
        kind: "rotate",
        target: captureTarget,
        pointerId,
        origin: screen,
        onMove: (e) => {
          const point = toSlide(e);
          let next = startAngle + (angleFromCenter(center, point) - grab);
          if (e.shiftKey) next = snapAngle(next);
          setRotation(el, next);
          setReadout(`${Math.round(((next % 360) + 360) % 360)}°`);
        },
        onEnd: (_e, moved) => {
          if (moved) latest.current.onCommit();
        },
      });
    },
    [runGesture]
  );

  /* ------------------------------------------------------- marquee select */

  const startMarquee = useCallback(
    (
      origin: { x: number; y: number },
      toSlide: (e: PointerEvent) => { x: number; y: number },
      captureTarget: Element,
      pointerId: number,
      screen: { screenX: number; screenY: number },
      additive: boolean
    ) => {
      const doc = getDoc();
      if (!doc?.body) return;
      const root = getSlideRoot(doc);
      const candidates = selectableElements(root).map((el) => ({
        el,
        box: readBox(el),
      }));
      const base = additive ? [...latest.current.selection] : [];
      let hits: HTMLElement[] = base;

      runGesture({
        kind: "marquee",
        target: captureTarget,
        pointerId,
        origin: screen,
        onMove: (e) => {
          const point = toSlide(e);
          const area = boxFromPoints(origin, point);
          hits = [
            ...base,
            ...candidates
              .filter((c) => boxesIntersect(area, c.box) && !base.includes(c.el))
              .map((c) => c.el),
          ];

          const m = metricsRef.current;
          const host = viewportRef.current;
          if (m && host) {
            const rect = host.getBoundingClientRect();
            setMarquee({
              left: m.rect.left + area.left * m.scale - rect.left,
              top: m.rect.top + area.top * m.scale - rect.top,
              width: area.width * m.scale,
              height: area.height * m.scale,
            });
          }
          setReadout(t(hits.length === 1 ? "1 selected" : "{n} selected", { n: hits.length }));
        },
        onEnd: (_e, moved) => {
          latest.current.onSelectionChange(moved ? hits : base);
        },
      });
    },
    [runGesture, getDoc, viewportRef, t]
  );

  /* -------------------------------------------------------------- panning */

  const startPan = useCallback(
    (
      captureTarget: Element,
      pointerId: number,
      screen: { screenX: number; screenY: number },
      start: { x: number; y: number }
    ) => {
      runGesture({
        kind: "pan",
        target: captureTarget,
        pointerId,
        origin: screen,
        onMove: (e) => {
          // screen coordinates, not client: the slide moves under the cursor
          // while panning, and client coordinates inside the iframe would feed
          // that motion straight back into the delta.
          latest.current.onPanTo({
            x: start.x + (e.screenX - screen.screenX),
            y: start.y + (e.screenY - screen.screenY),
          });
        },
        onEnd: () => {},
      });
    },
    [runGesture]
  );

  /* ------------------------------------------- events inside the iframe */

  useEffect(() => {
    const doc = getDoc();
    const win = doc?.defaultView;
    if (!doc?.body || !win) return;

    // Inside the iframe the viewport *is* the slide: it is laid out at the
    // slide's true pixel size and only then scaled by a transform, so a client
    // coordinate here already is a slide coordinate.
    const toSlide = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });

    const stopEditing = () => {
      const active = editRef.current;
      if (!active) return;
      editRef.current = null;
      active.stop();
    };

    /**
     * Type straight into the slide.
     *
     * The iframe has no script permission, so nothing inside it could drive
     * this: we set `contenteditable` from the parent realm, place the caret
     * ourselves at the click point, and take it back off on the way out.
     */
    const startEditing = (el: HTMLElement, clientX: number, clientY: number) => {
      stopEditing();
      el.setAttribute("contenteditable", "true");
      el.focus();

      const withCaret = doc as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      const range = withCaret.caretRangeFromPoint?.(clientX, clientY);
      const sel = win.getSelection();
      if (range && sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }

      const onKey = (event: Event) => {
        const ev = event as KeyboardEvent;
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          stopEditing();
        }
      };
      el.addEventListener("keydown", onKey);

      editRef.current = {
        el,
        stop: () => {
          el.removeEventListener("keydown", onKey);
          el.removeAttribute("contenteditable");
          // A caret left behind blinks in a slide nobody can type into.
          win.getSelection()?.removeAllRanges();
          el.blur();
          latest.current.onCommit();
        },
      };
    };

    // Presses can start in the iframe and finish on the selection overlay.
    const tryTextEdit = (hit: HTMLElement | null, point: { x: number; y: number }) => {
      const now = Date.now();
      const last = lastDownRef.current;
      const isDouble = hit !== null && last !== null && last.el === hit && now - last.at < 400;
      lastDownRef.current = hit ? { el: hit, at: now } : null;
      if (!isDouble || !hit || isLocked(hit) || elementKind(hit) !== "text") return false;
      lastDownRef.current = null;
      latest.current.onSelectionChange([hit]);
      startEditing(hit, point.x, point.y);
      return true;
    };
    tryTextEditRef.current = tryTextEdit;

    const onPointerDown = (event: Event) => {
      const e = event as PointerEvent;
      const editing = editRef.current;
      if (editing) {
        // Inside the text being edited a press is caret placement, and the
        // browser does that better than we would. Anywhere else ends it.
        if (editing.el.contains(e.target as Node)) return;
        stopEditing();
      }
      if (!latest.current.enabled || gestureRef.current) return;
      if (e.button !== 0 && e.button !== 1) return;

      const html = doc.documentElement;
      const origin = toSlide(e);
      const screen = { screenX: e.screenX, screenY: e.screenY };

      if (e.button === 1 || spaceRef.current) {
        e.preventDefault();
        startPan(html, e.pointerId, screen, { ...panRef.current });
        return;
      }

      const root = getSlideRoot(doc);
      const raw = e.target as Element | null;
      const hit =
        raw && isSelectable(raw) && raw !== root ? resolveTarget(raw, root) : null;

      e.preventDefault();
      if (tryTextEdit(hit, origin)) return;

      if (!hit) {
        startMarquee(origin, toSlide, html, e.pointerId, screen, e.shiftKey);
        return;
      }

      const current = latest.current.selection;
      const already = current.includes(hit);

      if (e.shiftKey) {
        latest.current.onSelectionChange(
          already ? current.filter((el) => el !== hit) : [...current, hit]
        );
        return;
      }

      // Alt turns the drag into a duplicate, exactly like Canva and Figma.
      let targets = already ? current : [hit];
      if (e.altKey) {
        const copies = duplicateElements(already ? current : [hit], 0);
        if (copies.length > 0) {
          targets = copies;
          latest.current.onSelectionChange(copies);
        }
      } else if (!already) {
        latest.current.onSelectionChange([hit]);
      }

      startMove(targets, origin, toSlide, html, e.pointerId, screen, (moved) => {
        // A press on one member of a multi-selection keeps the whole set while
        // dragging, and collapses to that member only if nothing moved.
        if (!moved && already && current.length > 1 && !e.altKey) {
          latest.current.onSelectionChange([hit]);
        }
      });
    };

    const onOver = (event: Event) => {
      if (gestureRef.current || !latest.current.enabled) return;
      const raw = (event as MouseEvent).target as Element | null;
      doc
        .querySelectorAll(`[${OC_ATTR_HOVER}]`)
        .forEach((n) => n.removeAttribute(OC_ATTR_HOVER));
      const root = getSlideRoot(doc);
      if (!raw || !isSelectable(raw) || raw === root) return;
      // Show the outline even on locked elements: silence reads as broken,
      // whereas a "no entry" cursor explains itself.
      const target = resolveTarget(raw, root) ?? raw;
      (target as HTMLElement).setAttribute(OC_ATTR_HOVER, "");
    };

    const onOut = () => {
      doc
        .querySelectorAll(`[${OC_ATTR_HOVER}]`)
        .forEach((n) => n.removeAttribute(OC_ATTR_HOVER));
    };

    const onContextMenu = (event: Event) => {
      const e = event as MouseEvent;
      e.preventDefault();
      if (!latest.current.enabled) return;
      const m = metricsRef.current;
      const root = getSlideRoot(doc);
      const raw = e.target as Element | null;
      const hit =
        raw && isSelectable(raw) && raw !== root ? resolveTarget(raw, root) : null;
      if (hit && !latest.current.selection.includes(hit)) {
        latest.current.onSelectionChange([hit]);
      } else if (!hit) {
        latest.current.onSelectionChange([]);
      }
      if (!m) return;
      setMenuAt({
        x: m.rect.left + e.clientX * m.scale,
        y: m.rect.top + e.clientY * m.scale,
      });
    };

    const onWheel = (event: Event) => {
      const e = event as WheelEvent;
      const m = metricsRef.current;
      if (!m) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        latest.current.onZoomBy(Math.exp(-e.deltaY / 400), {
          x: e.clientX,
          y: e.clientY,
        });
        return;
      }
      e.preventDefault();
      // Plain wheel scrolls the canvas vertically, shift scrolls it sideways —
      // the slide has no scrollable content of its own.
      if (e.shiftKey) latest.current.onPanBy(-e.deltaY, 0);
      else latest.current.onPanBy(0, -e.deltaY);
    };

    doc.addEventListener("mousedown", blockAutoScroll, true);
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("mouseover", onOver, true);
    doc.addEventListener("mouseleave", onOut, true);
    doc.addEventListener("contextmenu", onContextMenu, true);
    doc.addEventListener("wheel", onWheel, { passive: false, capture: true });

    return () => {
      tryTextEditRef.current = () => false;
      lastDownRef.current = null;
      // React flushes passive cleanups after the DOM node is already detached,
      // and a discarded frame throws SecurityError on any access. Its listeners
      // died with it, so there is nothing left to remove.
      try {
        stopEditing();
        doc.removeEventListener("mousedown", blockAutoScroll, true);
        doc.removeEventListener("pointerdown", onPointerDown, true);
        doc.removeEventListener("mouseover", onOver, true);
        doc.removeEventListener("mouseleave", onOut, true);
        doc.removeEventListener("contextmenu", onContextMenu, true);
        doc.removeEventListener("wheel", onWheel, true);
      } catch {
        /* the iframe is gone */
      }
    };
  }, [getDoc, iframeReadyTick, startMove, startMarquee, startPan]);

  /* ------------------------------------------- events on the canvas backdrop */

  // The iframe only covers the slide itself. Everything around it is the grey
  // work area, and a press there has to behave like Canva's: deselect, or pan
  // when space or the middle button is down. Without this the area reads as
  // dead space and a stray click appears to do nothing.
  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!latest.current.enabled || gestureRef.current) return;
      // Only presses that land on the backdrop itself; the iframe and the
      // selection handles handle their own.
      if (event.target !== host) return;

      if (event.button === 1 || spaceRef.current) {
        event.preventDefault();
        startPan(host, event.pointerId, { screenX: event.screenX, screenY: event.screenY }, {
          ...panRef.current,
        });
        return;
      }
      if (event.button !== 0) return;
      latest.current.onSelectionChange([]);
    };

    const onWheel = (event: WheelEvent) => {
      const m = metricsRef.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (!m) return;
        latest.current.onZoomBy(
          Math.exp(-event.deltaY / 400),
          toSlideCoords(event.clientX, event.clientY, m)
        );
        return;
      }
      event.preventDefault();
      if (event.shiftKey) latest.current.onPanBy(-event.deltaY, 0);
      else latest.current.onPanBy(0, -event.deltaY);
    };

    host.addEventListener("mousedown", blockAutoScroll);
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      host.removeEventListener("mousedown", blockAutoScroll);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("wheel", onWheel);
    };
  }, [viewportRef, startPan, iframeReadyTick]);

  /* ----------------------------------------------------- keyboard, both realms */

  useEffect(() => {
    const doc = getDoc();
    const frameWin = doc?.defaultView ?? null;

    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || typeof el.tagName !== "string") return false;
      return (
        /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true
      );
    };

    const onKeyDown = (event: Event) => {
      const e = event as KeyboardEvent;
      if (isTyping(e.target)) return;
      const { commands: cmd, enabled: on } = latest.current;
      const mod = e.ctrlKey || e.metaKey;

      if (e.code === "Space" && !mod) {
        spaceRef.current = true;
        if (!gestureRef.current) {
          markBusy(getDoc()?.documentElement, "pan");
          markBusy(viewportRef.current, "pan");
        }
        e.preventDefault();
        return;
      }

      // Zoom presets work with or without a selection.
      if (mod && (e.key === "0" || e.key === "1")) {
        e.preventDefault();
        if (e.key === "0") latest.current.onFit();
        else latest.current.onZoomTo(1);
        return;
      }
      if (mod && (e.key === "+" || e.key === "=" || e.key === "-")) {
        e.preventDefault();
        latest.current.onZoomBy(e.key === "-" ? 1 / 1.2 : 1.2);
        return;
      }

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) latest.current.onRedo();
        else latest.current.onUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        latest.current.onRedo();
        return;
      }

      if (!on) return;

      if (mod) {
        const key = e.key.toLowerCase();
        // Alt is the style brush: same copy/paste keys, the look only.
        if (e.altKey && (key === "c" || key === "v")) {
          e.preventDefault();
          if (key === "c") cmd.copyStyle();
          else cmd.pasteStyle();
          return;
        }
        const actions: Record<string, () => void> = {
          d: cmd.duplicate,
          c: cmd.copy,
          x: cmd.cut,
          v: cmd.paste,
          a: cmd.selectAll,
          l: cmd.toggleLock,
          g: e.shiftKey ? cmd.ungroup : cmd.group,
        };
        const action = actions[key];
        if (action) {
          e.preventDefault();
          action();
          return;
        }
        if (e.key === "]") {
          e.preventDefault();
          cmd.order(e.shiftKey ? "front" : "forward");
          return;
        }
        if (e.key === "[") {
          e.preventDefault();
          cmd.order(e.shiftKey ? "back" : "backward");
          return;
        }
        return;
      }

      if (e.key === "Escape") {
        setMenuAt(null);
        latest.current.onSelectionChange([]);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        cmd.remove();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const target = getDoc();
        if (!target?.body) return;
        const all = selectableElements(getSlideRoot(target));
        if (all.length === 0) return;
        const current = latest.current.selection[0];
        const index = current ? all.indexOf(current) : -1;
        const step = e.shiftKey ? -1 : 1;
        const next = all[(((index + step) % all.length) + all.length) % all.length];
        latest.current.onSelectionChange([next]);
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      const nudges: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = nudges[e.key];
      if (delta) {
        e.preventDefault();
        cmd.nudge(delta[0], delta[1]);
      }
    };

    const onKeyUp = (event: Event) => {
      if ((event as KeyboardEvent).code !== "Space") return;
      spaceRef.current = false;
      if (!gestureRef.current) {
        markBusy(getDoc()?.documentElement, null);
        markBusy(viewportRef.current, null);
      }
    };

    // Key events do not cross the iframe boundary, so both realms need the
    // same listener — whichever document has focus is the one that fires.
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    frameWin?.addEventListener("keydown", onKeyDown);
    frameWin?.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      // Same as the document listeners: a detached iframe window throws
      // SecurityError on any property read, removeEventListener included.
      try {
        frameWin?.removeEventListener("keydown", onKeyDown);
        frameWin?.removeEventListener("keyup", onKeyUp);
      } catch {
        /* the iframe is gone */
      }
    };
  }, [getDoc, iframeReadyTick, viewportRef]);

  /* ----------------------------------------------- paste an OS clipboard image */

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (!latest.current.enabled) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/")
      );
      if (!file) return; // Element paste is handled by the keyboard shortcut.
      e.preventDefault();
      const url = await latest.current.onUploadImage(file);
      const m = metricsRef.current;
      if (!url || !m) return;
      const img = insertFloatingImage(
        m.doc,
        url,
        { x: m.slideW / 2, y: m.slideH / 2 },
        m.slideW,
        m.slideH
      );
      latest.current.onSelectionChange([img]);
      latest.current.onCommit();
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  /* ------------------------------------------------- drop an image from a panel */

  useEffect(() => {
    if (!dragItem) return;
    let moved = false;

    const drop = (point: { x: number; y: number } | null, m: SlideMetrics) => {
      if (!point) return;
      const el = insertSnippet(m.doc, dragItem.html, point, m.slideW, m.slideH, {
        width: dragItem.width,
        height: dragItem.height,
      });
      if (el) {
        latest.current.onSelectionChange([el]);
        latest.current.onCommit();
      }
    };

    // Armed by a keyboard press on a panel tile: there is no pointer, so no
    // pointerup is ever coming and the item used to sit armed forever —
    // "Insertar" did nothing until you happened to click somewhere else.
    if (!pointerDownRef.current) {
      const m = readMetrics();
      if (m) drop({ x: m.slideW / 2, y: m.slideH / 2 }, m);
      onDragResolved();
      return;
    }

    const onMove = (e: PointerEvent) => {
      moved = true;
      const m = readMetrics();
      setGhost({
        item: dragItem,
        x: e.clientX,
        y: e.clientY,
        over: !!m && isInsideSlide(e.clientX, e.clientY, m),
      });
    };

    const onUp = (e: PointerEvent) => {
      const m = readMetrics();
      if (m) {
        // A plain click drops the image in the middle of the slide. Dragging is
        // the nice path, but it must never be the only one.
        drop(
          moved
            ? isInsideSlide(e.clientX, e.clientY, m)
              ? toSlideCoords(e.clientX, e.clientY, m)
              : null
            : { x: m.slideW / 2, y: m.slideH / 2 },
          m
        );
      }
      setGhost(null);
      onDragResolved();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGhost(null);
        onDragResolved();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragItem, readMetrics, onDragResolved]);

  /* --------------------------------------------- gestures from the overlay */

  const overlayGesture = useCallback(
    (e: React.PointerEvent, kind: "move" | "resize" | "rotate", handle?: string) => {
      if (!latest.current.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      const m = metricsRef.current ?? readMetrics();
      if (!m) return;

      const toSlide = (ev: PointerEvent) => toSlideCoords(ev.clientX, ev.clientY, m);
      const origin = toSlideCoords(e.clientX, e.clientY, m);
      const screen = { screenX: e.screenX, screenY: e.screenY };
      const target = e.currentTarget;

      if (kind === "move") {
        const selected = latest.current.selection;
        if (e.button === 0 && selected.length === 1 && tryTextEditRef.current(selected[0], origin)) return;
        startMove(latest.current.selection, origin, toSlide, target, e.pointerId, screen);
      } else if (kind === "resize" && handle) {
        startResize(handle, origin, toSlide, target, e.pointerId, screen);
      } else if (kind === "rotate") {
        startRotate(origin, toSlide, target, e.pointerId, screen);
      }
    },
    [readMetrics, startMove, startResize, startRotate]
  );

  /* ---------------------------------------------------------------- render */

  if (!overlay) return <CanvasGhost ghost={ghost} active={!!dragItem} />;

  const { viewport, items, union } = overlay;
  // The readout hangs off whatever the gesture is about: the common frame, the
  // single selection, or — while rubber-banding with nothing selected yet —
  // the marquee itself.
  const frame = union ?? items[0]?.box ?? marquee ?? null;

  return (
    <>
      <div
        className="pointer-events-none fixed"
        style={{
          left: viewport.left,
          top: viewport.top,
          width: viewport.width,
          height: viewport.height,
          overflow: "hidden",
          zIndex: "var(--z-overlay)",
        }}
      >
        {/* Alignment guides, drawn across the whole slide */}
        {guides.map((g, i) => (
          <div
            key={`${g.left}-${g.top}-${i}`}
            className="absolute"
            style={{
              left: g.left,
              top: g.top,
              width: g.width,
              height: g.height,
              background: "var(--canvas-guide)",
              zIndex: 2,
            }}
          />
        ))}

        {marquee && (
          <div
            className="absolute"
            style={{
              left: marquee.left,
              top: marquee.top,
              width: marquee.width,
              height: marquee.height,
              border: "1px solid var(--canvas-selection)",
              background: "var(--canvas-hover)",
              zIndex: 2,
            }}
          />
        )}

        {/* Individual outlines under a multi-selection, so it is obvious what
            is in the set and not just how far it reaches. */}
        {union &&
          items.map((item, i) => (
            <div
              key={i}
              className="pointer-events-none absolute"
              style={{
                left: item.box.left,
                top: item.box.top,
                width: item.box.width,
                height: item.box.height,
                transform: item.angle ? `rotate(${item.angle}deg)` : undefined,
                transformOrigin: "50% 50%",
                outline: "1px solid var(--canvas-selection)",
                opacity: 0.5,
              }}
            />
          ))}

        {union ? (
          <SelectionFrame
            box={union}
            angle={0}
            multi
            interactive={enabled}
            locked={items.every((i) => i.locked)}
            onBodyPointerDown={(e) => overlayGesture(e, "move")}
            onHandlePointerDown={(handle, e) => overlayGesture(e, "resize", handle)}
          />
        ) : (
          items[0] && (
            <SelectionFrame
              box={items[0].box}
              angle={items[0].angle}
              locked={items[0].locked}
              interactive={enabled}
              onBodyPointerDown={(e) => overlayGesture(e, "move")}
              onHandlePointerDown={(handle, e) => overlayGesture(e, "resize", handle)}
              onRotatePointerDown={(e) => overlayGesture(e, "rotate")}
            />
          )
        )}

        {readout && frame && <GestureReadout box={frame} text={readout} />}
      </div>

      <CanvasContextMenu
        at={menuAt}
        onClose={() => setMenuAt(null)}
        commands={commands}
        onUndo={onUndo}
        onRedo={onRedo}
        onApplyElementToAll={onApplyElementToAll}
        onApplyBackgroundToAll={onApplyBackgroundToAll}
      />

      <CanvasGhost ghost={ghost} active={!!dragItem} />
    </>
  );
}

/** Slide-space guide → a 1px line inside the overlay container. */
function toScreenGuide(g: Guide, m: SlideMetrics, host: HTMLElement | null): Box {
  const rect = host?.getBoundingClientRect();
  const ox = rect?.left ?? 0;
  const oy = rect?.top ?? 0;
  return g.axis === "x"
    ? {
        left: m.rect.left + g.at * m.scale - ox,
        top: m.rect.top - oy,
        width: 1,
        height: m.rect.height,
      }
    : {
        left: m.rect.left - ox,
        top: m.rect.top + g.at * m.scale - oy,
        width: m.rect.width,
        height: 1,
      };
}

const GHOST_MAX = 120;

function CanvasGhost({
  ghost,
  active,
}: {
  ghost: { item: DragPayload; x: number; y: number; over: boolean } | null;
  active: boolean;
}) {
  if (!ghost || !active) return null;
  const { item } = ghost;
  // Scaled to a thumbnail: a text preset is 760 slide-pixels wide and would
  // otherwise cover the viewport it is being dropped into.
  const shrink = Math.min(1, GHOST_MAX / Math.max(item.width, item.height));
  return (
    <div
      className="pointer-events-none fixed"
      style={{
        left: ghost.x,
        top: ghost.y,
        transform: "translate(-50%, -50%)",
        opacity: ghost.over ? 0.95 : 0.5,
        zIndex: "var(--z-modal)",
      }}
    >
      {item.previewUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={item.previewUrl}
          alt=""
          style={{
            width: GHOST_MAX,
            height: "auto",
            maxHeight: GHOST_MAX,
            objectFit: "contain",
            outline: "1px solid oklch(0 0 0 / 0.1)",
            filter: "drop-shadow(0 8px 16px oklch(0 0 0 / 0.25))",
          }}
        />
      ) : (
        <div
          style={{
            width: item.width,
            height: item.height,
            transform: `scale(${shrink})`,
            transformOrigin: "center",
            filter: "drop-shadow(0 8px 16px oklch(0 0 0 / 0.25))",
          }}
          dangerouslySetInnerHTML={{ __html: item.html }}
        />
      )}
    </div>
  );
}
