# The canvas editor

**Read this when** you work on the editor: selection, gestures, layers, the
toolbar, the panels, undo, or autosave.

Files: `src/components/editor/SlideCanvas.tsx` (pointer/keyboard engine and the
selection overlay), `canvas-commands.ts` (the commands), `use-slide-editor.ts`
(history, autosave, save points), `ContextToolbar.tsx`, `LayersPanel.tsx`,
`rail/*`, `inspector/*`, `src/lib/canvas-utils.ts`,
`src/lib/slide-history.ts`.

## The structural rule

The slide lives in an iframe with **no script permission**. Selection, move,
resize, rotate, marquee, panning and in-place text editing are all implemented in
the **parent** document against the iframe's DOM. There is no message channel and
no injected script.

Consequences you have to design around:

- The **iframe DOM is the layer tree.** Nothing is mirrored into React state; the
  layers panel lists the slide root's children in stacking order, read live.
- There is **no edit mode.** The slide is always editable.
- `contenteditable` is set from the parent realm and stripped again on the way
  out — and on save, so an interrupted session cannot persist it.
- Pointer events fire in the iframe's realm. Anything the parent must hear about
  needs pointer capture (see *Insertion* below).

## Geometry

`src/lib/canvas-utils.ts` is pure and fully covered by `npm run check:canvas`.

| Constant | Value |
| --- | --- |
| `SAFE_MARGIN` | 80 |
| `SNAP_THRESHOLD` | 8 |
| `MIN_ELEMENT_SIZE` | 16 |
| `DROP_WIDTH_RATIO` | 0.3 |
| `MIN_ZOOM` / `MAX_ZOOM` | 0.25 / 4 |

It owns rotation (`getRotation`/`setRotation` parse and write the `rotate()` in
the transform), resize **under rotation**, bounding boxes, align/distribute,
zoom-about-cursor, snapping against sibling boxes, and the slide DOM contract
(groups, locks, layer order, paste).

## Gestures

- **Double-click is detected from `pointerdown`, not `dblclick`.**
  `preventDefault()` on a pointerdown suppresses the compatibility mouse events,
  `dblclick` included.
- Middle-drag pans; the hand cursor shows while the wheel button is held.
- The wheel belongs to the canvas — the document itself does not scroll.

## Commands

`canvas-commands.ts` exposes one hook used by the toolbar, the context menu and
the keyboard, so the three can never disagree: `duplicate`, `copy`, `cut`,
`paste`, `copyStyle`, `pasteStyle`, `remove`, `align`, `distribute`, `order`,
`toggleLock`, `group`, `ungroup`, `selectAll`, `nudge`, plus the capability flags
the UI disables itself with (`canGroup`, `canDistribute`, `hasClipboard`…).

**"Copiar estilo" carries the look and nothing else.** `STYLE_COPY_PROPS`
excludes `left`, `top`, `width`, `height`, `transform` and `z-index`, and every
listed property is cleared before the snapshot goes on — otherwise a neon glow
survives a plain paste.

## The contextual toolbar

A **fixed row above the canvas** that changes with the selection type (text /
image / shape / several). It is deliberately not a bubble that follows the
selection: a bubble hides elements near the top of the slide and moves every
control out from under the cursor. The row keeps its height when nothing is
selected, so the canvas — and its zoom — never shifts.

It carries the frequent controls only. Anything with a slider or a preview lives
in the right-hand properties panel, one click away via a section jump.
`inspector/use-element-style.ts` is the single read of the selected element,
shared by both, so they cannot disagree.

Align, layer order, group, lock, duplicate and delete live **only** in the
context menu. Having them in two adjacent rows at once moved the rest of the bar
on every click.

## The tool rail and insertion

The fixed left column (Diseño / Elementos / Texto / Imágenes / Marca / IA) opens
one panel at a time. Every destination carries a visible text label — no
icon-only navigation. The AI chat lives inside the IA tab.

Insertion goes through **one channel**: a panel hands `SlideCanvas` a
`DragPayload` (html + natural size), and the same payload serves both a click
(drops it centred) and a drag (drops it under the cursor). Images are just a
payload with a `previewUrl`. Both routes stay live on purpose — making the drag
the only way in is exactly what "no anda" means to someone on a trackpad.

**Every insert affordance arms the drag through `armInsert()`**
(`rail/panel-kit.tsx`), which calls `setPointerCapture`. Without it the drag dies
the moment the cursor crosses into the slide: pointer events fire in the iframe's
realm and the parent `window` — where the drop listener lives — never hears
another one.

Everything a panel can insert is **authored in slide pixels** and previewed by
CSS-scaling the real markup, so what you see in the panel is exactly what lands
on the slide. Catalogs are pure HTML-string builders in
`src/lib/slide-elements.ts`.

## Effects

`src/lib/element-style.ts` builds and parses text effects, image filters, frames,
shadows and flip as plain CSS strings. **Every text effect writes only properties
listed in `TEXT_EFFECT_PROPS`, and switching effects clears that whole set
first** — that is what stops a neon glow from surviving under a new outline.

Image cropping is `object-fit: cover` plus `object-position`, dragged from a
preview in the panel: non-destructive, and the export inlines it untouched.

## Undo and autosave

- **Undo/redo is in-memory, per slide, one step per finished gesture**
  (`slide-history.ts`, `MAX_HISTORY` = 60). The server's five-version history is
  the cross-session safety net, not this — see [data-model.md](data-model.md).
- **Autosave is the only save path.** The explicit flush points are slide change,
  page unload (`keepalive` PUT), before export, and before the agent writes.
- **The editable slide's HTML prop is pinned once the iframe loads**
  (`use-slide-editor.ts`), so saving never reloads the iframe and destroys the
  selection.
- **Anything that rewrites the *stored* HTML of the slide on screen must update
  the carousel state before `dropLocal`.** `dropLocal` releases the pin, and the
  render right after it takes whatever HTML the state holds at that moment —
  dropping first re-pins the old document and the next autosave writes it back.

## Batch operations

`src/lib/slide-batch.ts` rewrites a slide's stored HTML without opening it
(browser-only, uses `DOMParser`).

- **"Aplicar a todas" deliberately skips the active slide**: it already has the
  change on screen, and re-sending it would reload its iframe and drop the
  selection.
- **The aspect-ratio reflow** (`slide-reflow.ts`) is one uniform factor
  `min(sx, sy)` plus a re-centring translation, applied to a whitelist of px
  declarations. It is an approximation on purpose, so it asks first and leans on
  the server's per-slide version history to undo.

## Verifying a change here

`npm run check:canvas` covers snapping, rotated resize, bounding boxes,
align/distribute, zoom-about-cursor, the undo cursor, filter round-trips, effect
clearing, and flip vs rotation. New geometry or history logic goes in there.
