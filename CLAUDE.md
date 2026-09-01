# Slides Lab

AI-powered Instagram carousel builder. Next.js 16 + React 19 + TypeScript + Tailwind v4.

## Architecture

- **Frontend**: React app at localhost:3000 with chat panel (left), carousel preview (center), slide filmstrip (bottom)
- **AI Agent**: a CLI (Claude or Codex) spawned as a subprocess via `/api/chat`, streaming back over SSE. The engine is picked per message from the chat panel; `src/lib/agents.ts` holds the registry.
- **Image generation**: Codex's built-in `image_gen` (gpt-image-2, billed to the user's ChatGPT plan, no API key). Codex calls it natively; Claude and the UI go through `POST /api/images/generate`.
- **Storage**: JSON files in `/data/` with async-mutex locking and atomic writes
- **Export**: Puppeteer screenshots HTML slides to PNG at exact Instagram dimensions
- **Slides**: Full HTML documents rendered in sandboxed iframes. `wrapSlideHtml()` in `src/lib/slide-html.ts` is the shared rendering contract between preview and export.
- **Tool rail**: fixed left column (Diseño / Elementos / Texto / Imágenes / Marca / IA) that opens a panel. The AI chat lives inside the IA tab. Every destination carries a visible text label — no icon-only navigation.
- **Layers**: the right column lists the slide root's children in stacking order. The iframe DOM *is* the layer tree; nothing is mirrored into React state.
- **Canvas**: always-on direct manipulation. Selection, move, resize, rotate, marquee and panning are all driven from the parent document (`SlideCanvas`), never from inside the iframe — it has no script permission. There is no "edit mode": the slide is always editable.
- **Undo/redo**: in-memory, per slide, one step per finished gesture (`slide-history.ts`). The server's five-version history stays as the cross-session safety net.
- **Contextual toolbar**: a fixed row above the canvas that changes with the selection's type (text / image / shape / several). It is not a bubble that follows the selection — that hides elements near the top of the slide and moves every control out from under the cursor. The row keeps its height when nothing is selected, so the canvas (and its zoom) never shifts. It carries the frequent controls; anything with a slider or a preview lives in the right-hand properties panel, one click away via a section jump.
- **Text editing in place**: double-click a text element and type into it. `contenteditable` is set from the parent realm (the iframe has no script permission) and stripped again on the way out — and on save, so an interrupted session cannot persist it.

## Key Files

- `src/lib/chat-system-prompt.ts` — Dynamic system prompt (injects brand config + carousel context)
- `src/lib/slide-html.ts` — `wrapSlideHtml()` wraps slide body HTML into full documents
- `src/lib/data.ts` — JSON storage with proper async-mutex and atomic writes
- `src/lib/carousels.ts` — Carousel and slide CRUD with version history
- `src/lib/agents.ts` — Engine registry: CLI discovery, launch args, stream parsing, one-shot runs
- `src/lib/slide-elements.ts` — Catalogs (shapes, lines, text presets, font pairs) as pure HTML-string builders, plus icon SVG serialization and the layer naming rules
- `src/components/editor/rail/ToolRail.tsx` — The rail and its six panels (`rail/*Panel.tsx`, shared chrome in `rail/panel-kit.tsx`)
- `src/components/editor/LayersPanel.tsx` — Layer list: reorder, rename, visibility, lock
- `src/lib/canvas-utils.ts` — Geometry (rotation, resize under rotation, bounding boxes, align/distribute, zoom/pan) plus the slide DOM contract (groups, locks, layer order, paste)
- `src/lib/slide-history.ts` — Pure undo/redo stack with a cursor
- `src/lib/slide-audit.ts` — Renders a slide once and takes both answers off that page: the measurements the agent reasons about and the PNG it looks at. Also builds the carousel's contact sheet
- `src/lib/slide-audit-rules.ts` — The pure half: measured boxes in, warnings out. Import-free so the self-check runs it without Chrome
- `src/lib/element-style.ts` — Text effects, image filters, frames, shadows and flip, all as pure string builders/parsers over native CSS
- `src/components/editor/ContextToolbar.tsx` — The toolbar row; one variant per selection type
- `src/components/editor/inspector/use-element-style.ts` — One read of the selected element, shared by the toolbar and the panel so they can never disagree
- `src/components/editor/inspector/{Text,Image,Box}Sections.tsx` — The properties panel's sections
- `src/components/editor/SlideCanvas.tsx` — Pointer/keyboard engine and the selection overlay
- `src/components/editor/canvas-commands.ts` — Duplicate, copy/paste, align, order, lock, group; shared by the toolbar, the context menu and the keyboard
- `src/components/editor/use-slide-editor.ts` — Undo history, autosave and the explicit save points
- `src/lib/slide-reflow.ts` — the pure half of the aspect-ratio re-layout (which px declarations scale, the uniform factor and the re-centring offset)
- `src/lib/slide-batch.ts` — rewrites a slide's stored HTML without opening it (aplicar a todas, reflow); browser-only, uses `DOMParser`
- `src/components/ui/empty-state.tsx` — the one empty/error state (`tone="error"`), used by the dashboard, the template gallery and the inspector
- `src/lib/utils.ts` — `cn()`, with the type scale registered as a `font-size` group so tailwind-merge stops eating text colours
- `docs/imagegen-policy.md` — When the agent should generate an image; injected into the system prompt, edit freely

## API Routes

All at localhost:3000:

- `POST /api/chat` — agent CLI subprocess + SSE streaming (body takes `engine: "claude" | "codex"`)
- `GET /api/chat/check` — which engines are installed and logged in
- `POST /api/images/generate` — generate a PNG into `public/uploads/` via Codex
- `GET /api/images` — recent images for the editor's drag-and-drop panel
- `GET/POST /api/carousels` — List/create carousels
- `GET/PUT/DELETE /api/carousels/[id]` — Single carousel
- `POST /api/carousels/[id]/slides` — Add slide. Always audits: the response carries `warnings` (measured geometry defects) and `pngPath` (the render, for the agent to `Read`). `?audit=0` skips it
- `GET /api/carousels/[id]/contact-sheet` — Every slide in one image, four to a row. Returns `{ path }`
- `PUT/DELETE /api/carousels/[id]/slides/[slideId]` — Update/delete slide. `?audit=1` re-measures and re-renders; without it nothing touches Chrome, because this is the autosave path
- `PUT /api/carousels/[id]/slides` — Reorder slides (body: { slideIds: [...] })
- `POST /api/carousels/[id]/slides/[slideId]/duplicate` — Duplicate a slide in place
- `POST /api/carousels/[id]/slides/[slideId]/undo` — Undo slide change
- `POST /api/carousels/[id]/export` — Export (body: `{ format?: "png"|"jpg"|"png-transparent"|"pdf", quality?, slideId? }`). One slide is one file; several are a ZIP; PDF is always one file
- `GET/PUT /api/brand` — Brand configuration
- `GET/POST /api/templates` — Templates
- `POST /api/upload` — Image upload (PNG/JPG/WebP only, max 10MB)
- `GET /api/fonts` — Google Fonts list

Static assets:

- `public/icon-catalog.json` — all 1695 Lucide icons as geometry, generated by `npm run build:icons`. Regenerate after upgrading `lucide-react`. The browser fetches it once instead of bundling 1695 React components.

## Conventions

- Components max ~300 lines per file
- Use `cn()` from `src/lib/utils.ts` for class merging
- Types in `src/types/`, libs in `src/lib/`, components in `src/components/`
- All data mutations go through `src/lib/data.ts` (never direct fs writes for JSON)
- iframe slides use `sandbox=""` for read-only thumbnails and `sandbox="allow-same-origin"` for the editable canvas — never `allow-scripts`
- The editable slide's HTML prop is pinned once the iframe loads (`use-slide-editor`), so saving never reloads the iframe and destroys the selection
- Autosave is the only save path; the explicit flush points are slide change, page unload (beacon), before export, and before the agent writes
- Manipulable elements are marked with `data-*` only (`data-oc-lock`, `data-oc-group`) so the export walks straight past them
- Slides are exported **one at a time**: Chrome composites only the foreground tab, so concurrent screenshots hang until the protocol timeout
- The agent subprocess drives the app with curl against these same API routes; on Windows the prompt says `curl.exe`, because Codex shells out through PowerShell where bare `curl` is Invoke-WebRequest
- Generated images always land in `public/uploads/` as `.png` — the PNG export inlines that path and silently drops anything else
- Insertion goes through one channel: a panel hands `SlideCanvas` a `DragPayload` (html + natural size), and the same payload serves both a click (drops it centred) and a drag (drops it under the cursor). Images are just a payload with a `previewUrl`
- Every insert affordance arms the drag through `armInsert()` in `rail/panel-kit.tsx`, which calls `setPointerCapture`. Without it the drag dies the moment the cursor crosses into the slide: pointer events fire in the iframe's realm and the parent `window` — where the drop listener lives — never hears another one
- Everything a panel can insert is authored in **slide pixels** and previewed by CSS-scaling the real markup, so what you see in the panel is exactly what lands on the slide
- Manipulable state lives in `data-*` attributes only (`data-oc-lock`, `data-oc-group`, `data-oc-hidden`, `data-oc-name`); hiding a layer also writes `display:none` inline, because the export renders raw HTML with none of our stylesheets
- Codex's Windows sandbox helper fails to start now and then (`orchestrator_helper_exit_nonzero`), and every image read in that run dies with it. It is transient — Codex reads PNGs fine, inside the workspace and out of it, verified directly — so the prompt tells the agent to note the failure and carry on with the warnings rather than retry or abandon. Never diagnose this as "Codex cannot read images"
- The agent never ships a slide it has not seen: creating one returns measured `warnings` plus a `pngPath` it is told to `Read`, and the contact sheet closes the carousel. The warnings only ever advise — a slide is saved before it is measured, and a Chrome that failed to start must never turn a good write into an error
- The audit checks geometry and nothing else (off-canvas, cut-off text, zero size, empty boxes). Contrast, collision and Instagram's safe area were deliberately left out: they need a judgement call about intent, and a warning the agent learns to ignore is worse than no warning
- `npm run check:canvas` runs the geometry, history, element and effect self-check (snapping, rotated resize, bounding boxes, align/distribute, zoom-about-cursor, undo cursor, filter round-trips, effect clearing, flip vs rotation)
- Every text effect writes only properties listed in `TEXT_EFFECT_PROPS`; switching effects clears that whole set first, which is what stops a neon glow from surviving under a new outline
- Double-click is detected from `pointerdown`, not from `dblclick`: `preventDefault()` on a pointerdown suppresses the compatibility mouse events, `dblclick` included
- Anything that rewrites the *stored* HTML of the slide on screen has to update the carousel state **before** `dropLocal`. `dropLocal` releases the pin that keeps the iframe from reloading, and the render right after it takes whatever HTML the state holds at that moment — dropping first re-pins the old document and the next autosave writes it back
- "Aplicar a todas" deliberately skips the active slide: it already has the change on screen, and re-sending it would reload its iframe and drop the selection
- The aspect-ratio reflow is one uniform factor (`min(sx, sy)`) plus a re-centring translation, applied to a whitelist of px declarations. It is an approximation on purpose, so it asks first and leans on the server's per-slide version history to undo
- "Copiar estilo" carries the look and nothing else: `STYLE_COPY_PROPS` excludes `left`, `top`, `width`, `height`, `transform` and `z-index`, and every listed property is cleared before the snapshot goes on so a neon glow cannot survive a plain paste
- Image cropping is `object-fit: cover` plus `object-position`, dragged from a preview in the panel. Non-destructive, and the export inlines it untouched
- Every token added to the type scale in `globals.css` has to be added to the `font-size` class group in `src/lib/utils.ts` too. Without it tailwind-merge reads `text-body` as `text-{color}` and drops the colour declared before it — that is how `bg-foreground` buttons ended up with near-black text on a near-black fill
- Read-only slide iframes (thumbnails, filmstrip, dashboard cards) carry `loading="lazy"`; the editable canvas must stay eager, because the attach effect waits on its document
- Errors surface where they happened, in a `role="alert"` line — there is no toast system. Every mutation that can fail says so; silence is a bug

## Instagram Dimensions

- 1:1 = 1080x1080 (square)
- 4:5 = 1080x1350 (portrait, recommended)
- 9:16 = 1080x1920 (story)
- Max 10 slides per carousel

## Slide HTML Rules

Slides store body-level HTML only (no `<html>`, `<head>`, `<!DOCTYPE>`). The `wrapSlideHtml()` function adds the full document structure, font loading, and dimension constraints. Slides should:

- Use inline styles or `<style>` tags
- Reference images as `/uploads/{filename}` paths
- Use Google Font family names in font-family declarations
- NOT contain `<script>` tags (enforced by iframe sandbox)
- Target the carousel's aspect ratio dimensions
