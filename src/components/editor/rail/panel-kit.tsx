"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DragPayload, SlideElementSpec } from "@/lib/slide-elements";

/* ------------------------------------------------------------- the shell */

export function PanelShell({
  title,
  description,
  onClose,
  toolbar,
  flush = false,
  hidden = false,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  /** Sticky row under the title — a search box, usually. */
  toolbar?: React.ReactNode;
  /** Hand the body its own scrolling — the chat already manages one. */
  flush?: boolean;
  /** Kept mounted but off screen — the AI panel does this to keep a stream alive. */
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-panel shrink-0 flex-col border-r border-border bg-surface",
        hidden && "hidden"
      )}
    >
      <div className="flex shrink-0 items-start gap-2 px-4 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold leading-tight">{title}</h2>
          {description && (
            <p className="mt-1 text-label text-muted-foreground">{description}</p>
          )}
        </div>
        <IconButton label="Cerrar el panel" size="sm" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
      {toolbar && <div className="shrink-0 px-4 pb-3">{toolbar}</div>}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          !flush && "overflow-y-auto px-4 pb-6"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function PanelGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex h-6 items-center gap-2">
        <h3 className="text-section font-semibold text-foreground">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-label leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------ search box */

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="oc-press flex h-control items-center gap-2 rounded-md border border-border bg-surface pl-3 pr-1 hover:border-muted-foreground/40 has-[:focus-visible]:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-body outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <IconButton label="Limpiar la búsqueda" size="sm" onClick={() => onChange("")}>
          <X className="h-4 w-4" aria-hidden />
        </IconButton>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ insertions */

/**
 * Arm a drag from a panel and keep the pointer talking to this document.
 *
 * Without the capture the drag dies the moment the cursor crosses into the
 * slide: pointer events fire in the iframe's own realm and the parent window
 * — where the drop listener lives — never hears another one. Capturing here
 * retargets every move and the release back to the pressed button, so the
 * ghost follows the cursor over the canvas and the drop lands where you let go.
 */
export function armInsert(e: React.PointerEvent, insert: () => void) {
  e.preventDefault();
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // No active pointer (a keyboard-triggered press). The click path still
    // drops the item in the middle of the slide.
  }
  insert();
}

/**
 * One insertable item.
 *
 * Both routes are always live: press and drag to place it where you want, or
 * just click to drop it in the middle of the slide. Making the drag the only
 * way in is exactly what "no anda" means to someone using a trackpad.
 */
export function InsertTile({
  spec,
  onInsert,
  className,
  children,
}: {
  spec: SlideElementSpec;
  onInsert: (payload: DragPayload) => void;
  className?: string;
  /** Custom preview. Defaults to a scaled render of the spec's own markup. */
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={`${spec.label} — arrastralo o tocalo`}
      aria-label={`Insertar ${spec.label}`}
      onPointerDown={(e) =>
        armInsert(e, () =>
          onInsert({ html: spec.html, width: spec.width, height: spec.height })
        )
      }
      className={cn(
        "oc-press oc-focus group flex aspect-square cursor-grab items-center justify-center overflow-hidden rounded-md border border-border bg-surface p-2 active:cursor-grabbing",
        "hover:border-accent hover:bg-accent-soft",
        className
      )}
    >
      {children ?? <ScaledPreview spec={spec} />}
    </button>
  );
}

/**
 * Render slide markup at panel size. The spec is authored in slide pixels
 * (a title is 92px tall), so it has to be scaled down rather than reflowed —
 * reflowing would show a preview that is not what gets inserted.
 */
export function ScaledPreview({
  spec,
  box = 72,
}: {
  spec: SlideElementSpec;
  box?: number;
}) {
  const scale = Math.min(box / spec.width, box / spec.height, 1);
  return (
    <div
      aria-hidden
      className="pointer-events-none flex items-center justify-center"
      style={{ width: box, height: box }}
    >
      <div
        style={{
          width: spec.width,
          height: spec.height,
          transform: `scale(${scale})`,
          transformOrigin: "center",
          flexShrink: 0,
        }}
        dangerouslySetInnerHTML={{ __html: spec.html }}
      />
    </div>
  );
}

/** Wide row for items that are text: a square tile would crop them. */
export function InsertRow({
  spec,
  onInsert,
  sample,
  hint,
}: {
  spec: SlideElementSpec;
  onInsert: (payload: DragPayload) => void;
  /** How the preview reads in the row, styled by the caller. */
  sample: React.ReactNode;
  hint?: string;
}) {
  return (
    <button
      type="button"
      title={`${spec.label} — arrastralo o tocalo`}
      aria-label={`Insertar ${spec.label}`}
      onPointerDown={(e) =>
        armInsert(e, () =>
          onInsert({ html: spec.html, width: spec.width, height: spec.height })
        )
      }
      className="oc-press oc-focus flex w-full cursor-grab flex-col items-start gap-0.5 rounded-md border border-border bg-surface px-3 py-2.5 text-left hover:border-accent hover:bg-accent-soft active:cursor-grabbing"
    >
      <span className="w-full truncate text-foreground">{sample}</span>
      <span className="text-micro text-muted-foreground">{hint ?? spec.label}</span>
    </button>
  );
}
