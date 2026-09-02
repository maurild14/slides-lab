"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stripInspectorAttrs } from "@/lib/inspector-utils";
import {
  canRedo as canRedoAt,
  canUndo as canUndoAt,
  createHistory,
  pushHistory,
  redo as redoAt,
  undo as undoAt,
  type History,
} from "@/lib/slide-history";
import type { Slide } from "@/types/carousel";

const SAVE_DELAY = 450;

interface Options {
  carouselId: string;
  slides: Slide[];
  activeSlide: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** Called after a snapshot is restored — every element reference is dead. */
  onRestore: () => void;
}

export interface SlideEditor {
  /** HTML to render for a slide: our own copy wins over the server's echo. */
  htmlFor: (slide: Slide) => string;
  saving: boolean;
  /** Record one undo step and schedule a save. Call once per finished gesture. */
  commit: () => void;
  /** Write pending changes now and wait for the server. */
  flush: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Seed the history for a freshly loaded slide document. */
  registerIframe: () => void;
  /** Forget our local copy of these slides — the agent rewrote them. */
  dropLocal: (slideIds: string[]) => void;
  /** Bumped on every mutation so the inspector re-reads what it is showing. */
  mutationTick: number;
}

/**
 * Slide editing state: undo history, autosave, and the local copy of the HTML.
 *
 * The edit-mode toggle used to be the one guaranteed moment when pending
 * changes reached the server. Without it every exit has to be covered
 * explicitly — changing slide, leaving the page, exporting, and handing the
 * slide to the AI — which is what `flush` is for.
 */
export function useSlideEditor({
  carouselId,
  slides,
  activeSlide,
  iframeRef,
  onRestore,
}: Options): SlideEditor {
  const [histories, setHistories] = useState<Record<string, History>>({});
  const [localHtml, setLocalHtml] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [mutationTick, setMutationTick] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef<Record<string, string>>({});
  // The unload handler cannot read state, and cannot await anything either.
  const unloadRef = useRef<{ slideId: string | null }>({ slideId: null });

  const slide = slides[activeSlide] ?? null;
  useEffect(() => {
    unloadRef.current.slideId = slide?.id ?? null;
  }, [slide?.id]);

  // Leaving a slide is the one moment its pin can move: the iframe is gone, so
  // a new string cannot reload it under the user. Without this, coming back
  // rebuilds the document from the HTML the slide had when the page loaded and
  // the next save writes that stale copy over the work that was just saved.
  useEffect(() => {
    const id = slide?.id;
    if (!id) return;
    return () => {
      // Reading the ref *at cleanup time* is the point: the pin has to move to
      // whatever was last saved, not to what it held when the effect ran.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const saved = savedRef.current[id];
      setLocalHtml((prev) =>
        saved !== undefined && prev[id] !== saved ? { ...prev, [id]: saved } : prev
      );
    };
  }, [slide?.id]);

  const snapshot = useCallback((): string | null => {
    try {
      const body = iframeRef.current?.contentDocument?.body;
      return body ? stripInspectorAttrs(body.innerHTML) : null;
    } catch {
      return null;
    }
  }, [iframeRef]);

  const persist = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const current = unloadRef.current.slideId;
    const html = snapshot();
    if (!current || html === null) return;
    if (savedRef.current[current] === html) return;

    savedRef.current[current] = html;
    setSaving(true);
    try {
      await fetch(`/api/carousels/${carouselId}/slides/${current}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
    } catch {
      // Offline or the route is down: the next commit retries, and the local
      // DOM still holds the work.
    } finally {
      setSaving(false);
    }
  }, [carouselId, snapshot]);

  const commit = useCallback(() => {
    const html = snapshot();
    const current = slide?.id;
    if (!current || html === null) return;

    setHistories((prev) => ({
      ...prev,
      [current]: pushHistory(prev[current] ?? createHistory(html), html),
    }));
    setMutationTick((n) => n + 1);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(persist, SAVE_DELAY);
  }, [slide?.id, snapshot, persist]);

  const restore = useCallback(
    (html: string) => {
      const body = iframeRef.current?.contentDocument?.body;
      if (!body) return;
      body.innerHTML = html;
      setMutationTick((n) => n + 1);
      onRestore();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(persist, SAVE_DELAY);
    },
    [iframeRef, onRestore, persist]
  );

  const step = useCallback(
    (direction: "undo" | "redo") => {
      const current = slide?.id;
      if (!current) return;
      const history = histories[current];
      if (!history) return;
      const result = direction === "undo" ? undoAt(history) : redoAt(history);
      if (!result) return;
      setHistories((prev) => ({ ...prev, [current]: result.history }));
      restore(result.snapshot);
    },
    [slide?.id, histories, restore]
  );

  const registerIframe = useCallback(() => {
    const current = slide?.id;
    const html = snapshot();
    if (!current || !html) return;
    // Seed from what the browser actually parsed, not from the stored string:
    // the two differ by whitespace and attribute order, and an undo back to the
    // stored version would show as a spurious change.
    setHistories((prev) =>
      prev[current] ? prev : { ...prev, [current]: createHistory(html) }
    );
    savedRef.current[current] = savedRef.current[current] ?? html;
    // Pin the exact string this document was built from. Every later save
    // changes the stored HTML, and without the pin that new string would flow
    // back down as a prop, reload the iframe, and destroy the selection the
    // user is working with — mid-drag, once per save. `dropLocal` releases the
    // pin when the agent legitimately rewrites the slide.
    setLocalHtml((prev) =>
      prev[current] !== undefined ? prev : { ...prev, [current]: slide.html }
    );
  }, [slide, snapshot]);

  const dropLocal = useCallback((slideIds: string[]) => {
    if (slideIds.length === 0) return;
    // Returning `prev` unchanged matters: the generation poll calls this every
    // 500ms with the same ids, and a fresh object each time would re-render the
    // whole editor twice a second for nothing.
    const without = <T,>(prev: Record<string, T>) => {
      if (!slideIds.some((id) => id in prev)) return prev;
      const next = { ...prev };
      for (const id of slideIds) delete next[id];
      return next;
    };
    setLocalHtml(without);
    setHistories(without);
    for (const id of slideIds) delete savedRef.current[id];
  }, []);

  // Leaving the page. A fetch started here is cancelled with the document, so
  // this is the one place that has to use a beacon.
  useEffect(() => {
    const onLeave = () => {
      const current = unloadRef.current.slideId;
      const html = snapshot();
      if (!current || html === null || savedRef.current[current] === html) return;
      savedRef.current[current] = html;
      navigator.sendBeacon?.(
        `/api/carousels/${carouselId}/slides/${current}`,
        new Blob([JSON.stringify({ html })], { type: "application/json" })
      );
    };

    // A tab that gets discarded in the background never fires beforeunload.
    const onHide = () => {
      if (document.visibilityState === "hidden") onLeave();
    };

    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("visibilitychange", onHide);
      onLeave();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [carouselId, snapshot]);

  const history = slide ? histories[slide.id] : undefined;

  return {
    htmlFor: useCallback(
      (s: Slide) => localHtml[s.id] ?? s.html,
      [localHtml]
    ),
    saving,
    commit,
    flush: persist,
    undo: useCallback(() => step("undo"), [step]),
    redo: useCallback(() => step("redo"), [step]),
    canUndo: history ? canUndoAt(history) : false,
    canRedo: history ? canRedoAt(history) : false,
    registerIframe,
    dropLocal,
    mutationTick,
  };
}
