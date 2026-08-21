"use client";

import { useCallback, useMemo, useState } from "react";
import {
  alignOffset,
  applyBox,
  distributeOffsets,
  duplicateElements,
  getSlideRoot,
  groupElements,
  isGroup,
  isLocked,
  pasteHtml,
  readBox,
  reorderLayer,
  selectableElements,
  serializeSelection,
  setLocked,
  ungroupElement,
  unionBox,
  type AlignMode,
  type LayerAction,
} from "@/lib/canvas-utils";
import {
  readStyleSnapshot,
  styleSnapshotPatch,
  type StyleSnapshot,
} from "@/lib/element-style";

/**
 * Clipboard shared by every slide in the tab.
 *
 * ponytail: a module-level string, not the system clipboard. Reading
 * text/html back out of the async Clipboard API needs a permission prompt and
 * still loses inline styles in some browsers, and copy/paste only has to work
 * *inside* this editor. Pasted images from the OS are handled separately, in
 * the canvas, because those arrive as files rather than markup.
 */
let clipboard: string | null = null;

/** Same idea, for "copiar estilo": the look without the content. */
let styleClipboard: StyleSnapshot | null = null;

export interface CanvasCommands {
  duplicate: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  copyStyle: () => void;
  pasteStyle: () => void;
  remove: () => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: "x" | "y") => void;
  order: (action: LayerAction) => void;
  toggleLock: () => void;
  group: () => void;
  ungroup: () => void;
  selectAll: () => void;
  nudge: (dx: number, dy: number) => void;
  /** True when the whole selection is locked. */
  locked: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canDistribute: boolean;
  hasClipboard: boolean;
  hasStyleClipboard: boolean;
  count: number;
}

interface Options {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  selection: HTMLElement[];
  onSelectionChange: (els: HTMLElement[]) => void;
  /** Commit one undo step and schedule a save. */
  onCommit: () => void;
  /** Slide dimensions, used as the frame when a single element is aligned. */
  dimensions: { width: number; height: number };
  enabled: boolean;
}

export function useCanvasCommands({
  iframeRef,
  selection,
  onSelectionChange,
  onCommit,
  dimensions,
  enabled,
}: Options): CanvasCommands {
  // Only exists so the "Paste" item can enable itself the moment something is
  // copied — the clipboard itself is module state.
  const [clipboardTick, setClipboardTick] = useState(0);

  const doc = useCallback(() => {
    try {
      return iframeRef.current?.contentDocument ?? null;
    } catch {
      return null;
    }
  }, [iframeRef]);

  const editable = useMemo(
    () => (enabled ? selection.filter((el) => el.isConnected && !isLocked(el)) : []),
    [selection, enabled]
  );

  const duplicate = useCallback(() => {
    if (editable.length === 0) return;
    const copies = duplicateElements(editable);
    if (copies.length === 0) return;
    onSelectionChange(copies);
    onCommit();
  }, [editable, onSelectionChange, onCommit]);

  const copy = useCallback(() => {
    if (selection.length === 0) return;
    clipboard = serializeSelection(selection);
    setClipboardTick((n) => n + 1);
  }, [selection]);

  const copyStyle = useCallback(() => {
    if (selection.length !== 1) return;
    styleClipboard = readStyleSnapshot(selection[0]);
    setClipboardTick((n) => n + 1);
  }, [selection]);

  const pasteStyle = useCallback(() => {
    if (editable.length === 0 || !styleClipboard) return;
    const patch = styleSnapshotPatch(styleClipboard);
    for (const el of editable) {
      for (const [prop, value] of Object.entries(patch)) {
        if (value === "") el.style.removeProperty(prop);
        else el.style.setProperty(prop, value);
      }
    }
    onCommit();
  }, [editable, onCommit]);

  const remove = useCallback(() => {
    if (editable.length === 0) return;
    for (const el of editable) el.remove();
    onSelectionChange([]);
    onCommit();
  }, [editable, onSelectionChange, onCommit]);

  const cut = useCallback(() => {
    if (editable.length === 0) return;
    clipboard = serializeSelection(editable);
    setClipboardTick((n) => n + 1);
    remove();
  }, [editable, remove]);

  const paste = useCallback(() => {
    const target = doc();
    if (!target || !clipboard || !enabled) return;
    const pasted = pasteHtml(target, clipboard);
    if (pasted.length === 0) return;
    onSelectionChange(pasted);
    onCommit();
  }, [doc, enabled, onSelectionChange, onCommit]);

  const align = useCallback(
    (mode: AlignMode) => {
      if (editable.length === 0) return;
      const boxes = editable.map(readBox);
      // One element aligns to the slide; several align to each other. Aligning
      // a lone element to itself would be a no-op, which reads as broken.
      const bounds =
        editable.length === 1
          ? { left: 0, top: 0, width: dimensions.width, height: dimensions.height }
          : unionBox(boxes);

      editable.forEach((el, i) => {
        const { dx, dy } = alignOffset(boxes[i], bounds, mode);
        if (dx === 0 && dy === 0) return;
        applyBox(el, { left: boxes[i].left + dx, top: boxes[i].top + dy });
      });
      onCommit();
    },
    [editable, dimensions, onCommit]
  );

  const distribute = useCallback(
    (axis: "x" | "y") => {
      if (editable.length < 3) return;
      const boxes = editable.map(readBox);
      const offsets = distributeOffsets(boxes, axis);
      editable.forEach((el, i) => {
        if (offsets[i] === 0) return;
        applyBox(el, {
          left: boxes[i].left + (axis === "x" ? offsets[i] : 0),
          top: boxes[i].top + (axis === "y" ? offsets[i] : 0),
        });
      });
      onCommit();
    },
    [editable, onCommit]
  );

  const order = useCallback(
    (action: LayerAction) => {
      if (editable.length === 0) return;
      // Front/forward walk the list backwards so the members keep their
      // relative stacking instead of reversing.
      const ordered =
        action === "front" || action === "forward" ? editable : [...editable].reverse();
      for (const el of ordered) reorderLayer(el, action);
      onCommit();
    },
    [editable, onCommit]
  );

  const locked = selection.length > 0 && selection.every(isLocked);

  const toggleLock = useCallback(() => {
    if (selection.length === 0) return;
    const next = !selection.every(isLocked);
    for (const el of selection) setLocked(el, next);
    // A locked element cannot be selected from the canvas, so holding on to it
    // would leave a frame the user can no longer dismiss by clicking away.
    if (next) onSelectionChange([]);
    onCommit();
  }, [selection, onSelectionChange, onCommit]);

  const group = useCallback(() => {
    if (editable.length < 2) return;
    const created = groupElements(editable);
    if (!created) return;
    onSelectionChange([created]);
    onCommit();
  }, [editable, onSelectionChange, onCommit]);

  const ungroup = useCallback(() => {
    const groups = editable.filter(isGroup);
    if (groups.length === 0) return;
    const released = groups.flatMap(ungroupElement);
    onSelectionChange(released);
    onCommit();
  }, [editable, onSelectionChange, onCommit]);

  const selectAll = useCallback(() => {
    const target = doc();
    if (!target?.body || !enabled) return;
    onSelectionChange(selectableElements(getSlideRoot(target)));
  }, [doc, enabled, onSelectionChange]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (editable.length === 0) return;
      for (const el of editable) {
        const box = readBox(el);
        applyBox(el, { left: box.left + dx, top: box.top + dy });
      }
      onCommit();
    },
    [editable, onCommit]
  );

  return {
    duplicate,
    copy,
    cut,
    paste,
    copyStyle,
    pasteStyle,
    remove,
    align,
    distribute,
    order,
    toggleLock,
    group,
    ungroup,
    selectAll,
    nudge,
    locked,
    canGroup: editable.length >= 2,
    canUngroup: editable.some(isGroup),
    canDistribute: editable.length >= 3,
    hasClipboard: clipboard !== null && clipboardTick >= 0,
    hasStyleClipboard: styleClipboard !== null && clipboardTick >= 0,
    count: selection.length,
  };
}
