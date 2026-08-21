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
- `src/lib/element-style.ts` — Text effects, image filters, frames, shadows and flip, all as pure string builders/parsers over native CSS
- `src/components/editor/ContextToolbar.tsx` — The toolbar row; one variant per selection type
- `src/components/editor/inspector/use-element-style.ts` — One read of the selected element, shared by the toolbar and the panel so they can never disagree
- `src/components/editor/inspector/{Text,Image,Box}Sections.tsx` — The properties panel's sections
- `src/components/editor/SlideCanvas.tsx` — Pointer/keyboard engine and the selection overlay
- `src/components/editor/canvas-commands.ts` — Duplicate, copy/paste, align, order, lock, group; shared by the toolbar, the context menu and the keyboard
- `src/components/editor/use-slide-editor.ts` — Undo history, autosave and the explicit save points
- `docs/imagegen-policy.md` — When the agent should generate an image; injected into the system prompt, edit freely

## API Routes

All at localhost:3000:

- `POST /api/chat` — agent CLI subprocess + SSE streaming (body takes `engine: "claude" | "codex"`)
- `GET /api/chat/check` — which engines are installed and logged in
- `POST /api/images/generate` — generate a PNG into `public/uploads/` via Codex
- `GET /api/images` — recent images for the editor's drag-and-drop panel
- `GET/POST /api/carousels` — List/create carousels
- `GET/PUT/DELETE /api/carousels/[id]` — Single carousel
- `POST /api/carousels/[id]/slides` — Add slide
- `PUT/DELETE /api/carousels/[id]/slides/[slideId]` — Update/delete slide
- `PUT /api/carousels/[id]/slides` — Reorder slides (body: { slideIds: [...] })
- `POST /api/carousels/[id]/slides/[slideId]/undo` — Undo slide change
- `POST /api/carousels/[id]/export` — Export all slides to PNG ZIP
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
- `npm run check:canvas` runs the geometry, history, element and effect self-check (snapping, rotated resize, bounding boxes, align/distribute, zoom-about-cursor, undo cursor, filter round-trips, effect clearing, flip vs rotation)
- Every text effect writes only properties listed in `TEXT_EFFECT_PROPS`; switching effects clears that whole set first, which is what stops a neon glow from surviving under a new outline
- Double-click is detected from `pointerdown`, not from `dblclick`: `preventDefault()` on a pointerdown suppresses the compatibility mouse events, `dblclick` included
- Image cropping is `object-fit: cover` plus `object-position`, dragged from a preview in the panel. Non-destructive, and the export inlines it untouched

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
